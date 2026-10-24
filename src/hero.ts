// The window at the top of the start page: a stretch of the chosen region, painted as on the field map,
// with mills turning, smoke rising, birds going over, and the chosen collector on the road.
import { Rng } from './rng';
import { generateLand } from './land';
import { M, RES, SH, SW, px, renderSheet, type Features } from './sheet';
import { BOX, RIDE_FRAMES, drawRider } from './rider';
import { W, placeRoadTile, roadPath } from './world';
import { placeNames } from './text';

interface Scene {
  sheet: HTMLCanvasElement;
  features: Features;
  path: [number, number][];
  len: number[];
  centre: [number, number];
  span: number;
}

export interface Hero {
  setRegion(region: string, title: string): void;
  setTravel(travel: string): void;
  destroy(): void;
}

/** Smooth a staircase of tile centres into the curve of the road. */
function smooth(raw: [number, number][]): [number, number][] {
  let pts = raw;
  for (let k = 0; k < 3; k++) {
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function build(region: string, title: string): Scene | null {
  const seed = 4100 + region.length * 97 + region.charCodeAt(0);
  const rng = new Rng(seed);
  const land = generateLand(rng, region, placeNames(region, rng));
  const features: Features = { chimneys: [], mills: [], windows: [] };
  const sheet = renderSheet(land, seed, 1, { region: title, year: 1952 }, features);
  // a road from one village to its nearest neighbour, preferably one with a mill in sight
  let best: { path: number[]; score: number } | null = null;
  for (const a of land.places) for (const b of land.places) {
    if (a.id >= b.id) continue;
    const ta = placeRoadTile(land, a), tb = placeRoadTile(land, b);
    if (ta === null || tb === null) continue;
    const path = roadPath(land, ta, tb);
    if (!path || path.length < 10 || path.length > 34) continue;
    // not along the top edge of the sheet: the title sits there
    const rows = path.map((i) => Math.floor(i / W));
    if (Math.min(...rows) < 9 || Math.max(...rows) > 38) continue;
    const mid = [px((a.x + b.x) / 2), px((a.y + b.y) / 2)];
    const mills = features.mills.filter(([x, y]) => Math.abs(x - mid[0]) < 500 && Math.abs(y - mid[1]) < 180).length;
    const score = mills * 10 + (a.home || b.home ? 3 : 0) - Math.abs(path.length - 20) * 0.3;
    if (!best || score > best.score) best = { path, score };
  }
  if (!best) return null;
  const path = smooth(best.path.map((i) => [px(i % W), px(Math.floor(i / W))] as [number, number]));
  const len = [0];
  for (let i = 1; i < path.length; i++) len.push(len[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const xs = path.map((p) => p[0]), ys = path.map((p) => p[1]);
  const centre: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const span = Math.max(760, Math.max(...xs) - Math.min(...xs) + 260);
  return { sheet, features, path, len, centre, span };
}

/** The whole sheet behind the page, greyed and dimmed like a map under glass. */
function paintBackdrop(bg: HTMLCanvasElement, sheet: HTMLCanvasElement) {
  const w = window.innerWidth, h = window.innerHeight;
  bg.width = Math.round(w);
  bg.height = Math.round(h);
  const ctx = bg.getContext('2d')!;
  // cover the window, keeping the sheet's shape
  const k = Math.max(w / sheet.width, h / sheet.height);
  const dw = sheet.width * k, dh = sheet.height * k;
  ctx.filter = 'grayscale(0.85) sepia(0.25) brightness(0.42) contrast(1.05) blur(0.6px)';
  ctx.drawImage(sheet, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.filter = 'none';
  // darker towards the edges, so the page stands out
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(20,15,10,0)');
  g.addColorStop(1, 'rgba(20,15,10,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  bg.classList.add('ready');
}

export function mountHero(canvas: HTMLCanvasElement, region: string, title: string, travel: string, backdrop?: HTMLCanvasElement): Hero {
  let scene: Scene | null = null;
  let travelMode = travel;
  let frames: HTMLCanvasElement | null = null;
  const birds: { x: number; y: number; v: number; n: number; t0: number }[] = [];
  const puffs: { x: number; y: number; t0: number; kind: 'smoke' | 'dust' }[] = [];
  let raf = 0, alive = true, lastPuff = 0;
  const view: [number | null, number | null] = [null, null];
  const t0 = performance.now();

  const makeFrames = () => {
    const B = Math.round(BOX * 2);
    const c = document.createElement('canvas');
    c.width = B * RIDE_FRAMES;
    c.height = B;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < RIDE_FRAMES; i++) {
      ctx.save();
      ctx.translate(i * B, 0);
      ctx.scale(2, 2);
      drawRider(ctx, travelMode, i, null);
      ctx.restore();
    }
    frames = c;
  };
  makeFrames();

  const load = (r: string, t: string) => {
    // painting the sheet takes a moment: let the page draw first
    setTimeout(() => {
      if (!alive) return;
      const next = build(r, t);
      if (next) {
        scene = next;
        view[0] = view[1] = null;
        canvas.classList.remove('loading');
        if (backdrop) paintBackdrop(backdrop, next.sheet);
      }
    }, 30);
  };
  canvas.classList.add('loading');
  load(region, title);
  let resizeT: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => backdrop && scene && paintBackdrop(backdrop, scene.sheet), 150);
  };
  window.addEventListener('resize', onResize);

  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wc = canvas.clientWidth, Hc = canvas.clientHeight;
    if (!Wc || !Hc) return;
    if (canvas.width !== Math.round(Wc * dpr)) {
      canvas.width = Math.round(Wc * dpr);
      canvas.height = Math.round(Hc * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!scene) return;
    const t = (now - t0) / 1000;
    // where the collector is along the road, back and forth
    const total = scene.len[scene.len.length - 1];
    const speed = travelMode === 'auto' ? 70 : travelMode === 'voet' ? 26 : travelMode === 'rijtuig' ? 40 : 48;
    const cycle = (t * speed) % (total * 2);
    const forward = cycle < total;
    const d = forward ? cycle : total * 2 - cycle;
    let i = 1;
    while (i < scene.len.length - 1 && scene.len[i] < d) i++;
    const a = scene.path[i - 1], b = scene.path[i];
    const k = (d - scene.len[i - 1]) / Math.max(0.001, scene.len[i] - scene.len[i - 1]);
    const rx = a[0] + (b[0] - a[0]) * k, ry = a[1] + (b[1] - a[1]) * k;
    const facing = (b[0] - a[0]) * (forward ? 1 : -1) < 0 ? -1 : 1;
    // the view: as wide as the road on a big screen, closer on a small one, following the traveller gently,
    // with the road in the lower part, below the title
    const span = Math.min(scene.span, Math.max(380, Wc * 0.75));
    const s = Wc / span;
    const cw = span, ch = Hc / s;
    // keep the traveller in the lower middle of the window, out from under the title
    const wantX = rx;
    const wantY = ry - ch * 0.16;
    view[0] = view[0] === null ? wantX : view[0] + (wantX - view[0]) * 0.02;
    view[1] = view[1] === null ? wantY : view[1] + (wantY - view[1]) * 0.02;
    // stay inside the neat line of the sheet
    const ox = Math.max(M, Math.min(SW - M - cw, view[0] - cw / 2));
    const oy = Math.max(M, Math.min(SH - M - ch, view[1] - ch / 2));
    ctx.drawImage(scene.sheet, ox * RES, oy * RES, cw * RES, ch * RES, 0, 0, Wc, Hc);
    const X = (x: number) => (x - ox) * s, Y = (y: number) => (y - oy) * s;

    // mills
    for (const [mx, my] of scene.features.mills) {
      const x = X(mx), y = Y(my);
      if (x < -40 || x > Wc + 40 || y < -40 || y > Hc + 40) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.6);
      ctx.strokeStyle = '#2f2419';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#f1e7cf';
        ctx.fillRect(2 * s, -3.2 * s, 23 * s * 0.9, 6.4 * s * 0.9);
        ctx.strokeRect(2 * s, -3.2 * s, 23 * s * 0.9, 6.4 * s * 0.9);
      }
      ctx.restore();
    }
    // smoke from the chimneys
    if (now - lastPuff > 450) {
      lastPuff = now;
      const vis = scene.features.chimneys.filter(([x, y]) => X(x) > 0 && X(x) < Wc && Y(y) > 0 && Y(y) < Hc);
      if (vis.length) {
        const [x, y] = vis[Math.floor(Math.random() * vis.length)];
        puffs.push({ x, y, t0: now, kind: 'smoke' });
      }
    }
    if (travelMode !== 'voet' && Math.random() < 0.25) puffs.push({ x: rx - facing * 12, y: ry, t0: now, kind: 'dust' });
    for (let p = puffs.length - 1; p >= 0; p--) {
      const q = puffs[p];
      const age = (now - q.t0) / (q.kind === 'smoke' ? 2800 : 700);
      if (age > 1) {
        puffs.splice(p, 1);
        continue;
      }
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, q.kind === 'smoke' ? 'rgba(107,98,88,0.45)' : 'rgba(201,180,138,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(X(q.x + (q.kind === 'smoke' ? age * 8 : 0)), Y(q.y - (q.kind === 'smoke' ? age * 26 : age * 4)));
      const r = (q.kind === 'smoke' ? 3 + age * 10 : 3 + age * 6) * s;
      ctx.scale(r, r);
      ctx.globalAlpha = Math.sin(Math.PI * age);
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    if (frames) {
      // the wheels and legs turn with the ground covered, whichever way the road is taken
      const f = Math.floor((t * speed) / 3.6) % RIDE_FRAMES;
      const B = BOX * 2, size = BOX * 0.95 * s;
      ctx.save();
      ctx.translate(X(rx), Y(ry));
      ctx.scale(facing, 1);
      ctx.drawImage(frames, f * B, 0, B, B, -size * 0.47, -size * (58 / BOX), size, size);
      ctx.restore();
    }
    // now and then a flock of birds goes over
    if (Math.random() < 0.003 && birds.length < 8) {
      const y = Hc * (0.15 + Math.random() * 0.4), n = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) birds.push({ x: -20 - j * 14, y: y + (j % 2 ? 6 : -6) * j * 0.6, v: 26 + Math.random() * 6, n: j, t0: now });
    }
    ctx.strokeStyle = 'rgba(47,36,25,0.75)';
    ctx.lineWidth = 1.2;
    for (let j = birds.length - 1; j >= 0; j--) {
      const q = birds[j];
      const x = q.x + ((now - q.t0) / 1000) * q.v;
      if (x > Wc + 30) {
        birds.splice(j, 1);
        continue;
      }
      const flap = Math.sin(now / 140 + q.n) * 2.2;
      ctx.beginPath();
      ctx.moveTo(x - 5, q.y - flap);
      ctx.lineTo(x, q.y + 1);
      ctx.lineTo(x + 5, q.y - flap);
      ctx.stroke();
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    setRegion(r, t) {
      canvas.classList.add('loading');
      load(r, t);
    },
    setTravel(m) {
      if (m === travelMode) return;
      travelMode = m;
      makeFrames();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    },
  };
}
