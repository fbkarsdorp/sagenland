// The index map: where the game region lies in the Low Countries, with every place in the archive as a dot.
// Shared by the setup screen, the region leaf and the inset on the map sheet (all Canvas2D).
import type { Meta } from './data';
import { BORDER, ISLANDS, LAND, REGION_SHAPES, REGION_TOWNS, RIVERS, TOWNS, WATERS, type LL } from './geo';

const BOUNDS = { w: 2.45, e: 7.32, s: 50.38, n: 53.62 };
const KX = Math.cos((51.5 * Math.PI) / 180);
export const LOCATOR_ASPECT = ((BOUNDS.e - BOUNDS.w) * KX) / (BOUNDS.n - BOUNDS.s);

export interface LocatorOpts {
  meta: Meta;
  region: string | null;
  hover?: string | null;
  /** draw every region faintly (setup screen, where they are clickable) */
  all?: boolean;
  /** size multiplier for strokes and text (the sheet draws at RES) */
  s?: number;
  labels?: boolean;
  /** smaller type and fewer towns for the inset */
  compact?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number }

export function project(box: Box, [lon, lat]: LL): [number, number] {
  const sx = box.w / ((BOUNDS.e - BOUNDS.w) * KX), sy = box.h / (BOUNDS.n - BOUNDS.s);
  const k = Math.min(sx, sy);
  const ox = box.x + (box.w - (BOUNDS.e - BOUNDS.w) * KX * k) / 2;
  const oy = box.y + (box.h - (BOUNDS.n - BOUNDS.s) * k) / 2;
  return [ox + (lon - BOUNDS.w) * KX * k, oy + (BOUNDS.n - lat) * k];
}

export function unproject(box: Box, x: number, y: number): LL {
  const sx = box.w / ((BOUNDS.e - BOUNDS.w) * KX), sy = box.h / (BOUNDS.n - BOUNDS.s);
  const k = Math.min(sx, sy);
  const ox = box.x + (box.w - (BOUNDS.e - BOUNDS.w) * KX * k) / 2;
  const oy = box.y + (box.h - (BOUNDS.n - BOUNDS.s) * k) / 2;
  return [BOUNDS.w + (x - ox) / (KX * k), BOUNDS.n - (y - oy) / k];
}

function inside(pt: LL, poly: LL[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function regionAt(pt: LL): string | null {
  for (const [k, poly] of Object.entries(REGION_SHAPES)) if (inside(pt, poly)) return k;
  return null;
}

export function regionCentre(region: string): LL {
  const p = REGION_SHAPES[region];
  return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
}

function path(ctx: CanvasRenderingContext2D, box: Box, pts: LL[], close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = project(box, p);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  if (close) ctx.closePath();
}

function hatch(ctx: CanvasRenderingContext2D, box: Box, gap: number, angle: number) {
  const d = Math.hypot(box.w, box.h);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  ctx.beginPath();
  for (let o = -d; o < d; o += gap) {
    ctx.moveTo(cx + ca * -d - sa * o, cy + sa * -d + ca * o);
    ctx.lineTo(cx + ca * d - sa * o, cy + sa * d + ca * o);
  }
  ctx.stroke();
}

export function drawLocator(ctx: CanvasRenderingContext2D, box: Box, o: LocatorOpts) {
  const s = o.s ?? 1;
  const INK = '#2a211a', RED = '#a8321f';
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  // sea: close horizontal hatching, the way engravers did it
  ctx.strokeStyle = 'rgba(60, 95, 105, 0.28)';
  ctx.lineWidth = 0.6 * s;
  ctx.beginPath();
  for (let y = box.y; y < box.y + box.h; y += 2.6 * s) {
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
  }
  ctx.stroke();

  // land
  path(ctx, box, LAND);
  ctx.fillStyle = '#efe5cb';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // the neighbouring countries are left blank: only the archive's own ground carries detail
  for (const w of WATERS) {
    path(ctx, box, w);
    ctx.fillStyle = '#c9d3cc';
    ctx.fill();
  }
  ctx.restore();
  for (const isl of ISLANDS) {
    path(ctx, box, isl);
    ctx.fillStyle = '#efe5cb';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();
  }

  // regions
  for (const [k, poly] of Object.entries(REGION_SHAPES)) {
    const on = k === o.region, hov = k === o.hover;
    if (!on && !hov && !o.all) continue;
    path(ctx, box, poly);
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = on ? 'rgba(168, 50, 31, 0.55)' : hov ? 'rgba(168, 50, 31, 0.35)' : 'rgba(42, 33, 26, 0.13)';
    ctx.lineWidth = (on ? 0.9 : 0.7) * s;
    hatch(ctx, box, (on ? 3 : 3.6) * s, -Math.PI / 4);
    ctx.restore();
    path(ctx, box, poly);
    ctx.strokeStyle = on ? RED : hov ? 'rgba(168, 50, 31, 0.7)' : 'rgba(42, 33, 26, 0.3)';
    ctx.lineWidth = (on ? 1.4 : 0.8) * s;
    ctx.setLineDash(on ? [] : [2 * s, 2 * s]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // every place in the archive where a story was written down
  const k = Math.max(0.6, Math.min(1.3, box.w / (300 * s))) * s;
  ctx.fillStyle = 'rgba(42, 33, 26, 0.3)';
  for (const [lon, lat, c] of o.meta.geo) {
    const [x, y] = project(box, [lon, lat]);
    const r = (0.45 + Math.log10(c) * 0.38) * k;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.region) {
    const pts = o.meta.regions[o.region]?.pts ?? [];
    ctx.fillStyle = RED;
    for (const [lon, lat, c] of pts) {
      const [x, y] = project(box, [lon, lat]);
      const r = (0.7 + Math.log10(c) * 0.45) * k;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // rivers, borders, coast
  ctx.strokeStyle = 'rgba(50, 85, 95, 0.75)';
  ctx.lineWidth = 0.9 * s;
  ctx.lineJoin = 'round';
  for (const r of RIVERS) {
    path(ctx, box, r, false);
    ctx.stroke();
  }
  path(ctx, box, BORDER, false);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9 * s;
  ctx.setLineDash([4 * s, 1.6 * s, 1 * s, 1.6 * s]);
  ctx.stroke();
  ctx.setLineDash([]);
  path(ctx, box, LAND);
  ctx.lineWidth = 1.1 * s;
  ctx.stroke();

  // towns
  if (o.labels !== false) {
    const names = new Set(o.compact ? REGION_TOWNS[o.region ?? ''] ?? [] : TOWNS.map((t) => t.n));
    ctx.textBaseline = 'middle';
    for (const t of TOWNS) {
      if (!names.has(t.n)) continue;
      const [x, y] = project(box, t.at);
      ctx.fillStyle = '#efe5cb';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.9 * s;
      ctx.beginPath();
      ctx.arc(x, y, (t.big ? 2.4 : 1.8) * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `italic ${(o.compact ? 8.5 : 10) * s}px "IM Fell English", serif`;
      const right = t.left || t.at[0] > 6.4;
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillText(t.n, x + (right ? -4 : 4) * s, y);
    }
  }
  if (!o.compact) {
    ctx.font = `${10 * s}px "IM Fell English SC", serif`;
    ctx.fillStyle = 'rgba(42, 33, 26, 0.75)';
    ctx.textAlign = 'center';
    const [nx, ny] = project(box, [4.3, 53.25]);
    ctx.fillText('Noordzee', nx, ny);
    const [dx, dy] = project(box, [6.95, 51.45]);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(-Math.PI / 2.4);
    ctx.fillStyle = 'rgba(42, 33, 26, 0.4)';
    ctx.fillText('Duitsland', 0, 0);
    ctx.restore();
    const [fx, fy] = project(box, [2.75, 50.52]);
    ctx.fillStyle = 'rgba(42, 33, 26, 0.4)';
    ctx.fillText('Frankrijk', fx, fy);
  }
  ctx.restore();
}
