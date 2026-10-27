// The collector on the road, drawn frame by frame: a cyclist with a satchel on the rack, a student
// on foot, a small car with a tape recorder on the back seat, a doctor's gig behind a trotting horse.
// Every figure faces right; the scene flips it for the way back.

export const BOX = 64;
export const RIDE_FRAMES = 12;
export const IDLE_FRAMES = 8;

const INK = '#2f2419';
const SKIN = '#ecd0ad';
const COAT = '#9c3b26';
const COAT_DARK = '#7a2c1c';
const HAT = '#3a2e26';
const PAPER = '#f4ecd6';

type P = [number, number];

function line(ctx: CanvasRenderingContext2D, pts: P[], w: number, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | null, stroke = INK, w = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && w > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = w;
    ctx.stroke();
  }
}

/** Knee (or elbow) of a two-part limb from `a` to `b`; `bend` picks the side it bends to (1: a knee pointing forward, for a figure facing right). */
function joint(a: P, b: P, l1: number, l2: number, bend: 1 | -1): P {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.min(l1 + l2 - 0.01, Math.max(0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const t = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return [a[0] + Math.cos(base - bend * t) * l1, a[1] + Math.sin(base - bend * t) * l1];
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, spokes = 8, tyre = 1.6) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.55;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (let i = 0; i < spokes / 2; i++) {
    const t = (i / (spokes / 2)) * Math.PI;
    ctx.moveTo(Math.cos(t) * r, Math.sin(t) * r);
    ctx.lineTo(-Math.cos(t) * r, -Math.sin(t) * r);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // a valve, so the turning can be seen
  ctx.fillStyle = INK;
  ctx.fillRect(r - 2.2, -0.8, 1.6, 1.6);
  ctx.restore();
  circle(ctx, x, y, r, null, INK, tyre);
  circle(ctx, x, y, 1.2, INK, INK, 0.5);
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, hat: 'brim' | 'cap' | 'beret' | 'top' | 'trilby', glasses = false) {
  circle(ctx, x, y, 3.9, SKIN, INK, 0.9);
  // ear and nose
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.moveTo(x + 3.7, y - 0.3);
  ctx.lineTo(x + 5.2, y + 0.8);
  ctx.lineTo(x + 3.6, y + 1.2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  circle(ctx, x + 1.9, y - 0.4, 0.55, INK, INK, 0);
  if (glasses) {
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x + 2, y - 0.4, 1.3, 0, Math.PI * 2);
    ctx.moveTo(x + 0.7, y - 0.6);
    ctx.lineTo(x - 2.4, y - 1);
    ctx.stroke();
  }
  ctx.fillStyle = HAT;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  if (hat === 'brim' || hat === 'trilby') {
    ctx.ellipse(x + 0.3, y - 2.6, 6.2, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 3.4, y - 2.8);
    ctx.quadraticCurveTo(x - 3, y - 8, x + 0.4, y - 7.6);
    ctx.quadraticCurveTo(x + 3.8, y - 7.8, x + 3.6, y - 2.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // the hatband
    ctx.strokeStyle = COAT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3.3, y - 3.6);
    ctx.lineTo(x + 3.6, y - 3.6);
    ctx.stroke();
  } else if (hat === 'cap') {
    ctx.moveTo(x - 4, y - 1.5);
    ctx.quadraticCurveTo(x - 3, y - 6.5, x + 2, y - 5.6);
    ctx.lineTo(x + 7, y - 2.6);
    ctx.lineTo(x + 3, y - 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (hat === 'beret') {
    ctx.ellipse(x - 0.4, y - 3.6, 5, 2.2, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    line(ctx, [[x - 0.4, y - 5.8], [x - 0.2, y - 7]], 0.9);
  } else if (hat === 'top') {
    ctx.ellipse(x + 0.3, y - 2.8, 5.4, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 3, y - 11, 6.6, 8.2);
    ctx.strokeRect(x - 3, y - 11, 6.6, 8.2);
  }
}

/** A satchel with a notebook sticking out: the collector's whole office. */
function satchel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.fillRect(x + 1.5, y - 2.5, w - 4, 3);
  ctx.strokeRect(x + 1.5, y - 2.5, w - 4, 3);
  ctx.fillStyle = '#7a5532';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 1.4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5e3f22';
  ctx.fillRect(x, y, w, h * 0.38);
  ctx.strokeRect(x, y, w, h * 0.38);
  ctx.fillStyle = '#c9a046';
  ctx.fillRect(x + w / 2 - 0.8, y + h * 0.3, 1.6, 1.6);
}

// ------------------------------------------------------------------ on the bicycle

function bicycle(ctx: CanvasRenderingContext2D, f: number, idle: number | null, empty = false) {
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  const C1: P = [15, 50], C2: P = [42, 50], R = 8.5;
  const BB: P = [27, 49];
  const S: P = [23, 33], HT: P = [39, 34], HB: P = [40, 29];
  const lean = idle === null ? 0 : 0;
  void lean;
  const bob = idle === null ? Math.sin(a * 2) * 0.45 : 0;
  const crank = idle === null ? a : 1.2;
  const p1: P = [BB[0] + Math.cos(crank) * 3.6, BB[1] + Math.sin(crank) * 3.6];
  const p2: P = [BB[0] - Math.cos(crank) * 3.6, BB[1] - Math.sin(crank) * 3.6];
  const hip: P = [S[0] + 0.5, S[1] - 1.5 + bob];
  const shoulder: P = [hip[0] + 6.5, hip[1] - 11];
  const riding = idle === null;

  // the far leg, behind the frame
  if (riding) {
    const k2 = joint(hip, p2, 9.2, 9.6, 1);
    line(ctx, [hip, k2, p2], 3.2, '#4a3328');
    line(ctx, [p2, [p2[0] + 2.4, p2[1] + 0.3]], 1.8, INK);
  }

  // wheels and frame
  wheel(ctx, C1[0], C1[1], R, idle === null ? a : 0);
  wheel(ctx, C2[0], C2[1], R, idle === null ? a : 0);
  ctx.strokeStyle = '#2e4a3c';
  line(ctx, [C1, BB, S, C1], 1.5, '#2e4a3c');
  line(ctx, [S, HT, BB], 1.5, '#2e4a3c');
  line(ctx, [HT, C2], 1.4, '#2e4a3c');
  line(ctx, [HT, HB, [HB[0] - 3.5, HB[1] - 0.6]], 1.2, INK);
  line(ctx, [[S[0] - 2.6, S[1] - 0.6], [S[0] + 2.4, S[1] - 0.4]], 2, INK);
  // mudguards
  ctx.strokeStyle = '#2e4a3c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(C1[0], C1[1], R + 1.6, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(C2[0], C2[1], R + 1.6, Math.PI * 1.25, Math.PI * 1.95);
  ctx.stroke();
  // the rack, with the satchel strapped on
  line(ctx, [[8, 39], [21, 39]], 1.2, INK);
  line(ctx, [[10, 39], C1], 0.8, INK);
  satchel(ctx, 8.5, 32.5 + bob * 0.3, 11, 6.5);
  // the lamp
  circle(ctx, HT[0] + 2.5, HT[1] + 1.5, 1.4, '#e8d38a', INK, 0.7);
  // crank and pedals
  line(ctx, [p1, BB, p2], 1.2, INK);

  if (riding) {
    // the near leg
    const k1 = joint(hip, p1, 9.2, 9.6, 1);
    line(ctx, [hip, k1, p1], 3.4, '#5a3d2e');
    line(ctx, [p1, [p1[0] + 2.6, p1[1] + 0.3]], 2, INK);
    // the coat, with its tail flying
    const tail = Math.sin(a * 2) * 0.8;
    ctx.fillStyle = COAT;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(shoulder[0] - 2, shoulder[1] - 1);
    ctx.quadraticCurveTo(shoulder[0] + 3.4, shoulder[1] + 1, hip[0] + 4, hip[1] + 2);
    ctx.lineTo(hip[0] - 4.5, hip[1] + 3.5 + tail);
    ctx.quadraticCurveTo(hip[0] - 3, hip[1] - 5, shoulder[0] - 2, shoulder[1] - 1);
    ctx.fill();
    ctx.stroke();
    // the arm to the handlebar
    const hand: P = [HB[0] - 2.5, HB[1] - 0.3];
    const el = joint([shoulder[0] + 0.5, shoulder[1] + 1], hand, 6, 6.5, 1);
    line(ctx, [[shoulder[0] + 0.5, shoulder[1] + 1], el, hand], 2.6, COAT_DARK);
    circle(ctx, hand[0], hand[1], 1.1, SKIN, INK, 0.5);
    // the scarf in the wind
    const sx = shoulder[0] - 0.5, sy = shoulder[1] - 1.5;
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(sx + 2, sy);
    ctx.quadraticCurveTo(sx - 4, sy + Math.sin(a) * 1.5, sx - 9, sy + 1 + Math.sin(a + 1.5) * 2);
    ctx.stroke();
    head(ctx, shoulder[0] + 2.6, shoulder[1] - 4.6, 'brim', true);
  } else {
    // parked on its stand, with the collector beside it, writing
    line(ctx, [BB, [BB[0] - 3, 58]], 1, INK);
    if (!empty) standingWriter(ctx, 52, idle, 'brim', COAT);
  }
}

/** Someone standing, writing in a notebook held up to the chest; the pen moves frame by frame. */
function standingWriter(ctx: CanvasRenderingContext2D, x: number, f: number, hat: Parameters<typeof head>[3], coat: string) {
  const t = (f / IDLE_FRAMES) * Math.PI * 2;
  const breathe = Math.sin(t) * 0.25;
  // legs
  line(ctx, [[x - 1.5, 44], [x - 2, 58]], 3, '#4a3328');
  line(ctx, [[x + 1.5, 44], [x + 2, 58]], 3, '#5a3d2e');
  line(ctx, [[x - 2, 58], [x + 0.6, 58.3]], 2, INK);
  line(ctx, [[x + 2, 58], [x + 4.6, 58.3]], 2, INK);
  // coat
  ctx.fillStyle = coat;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 3.5, 31 + breathe);
  ctx.lineTo(x + 3.5, 31 + breathe);
  ctx.lineTo(x + 5, 47);
  ctx.lineTo(x - 5, 47);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the notebook, and the hand that writes in it
  ctx.fillStyle = PAPER;
  ctx.fillRect(x + 2, 36, 5, 6.5);
  ctx.strokeRect(x + 2, 36, 5, 6.5);
  line(ctx, [[x + 3, 38], [x + 6, 38]], 0.4, INK);
  line(ctx, [[x + 3, 39.6], [x + 5.5, 39.6]], 0.4, INK);
  const pen: P = [x + 4 + Math.sin(t * 2) * 1.2, 39.5 + Math.cos(t * 3) * 0.6];
  line(ctx, [[x + 2, 33 + breathe], [x + 3.5, 40], [x + 2.5, 41]], 2.3, COAT_DARK);
  line(ctx, [[x - 2, 33 + breathe], pen], 2.3, COAT_DARK);
  line(ctx, [pen, [pen[0] + 1.2, pen[1] - 2.4]], 0.7, INK);
  // head, bent over the notebook now and then
  const nod = f % 4 < 2 ? 0.6 : 0;
  head(ctx, x + 0.8, 26.5 + nod + breathe, hat, true);
}

// ------------------------------------------------------------------ on foot

/** How each collector looks on foot: the student always, the others for the last stretch off the road. */
interface Look { hat: 'brim' | 'cap' | 'beret' | 'top' | 'trilby'; coat: string; sleeve: string; legs: [string, string]; scarf: string | null; striped: boolean }
const LOOK: Record<string, Look> = {
  voet: { hat: 'beret', coat: '#5a6a4a', sleeve: '#46523a', legs: ['#3d4636', '#4d5843'], scarf: '#a8321f', striped: true },
  fiets: { hat: 'brim', coat: COAT, sleeve: COAT_DARK, legs: ['#4a3328', '#5a3d2e'], scarf: '#d9a441', striped: false },
  auto: { hat: 'trilby', coat: '#6b6f78', sleeve: '#55595f', legs: ['#3a3a40', '#45454c'], scarf: null, striped: false },
  rijtuig: { hat: 'top', coat: '#26222a', sleeve: '#1e1a22', legs: ['#1a1820', '#222028'], scarf: null, striped: false },
};

function walker(ctx: CanvasRenderingContext2D, f: number, idle: number | null, look: Look = LOOK.voet) {
  if (idle !== null) {
    standingWriter(ctx, 32, idle, look.hat, look.coat);
    satchel(ctx, 24, 40, 7, 5.5);
    return;
  }
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  const bob = -Math.abs(Math.sin(a)) * 1.2;
  const hip: P = [30, 40 + bob];
  const leg = (ph: number): [P, P] => {
    const s = Math.sin(a + ph);
    const foot: P = [hip[0] + s * 7, 58 - Math.max(0, Math.cos(a + ph)) * 2.6];
    return [joint(hip, foot, 9.5, 9.5, 1), foot];
  };
  const [k2, f2] = leg(Math.PI);
  line(ctx, [hip, k2, f2], 3.1, look.legs[0]);
  line(ctx, [f2, [f2[0] + 2.4, f2[1] + 0.2]], 2, INK);
  const shoulder: P = [hip[0] + 1.5, hip[1] - 13];
  // the far arm swings against the near leg
  const arm = (ph: number): P => [shoulder[0] + Math.sin(a + ph) * 5, shoulder[1] + 11];
  line(ctx, [shoulder, arm(0)], 2.4, look.sleeve);
  const [k1, f1] = leg(0);
  // a duffel coat, a long striped scarf: this is the sixties
  ctx.fillStyle = look.coat;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(shoulder[0] - 3.5, shoulder[1]);
  ctx.lineTo(shoulder[0] + 3.5, shoulder[1]);
  ctx.lineTo(hip[0] + 5, hip[1] + 4);
  ctx.lineTo(hip[0] - 5, hip[1] + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  line(ctx, [hip, k1, f1], 3.3, look.legs[1]);
  line(ctx, [f1, [f1[0] + 2.6, f1[1] + 0.2]], 2.1, INK);
  // the shoulder bag, bumping along
  line(ctx, [[shoulder[0] + 2, shoulder[1]], [hip[0] - 4, hip[1] - 1]], 0.9, '#5e3f22');
  satchel(ctx, hip[0] - 9, hip[1] - 2 + Math.sin(a * 2) * 0.8, 7, 5.5);
  line(ctx, [shoulder, arm(Math.PI)], 2.6, look.sleeve);
  circle(ctx, arm(Math.PI)[0], arm(Math.PI)[1], 1.1, SKIN, INK, 0.5);
  if (look.scarf) {
    ctx.strokeStyle = look.scarf;
    ctx.lineWidth = 2;
    if (look.striped) ctx.setLineDash([2, 1.5]);
    ctx.beginPath();
    ctx.moveTo(shoulder[0] + 1, shoulder[1] - 0.5);
    ctx.quadraticCurveTo(shoulder[0] - 5, shoulder[1] + 1 + Math.sin(a) * 1.2, shoulder[0] - 8, shoulder[1] + 5 + Math.sin(a + 1) * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  head(ctx, shoulder[0] + 1.2, shoulder[1] - 5 + bob * 0.2, look.hat, look.hat === 'brim');
}

// ------------------------------------------------------------------ the old collector

/**
 * The old collector who shows you round on the first evening: a long dark skirt, a shawl over the shoulders, a white
 * lace cap over a grey bun, a stick in one hand and a lantern in the other.
 */
function oldCollector(ctx: CanvasRenderingContext2D, f: number, idle: number | null) {
  const walking = idle === null;
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  const t = ((idle ?? 0) / IDLE_FRAMES) * Math.PI * 2;
  const bob = walking ? -Math.abs(Math.sin(a)) * 0.8 : Math.sin(t) * 0.3;
  const x = 31;
  const shoulder: P = [x + 0.5, 30 + bob];
  // the lantern, swinging a little from the far hand
  const swing = walking ? Math.sin(a) * 3 : Math.sin(t) * 0.6;
  const hand: P = [x - 7.5 - swing * 0.6, 40 + bob];
  line(ctx, [[shoulder[0] - 1.5, shoulder[1] + 1], hand], 2.2, '#26222a');
  line(ctx, [hand, [hand[0] - swing * 0.15, hand[1] + 2.2]], 0.6, INK);
  const lx = hand[0] - 2.2 - swing * 0.15, ly = hand[1] + 2.2;
  ctx.fillStyle = '#f2c45a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.fillRect(lx, ly, 4.4, 5);
  ctx.strokeRect(lx, ly, 4.4, 5);
  line(ctx, [[lx - 0.4, ly], [lx + 4.8, ly]], 1, INK);
  line(ctx, [[lx + 2.2, ly + 1], [lx + 2.2, ly + 4]], 0.5, '#b8862a');
  // feet, peeping out under the hem in turn
  const step = (ph: number) => (walking ? Math.sin(a + ph) * 3.6 : 0);
  line(ctx, [[x - 1.5 + step(Math.PI), 57.6], [x + 1.2 + step(Math.PI), 57.9]], 2, INK);
  line(ctx, [[x + 0.5 + step(0), 57.6], [x + 3.2 + step(0), 57.9]], 2.1, INK);
  // the long skirt, swaying as she goes, with a blue apron in front
  const sway = walking ? Math.sin(a) * 1.3 : 0;
  ctx.fillStyle = '#2b2730';
  ctx.beginPath();
  ctx.moveTo(x - 3.8, 38 + bob);
  ctx.lineTo(x + 3.8, 38 + bob);
  ctx.quadraticCurveTo(x + 6.5 + sway, 47, x + 7.4 + sway, 56.8);
  ctx.lineTo(x - 7.2 + sway * 0.5, 56.8);
  ctx.quadraticCurveTo(x - 6.4 + sway * 0.5, 47, x - 3.8, 38 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4d6585';
  ctx.beginPath();
  ctx.moveTo(x + 1.2, 39 + bob);
  ctx.lineTo(x + 3.9, 39 + bob);
  ctx.quadraticCurveTo(x + 6 + sway, 47, x + 6.6 + sway, 54.5);
  ctx.lineTo(x + 2.6 + sway * 0.7, 54.5);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // the bodice, and a plum shawl over the shoulders, its point hanging at the back
  ctx.fillStyle = '#2b2730';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 3.3, 29.5 + bob);
  ctx.lineTo(x + 3.6, 29.5 + bob);
  ctx.lineTo(x + 4, 39 + bob);
  ctx.lineTo(x - 4, 39 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7a4a5e';
  ctx.beginPath();
  ctx.moveTo(x - 4.6, 29 + bob);
  ctx.lineTo(x + 4.4, 29 + bob);
  ctx.lineTo(x + 3, 33.5 + bob);
  ctx.lineTo(x - 2.5 - swing * 0.2, 38.5 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the near arm, on the stick; the stick goes ahead of her and back
  const reach = walking ? Math.sin(a + Math.PI / 2) * 2.4 : 0;
  const grip: P = [x + 6.2 + reach * 0.5, 40.5 + bob];
  const tip: P = [x + 8.6 + reach, 58];
  line(ctx, [[grip[0] - 0.6, grip[1] - 1.4], tip], 1.2, '#5e3f22');
  line(ctx, [[grip[0] - 0.6, grip[1] - 1.4], [grip[0] - 2.4, grip[1] - 2]], 1.2, '#5e3f22');
  line(ctx, [[shoulder[0] + 1.8, shoulder[1] + 0.5], [x + 4.6, 36 + bob], grip], 2.4, '#26222a');
  circle(ctx, grip[0], grip[1], 1.1, SKIN, INK, 0.5);
  // the head: a grey bun at the back, under a white cap with a frill
  const hx = x + 1.2, hy = 25 + bob;
  circle(ctx, hx - 3.6, hy - 0.2, 1.8, '#cfcabe', INK, 0.6);
  circle(ctx, hx, hy, 3.9, SKIN, INK, 0.9);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.moveTo(hx + 3.7, hy - 0.3);
  ctx.lineTo(hx + 5, hy + 0.9);
  ctx.lineTo(hx + 3.6, hy + 1.2);
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.stroke();
  circle(ctx, hx + 1.9, hy - 0.4, 0.5, INK, INK, 0);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(hx + 2, hy - 0.4, 1.3, 0, Math.PI * 2);
  ctx.moveTo(hx + 0.7, hy - 0.6);
  ctx.lineTo(hx - 2.4, hy - 1);
  ctx.stroke();
  ctx.fillStyle = '#f6f0e0';
  ctx.beginPath();
  ctx.moveTo(hx - 4.4, hy + 1.6);
  ctx.quadraticCurveTo(hx - 5, hy - 5, hx + 0.6, hy - 5.2);
  ctx.quadraticCurveTo(hx + 3.8, hy - 5, hx + 3.4, hy - 2.4);
  ctx.quadraticCurveTo(hx, hy - 2.8, hx - 1.6, hy + 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.setLineDash([0.8, 0.8]);
  line(ctx, [[hx + 3.6, hy - 2.2], [hx + 0.6, hy - 2.6], [hx - 1.4, hy + 2.2]], 0.6, '#9a927f');
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------ in the little car

function car(ctx: CanvasRenderingContext2D, f: number, idle: number | null, empty = false) {
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  const bounce = idle === null ? Math.sin(a * 2) * 0.6 + Math.sin(a * 3 + 1) * 0.3 : 0;
  const x0 = idle === null ? 6 : 2;
  const by = 50 + bounce;
  // body: a rounded little car, cream with a green line
  ctx.fillStyle = '#e9dcb6';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x0 + 2, by);
  ctx.lineTo(x0 + 2, by - 7);
  ctx.quadraticCurveTo(x0 + 3, by - 11, x0 + 9, by - 12);
  ctx.quadraticCurveTo(x0 + 14, by - 22, x0 + 25, by - 22);
  ctx.quadraticCurveTo(x0 + 34, by - 22, x0 + 37, by - 12);
  ctx.quadraticCurveTo(x0 + 45, by - 11, x0 + 46, by - 6);
  ctx.lineTo(x0 + 46, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  line(ctx, [[x0 + 3, by - 5], [x0 + 45, by - 5]], 1.2, '#5f8a6a');
  // windows
  ctx.fillStyle = '#c9dbe0';
  ctx.beginPath();
  ctx.moveTo(x0 + 12, by - 12.5);
  ctx.quadraticCurveTo(x0 + 15, by - 20, x0 + 22, by - 20.5);
  ctx.lineTo(x0 + 22, by - 12.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + 24, by - 20.5);
  ctx.quadraticCurveTo(x0 + 32, by - 20.5, x0 + 35, by - 12.5);
  ctx.lineTo(x0 + 24, by - 12.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the tape recorder on the back seat, its reels turning
  const rr = idle === null ? a * 1.5 : (idle / IDLE_FRAMES) * Math.PI * 2;
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(x0 + 13.5, by - 16, 7, 3.4);
  for (const cx of [x0 + 15.3, x0 + 18.7]) {
    circle(ctx, cx, by - 17, 1.5, '#d8cfb8', INK, 0.5);
    line(ctx, [[cx + Math.cos(rr) * 1.4, by - 17 + Math.sin(rr) * 1.4], [cx - Math.cos(rr) * 1.4, by - 17 - Math.sin(rr) * 1.4]], 0.4);
  }
  // driver
  if (idle === null) {
    circle(ctx, x0 + 29, by - 15.5, 3.2, SKIN, INK, 0.8);
    ctx.fillStyle = HAT;
    ctx.beginPath();
    ctx.ellipse(x0 + 29, by - 18, 4.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x0 + 26.5, by - 22, 5, 4);
  }
  // headlamp and bumper
  circle(ctx, x0 + 44, by - 8, 1.5, '#f2e2a0', INK, 0.7);
  line(ctx, [[x0 + 1, by - 1], [x0 + 4, by - 1]], 1.6);
  line(ctx, [[x0 + 44, by - 1], [x0 + 47.5, by - 1]], 1.6);
  wheel(ctx, x0 + 12, 51, 5.8, idle === null ? a * 1.3 : 0, 6, 2.2);
  wheel(ctx, x0 + 37, 51, 5.8, idle === null ? a * 1.3 : 0, 6, 2.2);
  if (idle !== null && !empty) {
    // out of the car, microphone held out on its cable
    const t = (idle / IDLE_FRAMES) * Math.PI * 2;
    const x = 56;
    line(ctx, [[x - 1.5, 44], [x - 2, 58]], 3, '#3a3a40');
    line(ctx, [[x + 1.5, 44], [x + 2, 58]], 3, '#45454c');
    ctx.fillStyle = '#6b6f78';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 3.5, 31);
    ctx.lineTo(x + 3.5, 31);
    ctx.lineTo(x + 4.5, 46);
    ctx.lineTo(x - 4.5, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const mic: P = [x + 7 + Math.sin(t) * 0.6, 34 + Math.cos(t) * 0.4];
    line(ctx, [[x + 2, 33], mic], 2.3, '#55595f');
    circle(ctx, mic[0] + 1.2, mic[1] - 1.2, 1.4, '#2a2a2a', INK, 0.4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(mic[0], mic[1]);
    ctx.quadraticCurveTo(x - 4, 60, x0 + 20, by - 14);
    ctx.stroke();
    head(ctx, x + 0.8, 26.5, 'trilby');
  }
}

// ------------------------------------------------------------------ the doctor's gig

function gig(ctx: CanvasRenderingContext2D, f: number, idle: number | null, empty = false) {
  const a = (f / RIDE_FRAMES) * Math.PI * 2;
  const trot = idle === null;
  const t = trot ? a : ((idle ?? 0) / IDLE_FRAMES) * Math.PI * 2;
  const bob = trot ? Math.abs(Math.sin(a)) * -1.2 : 0;
  // the horse
  const hx = 44, hy = 38 + bob;
  const legs: [number, number][] = [[hx + 6, 0], [hx + 4, Math.PI], [hx - 6, Math.PI], [hx - 8, 0]];
  legs.forEach(([lx, ph], i) => {
    const s = trot ? Math.sin(a + ph) : 0;
    const top: P = [lx, hy + 2];
    const knee: P = [lx + s * 3, hy + 9];
    const hoof: P = [lx + s * 4.5 + (trot ? Math.max(0, Math.cos(a + ph)) * 1.5 : 0), 58 - (trot ? Math.max(0, Math.cos(a + ph)) * 2.5 : 0)];
    line(ctx, [top, knee, hoof], 1.9, i % 2 ? '#5c4030' : '#6e4d38');
  });
  ctx.fillStyle = '#7a563c';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // neck and head; grazing when standing
  const graze = trot ? 0 : (Math.sin(t) + 1) * 3;
  const head0: P = [hx + 8, hy - 3];
  const headP: P = [hx + 14, hy - 10 + graze * 2];
  ctx.beginPath();
  ctx.moveTo(head0[0] - 3, head0[1] + 2);
  ctx.lineTo(headP[0] - 2, headP[1] - 2);
  ctx.lineTo(headP[0] + 2, headP[1]);
  ctx.lineTo(head0[0] + 3, head0[1] + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(headP[0] + 2.5, headP[1] + 1, 4, 2.2, 0.5 + graze * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  line(ctx, [[headP[0] - 1, headP[1] - 2], [headP[0], headP[1] - 4.5]], 1.2, '#5c4030');
  // mane and tail
  line(ctx, [[head0[0] - 2, head0[1]], [headP[0] - 2, headP[1] - 1]], 1.6, '#3a2a1e');
  const swish = Math.sin(t * (trot ? 2 : 1)) * 2;
  line(ctx, [[hx - 10, hy - 1], [hx - 14, hy + 3 + swish], [hx - 13, hy + 9 + swish]], 1.8, '#3a2a1e');
  // shafts and the gig, its big wheel turning
  line(ctx, [[22, 41 + bob * 0.4], [hx + 4, hy + 1]], 1, INK);
  ctx.fillStyle = '#2e2a26';
  ctx.beginPath();
  ctx.moveTo(10, 40);
  ctx.lineTo(26, 40);
  ctx.lineTo(24, 32);
  ctx.lineTo(12, 32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  wheel(ctx, 18, 49, 9, trot ? a : 0, 12, 1.4);
  // the doctor, top hat and black bag, reins in hand
  if (empty) return;
  ctx.fillStyle = '#26222a';
  ctx.beginPath();
  ctx.moveTo(14, 32);
  ctx.lineTo(23, 32);
  ctx.lineTo(21, 19 + bob * 0.5);
  ctx.lineTo(15, 19 + bob * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const hand: P = [25, 27 + bob * 0.5];
  line(ctx, [[20, 22 + bob * 0.5], hand], 2.3, '#26222a');
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(hand[0], hand[1]);
  ctx.quadraticCurveTo(36, 28 + bob, headP[0] + 3, headP[1] + 2);
  ctx.stroke();
  ctx.fillStyle = '#1e1a16';
  ctx.beginPath();
  ctx.roundRect(5, 34, 6, 4.5, 1);
  ctx.fill();
  head(ctx, 18.5, 14.5 + bob * 0.5, 'top');
}

/** Draw one frame. `idle` is null while travelling, otherwise the idle frame. */
export function drawRider(ctx: CanvasRenderingContext2D, travel: string, frame: number, idle: number | null) {
  if (travel === 'fiets') bicycle(ctx, frame, idle);
  else if (travel === 'voet') walker(ctx, frame, idle);
  else if (travel === 'auto') car(ctx, frame, idle);
  else gig(ctx, frame, idle);
}

/** The collector on foot, dressed as they are: for the last stretch to a place off the road. */
export function drawWalker(ctx: CanvasRenderingContext2D, travel: string, frame: number, idle: number | null) {
  walker(ctx, frame, idle, LOOK[travel] ?? LOOK.voet);
}

/** The old collector of the first evening: walking (`idle` null) or standing still. */
export function drawOldCollector(ctx: CanvasRenderingContext2D, frame: number, idle: number | null) {
  oldCollector(ctx, frame, idle);
}

/** The bicycle, car or gig left at the end of the road while the collector walks on (the horse grazes). */
export function drawVehicle(ctx: CanvasRenderingContext2D, travel: string, idle: number) {
  if (travel === 'fiets') bicycle(ctx, 0, idle, true);
  else if (travel === 'auto') car(ctx, 0, idle, true);
  else if (travel === 'rijtuig') gig(ctx, 0, idle, true);
}

/** Little creatures for the map: a cow, a sheep, a dog (two frames each: still, moving). */
export type AnimalKind = 'koe' | 'roodbont' | 'blaarkop' | 'paard' | 'varken' | 'geit' | 'kip' | 'gans' | 'eend' | 'schaap' | 'hond';
export const ANIMALS: AnimalKind[] = ['koe', 'roodbont', 'blaarkop', 'paard', 'varken', 'geit', 'kip', 'gans', 'eend', 'schaap', 'hond'];

/** A cow: black and white in the north, red and white in the east and south, the red blaarkop with its white face. Frame 0 grazes. */
function cow(ctx: CanvasRenderingContext2D, frame: number, patch: string, face: string) {
  const step = frame % 2 ? 1 : 0;
  line(ctx, [[5, 9], [5 - step, 13]], 1.2);
  line(ctx, [[7, 9], [7 + step, 13]], 1.2);
  line(ctx, [[13, 9], [13 - step, 13]], 1.2);
  line(ctx, [[15, 9], [15 + step, 13]], 1.2);
  ctx.fillStyle = patch === 'all' ? '#9a4a2c' : '#f4efe2';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(3, 4, 14, 6.5, 2.5);
  ctx.fill();
  ctx.stroke();
  if (patch !== 'all') {
    ctx.fillStyle = patch;
    ctx.beginPath();
    ctx.ellipse(8, 6.5, 2.4, 1.8, 0.3, 0, Math.PI * 2);
    ctx.ellipse(13.5, 8, 1.6, 1.3, 0, 0, Math.PI * 2);
    ctx.ellipse(4.6, 8.4, 1.2, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(18.5, 6 + (frame === 0 ? 3 : 0), 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // little horns
  line(ctx, [[17.6, 4.3 + (frame === 0 ? 3 : 0)], [17.2, 3 + (frame === 0 ? 3 : 0)]], 0.6, '#d8cfb6');
  line(ctx, [[3, 5], [1.5, 9]], 0.8);
}

export function drawAnimal(ctx: CanvasRenderingContext2D, kind: AnimalKind, frame: number) {
  ctx.lineJoin = 'round';
  const graze = frame === 0;
  if (kind === 'koe') cow(ctx, frame, INK, '#f4efe2');
  else if (kind === 'roodbont') cow(ctx, frame, '#a4502e', '#f4efe2');
  else if (kind === 'blaarkop') cow(ctx, frame, 'all', '#f4efe2');
  else if (kind === 'paard') {
    // a farm horse, bay, with a dark mane and a swishing tail
    const step = frame % 2 ? 1.4 : 0;
    const coat = '#7a4a2a';
    line(ctx, [[5, 7], [4.5 - step, 13]], 1.3, '#5a341c');
    line(ctx, [[7, 7], [7.5 + step, 13]], 1.3, coat);
    line(ctx, [[13, 7], [12.5 - step, 13]], 1.3, '#5a341c');
    line(ctx, [[15, 7], [15.5 + step, 13]], 1.3, coat);
    ctx.fillStyle = coat;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(10, 6.2, 6.6, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // neck and head: down to the grass, or up
    const hy = graze ? 10.5 : 2;
    ctx.beginPath();
    ctx.moveTo(14.5, 4.4);
    ctx.lineTo(graze ? 19 : 18, hy - 1);
    ctx.lineTo(graze ? 21 : 21, hy + 0.6);
    ctx.lineTo(graze ? 19.6 : 19.6, hy + 2);
    ctx.lineTo(16, 7.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    line(ctx, [[14.2, 3.8], [graze ? 18.4 : 17.4, hy - 1.4]], 1.2, '#2a1a10');
    line(ctx, [[3.6, 5.2], [1.6, frame ? 10 : 9], [2.4, 11]], 1.4, '#2a1a10');
  } else if (kind === 'varken') {
    // a pink pig, rooting about, with a curly tail
    const step = frame % 2 ? 0.8 : 0;
    line(ctx, [[7, 9.5], [7 - step, 12.5]], 1.2, '#c98a80');
    line(ctx, [[13, 9.5], [13 + step, 12.5]], 1.2, '#c98a80');
    ctx.fillStyle = '#efb9ac';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(10, 7.6, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const sy = graze ? 9.6 : 7.2;
    ctx.beginPath();
    ctx.ellipse(16.2, sy, 1.6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(16.6, sy - 0.4, 0.6, 0.6);
    line(ctx, [[13.4, 5.2], [14.6, 3.6], [15, 5.4]], 0.8, '#c98a80');
    ctx.strokeStyle = '#b07a70';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(3.6, 6.4, 1.2, 0, Math.PI * 1.6);
    ctx.stroke();
  } else if (kind === 'geit') {
    // a goat, white with a beard and swept-back horns
    const step = frame % 2 ? 0.8 : 0;
    line(ctx, [[6, 7.5], [6 - step, 12.5]], 1, '#6a5a48');
    line(ctx, [[11, 7.5], [11 + step, 12.5]], 1, '#6a5a48');
    ctx.fillStyle = '#ece4d2';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(8.5, 6.4, 4.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const hx = 14.6, hy = graze ? 10 : 3.6;
    ctx.beginPath();
    ctx.moveTo(11.6, 5);
    ctx.lineTo(hx - 0.6, hy - 0.4);
    ctx.lineTo(hx + 0.8, hy + 1.6);
    ctx.lineTo(13, 7.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(hx + 0.8, hy + 0.6, 2, 1.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(hx + 0.6, hy - 0.1, 0.6, 0.6);
    line(ctx, [[hx, hy], [hx - 1.6, hy - 2.2]], 0.8, '#6a5a48');
    line(ctx, [[hx + 2, hy + 1.4], [hx + 1.6, hy + 3]], 0.8, '#8a7a62');
    line(ctx, [[4, 5.2], [3.2, 3.8]], 0.9, '#ece4d2');
  } else if (kind === 'kip' || kind === 'gans' || kind === 'eend') {
    // poultry: a red-combed hen pecking, a white goose, a duck on the water
    const goose = kind === 'gans', duck = kind === 'eend';
    const body = goose ? '#f6f2e6' : duck ? '#8a6a44' : '#b8743a';
    const x0 = 9, y0 = duck ? 10.5 : goose ? 8.6 : 9.6;
    if (!duck) {
      line(ctx, [[x0 - 0.6, y0 + 1.6], [x0 - 0.6 - (frame ? 0.6 : 0), 13]], 0.7, '#d08a2a');
      line(ctx, [[x0 + 0.8, y0 + 1.6], [x0 + 0.8 + (frame ? 0.6 : 0), 13]], 0.7, '#d08a2a');
    }
    ctx.fillStyle = body;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(x0, y0, goose ? 3.6 : 3, goose ? 2.1 : 1.9, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // the tail
    ctx.beginPath();
    ctx.moveTo(x0 - (goose ? 3.2 : 2.6), y0 - 0.4);
    ctx.lineTo(x0 - (goose ? 4.6 : 4.2), y0 - (kind === 'kip' ? 2.6 : 1.2));
    ctx.lineTo(x0 - 2, y0 + 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // neck and head: down pecking, or up
    const peck = graze && !duck;
    const hx = x0 + (goose ? 4.4 : 3), hy = peck ? y0 + 2.2 : y0 - (goose ? 4.6 : 2.6);
    if (goose && !peck) line(ctx, [[x0 + 2.6, y0 - 0.8], [hx, hy + 0.6]], 1.4, '#f6f2e6');
    ctx.fillStyle = duck ? '#2f5a3a' : body;
    ctx.beginPath();
    ctx.arc(hx, hy, goose ? 1.2 : 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = duck ? '#d8a43a' : '#e0962a';
    ctx.beginPath();
    ctx.moveTo(hx + 0.9, hy - 0.3);
    ctx.lineTo(hx + 2.2, hy + 0.2);
    ctx.lineTo(hx + 0.9, hy + 0.6);
    ctx.fill();
    if (kind === 'kip') {
      ctx.fillStyle = '#c0322a';
      ctx.fillRect(hx - 0.6, hy - 1.9, 1.3, 0.9);
    }
    if (duck) {
      // the water round it
      ctx.strokeStyle = 'rgba(70,100,120,0.7)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(x0, y0 + 1.8, 5 + (frame ? 0.8 : 0), 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 'schaap') {
    const step = frame % 2 ? 0.8 : 0;
    line(ctx, [[5, 8], [5 - step, 11.5]], 1);
    line(ctx, [[10, 8], [10 + step, 11.5]], 1);
    // the fleece: outline first, then fill over it, so only the outer edge shows
    const puffs = [[4, 6], [7, 4.5], [10, 6], [7, 7.5], [5.5, 5], [9, 4.8]];
    ctx.fillStyle = INK;
    for (const [x, y] of puffs) circle(ctx, x, y, 3, INK, '', 0);
    for (const [x, y] of puffs) circle(ctx, x, y, 2.4, '#f2ecdc', '', 0);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(13.4, 5.5 + (frame === 0 ? 2 : 0), 1.8, 1.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // a small farm dog, running
    const run = frame % 2;
    ctx.fillStyle = '#7a5a3a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    line(ctx, [[4, 7], run ? [1.5, 10.5] : [4.5, 11]], 1.2);
    line(ctx, [[11, 7], run ? [14, 10] : [11, 11]], 1.2);
    ctx.beginPath();
    ctx.ellipse(8, 6.5, 5, 2.6, run ? -0.1 : 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(13.6, 4, 2.4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    line(ctx, [[12.6, 2.6], [12, 0.6]], 1.1, '#5a3d24');
    line(ctx, [[3, 5.5], [0.5, run ? 2 : 3.5]], 1.2, '#7a5a3a');
    ctx.fillStyle = INK;
    ctx.fillRect(15.3, 4, 1, 1);
  }
}
