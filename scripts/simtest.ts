// Headless run of the simulation for balancing:
//   npx tsx scripts/simtest.ts [region] [archetype] [seed] [play 1|0] [feasts 1|0] [none|light|care]
import { readFileSync } from 'node:fs';
import { buildCorpus, type Meta } from '../src/data';
import { Sim } from '../src/sim';
import { layRoad, BUILD } from '../src/world';

const [region = 'friesland', arch = 'volhouder', seedS = '7', playS = '1'] = process.argv.slice(2);
const meta: Meta = JSON.parse(readFileSync('public/data/meta.json', 'utf8'));
const data = JSON.parse(readFileSync(`public/data/${region}.json`, 'utf8'));
const corpus = buildCorpus(region, meta, data.variants);
const t0 = Date.now();
const sim = new Sim({ corpus, archetype: arch, seed: +seedS });
const play = playS === '1';
const kinds = Object.keys(sim.log.reduce((a, l) => ({ ...a, [l.kind]: 1 }), {}));
console.log('places', sim.map.places.map((p) => p.name).join(', '), 'start', sim.startYear, kinds);
console.log('narrators', sim.alive().length, 'nodes', sim.nodes.length);
if (play) {
  // connect home to the nearest neighbour
  const home = sim.home;
  const nb = sim.map.places.filter((p) => !p.home).sort((a, b) => Math.abs(a.x - home.x) + Math.abs(a.y - home.y) - Math.abs(b.x - home.x) - Math.abs(b.y - home.y))[0];
  layRoad(sim.map, home.x, home.y, nb.x, nb.y);
  sim.recomputeRoads();
}
const plan = ['huis', 'molen', 'huis', 'herberg', 'put', 'huis', 'boerderij', 'kerk', 'huis', 'smidse', 'huis', 'huis', 'kapel', 'huis', 'boerderij', 'huis'];
let pi = 0;
const counts: Record<string, number> = {};
for (let w = 0; w < sim.totalWeeks; w++) {
  sim.tick();
  if (play && pi < plan.length && sim.money >= BUILD[plan[pi] as keyof typeof BUILD].cost) {
    // find a free spot next to the home roads/buildings
    outer: for (let r = 1; r < 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = sim.home.x + dx, y = sim.home.y + dy;
          if (sim.canBuild(plan[pi] as any, x, y).ok) { sim.build(plan[pi] as any, x, y); pi++; break outer; }
          if (sim.canBuild('weg', x, y).ok && r > 2 && Math.random() < 0.02) sim.build('weg', x, y);
        }
  }
  const feast = (process.argv[6] ?? '1') === '1';
  const care = process.argv[7] === 'care' || process.argv[7] === 'light';
  const every = process.argv[7] === 'light' ? 20 : 4;
  if (care && sim.week % every === 0) {
    // keep fragile tales alive, and send the collector to whoever alone knows something
    const fragile = [...sim.homeTales.keys()].map((t) => [t, sim.taleStatus(t)] as const)
      .filter(([t, st]) => st.fragile && !st.lost && !st.recordedHere && sim.canTell(t).ok)
      .sort((a, b) => a[1].strength - b[1].strength);
    for (const [t] of fragile.slice(0, every === 4 ? 99 : 1)) sim.tellAtHome(t);
    if (sim.collector.phase === 'working' && sim.collector.at === 0) {
      for (const t of sim.homeTales.keys()) {
        if (sim.records.some((r) => r.t === t && r.place === 0)) continue;
        const n = sim.recommendFor(t);
        if (n) sim.recommendNarrator(n.id, t);
      }
    }
  }
  if (play && feast && pi >= 4 && sim.week % 52 === 42 && sim.canFeast().ok) sim.holdFeast();
  if (w % 260 === 259) {
    const alive = sim.alive();
    const types = [...sim.typeHolders.entries()].filter(([, c]) => c > 0).length;
    console.log(`y${sim.year} alive=${alive.length} home=${sim.alive(0).length} nodes=${sim.nodes.length} liveTypes=${types} seen=${sim.typesSeen.size} records=${sim.records.length} money=${sim.money} belief=${sim.belief.toFixed(2)} avgKnow=${(alive.reduce((a, n) => a + n.know.size, 0) / alive.length).toFixed(1)} walkers=${sim.walkers.length}`);
  }
}
for (const l of sim.log) counts[l.kind] = (counts[l.kind] ?? 0) + 1;
console.log('log kinds', counts, 'feasts', sim.feasts);
const homeT = [...sim.homeTales.keys()].map((t) => sim.taleStatus(t));
console.log('HOME tales', homeT.length, 'recorded', homeT.filter((x) => x.recordedHere).length, 'only told', homeT.filter((x) => !x.recordedHere && !x.lost).length,
  'lost unrecorded', homeT.filter((x) => !x.recordedHere && x.lost).length, 'acts', JSON.stringify(sim.acts), 'money', sim.money);
for (const c of sim.commissions) console.log('commission', c.key, c.status, `best ${c.best}/${c.target}`, 'weeks', c.start, c.deadline);
const tell = [...sim.typeTellings.values()].reduce((a, b) => a + b, 0);
console.log('tellings', tell, 'records', sim.records.length, 'nodes', sim.nodes.length, 'mutated', sim.nodes.filter((n) => n.parent !== null).length);
const recNarr = new Map<number, number>();
for (const r of sim.records) recNarr.set(r.narrator, (recNarr.get(r.narrator) ?? 0) + 1);
console.log('recorded narrators', recNarr.size, 'of', sim.narrators.length, 'top', [...recNarr.values()].sort((a, b) => b - a).slice(0, 5));
const deep = sim.nodes.map((n) => sim.lineage(n.id).length).reduce((a, b) => Math.max(a, b), 0);
console.log('deepest lineage', deep, 'ms', Date.now() - t0);
for (const l of sim.log.filter((l) => ['mutation', 'sighting', 'record', 'death', 'collector'].includes(l.kind)).slice(0, 14)) console.log(' -', l.week, l.kind, l.text);
