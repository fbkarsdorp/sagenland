// What the player has encountered across runs, kept in this browser only.
import type { Sim } from './sim';

interface Entry {
  v: number[];   // variant numbers seen
  a: boolean;    // ever recorded by a collector
  r: boolean;    // ever opened and read
}
interface RegionCat {
  types: Record<string, Entry>;
  runs: number;
}

const KEY = 'sagenland.catalogue.v1';
let cache: Record<string, RegionCat> | null = null;

function load(): Record<string, RegionCat> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    cache = {};
  }
  return cache!;
}

let dirty = false;
function save() {
  if (!dirty) return;
  dirty = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable: the catalogue lives for this session only */
  }
}
setInterval(save, 4000);
window.addEventListener('beforeunload', save);

export function catalogue(region: string): RegionCat {
  const all = load();
  all[region] ??= { types: {}, runs: 0 };
  return all[region];
}

let seenNodes = 0;
let seenRecords = 0;
export function recordCatalogue(sim: Sim) {
  const cat = catalogue(sim.corpus.region);
  for (; seenNodes < sim.nodes.length; seenNodes++) {
    const n = sim.nodes[seenNodes];
    const e = (cat.types[n.t] ??= { v: [], a: false, r: false });
    if (!e.v.includes(n.n)) {
      e.v.push(n.n);
      dirty = true;
    }
  }
  for (; seenRecords < sim.records.length; seenRecords++) {
    const e = (cat.types[sim.records[seenRecords].t] ??= { v: [], a: false, r: false });
    if (!e.a) {
      e.a = true;
      dirty = true;
    }
  }
}

export function markRead(region: string, t: string) {
  const e = (catalogue(region).types[t] ??= { v: [], a: false, r: false });
  if (!e.r) {
    e.r = true;
    dirty = true;
  }
}

export function countRun(region: string) {
  catalogue(region).runs++;
  dirty = true;
  save();
}

export function resetCatalogueCursor() {
  seenNodes = 0;
  seenRecords = 0;
}
