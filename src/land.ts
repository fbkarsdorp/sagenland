// The collector's region: villages of different sizes and characters, the roads between them,
// and the places outside the villages that tales are tied to (a gallows field, a bog, an old lime tree).
import { Rng, makeNoise } from './rng';
import {
  H, N8, W, addBuilding, crossroads, idx, inb, layRoad,
  type BKind, type MapData, type Place, type Terrain, type Tile,
} from './world';

export type VillageKind = 'kerkdorp' | 'esdorp' | 'gehucht' | 'molendorp' | 'veendorp' | 'heidedorp';

export const VILLAGE: Record<VillageKind, { nl: string; desc: string }> = {
  kerkdorp: { nl: 'kerkdorp', desc: 'Een dorp rond de kerk, met een herberg, een smidse en een school.' },
  esdorp: { nl: 'boerendorp', desc: 'Grote boerderijen rond de akkers. Hier wonen families al eeuwen op dezelfde grond.' },
  gehucht: { nl: 'gehucht', desc: 'Een paar boerderijen bij elkaar, ver van alles.' },
  molendorp: { nl: 'molendorp', desc: 'Een dorp onder de molen, waar boeren van heinde en ver hun koren brengen.' },
  veendorp: { nl: 'veendorp', desc: 'Huizen in een lange rij langs de weg door het veen. Arm, en vol verhalen over het water.' },
  heidedorp: { nl: 'heidedorp', desc: 'Een handvol huizen aan de rand van de heide, bij de schaapskooien.' },
};

export type SiteKind = 'galg' | 'kruisweg' | 'linde' | 'veen' | 'heide' | 'bos' | 'water';

export interface Site {
  id: number;
  kind: SiteKind;
  x: number;
  y: number;
  name: string;
  /** the nearest village */
  place: number;
  /** a loner's hut beside it (building id), or none */
  hut: number | null;
  /** a tale written down about this place: its type code */
  legend: string | null;
}

export const SITE: Record<SiteKind, { attract: string; loner: string | null; names: string[] }> = {
  galg: { attract: 'galg', loner: null, names: ['het Galgenveld', 'de Galgenberg'] },
  kruisweg: { attract: 'kruisweg', loner: null, names: ['de Kruisweg', 'het Kruis'] },
  linde: { attract: 'kruisweg', loner: 'woont in het huisje bij de linde', names: ['de Dikke Linde', 'de Oude Eik'] },
  veen: { attract: 'veen', loner: 'steekt turf in het veen', names: ['het Hoogveen', 'het Zwarte Veen'] },
  heide: { attract: 'heide', loner: 'hoedt de schapen op de heide', names: ['het Heideveld', 'de Steenhoop'] },
  bos: { attract: 'bos', loner: 'is houtvester in het bos', names: ['het Elsbroek', 'het Donkere Bos'] },
  water: { attract: 'water', loner: 'zet mensen over bij het veer', names: ['het Veer', 'de Overhaal'] },
};

export interface Land extends MapData {
  kinds: VillageKind[];
  sites: Site[];
}

const PROFILES: Record<string, { heide: number; bos: number; veen: number; lake: boolean }> = {
  friesland: { heide: 0.06, bos: 0.05, veen: 0.2, lake: true },
  limburg: { heide: 0.16, bos: 0.2, veen: 0.04, lake: false },
  westvl: { heide: 0.03, bos: 0.07, veen: 0.06, lake: false },
  brabant: { heide: 0.1, bos: 0.16, veen: 0.05, lake: false },
  antwerpen: { heide: 0.26, bos: 0.18, veen: 0.08, lake: false },
  oostvl: { heide: 0.05, bos: 0.1, veen: 0.06, lake: false },
  oosten: { heide: 0.22, bos: 0.16, veen: 0.12, lake: false },
};

const KIND_WEIGHTS: Record<string, Partial<Record<VillageKind, number>>> = {
  oosten: { esdorp: 3, kerkdorp: 2, gehucht: 1, heidedorp: 2, veendorp: 1, molendorp: 1 },
  friesland: { kerkdorp: 3, gehucht: 2, veendorp: 2, molendorp: 2 },
  limburg: { kerkdorp: 3, gehucht: 2, molendorp: 1, heidedorp: 1, esdorp: 1 },
  brabant: { kerkdorp: 2, gehucht: 1, heidedorp: 2, esdorp: 1, molendorp: 1 },
  antwerpen: { kerkdorp: 2, gehucht: 1, heidedorp: 3, esdorp: 1, molendorp: 1 },
  oostvl: { kerkdorp: 3, gehucht: 2, molendorp: 2, esdorp: 1 },
  westvl: { kerkdorp: 3, gehucht: 2, molendorp: 2, esdorp: 1 },
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function terrain(rng: Rng, region: string): Tile[] {
  const prof = PROFILES[region] ?? PROFILES.brabant;
  const noise = makeNoise(rng);
  const fbm = (x: number, y: number, s: number, o: number) =>
    noise(x / s + o, y / s + o) * 0.7 + noise(x / (s / 2) + o * 2, y / (s / 2) + o) * 0.3;
  const nh: number[] = [], nb: number[] = [], nv: number[] = [], nf: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      nh.push(fbm(x, y, 9, 11));
      nb.push(fbm(x, y, 7, 37));
      nv.push(fbm(x, y, 8, 71));
      nf.push(noise(x / 4 + 5, y / 4 + 9));
    }
  const q = (vals: number[], frac: number) => [...vals].sort((a, b) => b - a)[Math.floor(frac * vals.length)];
  const th = q(nh, prof.heide), tb = q(nb, prof.bos), tv = q(nv, prof.veen);
  const tiles: Tile[] = [];
  for (let i = 0; i < W * H; i++) {
    let t: Terrain = nf[i] > 0.55 ? 'wei' : 'akker';
    if (nh[i] >= th) t = 'heide';
    if (nb[i] >= tb) t = 'bos';
    if (nv[i] >= tv) t = 'veen';
    tiles.push({ t, road: false, bridge: false, b: -1 });
  }
  // a stream from the top edge to the bottom edge
  let x = rng.range(W * 0.25, W * 0.75), dx = 0, prevX = Math.round(x);
  for (let y = 0; y < H; y++) {
    dx = Math.max(-1, Math.min(1, dx + rng.range(-0.5, 0.5)));
    x = Math.max(2, Math.min(W - 3, x + dx * 0.8));
    const xi = Math.round(x);
    const from = y > 0 ? prevX : xi;
    for (let k = Math.min(from, xi); k <= Math.max(from, xi); k++) tiles[idx(k, y)].t = 'water';
    prevX = xi;
  }
  if (prof.lake) {
    const lx = rng.chance(0.5) ? rng.range(6, 14) : rng.range(W - 14, W - 6), ly = rng.range(6, H - 6);
    const rx = rng.range(3, 5), ry = rng.range(2, 3.5);
    for (let y = 0; y < H; y++)
      for (let x2 = 0; x2 < W; x2++)
        if (((x2 - lx) / rx) ** 2 + ((y - ly) / ry) ** 2 + (noise(x2 / 2, y / 2) - 0.5) * 0.8 < 1) tiles[idx(x2, y)].t = 'water';
  }
  return tiles;
}

export function generateLand(rng: Rng, region: string, names: string[]): Land {
  const tiles = terrain(rng, region);
  const map: Land = { tiles, places: [], buildings: [], exits: [], kinds: [], sites: [] };
  const T = (x: number, y: number) => tiles[idx(x, y)];
  const dryAround = (x: number, y: number, r: number) => {
    for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++) if (!inb(i, j) || T(i, j).t === 'water') return false;
    return true;
  };

  // villages, spread over the sheet; the lodgings lie near the middle
  const places: Place[] = [];
  for (let tries = 0; tries < 200 && !places.length; tries++) {
    const x = Math.round(W / 2 + rng.range(-7, 7)), y = Math.round(H / 2 + rng.range(-5, 5));
    if (dryAround(x, y, 2)) places.push({ id: 0, name: names[0], x, y, home: true });
  }
  if (!places.length) places.push({ id: 0, name: names[0], x: W >> 1, y: H >> 1, home: true });
  for (let tries = 0; tries < 3000 && places.length < 8; tries++) {
    const x = 4 + rng.int(W - 8), y = 4 + rng.int(H - 8);
    if (!dryAround(x, y, 2) || places.some((p) => Math.hypot(p.x - x, p.y - y) < 11)) continue;
    places.push({ id: places.length, name: names[places.length] ?? `Dorp ${places.length}`, x, y, home: false });
  }
  map.places = places;

  // what kind of village each is
  const weights = KIND_WEIGHTS[region] ?? KIND_WEIGHTS.brabant;
  const pool = Object.entries(weights) as [VillageKind, number][];
  map.kinds = places.map((p) => (p.home ? 'kerkdorp' : rng.weighted(pool, ([, w]) => w)![0]));
  // a heath village wants heath nearby, a peat village peat; otherwise it is a hamlet
  map.kinds = map.kinds.map((k, i) => {
    const p = places[i];
    const near = (t: Terrain) => { let n = 0; for (let y = p.y - 5; y <= p.y + 5; y++) for (let x = p.x - 5; x <= p.x + 5; x++) if (inb(x, y) && T(x, y).t === t) n++; return n; };
    if (k === 'heidedorp' && near('heide') < 6) return i % 2 ? 'esdorp' : 'molendorp';
    if (k === 'veendorp' && near('veen') < 6) return 'esdorp';
    return k;
  });
  if (!map.kinds.some((k, i) => i > 0 && (k === 'kerkdorp' || k === 'molendorp'))) map.kinds[places.length - 1] = 'kerkdorp';

  // clear the ground the villages stand on
  places.forEach((p, i) => {
    const r = map.kinds[i] === 'gehucht' ? 2 : 3;
    for (let y = p.y - r; y <= p.y + r; y++)
      for (let x = p.x - r; x <= p.x + r; x++) {
        if (!inb(x, y) || T(x, y).t === 'water') continue;
        if (map.kinds[i] === 'heidedorp' && T(x, y).t === 'heide' && dist(p, { x, y }) > 1) continue;
        if (map.kinds[i] === 'veendorp' && T(x, y).t === 'veen' && dist(p, { x, y }) > 1) continue;
        if (T(x, y).t !== 'akker' && T(x, y).t !== 'wei') T(x, y).t = (x + y) % 3 ? 'akker' : 'wei';
      }
  });

  // roads: a spanning tree between the villages, one or two loops, and two ways off the sheet
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < places.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree)
      for (const b of places)
        if (!inTree.has(b.id)) {
          const d = Math.hypot(places[a].x - b.x, places[a].y - b.y);
          if (d < bd) { bd = d; best = [a, b.id]; }
        }
    edges.push(best!);
    inTree.add(best![1]);
  }
  const extra = places.flatMap((a) => places.filter((b) => b.id > a.id).map((b) => [a.id, b.id] as [number, number]))
    .filter(([a, b]) => !edges.some(([c, d]) => (c === a && d === b) || (c === b && d === a)))
    .sort((e, f) => Math.hypot(places[e[0]].x - places[e[1]].x, places[e[0]].y - places[e[1]].y) - Math.hypot(places[f[0]].x - places[f[1]].x, places[f[0]].y - places[f[1]].y));
  edges.push(...extra.slice(0, 1 + rng.int(2)));
  for (const [a, b] of edges) layRoad(map, places[a].x, places[a].y, places[b].x, places[b].y);
  const byEdge = [...places].sort((a, b) => Math.min(a.x, W - a.x, a.y, H - a.y) - Math.min(b.x, W - b.x, b.y, H - b.y));
  for (const p of byEdge.slice(0, 2)) {
    const m = Math.min(p.x, W - 1 - p.x, p.y, H - 1 - p.y);
    let ex = p.x, ey = p.y;
    if (m === p.x) ex = 0; else if (m === W - 1 - p.x) ex = W - 1; else if (m === p.y) ey = 0; else ey = H - 1;
    if (T(ex, ey).t === 'water') continue;
    layRoad(map, p.x, p.y, ex, ey);
    map.exits.push({ x: ex, y: ey });
  }

  // buildings, by the kind of village
  const free = (x: number, y: number) => inb(x, y) && T(x, y).t !== 'water' && !T(x, y).road && T(x, y).b < 0;
  const nextToRoad = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx, y + dy) && T(x + dx, y + dy).road);
  const put = (p: Place, kind: BKind, r: number, alongRoad = false) => {
    const cands: [number, number, number][] = [];
    for (let y = p.y - r; y <= p.y + r; y++)
      for (let x = p.x - r; x <= p.x + r; x++) {
        if (!free(x, y)) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d > r + 0.5) continue;
        const road = nextToRoad(x, y);
        if (alongRoad && !road) continue;
        cands.push([x, y, (road ? 2 : 1) / (1 + d)]);
      }
    const c = rng.weighted(cands, (q) => q[2]);
    if (c) addBuilding(map, kind, c[0], c[1], p.id, 0);
  };
  places.forEach((p, i) => {
    const k = map.kinds[i];
    const n = (a: number, b: number) => a + rng.int(b - a + 1);
    const list: BKind[] = [];
    const add = (kind: BKind, count = 1) => { for (let j = 0; j < count; j++) list.push(kind); };
    // the lodgings are a modest church village: the richest tellers live elsewhere
    if (k === 'kerkdorp' && p.home) { add('kerk'); add('herberg'); add('put'); add('huis', n(2, 3)); add('boerderij', 1); }
    else if (k === 'kerkdorp') { add('kerk'); add('herberg'); add('smidse'); if (rng.chance(0.5)) add('school'); add('put'); add('huis', n(5, 8)); add('boerderij', n(2, 3)); }
    if (k === 'esdorp') { add('boerderij', n(4, 6)); add('huis', n(2, 3)); add('put'); if (rng.chance(0.5)) add('kapel'); if (rng.chance(0.35)) add('herberg'); }
    if (k === 'gehucht') { add('boerderij', n(2, 3)); add('huis', n(1, 2)); if (rng.chance(0.4)) add('kapel'); }
    if (k === 'molendorp') { add('molen'); if (rng.chance(0.6)) add('herberg'); if (rng.chance(0.4)) add('smidse'); add('huis', n(4, 6)); add('boerderij', n(1, 2)); }
    if (k === 'veendorp') { add('huis', n(5, 8)); if (rng.chance(0.4)) add('herberg'); add('kapel'); }
    if (k === 'heidedorp') { add('boerderij', n(2, 3)); add('huis', 2); add('put'); }
    const r = k === 'gehucht' ? 2 : k === 'veendorp' ? 5 : 3;
    for (const kind of list) put(p, kind, kind === 'molen' ? r + 1 : r, k === 'veendorp');
  });

  // places outside the villages that tales are tied to
  const siteOk = (x: number, y: number, minFromVillage: number) =>
    inb(x, y) && x > 2 && y > 2 && x < W - 3 && y < H - 3 && free(x, y)
    && places.every((p) => dist(p, { x, y }) >= minFromVillage) && map.sites.every((s) => dist(s, { x, y }) >= 6);
  const nearestPlace = (x: number, y: number) => places.reduce((b, p) => (dist(p, { x, y }) < dist(b, { x, y }) ? p : b), places[0]).id;
  const addSite = (kind: SiteKind, x: number, y: number) => {
    const s: Site = { id: map.sites.length, kind, x, y, name: rng.pick(SITE[kind].names), place: nearestPlace(x, y), hut: null, legend: null };
    if (SITE[kind].loner) {
      // the loner's hut stands beside the place
      for (const [dx, dy] of rng.shuffle([...N8])) {
        if (free(x + dx, y + dy) && T(x + dx, y + dy).t !== 'water') {
          s.hut = addBuilding(map, 'hut', x + dx, y + dy, s.place, 0).id;
          break;
        }
      }
    }
    map.sites.push(s);
  };
  const findSite = (kind: SiteKind, ok: (x: number, y: number) => boolean, minV: number) => {
    for (let tries = 0; tries < 600; tries++) {
      const x = 3 + rng.int(W - 6), y = 3 + rng.int(H - 6);
      if (siteOk(x, y, minV) && ok(x, y)) {
        addSite(kind, x, y);
        return;
      }
    }
  };
  const all8 = (x: number, y: number, t: Terrain) => N8.every(([dx, dy]) => inb(x + dx, y + dy) && T(x + dx, y + dy).t === t);
  findSite('galg', (x, y) => ['akker', 'wei', 'heide'].includes(T(x, y).t) && places.some((p) => dist(p, { x, y }) <= 8), 4);
  const cr = crossroads(map).map((i) => ({ x: i % W, y: Math.floor(i / W) }));
  const c = cr.find((q) => places.every((p) => dist(p, q) >= 4));
  if (c) addSite('kruisweg', c.x, c.y);
  findSite('linde', (x, y) => ['akker', 'wei'].includes(T(x, y).t) && places.some((p) => dist(p, { x, y }) <= 6) && nextToRoad(x, y), 3);
  findSite('veen', (x, y) => all8(x, y, 'veen'), 5);
  findSite('heide', (x, y) => all8(x, y, 'heide'), 5);
  findSite('bos', (x, y) => all8(x, y, 'bos'), 5);
  findSite('water', (x, y) => N8.some(([dx, dy]) => inb(x + dx, y + dy) && T(x + dx, y + dy).t === 'water') && places.some((p) => dist(p, { x, y }) <= 9), 4);
  return map;
}
