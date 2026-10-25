// Does the story world behave like a cultural population? Diversity against population size,
// effective population size (who tells) and connectivity:  npx tsx scripts/divtest.ts [region]
import { readFileSync } from 'node:fs';
import { buildCorpus, nameMeta, type Meta } from '../src/data';
import { Sim, type Culture } from '../src/sim';
import { layRoad, idx } from '../src/world';

const region = process.argv[2] ?? 'friesland';
const meta: Meta = nameMeta(JSON.parse(readFileSync('public/data/meta.json', 'utf8')));
const corpus = buildCorpus(region, meta, JSON.parse(readFileSync(`public/data/${region}.json`, 'utf8')).variants);

type Setup = (sim: Sim) => void;
const grow = (sim: Sim, k: number) => {
  sim.money = 10000;
  let built = 0;
  for (let r = 1; r < 8 && built < k; r++)
    for (let dy = -r; dy <= r && built < k; dy++)
      for (let dx = -r; dx <= r && built < k; dx++) {
        const x = sim.home.x + dx, y = sim.home.y + dy;
        if (sim.canBuild('huis', x, y).ok) { sim.build('huis', x, y); built++; }
        else if (sim.canBuild('weg', x, y).ok && Math.abs(dx) + Math.abs(dy) <= 2) sim.build('weg', x, y);
      }
  sim.money = 40;
};
const growAll = (sim: Sim, k: number) => {
  sim.money = 100000;
  for (const p of sim.map.places) {
    let built = 0;
    for (let r = 1; r < 7 && built < k; r++)
      for (let dy = -r; dy <= r && built < k; dy++)
        for (let dx = -r; dx <= r && built < k; dx++) {
          const x = p.x + dx, y = p.y + dy;
          if (sim.nearestPlace(x, y) !== p.id) continue;
          if (sim.canBuild('huis', x, y).ok) { sim.build('huis', x, y); built++; }
        }
  }
  sim.money = 40;
};
const connectAll = (sim: Sim) => {
  const ps = sim.map.places;
  for (const p of ps) for (const q of ps) if (p.id < q.id) layRoad(sim.map, p.x, p.y, q.x, q.y);
  sim.recomputeRoads();
};
const isolate = (sim: Sim) => {
  for (const t of sim.map.tiles) { t.road = false; t.bridge = false; }
  sim.recomputeRoads();
};
const culture = (c: Culture) => (sim: Sim) => { sim.culture = sim.culture.map(() => c); };

const conds: [string, Setup][] = [
  ['basis', () => {}],
  ['groot thuis (+14 huizen)', (s) => grow(s, 14)],
  ['alles verbonden', connectAll],
  ['alles los', isolate],
  ['alles los, overal +8 huizen', (s) => { growAll(s, 8); isolate(s); }],
  ['verbonden, overal +8 huizen', (s) => { growAll(s, 8); connectAll(s); }],
  ['herberg overal', culture('herberg')],
  ['haard overal', culture('haard')],
];
const seeds = [1, 2, 3, 4];
console.log('condition'.padEnd(26), 'N_home S_home D_home Ne_home | meanS  gamma overlap minUniq | (N,S) per village');
for (const [name, setup] of conds) {
  const acc = { nh: 0, sh: 0, dh: 0, ne: 0, ms: 0, g: 0, o: 0, u: 0 };
  let pairs = '';
  for (const seed of seeds) {
    const sim = new Sim({ corpus, archetype: 'volhouder', seed });
    setup(sim);
    while (!sim.over) sim.tick();
    // average the last five years
    const tail = sim.history.slice(-20);
    const avg = (f: (h: (typeof tail)[0]) => number) => tail.reduce((a, h) => a + f(h), 0) / tail.length;
    acc.nh += avg((h) => h.places[0].n) / seeds.length;
    acc.sh += avg((h) => h.places[0].s) / seeds.length;
    acc.dh += avg((h) => h.places[0].d) / seeds.length;
    acc.ne += avg((h) => h.places[0].ne) / seeds.length;
    acc.ms += avg((h) => h.places.reduce((a, p) => a + p.s, 0) / h.places.length) / seeds.length;
    acc.g += avg((h) => h.gamma) / seeds.length;
    acc.o += avg((h) => h.overlap) / seeds.length;
    const per = sim.regionDiversity().per;
    acc.u += Math.min(...per.map((_, i) => sim.uniqueTypes(i, per).length)) / seeds.length;
    if (seed === 1) pairs = tail[tail.length - 1].places.map((p) => `(${p.n},${p.s})`).join(' ');
  }
  const f = (x: number, w = 6) => x.toFixed(1).padStart(w);
  console.log(name.padEnd(26), f(acc.nh), f(acc.sh), f(acc.dh), f(acc.ne, 7), '|', f(acc.ms), f(acc.g), f(acc.o, 7), f(acc.u, 5), '|', pairs);
}
void idx;
