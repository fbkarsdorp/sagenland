// A headless season in the field with a simple bot, for balancing:
//   npx tsx scripts/fieldtest.ts [region] [archetype] [seed] [-v]      (SAGENLAND_LANG=en for the English edition)
// The bot visits everyone it has not met, moves on when a village starts repeating itself,
// and goes to every village and site in turn. A thoughtful player should do better.
import { readFileSync } from 'node:fs';
import { buildCorpus, nameMeta, type Meta } from '../src/data';
import { newField, type Where } from '../src/field';

const [region = 'oosten', arch = 'volhouder', seedS = '3', verbose] = process.argv.slice(2);
const meta: Meta = nameMeta(JSON.parse(readFileSync('public/data/meta.json', 'utf8')));
const corpus = buildCorpus(region, meta, JSON.parse(readFileSync(`public/data/${region}.json`, 'utf8')).variants);
const f = newField(corpus, arch, +seedS);
let guard = 0;
const smart = process.argv.includes('--smart');
if (smart) f.appeal();
while (!f.over && guard++ < 300) {
  if (f.canAttendEvening()) { f.attendEvening(); continue; }
  const ppl = f.people(f.at);
  const here = f.notebook.slice(-2).filter((e) => f.at.kind === 'place' && e.place === f.at.id);
  const fresh = ppl.filter((n) => !f.met.has(n.id));
  if (smart) {
    // finish what came out in pieces, coax the shy with a known tale
    const frag = f.notebook.find((e) => e.frag && ppl.some((n) => n.id === e.narrator) && e.day < f.day);
    if (frag) { f.visit(frag.narrator, { kind: 'again', num: frag.num }); continue; }
    const shy = ppl.find((n) => f.met.has(n.id) && f.temper(n) === 'schuchter' && [...n.know.keys()].some((t) => !f.toldUs.get(n.id)?.has(t)) && (f.visits.get(n.id) ?? 0) < 4);
    if (shy && f.prompts().length) { f.visit(shy.id, { kind: 'prompt', t: f.prompts()[(f.visits.get(shy.id) ?? 0) % f.prompts().length] }); continue; }
  }
  if (fresh.length && !(here.length === 2 && here.every((e) => e.kind === 'same'))) {
    f.visit(fresh[0].id, process.argv.includes('--eigen') ? { kind: 'eigen' } : { kind: 'free' });
    continue;
  }
  const occ = f.occasions.find((o) => o.known && !o.attended && o.day === f.day);
  const next = occ ? { id: occ.place, kind: 'place' as const } : null;
  const nextP = f.land.places.find((p) => !f.visitedPlaces.has(p.id)) ?? f.land.sites.find((s) => !f.visitedSites.has(s.id));
  const w: Where | null = next ?? (nextP ? (f.land.places.includes(nextP as never) ? { kind: 'place', id: nextP.id } : { kind: 'site', id: nextP.id }) : null);
  if (!w || (w.kind === f.at.kind && w.id === f.at.id)) { f.wait(); continue; }
  if (!f.travel(w)) { if (w.kind === 'site') f.visitedSites.add(w.id); f.wait(); }
}
const nb = f.notebook;
const told = f.toldTypes().size;
console.log(`${region} ${arch} ${seedS}: ${nb.length} written down, ${new Set(nb.map((e) => e.t)).size} different of ${told} told; ` +
  `${nb.filter((e) => e.kind === 'version').length} versions, ${nb.filter((e) => e.kind === 'same').length} repeats; met ${f.met.size}; ` +
  `villages ${f.visitedPlaces.size}/${f.land.places.length}; died ${f.lost.length}; frags ${nb.filter((e) => e.frag).length}; ` +
  `via ${['bezoek', 'avond', 'buurten', 'onderweg', 'brief'].map((v) => `${v}:${nb.filter((e) => e.via === v).length}`).join(' ')}; ` +
  `rival ${f.rival ? new Set(f.rival.got.map((g) => g.t)).size : 0} types; ` +
  `score ${JSON.stringify(f.score())} vs rival ${f.rivalScore()}; finds ${f.finds().length}; chapters ${f.chapterProgress().map((c) => c.have).join('/')}`);
if (verbose) for (const d of f.diary) console.log(`  ${d.day}.${d.part} ${d.text}`);
