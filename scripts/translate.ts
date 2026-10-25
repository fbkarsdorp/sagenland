// Translates a region's tale summaries into English with the Message Batches API, for an English edition of the game.
// Resumable: every submit only sends the summaries a model has not translated yet, so a failed or missing chunk is
// simply submitted again. Results go to data/translations/ (outside the repo, like the rest of the raw data).
//
//   npx tsx scripts/translate.ts submit oosten [opus,haiku]   send a batch (prints its id)
//   npx tsx scripts/translate.ts collect oosten               wait for the batch, store the translations, show the cost
//   npx tsx scripts/translate.ts compare oosten [20]          side-by-side sample of the original and each model
//
// The API key is read from ANTHROPIC_API_KEY or from a line ANTHROPIC_API_KEY=... in .env.local.

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';

const MODELS: Record<string, { id: string; input: number; output: number }> = {
  // batch prices in dollars per million tokens: half the list price
  opus: { id: 'claude-opus-5-5', input: 2, output: 10 },
  sonnet: { id: 'claude-sonnet-5-5', input: 1, output: 5 },
  haiku: { id: 'claude-haiku-5-5', input: 0.05, output: 0.25 },
};
const CHUNK = 40;
const OUT = 'data/translations';

const SYSTEM = `You translate short Dutch summaries of folk legends from the Dutch Folktale Database (Nederlandse Volksverhalenbank) into English. They appear in a game in which the player collects these tales, and the player reads each one on its own.

- Translate what is there, in plain, clear English, at about the same length and in the same tense. Do not embellish, explain or add detail.
- Keep Dutch and Flemish place names and personal names as they are.
- Use the usual English word for a being or practice when there is one (heks: witch, weerwolf: werewolf, dwaallicht: will-o'-the-wisp). When there is none, keep the Dutch word and add a short gloss in brackets, for example "witte wieven (white women)", "kollen (bewitching cattle)". Gloss each time, since every summary is read on its own. Treat the folklore terms voorloop (an apparition foreshadowing an event) and naloop (an apparition after a death) this way too.
- Some summaries contain dialect or old spelling; translate the meaning.
- Each item comes with the English name of its tale type as context. Do not include it in the translation.
- Plain text only: no markdown, no quotation marks around the whole translation.`;

const SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, en: { type: 'string' } },
        required: ['id', 'en'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

type Variant = { n: string; t: string; d: string };

function loadKey() {
  if (process.env.ANTHROPIC_API_KEY || !fs.existsSync('.env.local')) return;
  const m = fs.readFileSync('.env.local', 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (m) process.env.ANTHROPIC_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
}

function variants(region: string): Variant[] {
  const v = JSON.parse(fs.readFileSync(`public/data/${region}.json`, 'utf8')).variants;
  return (Array.isArray(v) ? v : Object.values(v)).filter((x: Variant) => x.d?.trim());
}

const resultFile = (region: string, model: string) => `${OUT}/${region}.${model}.json`;
const batchFile = (region: string) => `${OUT}/${region}.batch.json`;
const readJson = (f: string, empty: any) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : empty);

async function submit(client: Anthropic, region: string, models: string[]) {
  const types = JSON.parse(fs.readFileSync('public/data/meta.json', 'utf8')).types;
  const all = variants(region);
  const requests: Parameters<typeof client.messages.batches.create>[0]['requests'] = [];
  for (const key of models) {
    const model = MODELS[key];
    if (!model) throw new Error(`unknown model ${key}; choose from ${Object.keys(MODELS).join(', ')}`);
    const done = readJson(resultFile(region, key), {});
    const todo = all.filter((v) => !(v.n in done));
    for (let i = 0; i < todo.length; i += CHUNK) {
      const items = todo.slice(i, i + CHUNK).map((v) => ({ id: v.n, type: types[v.t]?.en ?? '', nl: v.d }));
      requests.push({
        custom_id: `${key}-${i / CHUNK}`,
        params: {
          model: model.id,
          max_tokens: 16000,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Translate each summary into English. Return every id exactly once.\n\n${JSON.stringify(items, null, 1)}`,
            },
          ],
        },
      });
    }
    console.log(`${key}: ${todo.length} of ${all.length} summaries to translate`);
  }
  if (!requests.length) return console.log('nothing left to translate');
  const batch = await client.messages.batches.create({ requests });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(batchFile(region), JSON.stringify({ id: batch.id, models }, null, 1));
  console.log(`batch ${batch.id}: ${requests.length} requests; run "collect ${region}" to fetch the results`);
}

async function collect(client: Anthropic, region: string) {
  const { id, models } = readJson(batchFile(region), {});
  if (!id) throw new Error(`no batch submitted for ${region}`);
  let batch = await client.messages.batches.retrieve(id);
  while (batch.processing_status !== 'ended') {
    const c = batch.request_counts;
    console.log(`${batch.processing_status}: ${c.processing} processing, ${c.succeeded} done`);
    await new Promise((r) => setTimeout(r, 60_000));
    batch = await client.messages.batches.retrieve(id);
  }
  const results: Record<string, Record<string, string>> = {};
  const usage: Record<string, { input: number; output: number }> = {};
  const failed: string[] = [];
  for (const key of models) {
    results[key] = readJson(resultFile(region, key), {});
    usage[key] = { input: 0, output: 0 };
  }
  for await (const r of await client.messages.batches.results(id)) {
    const key = r.custom_id.split('-')[0];
    if (r.result.type !== 'succeeded') {
      failed.push(`${r.custom_id} (${r.result.type})`);
      continue;
    }
    const msg = r.result.message;
    usage[key].input += msg.usage.input_tokens;
    usage[key].output += msg.usage.output_tokens;
    const text = msg.content.find((b) => b.type === 'text');
    if (msg.stop_reason !== 'end_turn' || !text || text.type !== 'text') {
      failed.push(`${r.custom_id} (${msg.stop_reason})`);
      continue;
    }
    for (const t of JSON.parse(text.text).translations) results[key][t.id] = t.en.trim();
  }
  const all = variants(region);
  for (const key of models) {
    // keep only answers for summaries that exist: the model now and then garbles an id
    const kept = Object.fromEntries(all.filter((v) => v.n in results[key]).map((v) => [v.n, results[key][v.n]]));
    fs.writeFileSync(resultFile(region, key), JSON.stringify(kept, null, 1));
    const m = MODELS[key];
    const cost = (usage[key].input * m.input + usage[key].output * m.output) / 1e6;
    console.log(
      `${key}: ${Object.keys(kept).length} of ${all.length} translated; ` +
        `${usage[key].input} in, ${usage[key].output} out, $${cost.toFixed(2)}`,
    );
  }
  if (failed.length) console.log(`failed: ${failed.join(', ')}; submit again to retry the missing summaries`);
}

function compare(region: string, count: number) {
  const { models } = readJson(batchFile(region), { models: Object.keys(MODELS) });
  const results = Object.fromEntries(models.map((k: string) => [k, readJson(resultFile(region, k), {})]));
  const types = JSON.parse(fs.readFileSync('public/data/meta.json', 'utf8')).types;
  const both = variants(region).filter((v) => models.every((k: string) => v.n in results[k]));
  // a fixed shuffle, so the sample stays the same between runs
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sample = both.map((v) => [rand(), v] as const).sort((a, b) => a[0] - b[0]).slice(0, count).map((x) => x[1]);
  const lines = [`# ${region}: ${sample.length} summaries, ${models.join(' vs ')}`, ''];
  for (const v of sample) {
    lines.push(`## ${v.n} · ${types[v.t]?.en ?? v.t}`, '', `**nl** ${v.d}`, '');
    for (const k of models) lines.push(`**${k}** ${results[k][v.n]}`, '');
    lines.push('---', '');
  }
  const file = `${OUT}/${region}-compare.md`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`wrote ${file}`);
}

const [cmd, region, arg] = process.argv.slice(2);
if (!region) throw new Error('usage: translate.ts submit|collect|compare <region> [models|count]');
loadKey();
if (cmd === 'compare') compare(region, Number(arg) || 20);
else {
  const client = new Anthropic();
  if (cmd === 'submit') await submit(client, region, (arg ?? 'opus,haiku').split(','));
  else if (cmd === 'collect') await collect(client, region);
  else throw new Error(`unknown command ${cmd}`);
}
