// Smooth outlines for terrain: blur the tile grid into a field, then trace it with marching squares.

export interface Contours {
  /** filled pieces: one small polygon per edge cell (draw them all in one path) */
  cells: number[][];
  /** runs of cells wholly inside, as x0, y0, x1, y1 rectangles */
  runs: number[];
  /** the outline, chained into polylines so dashes run on unbroken */
  lines: number[][];
}

/**
 * Sample a smooth field over a w×h tile grid at `sub` samples per tile.
 * `is(x, y)` says whether a tile belongs to the shape; tiles outside the grid copy the nearest edge tile.
 */
export function field(w: number, h: number, sub: number, is: (x: number, y: number) => boolean,
  jitter: (x: number, y: number) => number = () => 0, sigma = 0.5): { v: Float32Array; gw: number; gh: number } {
  const gw = (w + 2) * sub + 1, gh = (h + 2) * sub + 1;
  const v = new Float32Array(gw * gh);
  const inside = new Uint8Array((w + 4) * (h + 4));
  for (let y = -2; y < h + 2; y++)
    for (let x = -2; x < w + 2; x++)
      inside[(y + 2) * (w + 4) + x + 2] = is(Math.max(0, Math.min(w - 1, x)), Math.max(0, Math.min(h - 1, y))) ? 1 : 0;
  const r = 2, s2 = 2 * sigma * sigma;
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      // sample position in tile units, grid starts one tile outside the sheet
      const px = i / sub - 1, py = j / sub - 1;
      let num = 0, den = 0;
      const cx = Math.floor(px), cy = Math.floor(py);
      for (let ty = cy - r; ty <= cy + r; ty++)
        for (let tx = cx - r; tx <= cx + r; tx++) {
          if (tx < -2 || ty < -2 || tx >= w + 2 || ty >= h + 2) continue;
          const dx = tx + 0.5 - px, dy = ty + 0.5 - py;
          const g = Math.exp(-(dx * dx + dy * dy) / s2);
          num += g * inside[(ty + 2) * (w + 4) + tx + 2];
          den += g;
        }
      v[j * gw + i] = (den ? num / den : 0) + jitter(px, py);
    }
  return { v, gw, gh };
}

/** Marching squares at threshold `t`. Coordinates come out in tile units (relative to the sheet's first tile). */
export function trace(f: { v: Float32Array; gw: number; gh: number }, sub: number, t = 0.5): Contours {
  const { v, gw, gh } = f;
  const cells: number[][] = [];
  const runs: number[] = [];
  const segs: [number, number, number, number][] = [];
  const P = (i: number, j: number): [number, number] => [i / sub - 1, j / sub - 1];
  const lerp = (a: [number, number], b: [number, number], va: number, vb: number): [number, number] => {
    const k = (t - va) / (vb - va);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  for (let j = 0; j < gh - 1; j++) {
    let run = -1;
    const close = (i: number) => {
      if (run < 0) return;
      runs.push(...P(run, j), ...P(i, j + 1));
      run = -1;
    };
    for (let i = 0; i < gw - 1; i++) {
      const vs = [v[j * gw + i], v[j * gw + i + 1], v[(j + 1) * gw + i + 1], v[(j + 1) * gw + i]];
      const ins = vs.map((x) => x >= t);
      const n = ins.filter(Boolean).length;
      if (n === 4) {
        if (run < 0) run = i;
        continue;
      }
      close(i);
      if (!n) continue;
      const cs = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      // walk the cell's edge: inside corners, and crossings where the sign changes
      const poly: number[] = [];
      const cross: [number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        if (ins[k]) poly.push(...cs[k]);
        if (ins[k] !== ins[k2]) {
          const p = lerp(cs[k], cs[k2], vs[k], vs[k2]);
          poly.push(...p);
          cross.push(p);
        }
      }
      cells.push(poly);
      if (cross.length === 2) segs.push([...cross[0], ...cross[1]]);
      else if (cross.length === 4) {
        // saddle: pair each crossing that leaves the shape with the next one that enters it
        if (ins[0]) {
          segs.push([...cross[0], ...cross[1]]);
          segs.push([...cross[2], ...cross[3]]);
        } else {
          segs.push([...cross[1], ...cross[2]]);
          segs.push([...cross[3], ...cross[0]]);
        }
      }
    }
    close(gw - 1);
  }
  return { cells, runs, lines: chain(segs) };
}

/** Field value at a point in tile units (nearest sample). */
export function sample(f: { v: Float32Array; gw: number; gh: number }, sub: number, x: number, y: number): number {
  const i = Math.max(0, Math.min(f.gw - 1, Math.round((x + 1) * sub)));
  const j = Math.max(0, Math.min(f.gh - 1, Math.round((y + 1) * sub)));
  return f.v[j * f.gw + i];
}

/** Join loose segments end to end into polylines. */
function chain(segs: [number, number, number, number][]): number[][] {
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      const a = at.get(k);
      if (a) a.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const out: number[][] = [];
  const extend = (line: number[], fromEnd: boolean) => {
    for (;;) {
      const x = fromEnd ? line[line.length - 2] : line[0], y = fromEnd ? line[line.length - 1] : line[1];
      const next = (at.get(key(x, y)) ?? []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const s = segs[next];
      const forward = key(s[0], s[1]) === key(x, y);
      const [nx, ny] = forward ? [s[2], s[3]] : [s[0], s[1]];
      if (fromEnd) line.push(nx, ny);
      else line.unshift(nx, ny);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [...segs[i]];
    extend(line, true);
    extend(line, false);
    out.push(line);
  }
  return out;
}
