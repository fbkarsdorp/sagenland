// How different the villages' repertoires are when the collector arrives:
//   npx tsx scripts/landstats.ts [region] [seed]
import { readFileSync } from 'node:fs';
import { buildCorpus, type Meta } from '../src/data';
import { newField } from '../src/field';
import { VILLAGE } from '../src/land';

const [region = 'oosten', seedS = '3'] = process.argv.slice(2);
const meta: Meta = JSON.parse(readFileSync('public/data/meta.json', 'utf8'));
const corpus = buildCorpus(region, meta, JSON.parse(readFileSync(`public/data/${region}.json`, 'utf8')).variants);
const f = newField(corpus, 'volhouder', +seedS);
const sim = f.sim;
const sets = f.land.places.map((p) => new Set(sim.alive(p.id).flatMap((n) => [...n.know.keys()])));
const all = new Set(sets.flatMap((s) => [...s]));
let J = 0, k = 0;
for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
  const inter = [...sets[i]].filter((t) => sets[j].has(t)).length;
  J += inter / (sets[i].size + sets[j].size - inter); k++;
}
console.log(`region types ${all.size}, mean Jaccard ${(J / k).toFixed(2)}`);
f.land.places.forEach((p, i) => {
  const uniq = [...sets[i]].filter((t) => sets.every((s, j) => j === i || !s.has(t))).length;
  const ppl = sim.alive(p.id);
  const per = ppl.map((n) => n.know.size);
  console.log(`  ${p.name.padEnd(16)} ${VILLAGE[f.land.kinds[i]].nl.padEnd(11)} n=${String(ppl.length).padStart(2)} types=${String(sets[i].size).padStart(2)} unique=${uniq} perPerson=${(per.reduce((a, b) => a + b, 0) / Math.max(1, per.length)).toFixed(1)} max=${Math.max(0, ...per)}`);
});
