// The things seen at night, drawn frame by frame in the same hand as the collectors and the cattle:
// will-o'-the-wisps over the bog, white women on the heath, a sheet ghost at the gallows, a black dog at the
// edge of the wood, a water spirit at the ferry, the devil at the crossroads, witches dancing under the lime.
// Every figure fits a 64×64 box, standing on y = 58.

export const SPIRIT_BOX = 64;
export const SPIRIT_FRAMES = 8;
export type SpiritKind = 'dwaallicht' | 'wief' | 'spook' | 'hond' | 'nikker' | 'duivel' | 'heks';

const GHOST_INK = '#56607a';
const INK = '#241c22';

type P = [number, number];

function path(ctx: CanvasRenderingContext2D, pts: P[], close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

function stroke(ctx: CanvasRenderingContext2D, pts: P[], w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path(ctx, pts, false);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ------------------------------------------------------------------ the will-o'-the-wisp

function wisp(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const cx = 32, base = 44;
  const sway = Math.sin(a) * 3, tall = 22 + Math.sin(a * 2) * 2.5;
  glowDot(ctx, cx, base - 10, 22, 'rgba(220,240,140,0.55)');
  // the flame: a drop with its tip blown about
  const flame = (scale: number, fill: string, edge: string | null) => {
    ctx.beginPath();
    ctx.moveTo(cx + sway * scale, base - tall * scale);
    ctx.bezierCurveTo(cx + 3 * scale + sway * 0.4, base - tall * 0.55 * scale, cx + 11 * scale, base - 9 * scale, cx + 9 * scale, base - 2 * scale);
    ctx.bezierCurveTo(cx + 7 * scale, base + 5 * scale, cx - 7 * scale, base + 5 * scale, cx - 9 * scale, base - 2 * scale);
    ctx.bezierCurveTo(cx - 11 * scale, base - 9 * scale, cx - 3 * scale + sway * 0.4, base - tall * 0.55 * scale, cx + sway * scale, base - tall * scale);
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  };
  flame(1, '#d8ec7a', '#7a8a3a');
  flame(0.72, '#f2f8c0', null);
  flame(0.42, '#ffffff', null);
  // a small face, curious
  const blink = f === 5;
  if (blink) {
    stroke(ctx, [[cx - 4.2, base - 4], [cx - 1.8, base - 4]], 0.9, '#5a6a2a');
    stroke(ctx, [[cx + 1.8, base - 4], [cx + 4.2, base - 4]], 0.9, '#5a6a2a');
  } else {
    dot(ctx, cx - 3, base - 4.2, 1.2, '#4a5a22');
    dot(ctx, cx + 3, base - 4.2, 1.2, '#4a5a22');
  }
  stroke(ctx, [[cx - 1.6, base - 0.6], [cx, base + 0.4], [cx + 1.6, base - 0.6]], 0.8, '#6a7a32');
  // sparks falling away
  for (let k = 0; k < 3; k++) {
    const t = ((f + k * 3) % SPIRIT_FRAMES) / SPIRIT_FRAMES;
    dot(ctx, cx - 6 + k * 6 + Math.sin(a + k) * 2, base + 4 + t * 12, 1.1 * (1 - t), `rgba(240,250,180,${1 - t})`);
  }
}

// ------------------------------------------------------------------ the white woman

function wief(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const cx = 32;
  glowDot(ctx, cx, 34, 26, 'rgba(230,240,250,0.35)');
  // the gown, flowing down into wisps of mist
  const g = ctx.createLinearGradient(0, 12, 0, 60);
  g.addColorStop(0, 'rgba(250,252,255,0.97)');
  g.addColorStop(0.65, 'rgba(236,242,250,0.85)');
  g.addColorStop(1, 'rgba(236,242,250,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 6, 14);
  ctx.quadraticCurveTo(cx - 10, 30, cx - 15, 44);
  for (let k = 0; k <= 6; k++) {
    const x = cx - 15 + k * 5;
    const y = 50 + Math.sin(a + k * 1.3) * 3 + (k % 2 ? 6 : 0);
    ctx.quadraticCurveTo(x - 1.5, y + 3, x + 2.5, y);
  }
  ctx.quadraticCurveTo(cx + 10, 30, cx + 6, 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GHOST_INK;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 15, 44);
  ctx.quadraticCurveTo(cx - 10, 30, cx - 6, 14);
  ctx.moveTo(cx + 15, 44);
  ctx.quadraticCurveTo(cx + 10, 30, cx + 6, 14);
  ctx.stroke();
  // folds
  ctx.globalAlpha = 0.25;
  for (const dx of [-5, 0, 5]) stroke(ctx, [[cx + dx * 0.5, 24], [cx + dx * 1.4 + Math.sin(a + dx) * 1.2, 46]], 0.7, GHOST_INK);
  ctx.globalAlpha = 1;
  // the arm that beckons
  const lift = Math.sin(a) * 3;
  // a wide sleeve hanging from the raised arm, and a pale hand that beckons
  ctx.fillStyle = 'rgba(246,249,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx + 5, 21);
  ctx.quadraticCurveTo(cx + 11, 17 - lift, cx + 15, 18 - lift);
  ctx.quadraticCurveTo(cx + 17, 24 - lift * 0.5, cx + 14, 31);
  ctx.quadraticCurveTo(cx + 10, 28, cx + 6, 29);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GHOST_INK;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  const fing = Math.sin(a * 2) * 0.8;
  ctx.fillStyle = '#eef0ee';
  ctx.beginPath();
  ctx.ellipse(cx + 16.4, 16.6 - lift, 1.8, 2.2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx, [[cx + 17, 15 - lift], [cx + 18.6 + fing, 13.4 - lift]], 0.9, '#d8dcdc');
  // the veil and the face in it
  ctx.fillStyle = 'rgba(252,253,255,1)';
  ctx.beginPath();
  ctx.ellipse(cx, 13, 7.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GHOST_INK;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#eef0ee';
  ctx.beginPath();
  ctx.ellipse(cx, 14.5, 4.4, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();
  dot(ctx, cx - 1.8, 13.8, 0.9, '#3a4458');
  dot(ctx, cx + 1.8, 13.8, 0.9, '#3a4458');
  stroke(ctx, [[cx - 1.2, 17.4], [cx + 1.2, 17.4]], 0.6, '#7a8090');
}

// ------------------------------------------------------------------ the sheet ghost at the gallows

function spook(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const cx = 32;
  glowDot(ctx, cx, 32, 26, 'rgba(225,235,250,0.4)');
  const arm = Math.sin(a) * 3;
  ctx.beginPath();
  ctx.moveTo(cx - 11, 22);
  ctx.bezierCurveTo(cx - 11, 4, cx + 11, 4, cx + 11, 22);
  // the right arm, raised, with the chain
  ctx.quadraticCurveTo(cx + 15, 22 - arm, cx + 19, 19 - arm);
  ctx.quadraticCurveTo(cx + 19, 25 - arm, cx + 12, 30);
  ctx.lineTo(cx + 13, 46);
  for (let k = 0; k < 4; k++) {
    const x0 = cx + 13 - k * 6.5, x1 = x0 - 6.5;
    const dip = 50 + Math.sin(a + k * 1.6) * 2.5;
    ctx.quadraticCurveTo((x0 + x1) / 2, dip + 4, x1, dip - 2);
  }
  ctx.lineTo(cx - 12, 30);
  ctx.quadraticCurveTo(cx - 19, 26 + arm, cx - 18, 21 + arm);
  ctx.quadraticCurveTo(cx - 14, 21 + arm, cx - 11, 22);
  ctx.closePath();
  ctx.fillStyle = 'rgba(250,251,255,0.96)';
  ctx.fill();
  ctx.strokeStyle = GHOST_INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  // a shadow fold
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = GHOST_INK;
  ctx.beginPath();
  ctx.moveTo(cx + 4, 24);
  ctx.quadraticCurveTo(cx + 10, 36, cx + 7, 48);
  ctx.lineTo(cx + 12, 46);
  ctx.lineTo(cx + 11, 26);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // eyes and an 'oo'
  ctx.fillStyle = '#2a2a38';
  ctx.beginPath();
  ctx.ellipse(cx - 4, 16, 2, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 4, 16, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, 23 + Math.sin(a * 2) * 0.4, 1.8, 2.4 + Math.sin(a * 2) * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // the chain and its iron ball
  const hx = cx + 18, hy = 21 - arm;
  for (let k = 0; k < 5; k++) {
    const t = k / 5;
    const x = hx + Math.sin(a + t) * 1.5 + t * 2, y = hy + 3 + k * 4.2;
    ctx.strokeStyle = '#5a5a60';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(x, y, k % 2 ? 1 : 1.6, k % 2 ? 2.2 : 1.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  dot(ctx, hx + 2.5 + Math.sin(a + 1) * 1.5, hy + 26, 3.4, '#3a3a40');
  dot(ctx, hx + 1.6 + Math.sin(a + 1) * 1.5, hy + 25, 1, '#8a8a92');
}

// ------------------------------------------------------------------ the black dog at the edge of the wood

function hond(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const fur = '#1c181e', rim = '#7a86a6';
  const breathe = Math.sin(a) * 0.6;
  // tail, swinging slowly
  const tail = Math.sin(a) * 4;
  stroke(ctx, [[14, 36], [8, 30 + tail * 0.5], [6, 22 + tail]], 3.2, fur);
  stroke(ctx, [[14, 36], [8, 30 + tail * 0.5], [6, 22 + tail]], 0.7, rim);
  // legs
  for (const [x, ph] of [[18, 0], [22, Math.PI], [40, Math.PI], [44, 0]] as [number, number][]) {
    stroke(ctx, [[x, 42], [x + Math.sin(a + ph) * 0.4, 52], [x + 1.6, 57]], 3.6, fur);
    stroke(ctx, [[x - 1.6, 57.5], [x + 2.6, 57.5]], 2.2, fur);
  }
  // the shaggy body
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(12, 38);
  // tufts along the back and under the belly, drawn as soft scallops
  for (let k = 0; k < 8; k++) {
    const t0 = k / 8, t1 = (k + 1) / 8;
    const y0 = 31 - Math.sin(t0 * Math.PI) * 4 - breathe, y1 = 31 - Math.sin(t1 * Math.PI) * 4 - breathe;
    ctx.quadraticCurveTo(12 + (t0 + t1) * 18, Math.min(y0, y1) - 2.4, 12 + t1 * 36, y1);
  }
  ctx.quadraticCurveTo(50, 38, 47, 45);
  for (let k = 8; k > 0; k--) {
    const x0 = 12 + (k / 8) * 34, x1 = 12 + ((k - 1) / 8) * 34;
    ctx.quadraticCurveTo((x0 + x1) / 2, 48.5, x1, 45.5);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // head and ears, the jaw open a little
  const hx = 50, hy = 26 + breathe * 0.5;
  ctx.fillStyle = fur;
  path(ctx, [[hx - 8, hy + 8], [hx - 6, hy - 3], [hx - 4, hy - 9], [hx - 1, hy - 4], [hx + 3, hy - 9], [hx + 4, hy - 2], [hx + 11, hy + 1], [hx + 12, hy + 4], [hx + 6, hy + 6], [hx + 10, hy + 8], [hx + 2, hy + 10], [hx - 4, hy + 12]]);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
  dot(ctx, hx + 11.6, hy + 2.8, 1.1, '#3a3a40');
  ctx.fillStyle = '#e8e2d0';
  path(ctx, [[hx + 7, hy + 6.4], [hx + 7.8, hy + 8.2], [hx + 8.6, hy + 6.6]]);
  ctx.fill();
  // the eyes, glowing like coals
  const blink = f === 6;
  glowDot(ctx, hx + 3, hy + 0.6, 6, 'rgba(255,110,40,0.75)');
  if (!blink) {
    dot(ctx, hx + 3, hy + 0.6, 1.6, '#ffd060');
    dot(ctx, hx + 3.2, hy + 0.6, 0.6, '#5a1a0a');
  } else stroke(ctx, [[hx + 1.6, hy + 0.8], [hx + 4.4, hy + 0.8]], 0.9, '#ffb040');
  // an iron collar, and a broken chain hanging from it to the ground
  stroke(ctx, [[hx - 6, hy + 4], [hx - 3, hy + 11]], 2, '#6a6a74');
  ctx.strokeStyle = '#9a9aa6';
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 6; k++) {
    const x = hx - 5 + Math.sin(a + k * 0.6) * 0.8 - k * 0.6, y = hy + 12 + k * 3.2;
    ctx.beginPath();
    ctx.ellipse(x, y, k % 2 ? 0.9 : 1.5, k % 2 ? 1.7 : 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ the water spirit at the ferry

function nikker(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const cx = 32, rise = Math.sin(a) * 2;
  const skin = '#9cbfa8', hair = '#2f5a42';
  // the water, and rings going out from it
  for (let k = 0; k < 2; k++) {
    const t = ((f / SPIRIT_FRAMES) + k * 0.5) % 1;
    ctx.strokeStyle = `rgba(200,225,235,${0.8 * (1 - t)})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, 52, 10 + t * 16, 3 + t * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // hair behind the shoulders
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(cx - 9, 20 + rise);
  ctx.quadraticCurveTo(cx - 14, 34, cx - 12 + Math.sin(a) * 2, 50);
  ctx.lineTo(cx + 12 + Math.sin(a + 1) * 2, 50);
  ctx.quadraticCurveTo(cx + 14, 34, cx + 9, 20 + rise);
  ctx.closePath();
  ctx.fill();
  // body up from the water
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(cx - 9, 52);
  ctx.quadraticCurveTo(cx - 10, 36 + rise, cx - 5, 32 + rise);
  ctx.lineTo(cx + 5, 32 + rise);
  ctx.quadraticCurveTo(cx + 10, 36 + rise, cx + 9, 52);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a5a4a';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // arms reaching, with webbed hands
  const reach = Math.sin(a + 0.6) * 3;
  for (const side of [-1, 1]) {
    const sx = cx + side * 7, sy = 36 + rise;
    const hx = cx + side * (19 + reach), hy = 26 + rise - reach;
    stroke(ctx, [[sx, sy], [cx + side * 14, 30 + rise], [hx, hy]], 3, skin);
    stroke(ctx, [[sx, sy], [cx + side * 14, 30 + rise], [hx, hy]], 0.6, '#3a5a4a');
    for (let k = -1; k <= 1; k++) stroke(ctx, [[hx, hy], [hx + side * 3 + k, hy - 3 + k * 1.5]], 1.1, skin);
  }
  // head, with weed and a water-lily
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, 22 + rise, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a5a4a';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(cx - 7.5, 22 + rise);
  ctx.quadraticCurveTo(cx - 8, 12 + rise, cx, 13 + rise);
  ctx.quadraticCurveTo(cx + 8, 12 + rise, cx + 7.5, 22 + rise);
  ctx.quadraticCurveTo(cx + 4, 16 + rise, cx, 17 + rise);
  ctx.quadraticCurveTo(cx - 4, 16 + rise, cx - 7.5, 22 + rise);
  ctx.fill();
  for (const side of [-1, 1]) for (let k = 0; k < 2; k++)
    stroke(ctx, [[cx + side * (6 + k * 1.5), 19 + rise], [cx + side * (8 + k * 2) + Math.sin(a + k + side) * 1.5, 33 + rise + k * 3]], 1.4, hair);
  ctx.fillStyle = '#f2f2ea';
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + 4 + Math.cos(ang) * 2, 13 + rise + Math.sin(ang) * 1.2, 1.8, 1, ang, 0, Math.PI * 2);
    ctx.fill();
  }
  dot(ctx, cx + 4, 13 + rise, 0.9, '#e8c040');
  // big round eyes, a long thin mouth
  glowDot(ctx, cx - 2.6, 22 + rise, 4, 'rgba(220,250,140,0.6)');
  glowDot(ctx, cx + 2.6, 22 + rise, 4, 'rgba(220,250,140,0.6)');
  dot(ctx, cx - 2.6, 22 + rise, 1.6, '#f0f8b0');
  dot(ctx, cx + 2.6, 22 + rise, 1.6, '#f0f8b0');
  dot(ctx, cx - 2.6, 22.2 + rise, 0.7, '#1a2a1a');
  dot(ctx, cx + 2.6, 22.2 + rise, 0.7, '#1a2a1a');
  stroke(ctx, [[cx - 3, 26.5 + rise], [cx, 27.3 + rise], [cx + 3, 26.5 + rise]], 0.7, '#2a4a3a');
  // the water in front, over the body
  ctx.fillStyle = 'rgba(70,110,130,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, 52, 13, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx, [[cx - 9, 51], [cx - 4, 50], [cx + 1, 51]], 0.7, 'rgba(220,240,250,0.8)');
}

// ------------------------------------------------------------------ the devil at the crossroads

function duivel(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const cx = 30;
  const coat = '#1e1a22', lining = '#8a1e1e', skin = '#c4574a';
  glowDot(ctx, cx, 40, 22, 'rgba(200,60,30,0.35)');
  // the tail, out from under the coat, swishing
  const sw = Math.sin(a) * 5;
  ctx.strokeStyle = coat;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6, 44);
  ctx.bezierCurveTo(cx - 16, 48, cx - 22 + sw * 0.3, 40, cx - 18 + sw, 32);
  ctx.stroke();
  ctx.fillStyle = lining;
  path(ctx, [[cx - 18 + sw, 28.5], [cx - 15 + sw, 33], [cx - 18 + sw, 32], [cx - 21 + sw, 33]]);
  ctx.fill();
  // legs: a boot and a horse's hoof
  stroke(ctx, [[cx - 3, 46], [cx - 4, 56]], 3.4, '#121014');
  stroke(ctx, [[cx - 6, 57.3], [cx + 0.5, 57.3]], 2.6, '#121014');
  stroke(ctx, [[cx + 4, 46], [cx + 5, 54]], 3.4, '#121014');
  ctx.fillStyle = '#3a2a1e';
  path(ctx, [[cx + 2.8, 53.5], [cx + 7.4, 53.5], [cx + 8, 58], [cx + 5.6, 58], [cx + 5.2, 56.4], [cx + 4.8, 58], [cx + 2.4, 58]]);
  ctx.fill();
  // the tailcoat, its lining showing at the split
  ctx.fillStyle = coat;
  path(ctx, [[cx - 7, 22], [cx + 7, 22], [cx + 10, 46], [cx + 6 + Math.sin(a) * 0.8, 50], [cx + 1, 40], [cx - 1, 40], [cx - 6 + Math.sin(a + 1) * 0.8, 50], [cx - 10, 46]]);
  ctx.fill();
  ctx.strokeStyle = '#7a5a6a';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = lining;
  path(ctx, [[cx + 1, 40], [cx + 6 + Math.sin(a) * 0.8, 50], [cx + 3.6, 48]]);
  ctx.fill();
  path(ctx, [[cx - 1, 40], [cx - 6 + Math.sin(a + 1) * 0.8, 50], [cx - 3.6, 48]]);
  ctx.fill();
  // a white shirt front and a high red collar
  ctx.fillStyle = '#ece6d8';
  path(ctx, [[cx - 2.4, 22], [cx + 2.4, 22], [cx, 32]]);
  ctx.fill();
  ctx.fillStyle = lining;
  path(ctx, [[cx - 8, 22], [cx - 10, 15], [cx - 4, 20]]);
  ctx.fill();
  path(ctx, [[cx + 8, 22], [cx + 10, 15], [cx + 4, 20]]);
  ctx.fill();
  // one hand holds out the paper to be signed, the other is on the hip
  const offer = Math.sin(a) * 1.2;
  stroke(ctx, [[cx + 6, 24], [cx + 12, 30], [cx + 17, 27 + offer]], 2.6, coat);
  ctx.fillStyle = '#f0e8d0';
  ctx.save();
  ctx.translate(cx + 19, 25 + offer);
  ctx.rotate(-0.25);
  ctx.fillRect(-2, -5, 6, 8);
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineWidth = 0.4;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(-1, -3 + k * 2);
    ctx.lineTo(3, -3 + k * 2);
    ctx.stroke();
  }
  dot(ctx, 2.4, 2, 0.9, '#a8321f');
  ctx.restore();
  dot(ctx, cx + 17, 27 + offer, 1.3, skin);
  stroke(ctx, [[cx - 6, 24], [cx - 11, 32], [cx - 7, 36]], 2.6, coat);
  // the head: slick black hair, small horns, a pointed beard, and a grin
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(cx - 5.5, 12);
  ctx.quadraticCurveTo(cx - 6, 20, cx, 23.5);
  ctx.quadraticCurveTo(cx + 6, 20, cx + 5.5, 12);
  ctx.quadraticCurveTo(cx, 6, cx - 5.5, 12);
  ctx.fill();
  ctx.strokeStyle = '#5a1a14';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  ctx.moveTo(cx - 6, 13);
  ctx.quadraticCurveTo(cx - 5, 5, cx, 6);
  ctx.quadraticCurveTo(cx + 5, 5, cx + 6, 13);
  ctx.quadraticCurveTo(cx + 2, 9, cx, 11.5);
  ctx.quadraticCurveTo(cx - 2, 9, cx - 6, 13);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#e8dcc0';
    path(ctx, [[cx + side * 3.4, 7.6], [cx + side * 6.6, 2.4], [cx + side * 5.2, 7.4]]);
    ctx.fill();
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  path(ctx, [[cx - 2, 21], [cx + 2, 21], [cx, 26.5]]);
  ctx.fillStyle = '#121014';
  ctx.fill();
  // eyebrows up, eyes glinting
  stroke(ctx, [[cx - 4.6, 12.4], [cx - 1.4, 13.8]], 0.9, '#121014');
  stroke(ctx, [[cx + 4.6, 12.4], [cx + 1.4, 13.8]], 0.9, '#121014');
  dot(ctx, cx - 2.6, 15, 1.1, '#ffd84a');
  dot(ctx, cx + 2.6, 15, 1.1, '#ffd84a');
  dot(ctx, cx - 2.6, 15, 0.45, '#1a0a0a');
  dot(ctx, cx + 2.6, 15, 0.45, '#1a0a0a');
  ctx.fillStyle = '#f6f0e0';
  ctx.beginPath();
  ctx.moveTo(cx - 3, 18.4);
  ctx.quadraticCurveTo(cx, 21, cx + 3, 18.4);
  ctx.closePath();
  ctx.fill();
  stroke(ctx, [[cx - 3, 18.4], [cx, 21], [cx + 3, 18.4]], 0.6, '#5a1a14');
}

// ------------------------------------------------------------------ a witch, dancing

function heks(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SPIRIT_FRAMES) * Math.PI * 2;
  const cx = 32, hop = -Math.abs(Math.sin(a)) * 3;
  const dress = '#4a3460', hat = '#2e2238', face = '#d4dcae';
  glowDot(ctx, cx, 36, 22, 'rgba(170,140,220,0.35)');
  // legs in striped stockings, kicking
  for (const [side, ph] of [[-1, 0], [1, Math.PI]] as [number, number][]) {
    const kick = Math.sin(a + ph);
    const hipx = cx + side * 3, hipy = 42 + hop;
    const fx = cx + side * 4 + kick * 5, fy = 57 - Math.max(0, kick) * 4 + hop * 0.3;
    stroke(ctx, [[hipx, hipy], [fx, fy]], 2.6, '#f0ece0');
    ctx.setLineDash([1.6, 1.6]);
    stroke(ctx, [[hipx, hipy], [fx, fy]], 2.6, '#7a2a2a');
    ctx.setLineDash([]);
    ctx.fillStyle = INK;
    path(ctx, [[fx - 2, fy - 1], [fx + 3.5 * (kick > 0 ? 1 : -1) + 1, fy - 2.5], [fx + 1, fy + 1.2], [fx - 2, fy + 1]]);
    ctx.fill();
  }
  // the skirt, flaring as she turns
  const flare = Math.sin(a) * 3;
  ctx.fillStyle = dress;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 30 + hop);
  ctx.lineTo(cx + 5, 30 + hop);
  ctx.lineTo(cx + 13 + flare, 45 + hop);
  for (let k = 0; k < 5; k++) ctx.lineTo(cx + 13 + flare - (k + 0.5) * (26 / 5), 45 + hop + (k % 2 ? -2 : 1.5));
  ctx.lineTo(cx - 13 + flare, 45 + hop);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a78a8';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // patches
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(cx - 6 + flare * 0.5, 37 + hop, 3, 3);
  // the broom held high in one hand, the other hand out
  const bx = cx + 15, by = 16 + hop + Math.sin(a) * 2;
  stroke(ctx, [[cx + 4, 31 + hop], [cx + 10, 25 + hop], [bx - 2, by + 4]], 3, '#8a78a8');
  stroke(ctx, [[cx + 4, 31 + hop], [cx + 10, 25 + hop], [bx - 2, by + 4]], 2.2, dress);
  stroke(ctx, [[bx - 8, by + 16], [bx + 4, by - 8]], 1.4, '#6a4a2a');
  ctx.fillStyle = '#c9a046';
  path(ctx, [[bx - 8, by + 16], [bx - 13, by + 24], [bx - 9, by + 25], [bx - 5, by + 23]]);
  ctx.fill();
  stroke(ctx, [[bx - 11, by + 22], [bx - 8, by + 18]], 0.5, '#8a6a2a');
  stroke(ctx, [[cx - 4, 31 + hop], [cx - 10, 26 + hop - flare * 0.5], [cx - 14, 22 + hop - flare]], 3, '#8a78a8');
  stroke(ctx, [[cx - 4, 31 + hop], [cx - 10, 26 + hop - flare * 0.5], [cx - 14, 22 + hop - flare]], 2.2, dress);
  dot(ctx, cx - 14, 22 + hop - flare, 1.4, face);
  // the head: grey hair, long nose with a wart, a grin
  const hy = 23 + hop;
  ctx.fillStyle = '#b8b8a8';
  ctx.beginPath();
  ctx.ellipse(cx, hy, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(cx + 0.6, hy + 0.6, 5, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = face;
  path(ctx, [[cx + 3, hy - 0.4], [cx + 8.4, hy + 2.8], [cx + 3.6, hy + 2.8]]);
  ctx.fill();
  ctx.stroke();
  dot(ctx, cx + 6.4, hy + 1.6, 0.6, '#7a6a3a');
  dot(ctx, cx + 1, hy - 0.6, 0.8, INK);
  dot(ctx, cx + 4.2, hy - 0.8, 0.8, INK);
  stroke(ctx, [[cx - 0.6, hy + 3.4], [cx + 1.6, hy + 4.6], [cx + 3.6, hy + 3.6]], 0.6, '#5a2a2a');
  // the hat, with its tip bent over
  ctx.fillStyle = hat;
  ctx.beginPath();
  ctx.ellipse(cx, hy - 4, 10, 2.2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  const tip = Math.sin(a) * 2;
  path(ctx, [[cx - 5.5, hy - 4.5], [cx + 5.5, hy - 5.5], [cx + 2, hy - 14], [cx + 6 + tip, hy - 17], [cx + 0.5, hy - 15.5]]);
  ctx.fill();
  stroke(ctx, [[cx - 5, hy - 6.2], [cx + 5.2, hy - 7]], 1.3, '#8a2a3a');
}

export function drawSpirit(ctx: CanvasRenderingContext2D, kind: SpiritKind, frame: number) {
  ({ dwaallicht: wisp, wief, spook, hond, nikker, duivel, heks })[kind](ctx, frame);
}
