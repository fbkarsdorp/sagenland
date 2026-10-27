// The first evening, in every region, for every collector, in three seasons and six seeds, played the way the old
// collector says: each of the three must tell something, and the night out must end on the first morning.
//   npx tsx scripts/prologtest.ts
import { readFileSync } from 'node:fs';
import { buildCorpus, nameMeta, type Meta } from '../src/data';
import { newField, type Move } from '../src/field';
const meta: Meta = nameMeta(JSON.parse(readFileSync('public/data/meta.json', 'utf8')));
const problems: string[] = [];
let runs = 0, ok = 0, find = 0;
const walks: number[] = [];
for (const region of Object.keys(meta.regions)) {
  const corpus = buildCorpus(region, meta, JSON.parse(readFileSync(`public/data/${region}.json`, 'utf8')).variants);
  const archs = Object.entries(meta.archetypes).filter(([, a]) => a.regions[region]).map(([k]) => k);
  for (const arch of archs) for (const season of ['herfst', 'winter', 'zomer'] as const) for (let seed = 1; seed <= 6; seed++) {
    runs++;
    const f = newField(corpus, arch, seed * 7919, undefined, season);
    if (!f.startPrologue()) { problems.push(`${region}/${arch}/${seed}: no prologue`); continue; }
    const p = f.prologue!;
    p.step = 'verteller';
    for (const part of ['verteller', 'gelovige', 'schuchtere'] as const) {
      const nid = f.practiceWho();
      if (nid !== p.cast[part]) problems.push(`${region}/${arch}/${seed}: wrong turn ${part}`);
      const t = f.startTalk(nid!);
      for (let k = 0; k < 8; k++) {
        const h = f.practiceHint(t);
        if (!h || h === 'bye') break;
        const m: Move = h.startsWith('theme:') ? { kind: 'theme', being: h.slice(6) } : h === 'prompt' ? { kind: 'prompt', t: f.prompts()[0] } : { kind: h as 'praat' };
        f.move(t, m);
      }
      f.endTalk(t);
      if (!t.entries.length) problems.push(`${region}/${arch}/${seed}/${season}: ${part} told nothing`);
      if (part === 'schuchtere' && !t.lines.some((l) => l.lead)) problems.push(`${region}/${arch}/${seed}/${season}: no lead from the shy one`);
    }
    if (p.step !== 'erheen') { problems.push(`${region}/${arch}/${seed}: step ${p.step} after the visits`); continue; }
    const r = f.route({ kind: 'site', id: p.site });
    walks.push(r?.tiles.length ?? -1);
    f.travel({ kind: 'site', id: p.site });
    if (p.step !== 'kijken' || !f.canSee(p.site) || f.day !== 0) problems.push(`${region}/${arch}/${seed}/${season}: at the site ${p.step}, day ${f.day}, see ${f.canSee(p.site)}`);
    f.see(p.site);
    f.homeward();
    if (p.step !== 'klaar' || f.day !== 1 || f.part !== 0) problems.push(`${region}/${arch}/${seed}: home ${p.step} day ${f.day}.${f.part}`);
    find += f.finds().length ? 1 : 0;
    ok++;
  }
}
walks.sort((a, b) => a - b);
console.log(`${ok}/${runs} first evenings played through; a find in ${find}; walk tiles min ${walks[0]} median ${walks[walks.length >> 1]} max ${walks[walks.length - 1]}`);
console.log(problems.slice(0, 30).join('\n') || 'no problems');
