// The story world: narrators who tell, forget, travel and die; legends drawn by places;
// stories that change on the road; and a collector who writes some of it down.
import type { Archetype, Corpus, Variant } from './data';
import { Rng } from './rng';
import {
  BUILD, BRIDGE_COST, ROAD_COST, H, N4, W, addBuilding, crossroads, generateMap, idx, inb,
  placeRoadTile, roadPath, terrainNear,
  type BKind, type Building, type MapData, type Place,
} from './world';
import { describeChange, makeNamer, placeNames, seasonOf, WEEKS_PER_YEAR, yearOf } from './text';

export const RUN_YEARS = 25;

export interface Memory {
  node: number;
  s: number;            // strength; forgotten at 0
  at: number;           // week learned
  from: number | null;  // narrator id it was heard from (-1: peddler, null: own experience / seed)
}

export interface Narrator {
  id: number;
  first: string;
  last: string;
  born: number;         // year
  died: number | null;  // week
  place: number;
  home: number;         // building id
  talent: number;
  wander: number;
  capacity: number;
  know: Map<string, Memory>;
  told: number;
  heard: number;
  recordedNodes: Set<number>;
  sessions: number;
  away: boolean;
  everKnew: number;
  recent: number;       // tellings lately (decays), for the effective number of tellers
}

export type Cause = 'seed' | 'sighting' | 'drift' | 'travel' | 'peddler' | 'newcomer' | 'inherit';

export interface StoryNode {
  id: number;
  t: string;
  n: number;
  place: number;
  parent: number | null;
  week: number;
  cause: Cause;
  by: number | null;
  tellings: number;
  holders: number;
  everHolders: number;
  anchor: number | null;   // building id for sightings
  diff: string | null;
  records: number[];
}

export interface ArchiveRecord {
  id: number;
  node: number;
  t: string;
  n: number;
  narrator: number;
  place: number;
  week: number;
}

export type WalkerKind = 'narrator' | 'collector' | 'peddler';

export interface Walker {
  id: number;
  kind: WalkerKind;
  who: number;
  path: number[];
  pos: number;
  speed: number;
  to: number;            // destination place id, -1 = leaving the map
  carry: string | null;  // type code being carried (for the glyph)
  returning: boolean;
  errand?: string | null; // a tale the player asked this narrator to bring
}

export type LogKind = 'sighting' | 'travel' | 'mutation' | 'death' | 'record' | 'collector' | 'build' | 'info' | 'lost' | 'peddler' | 'era' | 'tell';

/** A tale as it lives (or lived) in the player's village. */
export interface HomeTale {
  t: string;
  since: number;         // week it was first known at home
  lost: number | null;   // week the last person at home forgot it
  via: Cause;
}

export interface TaleStatus {
  holders: Narrator[];
  present: Narrator[];
  strength: number;      // strongest memory at home
  recordedHere: number;  // records of this tale from the village
  recordedElsewhere: number;
  lost: boolean;
  fragile: boolean;
  versions: number;      // distinct versions known at home
}

/** Where and by whom stories are told in a village: this sets the effective number of tellers. */
export type Culture = 'haard' | 'gewoon' | 'herberg';
export const CULTURE: Record<Culture, { nl: string; desc: string; k: number; aud: [number, number] }> = {
  haard: { nl: 'Aan de eigen haard', desc: 'Iedereen vertelt een beetje, aan wie er toevallig bij zit.', k: 0, aud: [1, 3] },
  gewoon: { nl: 'Zoals het gaat', desc: 'Wie graag vertelt, vertelt vaker.', k: 1, aud: [2, 5] },
  herberg: { nl: 'In de herberg', desc: 'Een paar bekende vertellers voeren het woord, het hele dorp luistert.', k: 3, aud: [5, 12] },
};

export interface PlaceDiversity {
  n: number;          // people
  s: number;          // tale types known
  d: number;          // effective number of types (inverse Simpson over who knows what)
  ne: number;         // effective number of tellers
  types: Map<string, number>;
}

export interface HistoryPoint {
  week: number;
  places: { n: number; s: number; d: number; ne: number }[];
  gamma: number;      // types alive in the whole region
  overlap: number;    // mean Jaccard similarity between villages
}

/** A letter from the collector: a target in the story world, with a deadline. */
export type CommissionKey = 'rijk' | 'streek' | 'eigen' | 'stemmen' | 'reis';
export interface Commission {
  id: number;
  key: CommissionKey;
  title: string;
  text: string;
  hint: string;
  target: number;
  start: number;
  deadline: number;
  status: 'open' | 'done' | 'failed';
  reward: number;
  best: number;
}

export const TELL_COST = 4;
export const SEND_COST = 3;

export interface LogEntry {
  id: number;
  week: number;
  kind: LogKind;
  text: string;
  node?: number;
  place?: number;
  narrator?: number;
  newType?: boolean;
}

export interface CollectorParams {
  mode: 'return' | 'tour' | 'parish' | 'resident';
  startFrac: number;
  every: number;     // years between visits (return)
  weeksAt: number;   // weeks per place
  sessions: number;  // narrator sessions per week (resident: chance per week)
  perVisit: number;
  revisit: number;   // weight for narrators already visited (0 = never)
  prolific: number;  // exponent on repertoire size when picking narrators
  hops: number;      // how far from home the collector goes
}

export const COLLECTOR_PARAMS: Record<string, CollectorParams> = {
  volhouder: { mode: 'return', startFrac: 0.3, every: 2, weeksAt: 3, sessions: 2, perVisit: 3, revisit: 3, prolific: 1.1, hops: 2 },
  rondreiziger: { mode: 'tour', startFrac: 0.72, every: 0, weeksAt: 2, sessions: 2, perVisit: 4, revisit: 0, prolific: 1.4, hops: 99 },
  student: { mode: 'parish', startFrac: 0.84, every: 0, weeksAt: 36, sessions: 2, perVisit: 5, revisit: 0, prolific: 0.5, hops: 0 },
  notabele: { mode: 'resident', startFrac: 0.06, every: 0, weeksAt: 9999, sessions: 0.18, perVisit: 2, revisit: 10, prolific: 2.5, hops: 0 },
};

interface Visit {
  start: number;
  places: number[];
}

export interface CollectorState {
  key: string;
  name: string;
  params: CollectorParams;
  visits: Visit[];
  visitIdx: number;
  phase: 'waiting' | 'walking' | 'working' | 'away' | 'done';
  at: number;          // place id while working
  queue: number[];
  weeksLeft: number;
  walker: number | null;
  announced: Set<number>;
  failed: string[];
  circle: number[];    // the notable's favourite informants
  recQueue: number[];  // narrators the player sends the collector to, in order
  recTale: Map<number, string>;  // and the tale the player wants written down from them
  recsLeft: number;
}

export interface SimOptions {
  corpus: Corpus;
  archetype: string;
  seed: number;
  homeName?: string;
  /** a map made elsewhere (the collector's region) */
  map?: MapData;
  startYear?: number;
  /** no collector, no letters: the world runs on its own and the player collects */
  quiet?: boolean;
}

export interface Flow { from: number; to: number; t: string; node: number; mutated: boolean; path: number[]; errand: boolean }

type Listener = (e: { kind: 'log'; entry: LogEntry } | { kind: 'build' } | { kind: 'end' } | { kind: 'flow'; flow: Flow }
  | { kind: 'visit' } | { kind: 'commission'; commission: Commission }) => void;

const ATTRACT_TAG: Record<string, string[]> = {
  molen: ['molen'], kerk: ['kerk', 'kerkhof'], put: ['put'], kruisweg: ['kruisweg'], herberg: ['herberg'],
  smidse: ['smidse'], brug: ['brug'], boerderij: ['boerderij'], huis: ['huis'], kapel: ['kapel'], galg: ['galg'],
  heide: ['heide'], veen: ['veen'], bos: ['bos'], water: ['water'],
};

const ERAS: [number, string, number][] = [
  [1912, 'Er komt elektrisch licht in de grotere boerderijen. De donkere hoeken worden kleiner.', 0.05],
  [1927, 'De eerste radio in het dorp. Op winteravonden luistert men meer dan men vertelt.', 0.06],
  [1936, 'Een autobus rijdt nu tweemaal daags naar de stad.', 0.04],
  [1946, 'Na de oorlog trekken jongeren weg naar de stad en de fabriek.', 0.06],
  [1956, 'De eerste televisie staat in de herberg. Iedereen kijkt; niemand vertelt.', 0.08],
  [1968, 'Ruilverkaveling: sloten worden gedempt, paden rechtgetrokken, oude plekken verdwijnen.', 0.06],
];

export class Sim {
  readonly rng: Rng;
  readonly corpus: Corpus;
  readonly map: MapData;
  readonly archetypeKey: string;
  readonly archetype: Archetype;
  readonly startYear: number;
  readonly totalWeeks = RUN_YEARS * WEEKS_PER_YEAR;
  week = 0;
  money = 40;
  /** a storytelling evening at home runs until this week */
  feastUntil = -1;
  feasts = 0;
  homeTales = new Map<string, HomeTale>();
  culture: Culture[] = [];
  history: HistoryPoint[] = [];
  commissions: Commission[] = [];
  collectorBonus = 0;
  private nextOffer = 30;
  private offerOrder: CommissionKey[] = [];
  /** what the player did, for the end */
  acts = { tells: 0, sends: 0, recs: 0, roads: 0, breaks: 0, cultures: 0 };
  private flowCtx: { from: number; to: number; path: number[]; errand: boolean; seen: Set<string> } | null = null;
  belief = 1;
  narrators: Narrator[] = [];
  nodes: StoryNode[] = [];
  records: ArchiveRecord[] = [];
  walkers: Walker[] = [];
  log: LogEntry[] = [];
  typesSeen = new Set<string>();
  typeHolders = new Map<string, number>();
  typeTellings = new Map<string, number>();
  collector: CollectorState;
  over = false;
  private listeners: Listener[] = [];
  private nextWalker = 1;
  private nextLog = 1;
  private reach = new Map<number, Map<number, number[]>>(); // place -> place -> path
  private exitReach = new Map<number, number[]>();          // place -> path from nearest exit
  private crossTiles: number[] = [];
  private namer: () => string;
  private eras: [number, string, number][];

  readonly seed: number;
  readonly quiet: boolean;

  constructor(opts: SimOptions) {
    this.seed = opts.seed;
    this.rng = new Rng(opts.seed);
    this.corpus = opts.corpus;
    this.archetypeKey = opts.archetype;
    this.archetype = this.corpus.meta.archetypes[opts.archetype];
    const real = this.archetype.real;
    // the run ends in the last year the real collector (pattern) was at work, capped to the 1970s
    const end = Math.min(1975, Math.max(1925, real.years[1] ?? 1965));
    this.startYear = opts.startYear ?? end - RUN_YEARS;
    this.quiet = !!opts.quiet;
    const names = placeNames(this.corpus.region, this.rng).filter((n) => n !== opts.homeName);
    if (opts.homeName) names.unshift(opts.homeName);
    this.map = opts.map ?? generateMap(this.rng, this.corpus.region, names);
    this.namer = makeNamer(this.corpus.meta, this.corpus.region, this.rng);
    this.eras = ERAS.filter(([y]) => y > this.startYear && y < end);

    this.culture = this.map.places.map((p) => (this.placeBuildings(p.id).some((b) => b.kind === 'herberg') ? 'herberg' : 'gewoon'));
    for (const b of this.map.buildings) this.settle(b, true);
    this.seedRepertoires();
    this.recomputeRoads();
    this.collector = this.planCollector();
    this.recordHistory();
    if (this.quiet) this.collector.phase = 'done';
    // the first letter is waiting on the table when the game begins
    else this.offerCommission();
  }

  on(fn: Listener) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }
  private emit(e: Parameters<Listener>[0]) {
    for (const f of this.listeners) f(e);
  }

  // ------------------------------------------------------------------ helpers

  get home(): Place {
    return this.map.places[0];
  }
  get year(): number {
    return yearOf(this.startYear, this.week);
  }
  variant(n: number): Variant {
    return this.corpus.variants.get(n)!;
  }
  type(t: string) {
    return this.corpus.meta.types[t];
  }
  nodeVariant(id: number): Variant {
    return this.variant(this.nodes[id].n);
  }
  name(n: Narrator) {
    return `${n.first} ${n.last}`;
  }
  alive(place?: number): Narrator[] {
    return this.narrators.filter((n) => n.died === null && (place === undefined || n.place === place));
  }
  present(place: number): Narrator[] {
    return this.narrators.filter((n) => n.died === null && n.place === place && !n.away);
  }
  placeBuildings(place: number): Building[] {
    return this.map.buildings.filter((b) => b.place === place);
  }
  private addLog(kind: LogKind, text: string, extra: Partial<LogEntry> = {}) {
    const entry: LogEntry = { id: this.nextLog++, week: this.week, kind, text: text.charAt(0).toUpperCase() + text.slice(1), ...extra };
    this.log.push(entry);
    if (this.log.length > 3000) this.log.splice(0, this.log.length - 3000);
    this.emit({ kind: 'log', entry });
    return entry;
  }

  // ------------------------------------------------------------------ people

  private newNarrator(place: number, home: number, age: number, last?: string): Narrator {
    const [first, ...rest] = this.namer().split(' ');
    const n: Narrator = {
      id: this.narrators.length, first, last: last ?? rest.join(' '), born: this.startYear + Math.floor(this.week / WEEKS_PER_YEAR) - age,
      died: null, place, home, talent: Math.max(0.25, this.rng.range(0.3, 1.1) ** 1.5 * 1.6),
      wander: this.rng.range(0.3, 1.6), capacity: 8 + this.rng.int(10), know: new Map(), told: 0, heard: 0,
      recordedNodes: new Set(), sessions: 0, away: false, everKnew: 0, recent: 0,
    };
    this.narrators.push(n);
    return n;
  }

  /** Households that move into a building. */
  private settle(b: Building, initial: boolean) {
    const def = BUILD[b.kind];
    for (let h = 0; h < def.households; h++) {
      const count = this.rng.chance(0.55) ? 2 : 1;
      let last: string | undefined;
      for (let k = 0; k < count; k++) {
        const n = this.newNarrator(b.place, b.id, initial ? 20 + this.rng.int(62) : 20 + this.rng.int(35), last);
        last = n.last;
        if (!initial) this.giveNewcomerStories(n);
      }
    }
  }

  private giveNewcomerStories(n: Narrator) {
    // newcomers bring a story or two from elsewhere in the region
    const k = 1 + this.rng.int(2);
    for (let i = 0; i < k; i++) {
      const v = this.randomRegionVariant(true);
      if (!v || n.know.has(v.t)) continue;
      const node = this.newNode(v, n.place, null, 'newcomer', n.id);
      this.setMemory(n, node, 1.2, null);
    }
  }

  private regionTypes: [string, number][] | null = null;
  private randomRegionVariant(preferUnseen: boolean): Variant | undefined {
    if (!this.regionTypes) this.regionTypes = [...this.corpus.byType.entries()].map(([t, vs]) => [t, vs.length]);
    const pick = this.rng.weighted(this.regionTypes, ([t, c]) =>
      Math.pow(c, 0.55) * (preferUnseen && (this.typeHolders.get(t) ?? 0) > 0 ? 0.25 : 1));
    if (!pick) return undefined;
    return this.rng.pick(this.corpus.byType.get(pick[0])!);
  }

  private seedRepertoires() {
    for (const p of this.map.places) {
      // a local tradition: a handful of tales shared in the village
      const pool: StoryNode[] = [];
      const attractors = this.attractorKinds(p.id);
      const size = p.home ? 6 : 8;
      for (let i = 0; i < size * 3 && pool.length < size; i++) {
        let v: Variant | undefined;
        if (i % 2 === 0 && attractors.length) v = this.drawForAttractor(this.rng.pick(attractors), p.id);
        else v = this.randomRegionVariant(false);
        if (!v || pool.some((s) => s.t === v!.t)) continue;
        pool.push(this.newNode(v, p.id, null, 'seed', null));
      }
      for (const n of this.alive(p.id)) {
        const k = Math.min(n.capacity, 1 + this.rng.int(4) + (n.talent > 1 ? 2 : 0));
        for (const s of this.rng.shuffle([...pool]).slice(0, k)) this.setMemory(n, s, this.rng.range(0.8, 2.2), null);
      }
    }
  }

  /** Give someone a tale that nobody else tells: for a story the collector has to search for. */
  implant(n: Narrator, v: Variant) {
    const node = this.newNode(v, n.place, null, 'seed', null);
    this.setMemory(n, node, 2.8, null);
  }

  private setMemory(n: Narrator, node: StoryNode, s: number, from: number | null) {
    const old = n.know.get(node.t);
    if (old) this.dropMemory(n, node.t, true);
    if (n.place === 0) {
      const ht = this.homeTales.get(node.t);
      if (!ht) this.homeTales.set(node.t, { t: node.t, since: this.week, lost: null, via: node.cause });
      else if (ht.lost !== null) ht.lost = null;
    }
    n.know.set(node.t, { node: node.id, s, at: this.week, from });
    node.holders++;
    node.everHolders++;
    n.everKnew++;
    this.typeHolders.set(node.t, (this.typeHolders.get(node.t) ?? 0) + 1);
    if (!this.typesSeen.has(node.t)) this.typesSeen.add(node.t);
    // limited memory: the weakest story goes
    if (n.know.size > n.capacity) {
      let weakest: string | null = null, ws = Infinity;
      for (const [t, m] of n.know) if (t !== node.t && m.s < ws) { ws = m.s; weakest = t; }
      if (weakest) this.dropMemory(n, weakest);
    }
  }

  /** A full head takes in a new tale only if something in it is nearly forgotten. */
  private hasRoom(n: Narrator): boolean {
    if (n.know.size < n.capacity) return true;
    for (const m of n.know.values()) if (m.s < 0.6) return true;
    return false;
  }

  private dropMemory(n: Narrator, t: string, replacing = false) {
    const m = n.know.get(t);
    if (!m) return;
    n.know.delete(t);
    const node = this.nodes[m.node];
    node.holders--;
    const left = (this.typeHolders.get(t) ?? 1) - 1;
    this.typeHolders.set(t, left);
    if (replacing) return;
    if (n.place === 0 && this.week > 0 && !this.narrators.some((o) => o !== n && o.died === null && o.place === 0 && o.know.has(t))) {
      const ht = this.homeTales.get(t);
      if (ht) ht.lost = this.week;
      const rec = this.records.some((r) => r.t === t && r.place === 0);
      this.addLog('lost', `In ${this.home.name} kent niemand meer „${this.type(t).nl}”. ${rec ? 'Het staat in het notitieboek.' : 'Niemand heeft het opgeschreven.'}`,
        { node: node.id, place: 0, narrator: n.id });
    } else if (left === 0 && this.week > 0) {
      this.addLog('lost', `Niemand in de streek vertelt nog „${this.type(t).nl}”.`, { node: node.id, place: n.place });
    }
  }

  // ------------------------------------------------------------------ story nodes and change

  private newNode(v: Variant, place: number, parent: StoryNode | null, cause: Cause, by: number | null, anchor: number | null = null): StoryNode {
    const node: StoryNode = {
      id: this.nodes.length, t: v.t, n: v.n, place, parent: parent?.id ?? null, week: this.week, cause, by,
      tellings: 0, holders: 0, everHolders: 0, anchor, records: [],
      diff: parent ? describeChange(this.corpus.meta, this.variant(parent.n), v) : null,
    };
    this.nodes.push(node);
    return node;
  }

  /** Pick another real variant of the same tale type, near in meaning and fitting the new place. */
  private mutate(node: StoryNode, place: number, cause: Cause, by: number): StoryNode {
    const v = this.variant(node.n);
    const cands: [Variant, number][] = [];
    for (const [n, sim] of v.nb) {
      const w = this.corpus.variants.get(n);
      if (w) cands.push([w, sim]);
    }
    const same = this.corpus.byType.get(v.t)!;
    for (let i = 0; i < 2 && same.length > 1; i++) {
      const w = this.rng.pick(same);
      if (w.n !== v.n) cands.push([w, 0.55]);
    }
    if (!cands.length) return node;
    const local = new Set(this.attractorKinds(place).flatMap((a) => ATTRACT_TAG[a] ?? []));
    const tagIds = this.corpus.meta.tags;
    const pick = this.rng.weighted(cands, ([w, sim]) => {
      let fit = 1;
      for (const g of w.g) if (tagIds[g].cat === 'place' && local.has(tagIds[g].id)) fit += 0.8;
      return Math.pow(Math.max(0.05, sim), 6) * fit;
    })!;
    // reuse an existing node if this variant already lives in this place
    const existing = this.nodes.find((x) => x.n === pick[0].n && x.place === place && x.holders > 0);
    if (existing) return existing;
    return this.newNode(pick[0], place, node, cause, by);
  }

  // ------------------------------------------------------------------ telling

  private hear(listener: Narrator, node: StoryNode, teller: Narrator | null, place: number, mutP: number, cause: Cause): StoryNode | null {
    listener.heard++;
    const known = listener.know.get(node.t);
    if (known) {
      if (known.node === node.id) {
        known.s = Math.min(3, known.s + 0.3);
      } else if (this.rng.chance(0.1)) {
        // the other version wins
        this.setMemory(listener, node, 0.9, teller?.id ?? -1);
        return node;
      } else {
        known.s = Math.min(3, known.s + 0.12);
      }
      return null;
    }
    const pLearn = 0.32 * (0.6 + listener.talent * 0.4);
    if (!this.rng.chance(pLearn) || !this.hasRoom(listener)) return null;
    let learned = node;
    if (this.rng.chance(mutP)) learned = this.mutate(node, place, cause, listener.id);
    this.setMemory(listener, learned, 0.9, teller?.id ?? -1);
    const fc = this.flowCtx;
    if (fc && !fc.seen.has(node.t)) {
      fc.seen.add(node.t);
      this.emit({ kind: 'flow', flow: { from: fc.from, to: fc.to, t: node.t, node: learned.id, mutated: learned !== node, path: fc.path, errand: fc.errand } });
    }
    if (learned !== node && learned.parent === node.id && learned.holders === 1 && cause === 'travel') {
      const from = this.map.places[node.place]?.name ?? 'elders';
      this.addLog('mutation', `Onderweg van ${from} naar ${this.map.places[place].name} veranderde „${this.type(node.t).nl}”. ${learned.diff ?? ''}`,
        { node: learned.id, place, narrator: listener.id });
    }
    return learned;
  }

  private tell(teller: Narrator, place: number, audience: Narrator[], mutP: number, cause: Cause, pickType?: string) {
    if (!teller.know.size) return;
    const local = new Set(this.attractorKinds(place).flatMap((a) => ATTRACT_TAG[a] ?? []));
    const tags = this.corpus.meta.tags;
    const entries = [...teller.know.entries()];
    const chosen = pickType ? entries.find(([t]) => t === pickType) : this.rng.weighted(entries, ([, m]) => {
      // a place reminds people of its stories
      const v = this.nodeVariant(m.node);
      let boost = 1;
      for (const g of v.g) if (tags[g].cat === 'place' && local.has(tags[g].id)) boost += 0.6;
      return (0.3 + m.s) * boost;
    });
    if (!chosen) return;
    const [t, mem] = chosen;
    const node = this.nodes[mem.node];
    mem.s = Math.min(3, mem.s + 0.35);
    node.tellings++;
    teller.told++;
    this.typeTellings.set(t, (this.typeTellings.get(t) ?? 0) + 1);
    for (const l of audience) if (l !== teller) this.hear(l, node, teller, place, mutP, cause);
  }

  private tellingRate(place: number): number {
    const s = seasonOf(this.week);
    const season = [0.7, 0.45, 1.2, 2.0][s];
    let bonus = 1;
    for (const b of this.placeBuildings(place)) bonus += BUILD[b.kind].tell;
    return 0.05 * season * Math.max(0.3, bonus) * this.belief;
  }

  // ------------------------------------------------------------------ attractors and sightings

  /** Attractor kinds active for a place: its buildings, crossroads and landscape nearby. */
  attractorKinds(place: number): string[] {
    const out: string[] = [];
    for (const b of this.placeBuildings(place)) {
      const a = BUILD[b.kind].attract;
      if (a) out.push(a);
    }
    for (const i of this.crossTiles) if (this.nearestPlace(i % W, (i / W) | 0) === place) out.push('kruisweg');
    for (const [x, y] of this.bridgesNear(place)) if (x >= 0 && y >= 0) out.push('brug');
    const pts = this.placeBuildings(place).map((b) => [b.x, b.y] as [number, number]);
    const tn = terrainNear(this.map, pts, 2);
    if (tn.heide >= 5) out.push('heide');
    if (tn.bos >= 5) out.push('bos');
    if (tn.veen >= 4) out.push('veen');
    if (tn.water >= 3) out.push('water');
    return out;
  }

  private bridgesNear(place: number): [number, number][] {
    const p = this.map.places[place];
    const out: [number, number][] = [];
    for (let y = p.y - 6; y <= p.y + 6; y++)
      for (let x = p.x - 6; x <= p.x + 6; x++)
        if (inb(x, y) && this.map.tiles[idx(x, y)].bridge && this.nearestPlace(x, y) === place) out.push([x, y]);
    return out.slice(0, 2);
  }

  nearestPlace(x: number, y: number): number {
    let best = 0, bd = Infinity;
    for (const p of this.map.places) {
      const d = Math.abs(p.x - x) + Math.abs(p.y - y);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  private drawForAttractor(a: string, place: number): Variant | undefined {
    const table = this.corpus.meta.regions[this.corpus.region].attract[a] ?? [];
    const known = new Set<string>();
    for (const n of this.alive(place)) for (const t of n.know.keys()) known.add(t);
    const avail = table.filter(([t]) => this.corpus.byType.has(t));
    const pick = this.rng.weighted(avail, ([t, w]) => Math.pow(w, 0.6) * (known.has(t) ? 0.25 : 1) * ((this.typeHolders.get(t) ?? 0) > 0 ? 0.6 : 1));
    if (!pick) return undefined;
    const tags = new Set((ATTRACT_TAG[a] ?? []).map((id) => this.corpus.meta.tags.findIndex((x) => x.id === id)));
    const vs = this.corpus.byType.get(pick[0])!;
    return this.rng.weighted(vs, (v) => (v.g.some((g) => tags.has(g)) ? 5 : 1));
  }

  private sightings() {
    const s = seasonOf(this.week);
    const season = [0.9, 0.7, 1.2, 1.4][s];
    for (const p of this.map.places) {
      const people = this.alive(p.id);
      if (!people.length) continue;
      // one chance per kind of attractor (ten houses do not make ten haunted houses)
      const byKind = new Map<string, Building[]>();
      for (const b of this.placeBuildings(p.id)) {
        const a = BUILD[b.kind].attract;
        if (a) byKind.set(a, [...(byKind.get(a) ?? []), b]);
      }
      const instances: { a: string; b: Building | null }[] = [...byKind.entries()].map(([a, bs]) => ({ a, b: this.rng.pick(bs) }));
      for (const a of new Set(this.attractorKinds(p.id))) if (!byKind.has(a)) instances.push({ a, b: null });
      for (const inst of instances) {
        // every person can see something: innovation grows with the population
        let pr = 0.026 * this.belief * season * (this.quiet ? 0.7 : p.home ? 1.5 : 0.45) * Math.min(3, Math.max(0.3, people.length / 8));
        if (inst.b && this.nodes.some((n) => n.anchor === inst.b!.id && n.holders > 0)) pr *= 0.35;
        if (!this.rng.chance(pr)) continue;
        const v = this.drawForAttractor(inst.a, p.id);
        if (!v) continue;
        const witness = inst.b
          ? this.rng.weighted(people, (n) => 1 / (1 + Math.hypot(this.map.buildings[n.home].x - inst.b!.x, this.map.buildings[n.home].y - inst.b!.y)))!
          : this.rng.pick(people);
        const isNew = !this.typesSeen.has(v.t);
        const node = this.newNode(v, p.id, null, 'sighting', witness.id, inst.b?.id ?? null);
        this.setMemory(witness, node, 2.2, null);
        const where = inst.b ? AT_BUILDING[inst.b.kind] : landscapePhrase(inst.a);
        if (p.home || isNew) {
          this.addLog('sighting', `${this.name(witness)} vertelt wat er ${where} in ${p.name} gebeurde: „${this.type(v.t).nl}”.`,
            { node: node.id, place: p.id, narrator: witness.id, newType: isNew });
        }
      }
    }
  }

  // ------------------------------------------------------------------ roads, travel, walkers

  recomputeRoads() {
    this.reach.clear();
    this.exitReach.clear();
    this.crossTiles = crossroads(this.map);
    const rt = this.map.places.map((p) => placeRoadTile(this.map, p));
    for (const p of this.map.places) {
      const m = new Map<number, number[]>();
      const a = rt[p.id];
      if (a !== null) {
        for (const q of this.map.places) {
          if (q.id === p.id) continue;
          const b = rt[q.id];
          if (b === null) continue;
          const path = roadPath(this.map, a, b);
          if (path) m.set(q.id, path);
        }
        let best: number[] | null = null;
        for (const e of this.map.exits) {
          const path = roadPath(this.map, idx(e.x, e.y), a);
          if (path && (!best || path.length < best.length)) best = path;
        }
        if (best) this.exitReach.set(p.id, best);
      }
      this.reach.set(p.id, m);
    }
  }

  connected(a: number, b: number): boolean {
    return this.reach.get(a)?.has(b) ?? false;
  }
  connectedPlaces(a: number): number[] {
    return [...(this.reach.get(a)?.keys() ?? [])];
  }
  homeConnectedToWorld(): boolean {
    return this.connectedPlaces(0).length > 0 || this.exitReach.has(0);
  }

  private spawnWalker(kind: WalkerKind, who: number, path: number[], to: number, carry: string | null, returning = false): Walker {
    const w: Walker = { id: this.nextWalker++, kind, who, path, pos: 0, speed: kind === 'narrator' ? 3.5 : 3, to, carry, returning };
    this.walkers.push(w);
    return w;
  }

  private travel() {
    const s = seasonOf(this.week);
    const season = [1.0, 1.5, 1.4, 0.5][s];
    for (const n of this.narrators) {
      if (n.died !== null || n.away || !n.know.size) continue;
      const dests = this.connectedPlaces(n.place);
      if (!dests.length) continue;
      if (!this.rng.chance(0.008 * n.wander * season)) continue;
      const to = this.rng.weighted(dests, (q) => 1 / this.reach.get(n.place)!.get(q)!.length)!;
      const path = this.reach.get(n.place)!.get(to)!;
      const carry = this.strongest(n)?.[0] ?? null;
      n.away = true;
      this.spawnWalker('narrator', n.id, path, to, carry);
    }
    // peddlers and other strangers come in along roads from the map edge
    if (this.exitReach.size && this.rng.chance(0.022 * season)) {
      const starts = [...this.exitReach.keys()];
      const to = this.rng.pick(starts);
      const v = this.randomRegionVariant(true);
      if (v) {
        const node = this.newNode(v, -1, null, 'peddler', null);
        this.spawnWalker('peddler', node.id, this.exitReach.get(to)!, to, v.t);
      }
    }
  }

  private strongest(n: Narrator): [string, Memory] | undefined {
    let best: [string, Memory] | undefined;
    for (const e of n.know) if (!best || e[1].s > best[1].s) best = e;
    return best;
  }

  private moveWalkers() {
    const done: Walker[] = [];
    for (const w of this.walkers) {
      w.pos += w.speed;
      if (w.pos >= w.path.length - 1) {
        w.pos = w.path.length - 1;
        done.push(w);
      }
    }
    for (const w of done) {
      this.walkers = this.walkers.filter((x) => x !== w);
      this.arrive(w);
    }
  }

  private arrive(w: Walker) {
    if (w.kind === 'narrator') {
      const n = this.narrators[w.who];
      if (w.returning || n.died !== null) {
        n.away = false;
        return;
      }
      const locals = this.present(w.to);
      if (locals.length) {
        this.flowCtx = { from: n.place, to: w.to, path: w.path, errand: false, seen: new Set() };
        if (w.errand && n.know.has(w.errand)) {
          // the tale the player sent along: told to everyone, twice
          const t = w.errand;
          const before = locals.filter((l) => l.know.has(t)).length;
          this.flowCtx.errand = true;
          for (let i = 0; i < 2; i++) this.tell(n, w.to, locals, 0.45, 'travel', t);
          this.flowCtx.errand = false;
          const after = locals.filter((l) => l.know.has(t)).length;
          const gained = after - before;
          this.addLog('tell', gained > 0
            ? `${this.name(n)} vertelt in ${this.map.places[w.to].name} „${this.type(t).nl}”. ${gained === 1 ? 'Eén luisteraar onthoudt' : `${gained} luisteraars onthouden`} het.`
            : `${this.name(n)} vertelt in ${this.map.places[w.to].name} „${this.type(t).nl}”, maar niemand neemt het over.`,
            { place: 0, narrator: n.id, node: n.know.get(t)?.node });
        }
        // the visitor tells a few stories, and hears some back
        const k = 1 + this.rng.int(3);
        for (let i = 0; i < k; i++) {
          const aud = this.rng.shuffle([...locals]).slice(0, 2 + this.rng.int(3));
          this.tell(n, w.to, aud, 0.45, 'travel');
        }
        this.flowCtx = { from: w.to, to: n.place, path: [...w.path].reverse(), errand: false, seen: new Set() };
        const back = 1 + this.rng.int(2);
        for (let i = 0; i < back; i++) {
          const teller = this.rng.pick(locals);
          if (!teller.know.size) continue;
          const [t, m] = this.rng.pick([...teller.know.entries()]);
          const node = this.nodes[m.node];
          teller.told++;
          node.tellings++;
          this.typeTellings.set(t, (this.typeTellings.get(t) ?? 0) + 1);
          this.hear(n, node, teller, n.place, 0.45, 'travel');
        }
        this.flowCtx = null;
      }
      const path = [...w.path].reverse();
      const carry = this.strongest(n)?.[0] ?? null;
      this.spawnWalker('narrator', n.id, path, n.place, carry, true);
    } else if (w.kind === 'peddler') {
      const node = this.nodes[w.who];
      if (w.to >= 0) {
        const locals = this.present(w.to);
        for (let i = 0; i < 2 && locals.length; i++) {
          const aud = this.rng.shuffle([...locals]).slice(0, 3);
          node.tellings++;
          this.typeTellings.set(node.t, (this.typeTellings.get(node.t) ?? 0) + 1);
          for (const l of aud) this.hear(l, node, null, w.to, 0.25, 'peddler');
        }
        if (w.to === 0 && locals.length) {
          this.addLog('peddler', `Een marskramer vertelt in ${this.home.name} „${this.type(node.t).nl}”.`, { node: node.id, place: 0 });
        }
        // move on to another connected place, or leave
        const next = this.connectedPlaces(w.to).filter((q) => q !== w.to);
        if (next.length && this.rng.chance(0.6)) {
          const q = this.rng.pick(next);
          this.spawnWalker('peddler', w.who, this.reach.get(w.to)!.get(q)!, q, node.t);
        } else {
          const out = this.exitReach.get(w.to);
          if (out) this.spawnWalker('peddler', w.who, [...out].reverse(), -1, node.t);
        }
      }
    } else if (w.kind === 'collector') {
      this.collectorArrive(w);
    }
  }

  // ------------------------------------------------------------------ the collector

  private planCollector(): CollectorState {
    const key = this.archetypeKey;
    const params = COLLECTOR_PARAMS[key];
    const visits: Visit[] = [];
    const first = Math.round(params.startFrac * this.totalWeeks);
    if (params.mode === 'return') {
      for (let w = first; w < this.totalWeeks - 12; w += params.every * WEEKS_PER_YEAR + this.rng.int(20) - 10)
        visits.push({ start: w, places: [] });
    } else {
      visits.push({ start: first, places: [] });
    }
    return {
      key, name: collectorName(key, this.corpus.region), params, visits, visitIdx: 0, phase: 'waiting', at: -1, queue: [],
      weeksLeft: 0, walker: null, announced: new Set(), failed: [], circle: [], recQueue: [], recTale: new Map(), recsLeft: 3,
    };
  }

  nextVisitWeek(): number | null {
    const c = this.collector;
    return c.visitIdx < c.visits.length ? c.visits[c.visitIdx].start : null;
  }

  private collectorTick() {
    const c = this.collector;
    if (c.phase === 'done') return;
    const p = c.params;
    if (c.phase === 'waiting' || c.phase === 'away') {
      const v = c.visits[c.visitIdx];
      if (!v) {
        c.phase = 'done';
        return;
      }
      if (v.start - this.week === 8 && !c.announced.has(c.visitIdx)) {
        c.announced.add(c.visitIdx);
        const again = c.visitIdx > 0 ? 'weer ' : '';
        this.addLog('collector', `Bericht: over twee maanden komt ${c.name} ${again}verhalen optekenen in de streek.`);
      }
      if (this.week < v.start) return;
      // plan the route
      let route: number[];
      if (p.mode === 'parish' || p.mode === 'resident') route = [0];
      else if (p.mode === 'return') {
        const near = this.map.places.filter((q) => !q.home).sort((a, b) => dist(a, this.home) - dist(b, this.home)).slice(0, p.hops);
        route = [0, ...near.map((q) => q.id)];
      } else {
        // a tour: from the entry, always the nearest unvisited place
        route = [];
        const left = new Set(this.map.places.map((q) => q.id));
        let cur = this.map.places.find((q) => this.exitReach.has(q.id)) ?? this.home;
        while (left.size) {
          const next = [...left].map((id) => this.map.places[id]).sort((a, b) => dist(a, cur) - dist(b, cur))[0];
          route.push(next.id);
          left.delete(next.id);
          cur = next;
        }
      }
      c.queue = route;
      c.visitIdx++;
      c.recsLeft = 3;
      this.collectorNext(true);
      return;
    }
    if (c.phase === 'working') {
      c.weeksLeft--;
      if (p.mode === 'resident' && this.week % WEEKS_PER_YEAR === 0) c.recsLeft = 2;
      if (p.mode === 'resident') {
        if (this.rng.chance(p.sessions)) this.session(c.at);
      } else {
        for (let i = 0; i < p.sessions; i++) this.session(c.at);
      }
      if (c.at === 0 && this.feasting()) this.session(0);
      if (c.weeksLeft <= 0) this.collectorNext(false);
    }
  }

  /** Move to the next place on the route (or leave). */
  private collectorNext(entering: boolean) {
    const c = this.collector;
    const from = c.at;
    while (c.queue.length) {
      const to = c.queue.shift()!;
      if (c.params.mode === 'parish' || c.params.mode === 'resident') {
        c.at = to;
        c.phase = 'working';
        c.weeksLeft = Math.min(c.params.weeksAt, this.totalWeeks - this.week);
        const how = c.params.mode === 'resident' ? 'vestigt zich' : 'neemt een kamer';
        this.addLog('collector', `${c.name} ${how} in ${this.map.places[to].name} en begint verhalen op te tekenen.`, { place: to });
        if (to === 0) this.emit({ kind: 'visit' });
        return;
      }
      let path: number[] | undefined | null;
      if (entering || from < 0) path = this.exitReach.get(to) ?? null;
      else path = this.reach.get(from)?.get(to) ?? null;
      if (from === to) path = [placeRoadTile(this.map, this.map.places[to])!];
      if (!path) {
        if (entering && this.exitReach.size === 0) continue;
        if (to === 0 || this.collector.params.mode === 'tour') {
          const msg = `${c.name} kon ${this.map.places[to].name} niet bereiken: er loopt geen weg heen.`;
          if (!c.failed.includes(msg)) {
            c.failed.push(msg);
            this.addLog('collector', msg, { place: to });
          }
        }
        continue;
      }
      c.phase = 'walking';
      const w = this.spawnWalker('collector', -1, path, to, null);
      c.walker = w.id;
      entering = false;
      return;
    }
    // done with this visit
    c.at = -1;
    c.walker = null;
    c.phase = c.visitIdx < c.visits.length ? 'away' : 'done';
    if (c.params.mode !== 'resident')
      this.addLog('collector', `${c.name} vertrekt met ${this.records.length} opgetekende verhalen in het notitieboek.`);
  }

  private collectorArrive(w: Walker) {
    const c = this.collector;
    c.walker = null;
    c.at = w.to;
    c.phase = 'working';
    const inn = this.placeBuildings(w.to).some((b) => b.kind === 'herberg');
    c.weeksLeft = c.params.weeksAt + (inn ? 2 : 0) + this.collectorBonus;
    this.addLog('collector', `${c.name} is in ${this.map.places[w.to].name}${inn ? ' en logeert in de herberg' : ''}.`, { place: w.to });
    if (w.to === 0) this.emit({ kind: 'visit' });
  }

  private session(place: number) {
    const c = this.collector;
    const p = c.params;
    let cands = this.present(place).filter((n) => n.know.size > 0);
    if (p.mode === 'resident') {
      // a notable listens mostly to a small circle: the best tellers they happen to know
      c.circle = c.circle.map((id) => {
        const n = this.narrators[id];
        if (n.died === null) return id;
        const heir = this.narrators.find((m) => m.home === n.home && m.died === null);
        return heir ? heir.id : -1;
      }).filter((id) => id >= 0);
      while (c.circle.length < 2) {
        const extra = this.rng.weighted(cands.filter((n) => !c.circle.includes(n.id)), (n) => n.talent ** 2 * (1 + n.know.size));
        if (!extra) break;
        c.circle.push(extra.id);
      }
      if (this.rng.chance(0.85)) cands = cands.filter((n) => c.circle.includes(n.id));
    }
    let pick = this.rng.weighted(cands, (n) => {
      const fresh = [...n.know.values()].filter((m) => !n.recordedNodes.has(m.node)).length;
      if (!fresh) return 0;
      const base = Math.pow(1 + n.know.size, p.prolific) * (0.5 + n.talent);
      if (n.sessions > 0) return p.revisit * base;
      return base;
    });
    // the player's suggestions come first, in the order given
    c.recQueue = c.recQueue.filter((id) => this.narrators[id].died === null && this.narrators[id].place === place);
    const ri = c.recQueue.findIndex((id) => !this.narrators[id].away);
    if (ri >= 0) {
      pick = this.narrators[c.recQueue[ri]];
      c.recQueue.splice(ri, 1);
    }
    if (!pick) return;
    pick.sessions++;
    const want = c.recTale.get(pick.id);
    c.recTale.delete(pick.id);
    const mems = [...pick.know.entries()].filter(([, m]) => !pick.recordedNodes.has(m.node))
      .sort(([ta, a], [tb, b]) => (tb === want ? 9 : 0) + b.s + this.rng.next() - ((ta === want ? 9 : 0) + a.s + this.rng.next()))
      .slice(0, p.perVisit + this.collectorBonus).map(([, m]) => m);
    const got: string[] = [];
    for (const m of mems) {
      const node = this.nodes[m.node];
      const rec: ArchiveRecord = { id: this.records.length + 1, node: node.id, t: node.t, n: node.n, narrator: pick.id, place, week: this.week };
      this.records.push(rec);
      node.records.push(rec.id);
      pick.recordedNodes.add(node.id);
      got.push(this.type(node.t).nl);
    }
    if (got.length) {
      this.addLog('record', `${c.name} tekent bij ${this.name(pick)} (${this.map.places[place].name}) ${got.length === 1 ? 'één verhaal' : got.length + ' verhalen'} op: ${got.map((g) => `„${g}”`).join(', ')}.`,
        { place, narrator: pick.id, node: mems[0].node });
    }
  }

  /** Who should the collector see for this tale: a present holder whose version is not yet written down. */
  recommendFor(t: string): Narrator | null {
    const c = this.collector;
    if (c.phase !== 'working' || c.at !== 0) return null;
    const cands = this.taleStatus(t).holders.filter((n) => this.canRecommend(n) && !n.recordedNodes.has(n.know.get(t)!.node));
    return cands.sort((a, b) => b.know.get(t)!.s - a.know.get(t)!.s)[0] ?? null;
  }

  /** The player, as a local go-between, points the collector to a narrator. */
  canRecommend(n: Narrator): boolean {
    const c = this.collector;
    return c.phase === 'working' && c.at === n.place && n.died === null && c.recsLeft > 0 && !c.recQueue.includes(n.id)
      && [...n.know.values()].some((m) => !n.recordedNodes.has(m.node));
  }

  recommendNarrator(id: number, tale?: string): boolean {
    const n = this.narrators[id];
    if (!this.canRecommend(n)) return false;
    const c = this.collector;
    c.recQueue.push(id);
    if (tale) c.recTale.set(id, tale);
    c.recsLeft--;
    this.acts.recs++;
    this.addLog('collector', `Je wijst ${c.name} de weg naar ${this.name(n)}${tale ? `, voor „${this.type(tale).nl}”` : ''}.`, { place: n.place, narrator: id });
    return true;
  }

  // ------------------------------------------------------------------ the year

  private yearly() {
    const y = this.year;
    for (const n of this.narrators) {
      if (n.died !== null) continue;
      const age = y - n.born;
      const pd = 0.0006 * Math.exp(0.085 * (age - 20));
      if (!this.rng.chance(pd)) continue;
      this.die(n);
    }
    for (const [ey, text, drop] of this.eras) {
      if (ey === y) {
        this.belief = Math.max(0.35, this.belief - drop);
        this.addLog('era', text);
      }
    }
  }

  /** A loner out of the village knows the tales of the place they live at. */
  seedFromAttractor(n: Narrator, a: string, k: number) {
    for (let i = 0; i < k * 3 && k > 0; i++) {
      const v = this.drawForAttractor(a, n.place);
      if (!v || n.know.has(v.t)) continue;
      this.setMemory(n, this.newNode(v, n.place, null, 'seed', null), this.rng.range(1.6, 2.6), null);
      k--;
    }
  }

  die(n: Narrator) {
    const known = n.know.size;
    const rec = n.recordedNodes.size;
    // someone in the household carries on, and remembers part of it
    const b = this.map.buildings[n.home];
    let heir: Narrator | null = null;
    if (b) {
      heir = this.newNarrator(n.place, n.home, 18 + this.rng.int(14), n.last);
      for (const [, m] of n.know) {
        if (!this.rng.chance(0.45)) continue;
        let node = this.nodes[m.node];
        if (this.rng.chance(0.06)) node = this.mutate(node, n.place, 'inherit', heir.id);
        this.setMemory(heir, node, 0.9, n.id);
      }
    }
    for (const t of [...n.know.keys()]) this.dropMemory(n, t);
    n.died = this.week;
    n.away = false;
    if (n.place === 0 && known + rec > 0) {
      const recd = rec ? `${rec} ervan staan in het notitieboek van de verzamelaar.` : 'Niets daarvan werd opgetekend.';
      this.addLog('death', `${this.name(n)} (${n.born}–${this.year}) is overleden en kende ${known === 1 ? 'één verhaal' : known + ' verhalen'}. ${recd}${heir ? ` ${heir.first} neemt er een deel van over.` : ''}`,
        { place: n.place, narrator: n.id });
    }
  }

  private decay() {
    const rate = 0.009 + (1 - this.belief) * 0.006;
    for (const n of this.narrators) {
      if (n.died !== null) continue;
      for (const [t, m] of n.know) {
        m.s -= rate;
        if (m.s <= 0) this.dropMemory(n, t);
      }
    }
  }

  private income() {
    this.money += this.income_preview();
  }

  // ------------------------------------------------------------------ diversity

  placeDiversity(place: number): PlaceDiversity {
    const people = this.alive(place);
    const types = new Map<string, number>();
    for (const n of people) for (const t of n.know.keys()) types.set(t, (types.get(t) ?? 0) + 1);
    const tot = [...types.values()].reduce((a, b) => a + b, 0);
    const simpson = [...types.values()].reduce((a, c) => a + (c / tot) ** 2, 0);
    const sum = people.reduce((a, n) => a + n.recent, 0);
    const sq = people.reduce((a, n) => a + n.recent * n.recent, 0);
    return { n: people.length, s: types.size, d: tot ? 1 / simpson : 0, ne: sq ? (sum * sum) / sq : people.length, types };
  }

  regionDiversity(): { gamma: number; overlap: number; per: PlaceDiversity[] } {
    const per = this.map.places.map((p) => this.placeDiversity(p.id));
    const all = new Set<string>();
    for (const d of per) for (const t of d.types.keys()) all.add(t);
    let sim = 0, pairs = 0;
    for (let i = 0; i < per.length; i++)
      for (let j = i + 1; j < per.length; j++) {
        const a = per[i].types, b = per[j].types;
        if (!a.size && !b.size) continue;
        let inter = 0;
        for (const t of a.keys()) if (b.has(t)) inter++;
        sim += inter / (a.size + b.size - inter);
        pairs++;
      }
    return { gamma: all.size, overlap: pairs ? sim / pairs : 0, per };
  }

  private recordHistory() {
    const r = this.regionDiversity();
    this.history.push({ week: this.week, gamma: r.gamma, overlap: r.overlap, places: r.per.map((d) => ({ n: d.n, s: d.s, d: d.d, ne: d.ne })) });
  }

  canCulture(place: number, c: Culture): { ok: boolean; reason?: string } {
    if (c === 'herberg' && !this.placeBuildings(place).some((b) => b.kind === 'herberg'))
      return { ok: false, reason: 'Daar is eerst een herberg voor nodig.' };
    return { ok: true };
  }

  setCulture(place: number, c: Culture) {
    if (this.culture[place] === c || !this.canCulture(place, c).ok) return;
    this.culture[place] = c;
    this.acts.cultures++;
    this.addLog('info', `In ${this.map.places[place].name} wordt voortaan verteld: ${CULTURE[c].nl.toLowerCase()}.`, { place });
  }

  /** Tale types told in this village and in no other. */
  uniqueTypes(place: number, per = this.regionDiversity().per): string[] {
    return [...per[place].types.keys()].filter((t) => per.every((d, i) => i === place || !d.types.has(t)));
  }

  commissionValue(c: Commission): number {
    const r = this.regionDiversity();
    switch (c.key) {
      case 'rijk': return r.per[0].s;
      case 'streek': return r.gamma;
      case 'eigen': return Math.min(...r.per.map((d, i) => (d.n > 0 ? this.uniqueTypes(i, r.per).length : Infinity)));
      case 'stemmen': return Math.round(r.per[0].ne);
      case 'reis': {
        let best = 0;
        for (const t of this.homeTales.keys()) best = Math.max(best, r.per.filter((d) => d.types.has(t)).length);
        return best;
      }
    }
  }

  private offerCommission() {
    if (!this.offerOrder.length) this.offerOrder = ['rijk', ...this.rng.shuffle(['streek', 'eigen', 'stemmen', 'reis'] as CommissionKey[])];
    const key = this.offerOrder.shift()!;
    const r = this.regionDiversity();
    const home = this.home.name;
    const years = 5;
    let target = 0, title = '', text = '', hint = '';
    if (key === 'rijk') {
      target = Math.max(14, r.per[0].s + 8);
      title = 'Een rijk dorp';
      text = `Ik hoop in ${home} straks ${target} verschillende sagen te horen.`;
      hint = 'Waar veel mensen wonen, worden veel verhalen onthouden. Huizen brengen vertellers.';
    } else if (key === 'streek') {
      target = r.gamma + 8;
      title = 'Een rijke streek';
      text = `Ik hoop in de hele streek samen ${target} verschillende sagen te vinden.`;
      hint = 'Elk dorp onthoudt maar zoveel. Grotere dorpen, en verhalen die van dorp tot dorp gaan, houden meer in leven.';
    } else if (key === 'eigen') {
      target = 2;
      title = 'Elk dorp het zijne';
      text = `Mij gaat het om wat eigen is: in elk dorp minstens ${target} sagen die je nergens anders hoort.`;
      hint = 'Langs wegen worden dorpen op elkaar gelijk. Een weg opbreken laat ze elk hun eigen kant op gaan. Maar een klein dorp dat alleen staat, vergeet veel.';
    } else if (key === 'stemmen') {
      target = Math.max(9, Math.round(Math.max(12, r.per[0].n) * 0.7));
      title = 'Veel stemmen';
      text = `In ${home} wil ik niet alleen de bekende vertellers horen. Zorg dat het vertellen over minstens ${target} mensen verdeeld is.`;
      hint = 'Als een paar vertellers het woord voeren, raakt de rest in vergetelheid. Kijk hoe er verteld wordt in het dorp, en hoeveel mensen er wonen.';
    } else {
      target = this.map.places.length;
      title = 'Een verhaal op reis';
      text = `Ik zou graag één verhaal uit ${home} in alle ${target} dorpen horen vertellen.`;
      hint = 'Verhalen reizen langs wegen, met wie op pad gaat. Je kunt ook zelf iemand met een verhaal op weg sturen.';
    }
    const c: Commission = { id: this.commissions.length, key, title, text, hint, target, start: this.week,
      deadline: Math.min(this.totalWeeks - 4, this.week + years * WEEKS_PER_YEAR), status: 'open', reward: 30, best: 0 };
    c.best = this.commissionValue(c);
    this.commissions.push(c);
    this.addLog('collector', `Brief van ${this.collector.name}: „${title}”. ${text}`);
    this.emit({ kind: 'commission', commission: c });
  }

  private checkCommissions() {
    if (this.quiet) return;
    const open = this.commissions.find((c) => c.status === 'open');
    if (open) {
      const v = this.commissionValue(open);
      open.best = Math.max(open.best, v);
      if (v >= open.target) {
        open.status = 'done';
        this.money += open.reward;
        this.collectorBonus++;
        // a year's breather before the next letter
        this.nextOffer = this.week + 1;
        this.addLog('collector', `Opdracht volbracht: „${open.title}”. ${this.collector.name.charAt(0).toUpperCase() + this.collector.name.slice(1)} zal langer blijven en meer optekenen. ƒ ${open.reward}.`);
        this.emit({ kind: 'commission', commission: open });
      } else if (this.week >= open.deadline) {
        open.status = 'failed';
        this.nextOffer = this.week;
        this.addLog('collector', `De opdracht „${open.title}” is niet gelukt (${v} van de ${open.target}).`);
        this.emit({ kind: 'commission', commission: open });
      }
    }
    // letters only come at the turn of the year, so they can be read at leisure
    if (!this.commissions.some((c) => c.status === 'open') && this.week % WEEKS_PER_YEAR === 0
      && this.week >= this.nextOffer && this.week < this.totalWeeks - 2 * WEEKS_PER_YEAR) this.offerCommission();
  }

  // ------------------------------------------------------------------ the village repertoire, and what the player can do with it

  homeHolders(t: string): Narrator[] {
    return this.alive(0).filter((n) => n.know.has(t));
  }

  taleStatus(t: string): TaleStatus {
    const holders = this.homeHolders(t);
    const present = holders.filter((n) => !n.away);
    const strength = holders.reduce((a, n) => Math.max(a, n.know.get(t)!.s), 0);
    const recordedHere = this.records.filter((r) => r.t === t && r.place === 0).length;
    const recordedElsewhere = this.records.filter((r) => r.t === t && r.place !== 0).length;
    const old = holders.filter((n) => this.year - n.born >= 70).length;
    const fragile = holders.length > 0 && (holders.length === 1 || strength < 0.6 || (holders.length - old <= 0));
    const versions = new Set(holders.map((n) => n.know.get(t)!.node)).size;
    return { holders, present, strength, recordedHere, recordedElsewhere, lost: holders.length === 0, fragile, versions };
  }

  canTell(t: string): { ok: boolean; reason?: string } {
    if (this.over) return { ok: false };
    const st = this.taleStatus(t);
    if (!st.holders.length) return { ok: false, reason: 'Niemand in het dorp kent het nog.' };
    if (!st.present.length) return { ok: false, reason: 'Wie het kent, is nu niet thuis.' };
    if (this.present(0).length < 2) return { ok: false, reason: 'Er is niemand om naar te luisteren.' };
    if (this.money < TELL_COST) return { ok: false, reason: 'Niet genoeg geld.' };
    return { ok: true };
  }

  /** Ask the best teller of a tale to tell it to everyone at home. Returns who learned it. */
  tellAtHome(t: string): Narrator[] {
    if (!this.canTell(t).ok) return [];
    this.money -= TELL_COST;
    this.acts.tells++;
    const teller = this.taleStatus(t).present.sort((a, b) => b.know.get(t)!.s * b.talent - a.know.get(t)!.s * a.talent)[0];
    const mem = teller.know.get(t)!;
    const node = this.nodes[mem.node];
    mem.s = Math.min(3, mem.s + 0.5);
    node.tellings++;
    teller.told++;
    this.typeTellings.set(t, (this.typeTellings.get(t) ?? 0) + 1);
    const learners: Narrator[] = [];
    const pushedOut: string[] = [];
    for (const l of this.present(0)) {
      if (l === teller) continue;
      const k = l.know.get(t);
      if (k) {
        k.s = Math.min(3, k.s + (k.node === node.id ? 0.6 : 0.25));
        continue;
      }
      if (!this.rng.chance(0.45 + 0.3 * Math.min(1, l.talent)) || !this.hasRoom(l)) continue;
      const learned = this.rng.chance(0.05) ? this.mutate(node, 0, 'drift', l.id) : node;
      const before = new Set(l.know.keys());
      this.setMemory(l, learned, 1.3, teller.id);
      learners.push(l);
      // a head holds only so much: something else may have to go
      for (const o of before) if (!l.know.has(o)) pushedOut.push(`${l.first} vergat daardoor „${this.type(o).nl}”.`);
    }
    const who = learners.map((l) => l.first);
    const heard = learners.length === 0 ? 'Iedereen luistert, maar niemand neemt het over.'
      : learners.length === 1 ? `${who[0]} onthoudt het.`
      : `${who.slice(0, -1).join(', ')} en ${who[who.length - 1]} onthouden het.`;
    this.addLog('tell', `Op jouw verzoek vertelt ${this.name(teller)} „${this.type(t).nl}”. ${heard}${pushedOut.length ? ' ' + pushedOut.join(' ') : ''}`, { place: 0, narrator: teller.id, node: node.id });
    return learners;
  }

  canSend(t: string, to: number): { ok: boolean; reason?: string } {
    if (this.over) return { ok: false };
    if (!this.connected(0, to)) return { ok: false, reason: 'Er loopt geen weg heen.' };
    if (!this.taleStatus(t).present.length) return { ok: false, reason: 'Wie het kent, is nu niet thuis.' };
    if (this.money < SEND_COST) return { ok: false, reason: 'Niet genoeg geld.' };
    return { ok: true };
  }

  /** Send someone who knows a tale to a neighbouring village to tell it there. */
  sendTale(t: string, to: number): boolean {
    if (!this.canSend(t, to).ok) return false;
    this.money -= SEND_COST;
    this.acts.sends++;
    const n = this.taleStatus(t).present.sort((a, b) => b.wander + b.know.get(t)!.s - (a.wander + a.know.get(t)!.s))[0];
    n.away = true;
    const w = this.spawnWalker('narrator', n.id, this.reach.get(0)!.get(to)!, to, t);
    w.errand = t;
    this.addLog('tell', `${this.name(n)} gaat met „${this.type(t).nl}” op weg naar ${this.map.places[to].name}.`, { place: 0, narrator: n.id, node: n.know.get(t)!.node });
    return true;
  }

  // ------------------------------------------------------------------ storytelling evenings

  feasting(): boolean {
    return this.week <= this.feastUntil;
  }

  feastCost(): number {
    return 15 + this.feasts * 10;
  }

  canFeast(): { ok: boolean; reason?: string } {
    if (this.over) return { ok: false };
    if (this.feasting()) return { ok: false, reason: 'De vertelavond is al bezig.' };
    if (this.alive(0).length < 3) return { ok: false, reason: 'Er wonen nog te weinig vertellers.' };
    if (this.money < this.feastCost()) return { ok: false, reason: 'Niet genoeg geld.' };
    return { ok: true };
  }

  /** Three weeks of telling at home; storytellers from connected villages walk over with their versions. */
  holdFeast(): boolean {
    if (!this.canFeast().ok) return false;
    this.money -= this.feastCost();
    this.feasts++;
    this.feastUntil = this.week + 3;
    let guests = 0;
    for (const q of this.connectedPlaces(0)) {
      const path = this.reach.get(q)?.get(0);
      if (!path) continue;
      const cands = this.alive(q).filter((n) => !n.away && n.know.size).sort((a, b) => b.talent - a.talent).slice(0, 2);
      for (const n of cands) {
        n.away = true;
        this.spawnWalker('narrator', n.id, path, 0, this.strongest(n)?.[0] ?? null);
        guests++;
      }
    }
    const season = ['lenteavond', 'zomeravond', 'herfstavond', 'winteravond'][seasonOf(this.week)];
    this.addLog('info', `Vertelavond in ${this.home.name}: op een ${season} wordt er verteld tot diep in de nacht.${guests ? ` Uit de buurdorpen ${guests === 1 ? 'komt één verteller' : `komen ${guests} vertellers`} luisteren.` : ''}`, { place: 0 });
    return true;
  }

  income_preview(): number {
    let inc = 2;
    for (const b of this.map.buildings) if (b.place === 0 || b.week > 0) inc += BUILD[b.kind].income;
    inc += this.alive(0).length * 0.1;
    return Math.round(inc);
  }

  tick() {
    if (this.over) return;
    this.week++;
    if (this.week % 13 === 0) this.income();
    if (this.week % WEEKS_PER_YEAR === 0) this.yearly();
    if (this.week % 4 === 0) this.sightings();
    for (const p of this.map.places) {
      const people = this.present(p.id);
      if (people.length < 2) continue;
      const feast = p.id === 0 && this.feasting();
      const cu = CULTURE[this.culture[p.id]];
      // the culture changes who tells, not how much is heard: fewer tellings for bigger audiences
      const meanAud = (cu.aud[0] + cu.aud[1]) / 2;
      const lambda = people.length * 0.8 * this.tellingRate(p.id) * (feast ? 5 : 1) * (3.5 / meanAud);
      const k = this.rng.poisson(lambda);
      for (let i = 0; i < k; i++) {
        // the culture of telling decides how unequal the tellers are: this is what sets the effective population size
        const teller = this.rng.weighted(people, (n) => Math.pow(n.talent * (0.5 + n.know.size * 0.15), cu.k));
        if (!teller) break;
        teller.recent++;
        // at a storytelling evening everyone listens, and tales grow in the telling
        const size = cu.aud[0] + this.rng.int(cu.aud[1] - cu.aud[0] + 1);
        const aud = feast ? people : this.rng.shuffle(people.filter((x) => x !== teller)).slice(0, size);
        this.tell(teller, p.id, aud, feast ? 0.07 : 0.035, 'drift');
      }
    }
    this.decay();
    // the tellings of the last year or so count towards the effective number of tellers
    if (this.week % 4 === 0) for (const n of this.narrators) n.recent *= 0.93;
    if (this.week % 13 === 0) this.recordHistory();
    if (this.week % 4 === 0) this.checkCommissions();
    this.travel();
    this.moveWalkers();
    this.collectorTick();
    if (this.week >= this.totalWeeks) {
      this.over = true;
      this.emit({ kind: 'end' });
    }
  }

  // ------------------------------------------------------------------ building

  canBuild(kind: BKind | 'weg', x: number, y: number): { ok: boolean; reason?: string; cost: number } {
    if (!inb(x, y)) return { ok: false, cost: 0 };
    const t = this.map.tiles[idx(x, y)];
    if (kind === 'weg') {
      const cost = t.t === 'water' ? BRIDGE_COST : ROAD_COST;
      if (t.road) return { ok: false, reason: 'Hier ligt al een weg.', cost };
      if (t.b >= 0) return { ok: false, reason: 'Hier staat een gebouw.', cost };
      if (t.t === 'water') {
        const banks = N4.filter(([dx, dy]) => inb(x + dx, y + dy) && this.map.tiles[idx(x + dx, y + dy)].t !== 'water').length;
        if (banks < 1) return { ok: false, reason: 'Een brug moet aan land beginnen.', cost };
      }
      if (this.money < cost) return { ok: false, reason: 'Niet genoeg geld.', cost };
      return { ok: true, cost };
    }
    const def = BUILD[kind];
    if (!def.buildable) return { ok: false, cost: 0 };
    // you may build in any village: the land belongs to the nearest one
    const owner = this.nearestPlace(x, y);
    const cost = this.costOf(kind, owner);
    if (t.t === 'water') return { ok: false, reason: 'Niet op het water.', cost };
    if (t.road || t.b >= 0) return { ok: false, reason: 'Deze plek is bezet.', cost };
    const op = this.map.places[owner];
    if (Math.abs(op.x - x) + Math.abs(op.y - y) > 7) return { ok: false, reason: 'Te ver van een dorp.', cost };
    if (def.max && this.placeBuildings(owner).filter((b) => b.kind === kind).length >= def.max)
      return { ok: false, reason: `${op.name} heeft al ${def.max === 1 ? 'een' : def.max} ${def.nl.toLowerCase()}.`, cost };
    if (def.needs) {
      const nextTo = this.map.buildings.some((b) => b.kind === def.needs && Math.abs(b.x - x) <= 1 && Math.abs(b.y - y) <= 1);
      if (!nextTo) return { ok: false, reason: `Moet naast de ${BUILD[def.needs].nl.toLowerCase()} liggen.`, cost };
    }
    const nearRoad = N4.some(([dx, dy]) => inb(x + dx, y + dy) && this.map.tiles[idx(x + dx, y + dy)].road);
    const nearHome = this.placeBuildings(owner).some((b) => Math.abs(b.x - x) <= 1 && Math.abs(b.y - y) <= 1);
    if (!nearRoad && !nearHome && kind !== 'kapel') return { ok: false, reason: 'Bouw aan een weg of naast het dorp.', cost };
    if (kind === 'kapel' && !nearRoad) return { ok: false, reason: 'Een kapel staat aan de weg.', cost };
    if (this.money < cost) return { ok: false, reason: 'Niet genoeg geld.', cost };
    return { ok: true, cost };
  }

  /** Each further building of the same kind in the same village costs a little more. */
  costOf(kind: BKind | 'weg', place = 0): number {
    if (kind === 'weg') return ROAD_COST;
    const have = this.placeBuildings(place).filter((b) => b.kind === kind && b.week > 0).length;
    return Math.round(BUILD[kind].cost * (1 + 0.25 * have));
  }

  build(kind: BKind | 'weg', x: number, y: number): boolean {
    const c = this.canBuild(kind, x, y);
    if (!c.ok) return false;
    this.money -= c.cost;
    if (kind === 'weg') {
      const t = this.map.tiles[idx(x, y)];
      t.road = true;
      this.acts.roads++;
      if (t.t === 'water') t.bridge = true;
      const before = this.homeConnectedToWorld();
      this.recomputeRoads();
      if (!before && this.homeConnectedToWorld()) {
        const to = this.connectedPlaces(0).map((q) => this.map.places[q].name);
        this.addLog('build', to.length ? `${this.home.name} is nu over de weg verbonden met ${to.join(', ')}.` : `${this.home.name} is nu verbonden met de grote weg.`);
      }
    } else {
      const owner = this.nearestPlace(x, y);
      const b = addBuilding(this.map, kind, x, y, owner, this.week);
      this.settle(b, false);
      this.recomputeRoads();
      this.addLog('build', `In ${this.map.places[owner].name} is een ${BUILD[kind].nl.toLowerCase()} gebouwd.`, { place: owner });
    }
    this.emit({ kind: 'build' });
    return true;
  }

  /** Remove a road tile the player laid (refunds nothing). */
  removeRoad(x: number, y: number): boolean {
    const t = this.map.tiles[idx(x, y)];
    if (!t.road) return false;
    t.road = false;
    t.bridge = false;
    this.acts.breaks++;
    const before = this.map.places.map((p) => this.connectedPlaces(p.id).length).reduce((a, b) => a + b, 0);
    this.recomputeRoads();
    const after = this.map.places.map((p) => this.connectedPlaces(p.id).length).reduce((a, b) => a + b, 0);
    if (after < before) this.addLog('build', 'Een weg is opgebroken. Sommige dorpen zijn nu van elkaar afgesneden.');
    this.emit({ kind: 'build' });
    return true;
  }

  // ------------------------------------------------------------------ queries for the UI

  holdersOf(nodeId: number): Narrator[] {
    return this.narrators.filter((n) => n.died === null && [...n.know.values()].some((m) => m.node === nodeId));
  }

  lineage(nodeId: number): StoryNode[] {
    const out: StoryNode[] = [];
    let cur: StoryNode | undefined = this.nodes[nodeId];
    while (cur) {
      out.unshift(cur);
      cur = cur.parent !== null ? this.nodes[cur.parent] : undefined;
    }
    return out;
  }

  /** All live sightings anchored to buildings (for the map glyphs). */
  anchoredNodes(): StoryNode[] {
    return this.nodes.filter((n) => n.anchor !== null && n.holders > 0);
  }

  placeRepertoire(place: number): { node: StoryNode; holders: number }[] {
    const m = new Map<number, number>();
    for (const n of this.alive(place)) for (const mem of n.know.values()) m.set(mem.node, (m.get(mem.node) ?? 0) + 1);
    return [...m.entries()].map(([id, h]) => ({ node: this.nodes[id], holders: h })).sort((a, b) => b.holders - a.holders);
  }

  walkerProgress(w: Walker, frac: number): number {
    return Math.min(w.path.length - 1, w.pos + w.speed * frac);
  }
}

function dist(a: Place, b: Place) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export const AT_BUILDING: Record<BKind, string> = {
  huis: 'in een van de huizen', boerderij: 'op de boerderij', molen: 'bij de molen', kerk: 'bij de kerk',
  kerkhof: 'op het kerkhof', put: 'bij de put', herberg: 'in de herberg', smidse: 'in de smidse',
  kapel: 'bij de kapel', galg: 'op het galgenveld', school: 'bij de school', hut: 'bij een huisje buiten het dorp',
};

function landscapePhrase(a: string): string {
  return ({ heide: 'op de heide', bos: 'in het bos', veen: 'in het veen', water: 'aan het water', kruisweg: 'op de kruisweg', brug: 'bij de brug' } as Record<string, string>)[a] ?? 'buiten';
}

export function collectorName(key: string, region: string): string {
  const fl = ['westvl', 'oostvl', 'antwerpen', 'brabant'].includes(region);
  switch (key) {
    case 'volhouder': return 'de oude verzamelaar';
    case 'rondreiziger': return 'de man met de bandrecorder';
    case 'student': return 'een studente uit Leuven';
    default: return fl ? 'de onderpastoor' : 'de dokter';
  }
}

export { W, H };
