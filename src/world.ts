// The map: terrain, places, buildings and roads, plus road pathfinding.
import { Rng, makeNoise } from './rng';

export const W = 60;
export const H = 42;
export const TILE = 24;

export type Terrain = 'akker' | 'wei' | 'heide' | 'bos' | 'veen' | 'water';

export type BKind =
  | 'huis' | 'boerderij' | 'molen' | 'kerk' | 'kerkhof' | 'put'
  | 'herberg' | 'smidse' | 'kapel' | 'galg' | 'school' | 'hut';

export interface BuildingDef {
  nl: string;
  cost: number;
  income: number;       // guilders per season
  households: number;   // households that move in
  attract: string | null;
  tell: number;         // bonus to telling in the village
  max?: number;
  needs?: BKind;
  buildable: boolean;
  desc: string;
}

export const BUILD: Record<BKind, BuildingDef> = {
  huis: { nl: 'Huis', cost: 6, income: 0.5, households: 1, attract: 'huis', tell: 0, buildable: true,
    desc: 'Een huishouden trekt in. Wie er woont, vertelt, en neemt verhalen mee van elders.' },
  boerderij: { nl: 'Boerderij', cost: 10, income: 2, households: 1, attract: 'boerderij', tell: 0, buildable: true,
    desc: 'Brengt geld op. Melk die niet wil boteren, vee dat ziek wordt, een kat die te veel weet.' },
  molen: { nl: 'Molen', cost: 16, income: 3, households: 0, attract: 'molen', tell: 0, buildable: true,
    desc: 'Brengt veel geld op. Een molen draait ook ’s nachts, en niet altijd voor de molenaar.' },
  kerk: { nl: 'Kerk', cost: 28, income: 0, households: 1, attract: 'kerk', tell: 0.1, max: 1, buildable: true,
    desc: 'Klokken, graven, een pastoor die bezweren kan. Het dorp groeit sneller rond een kerk.' },
  kerkhof: { nl: 'Kerkhof', cost: 6, income: 0, households: 0, attract: 'kerk', tell: 0, needs: 'kerk', buildable: true,
    desc: 'Alleen naast de kerk. De doden blijven niet altijd liggen.' },
  put: { nl: 'Put', cost: 4, income: 0, households: 0, attract: 'put', tell: 0.05, buildable: true,
    desc: 'Bij de put wordt gepraat. Wat er in de diepte woont, praat soms mee.' },
  herberg: { nl: 'Herberg', cost: 14, income: 1.5, households: 0, attract: 'herberg', tell: 0.4, max: 2, buildable: true,
    desc: 'Hier wordt het meest verteld. Reizigers blijven er hangen, ook de verzamelaar.' },
  smidse: { nl: 'Smidse', cost: 12, income: 1, households: 1, attract: 'smidse', tell: 0.15, max: 1, buildable: true,
    desc: 'Mannen wachten bij het vuur op hun paard. Wie hoefijzers slaat, ziet wel eens een rare klant.' },
  kapel: { nl: 'Kapel', cost: 7, income: 0, households: 0, attract: 'kapel', tell: 0, buildable: true,
    desc: 'Een wegkapel op een plek waar het niet pluis is.' },
  galg: { nl: 'Galgenveld', cost: 0, income: 0, households: 0, attract: 'galg', tell: 0, buildable: false,
    desc: 'Een oude gerechtsplaats buiten het dorp.' },
  hut: { nl: 'Hut', cost: 0, income: 0, households: 1, attract: null, tell: 0, buildable: false,
    desc: 'Een eenzaam huisje buiten het dorp: een schaapskooi, een veenhut, het veerhuis.' },
  school: { nl: 'School', cost: 20, income: 2.5, households: 1, attract: null, tell: -0.25, max: 1, buildable: true,
    desc: 'Brengt geld en jonge gezinnen. De meester leert dat spoken niet bestaan; er wordt minder verteld.' },
};

export const ROAD_COST = 1;
export const BRIDGE_COST = 6;

export interface Tile {
  t: Terrain;
  road: boolean;
  bridge: boolean;
  b: number;        // building id or -1
}

export interface Building {
  id: number;
  kind: BKind;
  x: number;
  y: number;
  place: number;
  week: number;
}

export interface Place {
  id: number;
  name: string;
  x: number;
  y: number;
  home: boolean;
}

export interface Exit {
  x: number;
  y: number;
}

export interface MapData {
  tiles: Tile[];
  places: Place[];
  buildings: Building[];
  exits: Exit[];
}

export const idx = (x: number, y: number) => y * W + x;
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
export const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;

const PROFILES: Record<string, { heide: number; bos: number; veen: number; lake: boolean }> = {
  friesland: { heide: 0.08, bos: 0.05, veen: 0.2, lake: true },
  limburg: { heide: 0.18, bos: 0.2, veen: 0.04, lake: false },
  westvl: { heide: 0.03, bos: 0.07, veen: 0.06, lake: false },
  brabant: { heide: 0.08, bos: 0.16, veen: 0.04, lake: false },
  antwerpen: { heide: 0.28, bos: 0.18, veen: 0.08, lake: false },
  oostvl: { heide: 0.05, bos: 0.1, veen: 0.06, lake: false },
  oosten: { heide: 0.24, bos: 0.18, veen: 0.12, lake: false },
};

function quantile(vals: number[], frac: number): number {
  const s = [...vals].sort((a, b) => b - a);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(frac * s.length)))];
}

export function generateMap(rng: Rng, region: string, names: string[]): MapData {
  const prof = PROFILES[region] ?? PROFILES.brabant;
  const noise = makeNoise(rng);
  const tiles: Tile[] = [];
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
  const th = quantile(nh, prof.heide), tb = quantile(nb, prof.bos), tv = quantile(nv, prof.veen);
  for (let i = 0; i < W * H; i++) {
    let t: Terrain = nf[i] > 0.55 ? 'wei' : 'akker';
    if (nh[i] >= th) t = 'heide';
    if (nb[i] >= tb) t = 'bos';
    if (nv[i] >= tv) t = 'veen';
    tiles.push({ t, road: false, bridge: false, b: -1 });
  }

  const hx = Math.floor(W / 2), hy = Math.floor(H / 2);

  // A meandering stream from the top edge to the bottom edge that passes the village at a short distance
  const side = rng.chance(0.5) ? -1 : 1;
  let x = hx + side * rng.range(5, 9);
  let dx = 0;
  let prevX = Math.round(x);
  for (let y = 0; y < H; y++) {
    dx = Math.max(-1, Math.min(1, dx + rng.range(-0.5, 0.5)));
    x += dx * 0.8;
    // keep clear of the village centre
    if (Math.abs(x - hx) < 4 && Math.abs(y - hy) < 6) x = hx + Math.sign(x - hx || side) * 4;
    x = Math.max(2, Math.min(W - 3, x));
    const xi = Math.round(x);
    const from = y > 0 ? prevX : xi;
    for (let k = Math.min(from, xi); k <= Math.max(from, xi); k++) tiles[idx(k, y)].t = 'water';
    prevX = xi;
  }
  if (prof.lake) {
    const lx = rng.chance(0.5) ? rng.range(6, 14) : rng.range(W - 14, W - 6);
    const ly = rng.range(6, H - 6);
    const rx = rng.range(3, 5), ry = rng.range(2, 3.5);
    for (let y = 0; y < H; y++)
      for (let x2 = 0; x2 < W; x2++) {
        const d = ((x2 - lx) / rx) ** 2 + ((y - ly) / ry) ** 2 + (noise(x2 / 2, y / 2) - 0.5) * 0.8;
        if (d < 1) tiles[idx(x2, y)].t = 'water';
      }
  }

  const clear = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x2 = cx - r; x2 <= cx + r; x2++)
        if (inb(x2, y) && tiles[idx(x2, y)].t !== 'water') {
          const t = tiles[idx(x2, y)];
          if (t.t === 'bos' || t.t === 'veen' || (t.t === 'heide' && Math.abs(x2 - cx) + Math.abs(y - cy) < r))
            t.t = nf[idx(x2, y)] > 0.5 ? 'wei' : 'akker';
        }
  };

  const places: Place[] = [{ id: 0, name: names[0], x: hx, y: hy, home: true }];
  clear(hx, hy, 3);

  // Neighbouring villages in a loose ring
  const nN = 5;
  const a0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < nN; k++) {
    let best: [number, number] | null = null;
    for (let tries = 0; tries < 40 && !best; tries++) {
      const a = a0 + (k / nN) * Math.PI * 2 + rng.range(-0.25, 0.25);
      const r = rng.range(0.62, 0.8);
      const px = Math.round(hx + Math.cos(a) * r * (W / 2 - 3));
      const py = Math.round(hy + Math.sin(a) * r * (H / 2 - 3));
      if (!inb(px, py) || px < 3 || py < 3 || px > W - 4 || py > H - 4) continue;
      let wet = false;
      for (let y = py - 2; y <= py + 2; y++) for (let x2 = px - 2; x2 <= px + 2; x2++) if (tiles[idx(x2, y)].t === 'water') wet = true;
      if (!wet) best = [px, py];
    }
    if (!best) continue;
    places.push({ id: places.length, name: names[places.length], x: best[0], y: best[1], home: false });
    clear(best[0], best[1], 2);
  }

  const map: MapData = { tiles, places, buildings: [], exits: [] };

  // Roads between neighbours (ring), and from some neighbours to the map edge
  const others = places.filter((p) => !p.home);
  const sorted = [...others].sort((p, q) => Math.atan2(p.y - hy, p.x - hx) - Math.atan2(q.y - hy, q.x - hx));
  for (let k = 0; k < sorted.length; k++) {
    const p = sorted[k], q = sorted[(k + 1) % sorted.length];
    if (k === sorted.length - 1 && rng.chance(0.5)) continue; // leave one gap in the ring sometimes
    layRoad(map, p.x, p.y, q.x, q.y, { x: hx, y: hy, r: 5 });
  }
  const exitPlaces = rng.shuffle([...others]).slice(0, 3);
  for (const p of exitPlaces) {
    const dl = p.x, dr = W - 1 - p.x, dt = p.y, db = H - 1 - p.y;
    const m = Math.min(dl, dr, dt, db);
    let ex = p.x, ey = p.y;
    if (m === dl) ex = 0; else if (m === dr) ex = W - 1; else if (m === dt) ey = 0; else ey = H - 1;
    if (tiles[idx(ex, ey)].t === 'water') continue;
    layRoad(map, p.x, p.y, ex, ey, { x: hx, y: hy, r: 5 });
    map.exits.push({ x: ex, y: ey });
  }

  // Village buildings for neighbours: houses around the centre plus one or two landmarks
  const landmarkPool: BKind[] = rng.shuffle(['molen', 'kerk', 'herberg', 'smidse', 'put', 'kapel', 'molen', 'kerk'] as BKind[]);
  for (const p of others) {
    const lm = [landmarkPool.pop()!, ...(rng.chance(0.5) ? [landmarkPool.pop()!] : [])].filter(Boolean);
    const kinds: BKind[] = [...lm, 'boerderij', 'huis', 'huis', 'huis', ...(rng.chance(0.6) ? ['huis' as BKind] : []), ...(rng.chance(0.5) ? ['boerderij' as BKind] : [])];
    for (const kind of kinds) {
      const spot = findSpotNear(map, rng, p.x, p.y, 3);
      if (spot) addBuilding(map, kind, spot[0], spot[1], p.id, 0);
    }
  }

  // Home: a few houses and a farm along a short lane
  tiles[idx(hx, hy)].road = true;
  tiles[idx(hx + 1, hy)].road = true;
  tiles[idx(hx - 1, hy)].road = true;
  for (const kind of ['huis', 'huis', 'boerderij', 'huis'] as BKind[]) {
    const spot = findSpotNear(map, rng, hx, hy, 2);
    if (spot) addBuilding(map, kind, spot[0], spot[1], 0, 0);
  }

  // A gallows field on open land between home and a neighbour
  for (let tries = 0; tries < 60; tries++) {
    const gx = hx + Math.round(rng.range(-11, 11)), gy = hy + Math.round(rng.range(-8, 8));
    const d = Math.abs(gx - hx) + Math.abs(gy - hy);
    if (!inb(gx, gy) || d < 6 || d > 12) continue;
    const t = tiles[idx(gx, gy)];
    if (t.t === 'water' || t.road || t.b >= 0) continue;
    if (others.some((p) => Math.abs(p.x - gx) + Math.abs(p.y - gy) < 5)) continue;
    addBuilding(map, 'galg', gx, gy, 0, 0);
    break;
  }

  return map;
}

function findSpotNear(map: MapData, rng: Rng, cx: number, cy: number, r: number): [number, number] | null {
  const cands: [number, number][] = [];
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inb(x, y)) continue;
      const t = map.tiles[idx(x, y)];
      if (t.t === 'water' || t.road || t.b >= 0) continue;
      cands.push([x, y]);
    }
  if (!cands.length) return null;
  // prefer spots next to a road
  const scored = cands.map((c) => {
    const nearRoad = N4.some(([dx, dy]) => inb(c[0] + dx, c[1] + dy) && map.tiles[idx(c[0] + dx, c[1] + dy)].road);
    return { c, w: (nearRoad ? 4 : 1) / (1 + Math.hypot(c[0] - cx, c[1] - cy)) };
  });
  return rng.weighted(scored, (s) => s.w)!.c;
}

export function addBuilding(map: MapData, kind: BKind, x: number, y: number, place: number, week: number): Building {
  const b: Building = { id: map.buildings.length, kind, x, y, place, week };
  map.buildings.push(b);
  map.tiles[idx(x, y)].b = b.id;
  return b;
}

/** Least-cost road between two points; existing roads are cheap, water becomes a bridge. */
export function layRoad(map: MapData, x0: number, y0: number, x1: number, y1: number, avoid?: { x: number; y: number; r: number }) {
  const cost = (t: Tile, i: number) => {
    if (t.b >= 0) return 50;
    let c = t.road ? 0.3 : { akker: 1, wei: 1, heide: 1.3, bos: 2.5, veen: 3, water: 9 }[t.t];
    if (avoid) {
      const x = i % W, y = (i / W) | 0;
      if (Math.max(Math.abs(x - avoid.x), Math.abs(y - avoid.y)) <= avoid.r) c += 40;
    }
    return c;
  };
  const path = dijkstra(map, x0, y0, x1, y1, cost);
  for (const [x, y] of path) {
    const t = map.tiles[idx(x, y)];
    if (t.b >= 0) continue;
    t.road = true;
    if (t.t === 'water') t.bridge = true;
  }
}

function dijkstra(map: MapData, x0: number, y0: number, x1: number, y1: number, cost: (t: Tile, i: number) => number) {
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const open: number[] = [idx(x0, y0)];
  dist[idx(x0, y0)] = 0;
  const goal = idx(x1, y1);
  while (open.length) {
    // small maps: linear scan is fine
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy;
      if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny);
      const c = ni === goal ? 1 : cost(map.tiles[ni], ni);
      const nd = dist[cur] + c + 0.001 * Math.abs(dy); // tiny bias for straighter roads
      if (nd < dist[ni]) {
        if (dist[ni] === Infinity) open.push(ni);
        dist[ni] = nd;
        prev[ni] = cur;
      }
    }
  }
  const path: [number, number][] = [];
  let c = goal;
  while (c !== -1) {
    path.push([c % W, (c / W) | 0]);
    c = prev[c];
  }
  return path.reverse();
}

/** Tiles a walker can use: roads, plus the tiles of buildings that touch a road (doors). */
export function walkable(map: MapData, i: number): boolean {
  return map.tiles[i].road;
}

/** Road tile that serves a place: the nearest road tile to its centre (within reach). */
export function placeRoadTile(map: MapData, p: Place): number | null {
  let best: number | null = null, bd = Infinity;
  for (let y = p.y - 4; y <= p.y + 4; y++)
    for (let x = p.x - 4; x <= p.x + 4; x++) {
      if (!inb(x, y) || !map.tiles[idx(x, y)].road) continue;
      const d = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (d < bd) { bd = d; best = idx(x, y); }
    }
  return best;
}

/** BFS over roads. Returns the tile path from a to b (inclusive) or null. */
export function roadPath(map: MapData, a: number, b: number): number[] | null {
  if (a === b) return [a];
  const prev = new Int32Array(W * H).fill(-2);
  prev[a] = -1;
  const q = [a];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy;
      if (!inb(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (prev[ni] !== -2 || !walkable(map, ni)) continue;
      prev[ni] = cur;
      if (ni === b) {
        const path = [b];
        let c = cur;
        while (c !== -1) { path.push(c); c = prev[c]; }
        return path.reverse();
      }
      q.push(ni);
    }
  }
  return null;
}

/** Road junctions with three or more arms lying outside the village cores count as crossroads. */
export function crossroads(map: MapData): number[] {
  const out: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!map.tiles[i].road || map.tiles[i].bridge) continue;
      let arms = 0;
      for (const [dx, dy] of N4) if (inb(x + dx, y + dy) && map.tiles[idx(x + dx, y + dy)].road) arms++;
      if (arms < 3) continue;
      const nearCore = map.places.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= 2);
      if (!nearCore) out.push(i);
    }
  return out;
}

/** Count terrain tiles within radius r of any of the given points. */
export function terrainNear(map: MapData, pts: [number, number][], r: number): Record<Terrain, number> {
  const seen = new Set<number>();
  const counts: Record<Terrain, number> = { akker: 0, wei: 0, heide: 0, bos: 0, veen: 0, water: 0 };
  for (const [px, py] of pts)
    for (let y = py - r; y <= py + r; y++)
      for (let x = px - r; x <= px + r; x++) {
        if (!inb(x, y)) continue;
        const i = idx(x, y);
        if (seen.has(i)) continue;
        seen.add(i);
        counts[map.tiles[i].t]++;
      }
  return counts;
}
