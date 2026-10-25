// The collector's field map. The land is drawn twice, once as a faded printed sheet and once in watercolour;
// the watercolour shows through only where the collector has been. Names, hearsay in pencil and the red trail
// of what was written down are drawn on a layer of their own.
import { Rng, makeNoise } from './rng';
import { N4, TILE, W, H, idx, inb, type BKind } from './world';
import { field, trace } from './contour';
import type { Land } from './land';
import type { Field, Known, Season } from './field';

export const M = 56;
export const SW = W * TILE + M * 2;
export const SH = H * TILE + M * 2;
/**
 * Pixels per map unit: as sharp as a desktop on recent phones (their screens have three pixels to a point), a little
 * less on older, smaller ones, to keep within their memory. ?res=… in the address overrides it (between 1 and 2.5).
 */
export const RES = (() => {
  if (typeof window === 'undefined') return 2;
  const asked = Number(new URLSearchParams(location.search).get('res'));
  if (asked >= 1 && asked <= 2.5) return asked;
  const phone = Math.min(window.innerWidth, window.innerHeight) < 700;
  return !phone || (window.devicePixelRatio || 1) >= 3 ? 2 : 1.5;
})();

export const INK = '#2f2419';
export const PAPER = '#efe5cb';
export const RED = '#a8321f';
const PENCIL = 'rgba(62, 62, 72, 0.85)';

/** The two finished sheets, for the HTML layer to cut views of places from. */
export const sheets: { sepia: HTMLCanvasElement | null; colour: HTMLCanvasElement | null } = { sepia: null, colour: null };

/** Centre of a tile, in sheet pixels. */
export const px = (t: number) => M + t * TILE + TILE / 2;

type Terrain = 'akker' | 'wei' | 'heide' | 'bos' | 'veen' | 'water';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, k: number): string {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const WASH_AUTUMN: Record<Terrain, [string, number]> = {
  akker: ['#d8bf86', 0.42],
  wei: ['#a7bb7d', 0.42],
  heide: ['#b48aa6', 0.4],
  bos: ['#6d8d5a', 0.5],
  veen: ['#8b7a58', 0.42],
  water: ['#86aab4', 0.75],
};
/** The land's colours through the year: fresh green and new furrows in spring, gold and blooming heather in summer,
 *  autumn's browns, and in winter a land under snow, the water grey with ice. */
const WASHES: Record<Season, Record<Terrain, [string, number]>> = {
  lente: { akker: ['#c9bb8a', 0.4], wei: ['#9cc472', 0.46], heide: ['#a89a86', 0.38], bos: ['#7fae5e', 0.5], veen: ['#8f8460', 0.4], water: ['#80aebc', 0.75] },
  zomer: { akker: ['#e6c763', 0.48], wei: ['#9eb862', 0.44], heide: ['#a865a2', 0.5], bos: ['#577f45', 0.55], veen: ['#9a8656', 0.42], water: ['#78a6b6', 0.75] },
  herfst: WASH_AUTUMN,
  winter: { akker: ['#e4e6e6', 0.22], wei: ['#e0e6e8', 0.22], heide: ['#c6bcc4', 0.26], bos: ['#7a8a80', 0.42], veen: ['#bdb6a8', 0.26], water: ['#a9bcc6', 0.7] },
};
let WASH = WASH_AUTUMN;
let SEASON: Season = 'herfst';

// ------------------------------------------------------------------ the land, in one of two states

/** Draw the whole sheet; `k` is 0 for the printed sheet and 1 for the watercolour one. Same seed, same marks. */
/** Things on the sheet that move, which the scene animates on top: chimneys that smoke, mills whose sails turn. */
export interface Features {
  chimneys: [number, number][];
  mills: [number, number][];
  /** lit windows at night: where people live, and which place they belong to (-1: a hut out of the village) */
  windows: [number, number, number][];
}

export function renderSheet(land: Land, seed: number, k: number, title: { region: string; year: number; season?: Season }, features?: Features): HTMLCanvasElement {
  SEASON = title.season ?? 'herfst';
  WASH = WASHES[SEASON];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(SW * RES);
  canvas.height = Math.round(SH * RES);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RES, RES);
  const noise = makeNoise(new Rng(seed + 9));
  const ink = 0.62 + 0.38 * k;
  const glyphs: { y: number; draw: () => void }[] = [];

  // paper
  {
    const r = new Rng(seed + 1);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, SW, SH);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = r.chance(0.5) ? 'rgba(120, 95, 60, 0.05)' : 'rgba(255, 252, 240, 0.1)';
      ctx.fillRect(r.next() * SW, r.next() * SH, r.range(0.5, 2), r.range(0.5, 1.5));
    }
    for (let i = 0; i < 18; i++) {
      const x = r.next() * SW, y = r.next() * SH, rad = r.range(20, 80);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(160, 120, 70, 0.07)');
      g.addColorStop(1, 'rgba(160, 120, 70, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  // watercolour washes
  {
    const sub = 4;
    const kinds = Object.keys(WASH) as Terrain[];
    const fields = kinds.map((t) => field(W, H, sub, (x, y) => land.tiles[idx(x, y)].t === t, (x, y) => (noise(x * 1.7, y * 1.7) - 0.5) * 0.25, 0.7));
    const S = 3;
    const gw = Math.ceil((W * TILE) / S), gh = Math.ceil((H * TILE) / S);
    const img = new ImageData(gw, gh);
    const r = new Rng(seed + 3);
    for (let j = 0; j < gh; j++)
      for (let i = 0; i < gw; i++) {
        const tx = (i * S) / TILE, ty = (j * S) / TILE;
        let wsum = 0, cr = 0, cg = 0, cb = 0, a = 0;
        kinds.forEach((t, n) => {
          const f = fields[n];
          const fi = Math.max(0, Math.min(f.gw - 1, Math.round((tx + 1) * sub))), fj = Math.max(0, Math.min(f.gh - 1, Math.round((ty + 1) * sub)));
          const w = Math.pow(smooth(0.3, 0.7, f.v[fj * f.gw + fi]), 2);
          if (!w) return;
          let [R, G, B] = hex(WASH[t][0]);
          // fields lie in a patchwork of parcels, each a little different
          if (t === 'akker' || t === 'wei') {
            const p = noise(Math.floor(tx / 2.3) * 3.1 + 0.5, Math.floor(ty / 1.7) * 2.7 + 0.5) - 0.5;
            R += p * 40; G += p * 30; B += p * 18;
          }
          cr += R * w; cg += G * w; cb += B * w; wsum += w;
          a = Math.max(a, WASH[t][1] * w);
        });
        if (!wsum) continue;
        const gran = 0.82 + r.next() * 0.3 + (noise(tx * 6, ty * 6) - 0.5) * 0.35;
        const o = (j * gw + i) * 4;
        img.data[o] = cr / wsum; img.data[o + 1] = cg / wsum; img.data[o + 2] = cb / wsum;
        img.data[o + 3] = 255 * a * gran * (0.07 + 0.93 * k);
      }
    const off = document.createElement('canvas');
    off.width = gw; off.height = gh;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(off, M, M, W * TILE, H * TILE);
    ctx.restore();
    // pigment gathers at the edge of a wash
    if (k > 0) kinds.forEach((t, n) => {
      if (t === 'akker' || t === 'wei') return;
      const c = trace(fields[n], sub, 0.5);
      ctx.strokeStyle = WASH[t][0];
      ctx.globalAlpha = 0.45 * k;
      ctx.lineWidth = 1.6;
      for (const line of c.lines) {
        ctx.beginPath();
        for (let i = 0; i < line.length; i += 2) {
          const X = M + line[i] * TILE, Y = M + line[i + 1] * TILE;
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  // the ground's own marks
  {
    const r = new Rng(seed + 6);
    ctx.strokeStyle = INK;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = land.tiles[idx(x, y)];
        if (t.road || t.b >= 0) continue;
        const X = M + x * TILE, Y = M + y * TILE;
        if (t.t === 'akker') {
          const ang = noise(Math.floor(x / 2.3) * 3.1 + 0.5, Math.floor(y / 1.7) * 2.7 + 0.5) > 0.5;
          ctx.globalAlpha = 0.18 * ink;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          for (let q = 4; q < TILE; q += 5) {
            if (ang) { ctx.moveTo(X + q, Y + 3); ctx.lineTo(X + q, Y + TILE - 3); }
            else { ctx.moveTo(X + 3, Y + q); ctx.lineTo(X + TILE - 3, Y + q); }
          }
          ctx.stroke();
        } else if (t.t === 'wei' || t.t === 'heide') {
          const heath = t.t === 'heide';
          ctx.globalAlpha = (heath ? 0.55 : 0.4) * ink;
          ctx.lineWidth = 0.8;
          for (let q = 0; q < (heath ? 3 : 2); q++) {
            const gx = X + r.range(3, TILE - 3), gy = Y + r.range(5, TILE - 2);
            ctx.beginPath();
            ctx.moveTo(gx - 2.5, gy - 3); ctx.lineTo(gx, gy); ctx.lineTo(gx + 2.5, gy - 3);
            if (heath) { ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 4); }
            ctx.stroke();
          }
        } else if (t.t === 'veen') {
          ctx.globalAlpha = 0.55 * ink;
          ctx.lineWidth = 0.7;
          const gx = X + r.range(4, TILE - 6), gy = Y + r.range(8, TILE - 2);
          ctx.beginPath();
          for (let q = -2; q <= 2; q++) { ctx.moveTo(gx + q * 1.6, gy); ctx.lineTo(gx + q * 2.2, gy - 6 + Math.abs(q) * 0.8); }
          ctx.stroke();
          if (r.chance(0.3)) {
            ctx.fillStyle = mix(PAPER, '#6f8f98', 0.25 + 0.5 * k);
            ctx.beginPath();
            ctx.ellipse(X + r.range(6, 18), Y + r.range(4, 10), 4, 1.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    ctx.globalAlpha = 1;
  }

  // water: banks and ripples
  {
    const f = field(W, H, 4, (x, y) => land.tiles[idx(x, y)].t === 'water', (x, y) => (noise(x * 2, y * 2) - 0.5) * 0.12, 0.6);
    const c = trace(f, 4, 0.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = 0.85 * ink;
    for (const line of c.lines) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i += 2) {
        const X = M + line[i] * TILE, Y = M + line[i + 1] * TILE;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
    const r = new Rng(seed + 4);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#2f4a55';
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = land.tiles[idx(x, y)];
        if (t.t !== 'water' || t.road) continue;
        for (let q = 0; q < 2; q++) {
          const X = M + x * TILE + r.range(4, TILE - 8), Y = M + y * TILE + r.range(4, TILE - 4);
          ctx.globalAlpha = 0.5 * ink;
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.quadraticCurveTo(X + 3, Y - 2, X + 6, Y);
          ctx.quadraticCurveTo(X + 9, Y + 2, X + 12, Y);
          ctx.stroke();
        }
      }
    ctx.globalAlpha = 1;
  }

  // snow lies over everything but the water, thinner where the wind has swept it
  if (SEASON === 'winter' && k > 0) {
    const sub = 3;
    const off = document.createElement('canvas');
    off.width = W * sub;
    off.height = H * sub;
    const oc = off.getContext('2d')!;
    const img = oc.createImageData(off.width, off.height);
    for (let j = 0; j < off.height; j++)
      for (let i = 0; i < off.width; i++) {
        const tx = Math.floor(i / sub), ty = Math.floor(j / sub);
        const t = land.tiles[idx(tx, ty)].t;
        const o = (j * off.width + i) * 4;
        img.data[o] = 252; img.data[o + 1] = 253; img.data[o + 2] = 255;
        img.data[o + 3] = t === 'water' ? 0 : 255 * k * (0.5 + 0.35 * noise(i / 5, j / 5)) * (t === 'bos' ? 0.6 : 1);
      }
    oc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, M, M, W * TILE, H * TILE);
    ctx.restore();
  }

  // ---------------------------------------------------------------- pictorial signs, back to front

  const tree = (x: number, y: number, s: number, kind: 'loof' | 'den' | 'fruit') => glyphs.push({ y, draw: () => {
    ctx.globalAlpha = ink;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.fillStyle = 'rgba(60, 50, 30, 0.12)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.25, y + 1, s * 0.45, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - s * 0.45);
    ctx.stroke();
    if (kind !== 'den' && SEASON === 'winter') {
      // bare branches, with a little snow along them
      const rb = new Rng(Math.round(x * 13 + y * 7));
      ctx.beginPath();
      const top = y - s * 1.25;
      ctx.moveTo(x, y - s * 0.45);
      ctx.lineTo(x, top + s * 0.2);
      for (let i = 0; i < 5; i++) {
        const by = y - s * (0.55 + i * 0.13), side = i % 2 ? 1 : -1, len = s * (0.42 - i * 0.05);
        ctx.moveTo(x, by);
        ctx.lineTo(x + side * len, by - len * 0.8);
        ctx.moveTo(x + side * len * 0.55, by - len * 0.44);
        ctx.lineTo(x + side * len * (0.55 + rb.range(0.1, 0.3)), by - len * 1.05);
      }
      ctx.stroke();
      if (k > 0) {
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + rb.range(-s * 0.3, s * 0.3), y - s * rb.range(0.7, 1.1), 1.8, 0.9);
      }
      ctx.globalAlpha = 1;
      return;
    }
    const leafColour = (fruit: boolean) => {
      if (SEASON === 'lente') return fruit ? '#e8d6d0' : '#a3c477';
      if (SEASON === 'zomer') return fruit ? '#86a058' : '#6c8e50';
      if (SEASON === 'herfst' && !fruit) {
        // autumn turns some trees ochre and rust
        const v = Math.abs(Math.sin(x * 12.9898 + y * 78.233)) % 1;
        return v < 0.18 ? '#c48a3c' : v < 0.3 ? '#b0623a' : v < 0.42 ? '#a8a04e' : '#7f9c63';
      }
      return fruit ? '#9aae6c' : '#7f9c63';
    };
    if (kind === 'den') {
      ctx.fillStyle = mix('#e6dcbf', SEASON === 'winter' ? '#5f7466' : '#5b7a52', k);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.35);
      ctx.lineTo(x + s * 0.38, y - s * 0.35);
      ctx.lineTo(x - s * 0.38, y - s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (SEASON === 'winter' && k > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = k * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.35);
        ctx.lineTo(x + s * 0.17, y - s * 0.9);
        ctx.lineTo(x - s * 0.17, y - s * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(x - s * 0.36, y - s * 0.4, s * 0.72, 1.4);
      }
    } else {
      const rr = kind === 'fruit' ? s * 0.32 : s * 0.42;
      ctx.fillStyle = mix('#e8dec2', leafColour(kind === 'fruit'), k);
      ctx.beginPath();
      ctx.arc(x - rr * 0.45, y - s * 0.55 - rr * 0.2, rr * 0.75, 0, Math.PI * 2);
      ctx.arc(x + rr * 0.45, y - s * 0.55 - rr * 0.25, rr * 0.75, 0, Math.PI * 2);
      ctx.arc(x, y - s * 0.55 - rr * 0.85, rr * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = ink * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(x + rr * 0.2 + i * 2, y - s * 0.55 - rr * 0.9 + i);
        ctx.lineTo(x + rr * 0.2 + i * 2, y - s * 0.55 + rr * 0.1);
      }
      ctx.stroke();
      if (kind === 'fruit' && k > 0.3 && SEASON !== 'winter') {
        ctx.globalAlpha = k;
        // blossom in spring, apples later in the year
        ctx.fillStyle = SEASON === 'lente' ? '#f4f0ee' : SEASON === 'zomer' ? '#9aae3c' : '#b0442c';
        for (let i = 0; i < 3; i++) ctx.fillRect(x - rr * 0.5 + i * rr * 0.5, y - s * 0.6 - (i % 2) * rr * 0.6, 1.5, 1.5);
      }
    }
    ctx.globalAlpha = 1;
  } });

  // woods, junipers on the heath, hedgerows along parcel edges
  {
    const r = new Rng(seed + 7);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = land.tiles[idx(x, y)];
        if (t.road || t.b >= 0) continue;
        const X = M + x * TILE, Y = M + y * TILE;
        if (t.t === 'bos') {
          const pine = noise(x / 5 + 40, y / 5) > 0.55;
          for (let q = 0; q < 2; q++) tree(X + r.range(3, TILE - 3), Y + r.range(6, TILE), r.range(11, 15), pine ? 'den' : 'loof');
        } else if (t.t === 'heide' && r.chance(0.06)) {
          tree(X + r.range(4, 20), Y + r.range(8, 22), r.range(7, 9), 'den');
        }
      }
    const rh = new Rng(seed + 12);
    const open = (x: number, y: number) => inb(x, y) && ['akker', 'wei'].includes(land.tiles[idx(x, y)].t) && !land.tiles[idx(x, y)].road && land.tiles[idx(x, y)].b < 0;
    for (let py = 0; py < H; py += 2)
      for (let pxl = 0; pxl < W; pxl += 3) {
        if (noise(pxl / 3 + 7.3, py / 2 + 2.1) < 0.68) continue;
        if (land.places.some((p) => dist(p, { x: pxl, y: py }) < 3)) continue;
        const vertical = rh.chance(0.4);
        for (let q = 0; q < (vertical ? 2 : 3); q++) {
          const x = vertical ? pxl : pxl + q, y = vertical ? py + q : py;
          if (!open(x, y)) continue;
          for (let j = 0; j < 3; j++) {
            const X = M + x * TILE + (vertical ? 0 : j * 8 + 4), Y = M + y * TILE + (vertical ? j * 8 + 6 : 2);
            if (rh.chance(0.8)) tree(X + rh.range(-2.5, 2.5), Y + rh.range(-1.5, 1.5), rh.range(5.5, 9), 'loof');
          }
        }
      }
  }

  // roads, a sandy track between inked edges, with trees along some stretches
  {
    const road = (x: number, y: number) => inb(x, y) && land.tiles[idx(x, y)].road;
    const path = new Path2D();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!road(x, y)) continue;
        const cx = px(x), cy = px(y);
        const arms = N4.filter(([dx, dy]) => road(x + dx, y + dy));
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          const dx = x === 0 ? -1 : x === W - 1 ? 1 : 0, dy = y === 0 ? -1 : y === H - 1 ? 1 : 0;
          path.moveTo(cx, cy);
          path.lineTo(cx + dx * TILE * 1.2, cy + dy * TILE * 1.2);
        }
        if (arms.length === 2 && arms[0][0] !== -arms[1][0] && arms[0][1] !== -arms[1][1]) {
          const [a, b] = arms;
          path.moveTo(cx + (a[0] * TILE) / 2, cy + (a[1] * TILE) / 2);
          path.quadraticCurveTo(cx, cy, cx + (b[0] * TILE) / 2, cy + (b[1] * TILE) / 2);
          continue;
        }
        for (const [dx, dy] of arms) {
          path.moveTo(cx, cy);
          path.lineTo(cx + (dx * TILE) / 2, cy + (dy * TILE) / 2);
        }
      }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.8 * ink;
    ctx.lineWidth = 5.2;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mix('#efe2c2', '#e9d6a6', k);
    ctx.lineWidth = 3.4;
    ctx.stroke(path);
    // bridges
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!land.tiles[idx(x, y)].bridge) continue;
        const horiz = road(x - 1, y) || road(x + 1, y);
        ctx.strokeStyle = INK;
        ctx.globalAlpha = ink;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(px(x) - 11, px(y) - 5); ctx.lineTo(px(x) + 11, px(y) - 5); ctx.moveTo(px(x) - 11, px(y) + 5); ctx.lineTo(px(x) + 11, px(y) + 5); }
        else { ctx.moveTo(px(x) - 5, px(y) - 11); ctx.lineTo(px(x) - 5, px(y) + 11); ctx.moveTo(px(x) + 5, px(y) - 11); ctx.lineTo(px(x) + 5, px(y) + 11); }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    const r = new Rng(seed + 8);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        if (!road(x, y) || land.places.some((p) => dist(p, { x, y }) < 3) || land.tiles[idx(x, y)].bridge) continue;
        if (noise(x / 4 + 13, y / 4 + 5) < 0.66 || (x + y) % 2) continue;
        const horiz = road(x - 1, y) || road(x + 1, y);
        if (horiz) { tree(px(x) + r.range(-3, 3), px(y) - 5, 10, 'loof'); tree(px(x) + r.range(-3, 3), px(y) + 12, 10, 'loof'); }
        else { tree(px(x) - 9, px(y) + r.range(-3, 3) + 4, 10, 'loof'); tree(px(x) + 9, px(y) + r.range(-3, 3) + 4, 10, 'loof'); }
      }
  }

  // buildings in elevation, larger than the land: a village is a landmark
  const BS = 1.6;
  const building = (kind: BKind, bx: number, by: number, r: Rng) => glyphs.push({ y: by, draw: () => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(BS, BS);
    const x = 0, y = 0;
    ctx.globalAlpha = ink;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.75;
    ctx.lineJoin = 'round';
    const wall = mix('#e9dfc4', '#efe2c4', k);
    const snow = SEASON === 'winter';
    const tile = mix('#ddd0b0', snow ? '#eef0f2' : r.chance(0.5) ? '#b4543a' : '#9c4a35', k);
    const thatch = mix('#d8caa6', snow ? '#e9ecee' : '#9c8456', k);
    const poly = (pts: number[], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    ctx.fillStyle = 'rgba(60, 50, 30, 0.14)';
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 1, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    if (kind === 'huis' || kind === 'smidse' || kind === 'herberg' || kind === 'school') {
      const w = kind === 'school' ? 18 : 13, h = 8;
      poly([x - w / 2, y, x + w / 2, y, x + w / 2, y - h, x - w / 2, y - h], wall);
      poly([x - w / 2 - 2, y - h, x + w / 2 + 2, y - h, x + w / 2 - 2, y - h - 9, x - w / 2 + 2, y - h - 9], tile);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, y - 5, 2.4, 5);
      ctx.fillRect(x - w / 2 + 2.5, y - 6, 2.4, 2.4);
      ctx.fillRect(x + w / 2 - 5, y - 6, 2.4, 2.4);
      if (kind === 'smidse') chimney(bx + (x + w / 2 - 3) * BS, by + (y - h - 9) * BS);
      if (kind === 'herberg') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y - 6); ctx.lineTo(x + w / 2 + 5, y - 6); ctx.moveTo(x + w / 2 + 4, y - 6); ctx.lineTo(x + w / 2 + 4, y - 4);
        ctx.stroke();
        ctx.fillStyle = mix('#e0d2ae', '#c49a3c', k);
        ctx.fillRect(x + w / 2 + 2, y - 4, 4, 3.5);
        ctx.strokeRect(x + w / 2 + 2, y - 4, 4, 3.5);
      }
    } else if (kind === 'boerderij') {
      poly([x - 12, y, x + 12, y, x + 12, y - 6, x - 12, y - 6], wall);
      poly([x - 14, y - 6, x + 14, y - 6, x + 9, y - 17, x - 9, y - 17], thatch);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x - 7, y, 3, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = ink * 0.4;
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 3) { ctx.moveTo(x + i, y - 16); ctx.lineTo(x + i * 1.3, y - 7); }
      ctx.stroke();
    } else if (kind === 'kerk') {
      poly([x - 12, y, x + 6, y, x + 6, y - 10, x - 12, y - 10], wall);
      poly([x - 13, y - 10, x + 6, y - 10, x + 3, y - 17, x - 10, y - 17], tile);
      poly([x + 4, y, x + 12, y, x + 12, y - 20, x + 4, y - 20], wall);
      poly([x + 3, y - 20, x + 13, y - 20, x + 8, y - 36], mix('#d2c6a8', '#6c6f6a', k));
      ctx.beginPath(); ctx.moveTo(x + 8, y - 36); ctx.lineTo(x + 8, y - 41); ctx.moveTo(x + 6, y - 39); ctx.lineTo(x + 10, y - 39); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(x - 9, y - 7, 2, 4); ctx.fillRect(x - 4, y - 7, 2, 4); ctx.fillRect(x + 7, y - 15, 2, 4);
    } else if (kind === 'molen') {
      poly([x - 6, y, x + 6, y, x + 3.5, y - 20, x - 3.5, y - 20], wall);
      poly([x - 4.5, y - 20, x + 4.5, y - 20, x, y - 25], thatch);
      // the sails are drawn by the scene, turning
      features?.mills.push([bx + x * BS, by + (y - 21) * BS]);
    } else if (kind === 'kapel') {
      poly([x - 4, y, x + 4, y, x + 4, y - 7, x - 4, y - 7], wall);
      poly([x - 5.5, y - 7, x + 5.5, y - 7, x, y - 13], tile);
      ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 18); ctx.moveTo(x - 2, y - 16); ctx.lineTo(x + 2, y - 16); ctx.stroke();
    } else if (kind === 'put') {
      ctx.fillStyle = wall;
      ctx.beginPath(); ctx.ellipse(x, y - 2, 4.5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x - 4, y - 11); ctx.lineTo(x + 4, y - 11); ctx.lineTo(x + 4, y - 2); ctx.stroke();
    } else if (kind === 'hut') {
      poly([x - 6, y, x + 6, y, x + 6, y - 5, x - 6, y - 5], wall);
      poly([x - 8, y - 5, x + 8, y - 5, x, y - 14], thatch);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, y - 4, 2.2, 4);
      chimney(bx + (x + 3) * BS, by + (y - 12) * BS);
    }
    ctx.restore();
  } });
  const chimney = (x: number, y: number) => features?.chimneys.push([x, y]);

  {
    const r = new Rng(seed + 10);
    for (const b of land.buildings) {
      if (b.kind === 'galg') continue;
      const p = land.places[b.place];
      const spread = b.kind === 'hut' ? 0 : 0.25;
      const X = px(b.x) + (px(b.x) - px(p.x)) * spread + r.range(-3, 3);
      const Y = px(b.y) + (px(b.y) - px(p.y)) * spread + r.range(-2, 2) + 6;
      building(b.kind, X, Y, r);
      if (['huis', 'boerderij', 'herberg', 'smidse', 'school', 'hut', 'kerk'].includes(b.kind))
        features?.windows.push([X + (b.kind === 'kerk' ? -8 : 0), Y - 7, b.kind === 'hut' ? -1 : b.place]);
      if (b.kind === 'boerderij') for (let i = 0; i < 3; i++) tree(X + r.range(-30, 30), Y + r.range(8, 20), r.range(8, 10), 'fruit');
      if (b.kind === 'huis' && r.chance(0.5)) chimney(X - 3, Y - 26);
    }
    for (const p of land.places) tree(px(p.x) + 2, px(p.y) + 4, 22, 'loof');
  }

  // the places tales are tied to
  for (const s of land.sites) {
    const X = px(s.x), Y = px(s.y);
    if (s.kind === 'linde') tree(X, Y + 8, 28, 'loof');
    else if (s.kind === 'galg') glyphs.push({ y: Y + 6, draw: () => {
      ctx.globalAlpha = ink;
      ctx.strokeStyle = INK;
      ctx.fillStyle = mix('#e6dcc0', '#c9b98a', k);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(X, Y + 6, 20, 6, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X - 6, Y + 1); ctx.lineTo(X - 6, Y - 26); ctx.lineTo(X + 9, Y - 26); ctx.moveTo(X - 6, Y - 19); ctx.lineTo(X + 1, Y - 26); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X + 6, Y - 26); ctx.lineTo(X + 6, Y - 18); ctx.stroke();
      ctx.globalAlpha = 1;
    } });
    else if (s.kind === 'kruisweg') glyphs.push({ y: Y + 10, draw: () => {
      ctx.globalAlpha = ink;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X + 13, Y + 8); ctx.lineTo(X + 13, Y - 14); ctx.moveTo(X + 7, Y - 8); ctx.lineTo(X + 19, Y - 8); ctx.stroke();
      ctx.globalAlpha = 1;
    } });
    else if (s.kind === 'heide') glyphs.push({ y: Y + 6, draw: () => {
      // a heap of great stones
      ctx.globalAlpha = ink;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.fillStyle = mix('#e2d8bd', '#a7a294', k);
      for (const [dx, dy, rx, ry] of [[-10, 4, 8, 5], [3, 5, 9, 6], [-2, -3, 12, 5], [12, 2, 6, 4]]) {
        ctx.beginPath(); ctx.ellipse(X + dx, Y + dy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } });
    else if (s.kind === 'veen') glyphs.push({ y: Y, draw: () => {
      ctx.globalAlpha = ink;
      ctx.strokeStyle = INK;
      ctx.fillStyle = mix('#dcd6c4', '#4f6a72', k);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(X - 6, Y + 2, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(X + 12, Y - 4, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    } });
    else if (s.kind === 'water') glyphs.push({ y: Y + 4, draw: () => {
      // a ferry punt on its rope
      ctx.globalAlpha = ink;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.fillStyle = mix('#e0d4b4', '#8a6a44', k);
      ctx.beginPath(); ctx.moveTo(X - 14, Y); ctx.lineTo(X + 14, Y); ctx.lineTo(X + 10, Y + 5); ctx.lineTo(X - 10, Y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(X - 30, Y - 6); ctx.lineTo(X + 30, Y - 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } });
    else if (s.kind === 'bos') tree(X, Y + 8, 24, 'den');
  }

  glyphs.sort((a, b) => a.y - b.y).forEach((g) => g.draw());

  // the neat line and the title
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(M - 8, M - 8, W * TILE + 16, H * TILE + 16);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(M - 4, M - 4, W * TILE + 8, H * TILE + 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '20px "IM Fell English SC"';
  ctx.fillText(title.region, M - 8, M - 22);
  ctx.textAlign = 'right';
  ctx.font = 'italic 15px "IM Fell English"';
  ctx.fillText(`Veldkaart, ${{ lente: 'voorjaar', zomer: 'zomer', herfst: 'najaar', winter: 'winter' }[SEASON]} ${title.year}`, M + W * TILE + 8, M - 22);
  return canvas;
}

// ------------------------------------------------------------------ where the colour shows

/** A soft mask of everything the collector has seen, at a quarter of the sheet's resolution. */
export function knownMask(known: Known[], mask?: HTMLCanvasElement): HTMLCanvasElement {
  const S = 0.25;
  const c = mask ?? document.createElement('canvas');
  c.width = Math.ceil(SW * S);
  c.height = Math.ceil(SH * S);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  for (const k of known) {
    const x = px(k.x) * S, y = px(k.y) * S, r = k.r * TILE * S * 1.15;
    const g = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

/** Add one more seen place to the mask; returns the sheet rectangle it touched. */
export function addKnown(mask: HTMLCanvasElement, k: Known): [number, number, number, number] {
  const S = 0.25;
  const ctx = mask.getContext('2d')!;
  const x = px(k.x) * S, y = px(k.y) * S, r = k.r * TILE * S * 1.15;
  const g = ctx.createRadialGradient(x, y, r * 0.45, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  return [(x - r) / S, (y - r) / S, (r * 2) / S, (r * 2) / S];
}

/** Recompose only a rectangle of the sheet (sheet pixels). */
export function composeRect(out: CanvasRenderingContext2D, sepia: HTMLCanvasElement, colour: HTMLCanvasElement, mask: HTMLCanvasElement, tmp: HTMLCanvasElement, rect: [number, number, number, number]) {
  const S = 0.25;
  const x = Math.max(0, Math.floor(rect[0] * RES)), y = Math.max(0, Math.floor(rect[1] * RES));
  const w = Math.min(sepia.width - x, Math.ceil(rect[2] * RES) + 2), h = Math.min(sepia.height - y, Math.ceil(rect[3] * RES) + 2);
  if (w <= 0 || h <= 0) return;
  if (tmp.width < w || tmp.height < h) {
    tmp.width = Math.max(tmp.width, w);
    tmp.height = Math.max(tmp.height, h);
  }
  const t = tmp.getContext('2d')!;
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, w, h);
  t.drawImage(colour, x, y, w, h, 0, 0, w, h);
  t.globalCompositeOperation = 'destination-in';
  t.imageSmoothingEnabled = true;
  t.drawImage(mask, (x / RES) * S, (y / RES) * S, (w / RES) * S, (h / RES) * S, 0, 0, w, h);
  out.save();
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.clearRect(x, y, w, h);
  out.drawImage(sepia, x, y, w, h, x, y, w, h);
  out.drawImage(tmp, 0, 0, w, h, x, y, w, h);
  out.restore();
}

/** How well the collector knows a point (0–1), for fading names in and out. */
export function knownAt(known: Known[], x: number, y: number): number {
  let k = 0;
  for (const c of known) {
    const d = Math.hypot(x - c.x, y - c.y) / (c.r * 1.15);
    k = Math.max(k, 1 - smooth(0.45, 1, d));
  }
  return k;
}

/** The printed sheet with the watercolour let through where the mask allows. */
export function compose(out: CanvasRenderingContext2D, sepia: HTMLCanvasElement, colour: HTMLCanvasElement, mask: HTMLCanvasElement, tmp: HTMLCanvasElement) {
  const w = sepia.width, h = sepia.height;
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext('2d')!;
  t.globalCompositeOperation = 'source-over';
  t.drawImage(colour, 0, 0);
  t.globalCompositeOperation = 'destination-in';
  t.imageSmoothingEnabled = true;
  t.drawImage(mask, 0, 0, w, h);
  out.clearRect(0, 0, w, h);
  out.drawImage(sepia, 0, 0);
  out.drawImage(tmp, 0, 0);
}

// ------------------------------------------------------------------ the layer of ink and pencil

/** `trailUpTo`: draw the red trail only this far (the scene draws the stretch being travelled). */
export function renderNotes(ctx: CanvasRenderingContext2D, f: Field, trailUpTo = Infinity) {
  const land = f.land, sim = f.sim;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const free = (x0: number, y0: number, x1: number, y1: number) =>
    x0 > 4 && y0 > 4 && x1 < SW - 4 && y1 < SH - 4 && !taken.some((t) => x0 < t.x1 && x1 > t.x0 && y0 < t.y1 && y1 > t.y0);
  // keep the villages themselves clear of notes
  for (const p of land.places) taken.push({ x0: px(p.x) - 80, y0: px(p.y) - 90, x1: px(p.x) + 80, y1: px(p.y) + 60 });

  const label = (text: string, x: number, y: number, o: { size?: number; caps?: boolean; italic?: boolean; color?: string; alpha?: number } = {}) => {
    ctx.save();
    ctx.font = `${o.italic ? 'italic ' : ''}${o.size ?? 15}px ${o.caps ? '"IM Fell English SC"' : '"IM Fell English"'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(239, 229, 203, 0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = o.color ?? INK;
    ctx.fillText(text, x, y);
    const w = ctx.measureText(text).width;
    taken.push({ x0: x - w / 2 - 2, y0: y - 9, x1: x + w / 2 + 2, y1: y + 9 });
    ctx.restore();
  };

  // the way walked, in red ink
  const trail = f.trail.slice(0, Math.min(f.trail.length, trailUpTo));
  if (trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([2, 4]);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    let prev = -1;
    for (const i of trail) {
      const x = px(i % W), y = px(Math.floor(i / W));
      if (prev < 0 || Math.abs((prev % W) - (i % W)) + Math.abs(Math.floor(prev / W) - Math.floor(i / W)) > 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = i;
    }
    ctx.stroke();
    ctx.restore();
  }

  // names, below the lowest house of each village
  land.places.forEach((p) => {
    const k = knownAt(f.known, p.x, p.y);
    const low = Math.max(p.y, ...land.buildings.filter((b) => b.place === p.id && b.kind !== 'hut' && Math.abs(b.y - p.y) <= 5 && Math.abs(b.x - p.x) <= 5).map((b) => b.y + (b.y - p.y) * 0.25));
    const x = px(p.x), y = px(low) + 28;
    label(p.name.toUpperCase(), x, y, { caps: true, size: p.home ? 19 : 16, alpha: 0.55 + 0.45 * k });
    const recs = f.notebook.filter((e) => e.place === p.id && e.site === null).length;
    const own = f.finds().filter((e) => e.place === p.id).length;
    if (f.visitedPlaces.has(p.id)) label(recs ? `${recs} opgetekend${own ? ` · ${own} ${own === 1 ? 'vondst' : 'vondsten'}` : ''}` : 'bezocht', x, y + 17, { italic: true, size: 13, color: recs ? RED : '#5a4a3a' });
  });
  for (const s of land.sites) {
    const k = knownAt(f.known, s.x, s.y);
    const x = px(s.x), y = px(s.y) + 22;
    label(s.name, x, y, { italic: true, size: 14, alpha: 0.6 + 0.4 * k });
    if (s.legend) label(`„${sim.type(s.legend).name}”`, x, y + 16, { italic: true, size: 13, color: RED });
  }

  // red dots: what was written down where
  const at = new Map<string, number[]>();
  for (const e of f.notebook) {
    const key = e.site !== null ? `s${e.site}` : `p${e.place}`;
    at.set(key, [...(at.get(key) ?? []), e.num]);
  }
  for (const [key, nums] of at) {
    const o = key[0] === 's' ? land.sites[+key.slice(1)] : land.places[+key.slice(1)];
    const shown = nums.slice(0, 8);
    shown.forEach((num, i) => {
      const X = px(o.x) - ((shown.length - 1) * 12) / 2 + i * 12, Y = px(o.y) + (key[0] === 's' ? -34 : -78);
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.arc(X, Y, 5.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.font = `${num > 9 ? 7.5 : 9}px "EB Garamond"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), X, Y + 0.5);
    });
  }

  // hearsay, pencilled near what it is about; and where the other collector goes tomorrow
  const notes = f.leads.filter((l) => !l.done).map((l) => ({ id: l.id, lines: l.lines, at: l.at, rival: false, quest: l.kind === 'quest' }));
  if (f.rival?.next !== null && f.rival?.next !== undefined && !f.over)
    notes.push({ id: 999, lines: ['Morgen komt de ander hier.'], at: { kind: 'place', id: f.rival.next }, rival: true, quest: false });
  for (const l of notes) {
    const [tx, ty] = f.tileOf(l.at);
    const X = px(tx), Y = px(ty);
    ctx.save();
    ctx.font = 'italic 14.5px "IM Fell English"';
    const w = Math.max(...l.lines.map((s) => ctx.measureText(s).width)), h = l.lines.length * 16;
    const cands: [number, number][] = [[X + 56, Y - h - 10], [X - w - 56, Y - h - 10], [X + 56, Y + 20], [X - w - 56, Y + 20], [X - w / 2, Y - h - 70], [X - w / 2, Y + 70], [X + 90, Y - h / 2], [X - w - 90, Y - h / 2]];
    const [nx, ny] = cands.find(([cx, cy]) => free(cx - 4, cy - 4, cx + w + 4, cy + h + 4)) ?? cands[0];
    taken.push({ x0: nx - 4, y0: ny - 4, x1: nx + w + 4, y1: ny + h + 4 });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(239, 229, 203, 0.9)';
    l.lines.forEach((s, i) => ctx.strokeText(s, nx, ny + i * 16));
    ctx.fillStyle = l.rival ? '#4a5a78' : l.quest ? '#8a2a1a' : PENCIL;
    l.lines.forEach((s, i) => ctx.fillText(s, nx, ny + i * 16));
    // a lead line, and a pencilled ring round the place
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 3]);
    const sx = nx + (nx > X ? -4 : w + 4), sy = ny + h / 2;
    const ex = X + (nx > X ? 26 : -26), ey = Y - 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2, Math.min(sy, ey) - 16, ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2.1; a += 0.2) {
      const rr = 30 + Math.sin(a * 3 + l.id) * 2;
      const qx = X + Math.cos(a) * rr, qy = Y - 6 + Math.sin(a) * rr * 0.72;
      if (a === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** The collector, small, in red: a figure with whatever gets them about. */
export function drawCollector(ctx: CanvasRenderingContext2D, travel: string) {
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  const X = 20, Y = 30;
  if (travel === 'fiets') {
    ctx.beginPath(); ctx.arc(X - 7, Y, 4.5, 0, Math.PI * 2); ctx.arc(X + 7, Y, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X - 7, Y); ctx.lineTo(X - 1, Y - 7); ctx.lineTo(X + 7, Y); ctx.moveTo(X - 1, Y - 7); ctx.lineTo(X + 4, Y - 8); ctx.stroke();
  } else if (travel === 'auto') {
    ctx.beginPath(); ctx.moveTo(X - 13, Y - 1); ctx.lineTo(X - 13, Y - 7); ctx.lineTo(X - 6, Y - 7); ctx.lineTo(X - 3, Y - 12); ctx.lineTo(X + 7, Y - 12); ctx.lineTo(X + 10, Y - 7); ctx.lineTo(X + 14, Y - 6); ctx.lineTo(X + 14, Y - 1); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(X - 7, Y, 3, 0, Math.PI * 2); ctx.arc(X + 8, Y, 3, 0, Math.PI * 2); ctx.fill();
  } else if (travel === 'rijtuig') {
    ctx.beginPath(); ctx.arc(X + 4, Y - 1, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.rect(X - 4, Y - 13, 14, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X - 4, Y - 7); ctx.lineTo(X - 14, Y - 7); ctx.moveTo(X - 16, Y - 10); ctx.lineTo(X - 16, Y); ctx.moveTo(X - 12, Y - 10); ctx.lineTo(X - 12, Y); ctx.stroke();
  }
  // the figure
  const fx = travel === 'voet' ? X : X + 12, fy = travel === 'voet' ? Y + 4 : Y - 2;
  ctx.beginPath(); ctx.arc(fx, fy - 16, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx, fy - 13); ctx.lineTo(fx, fy - 4); ctx.moveTo(fx, fy - 4); ctx.lineTo(fx - 2.5, fy + 3); ctx.moveTo(fx, fy - 4); ctx.lineTo(fx + 2.5, fy + 3); ctx.moveTo(fx - 3, fy - 10); ctx.lineTo(fx + 3, fy - 10); ctx.stroke();
  // the notebook under the arm
  ctx.fillRect(fx + 2, fy - 11, 3, 4);
}
