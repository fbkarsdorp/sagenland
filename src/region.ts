// The region in context: a clickable index map and a short profile drawn from the archive's metadata.
import type { Meta } from './data';
import { BEING_NAME, beingIcon, svg } from './icons';
import { LOCATOR_ASPECT, drawLocator, regionAt, unproject } from './locator';
import { REGION_LAND, esc, listOf, personName } from './text';

export interface LocatorHandle {
  set(region: string | null): void;
  destroy(): void;
}

/** A locator map on an HTML canvas, sized to its parent's width. */
export function mountLocator(canvas: HTMLCanvasElement, meta: Meta, region: string | null,
  opts: { all?: boolean; compact?: boolean; onPick?: (r: string) => void } = {}): LocatorHandle {
  let current = region;
  let hover: string | null = null;
  const draw = () => {
    const w = canvas.clientWidth || 300;
    const h = Math.round(w / LOCATOR_ASPECT);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawLocator(ctx, { x: 0, y: 0, w, h }, { meta, region: current, hover, all: opts.all, compact: opts.compact, s: Math.max(0.8, w / 380) });
  };
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return regionAt(unproject({ x: 0, y: 0, w: r.width, h: r.height }, e.clientX - r.left, e.clientY - r.top));
  };
  const move = (e: PointerEvent) => {
    const k = at(e);
    const h = k && meta.regions[k] ? k : null;
    canvas.style.cursor = h && opts.onPick ? 'pointer' : 'default';
    if (h !== hover) {
      hover = h;
      draw();
    }
  };
  const leave = () => {
    hover = null;
    draw();
  };
  const click = (e: PointerEvent) => {
    const k = at(e);
    if (k && meta.regions[k]) opts.onPick?.(k);
  };
  if (opts.onPick) {
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerup', click);
  }
  const ro = new ResizeObserver(draw);
  ro.observe(canvas);
  draw();
  return {
    set(r) {
      current = r;
      draw();
    },
    destroy() {
      ro.disconnect();
    },
  };
}

/** When the region's stories were written down, per decade (ink bars). */
export function decadeChart(decades: [number, number][], years: [number, number] | null): string {
  if (!decades.length) return '';
  const from = 1880, to = 2010;
  const n = (to - from) / 10 + 1;
  const max = Math.max(...decades.map((d) => d[1]));
  const map = new Map(decades);
  const bw = 280 / n;
  const bars = Array.from({ length: n }, (_, i) => {
    const d = from + i * 10;
    const v = map.get(d) ?? 0;
    const h = v ? Math.max(1.5, (v / max) * 30) : 0;
    const inRun = years && d + 9 >= years[0] && d <= years[1];
    return `<rect x="${i * bw + bw * 0.15}" y="${32 - h}" width="${bw * 0.7}" height="${h}" fill="${inRun ? '#a8321f' : '#54463a'}" opacity="${inRun ? 0.85 : 0.6}"><title>${d}–${d + 9}: ${v.toLocaleString('nl-NL')}</title></rect>`;
  }).join('');
  const ticks = [1900, 1950, 2000].map((d) => `<text x="${((d - from) / 10) * bw + bw / 2}" y="42" text-anchor="middle">${d}</text>`).join('');
  return `<svg class="decades" viewBox="0 0 280 46" role="img" aria-label="Opgetekende verhalen per decennium">
    <line x1="0" x2="280" y1="32.5" y2="32.5" stroke="#54463a" stroke-width="0.6" />${bars}${ticks}</svg>`;
}

/** A short, factual profile of the region in the archive. */
export function regionProfile(meta: Meta, region: string, opts: { short?: boolean } = {}): string {
  const R = meta.regions[region];
  const fmt = (x: number) => x.toLocaleString('nl-NL');
  const langs = R.langs.filter(([l, n]) => l !== 'Standaardnederlands' && n > R.count * 0.08).slice(0, 2).map(([l]) => l);
  const cols = R.collectors.slice(0, 3).map(([c, n]) => `${esc(personName(c))} <span class="muted">(${fmt(n)})</span>`);
  const typical = R.typical.map((b) => `<span class="chip">${svg(beingIcon(b), 16)}${esc(BEING_NAME[b] ?? b)}</span>`).join('');
  const top = R.top.slice(0, opts.short ? 3 : 5).map(([t, n]) =>
    `<li><span>${esc(meta.types[t]?.name ?? t)}</span><span class="muted">${fmt(n)}</span></li>`).join('');
  return `
    <p class="rp-lead">${fmt(R.count)} opgetekende sagen van ${R.types} typen${langs.length ? `, vooral in het ${esc(listOf(langs))}` : ''}.
      ${R.years ? `De meeste zijn opgeschreven tussen ${R.years[0]} en ${R.years[1]}.` : ''}</p>
    ${decadeChart(R.decades, R.years)}
    <p class="rp-land">${esc(REGION_LAND[region] ?? '')}</p>
    <div class="rp-row"><span class="rp-k">Meer dan elders</span><div class="chips">${typical}</div></div>
    <div class="rp-row"><span class="rp-k">Het vaakst verteld</span><ol class="rp-top">${top}</ol></div>
    ${opts.short ? '' : `<div class="rp-row"><span class="rp-k">Opgetekend door</span><span>${listOf(cols)}</span></div>`}`;
}
