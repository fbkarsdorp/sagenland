// Feast days, by the player's own calendar: around All Hallows' Eve the dead are about (hollowed-out turnips and
// pumpkins by the doors, bats at dusk, everything seen at night shows itself more readily); on the eve of Saint
// Nicholas the saint rides his white horse over the roofs; at Christmas there is snow in the air, a star over every
// church, and from somewhere far away the midwinter horn. ?feest=halloween|sinterklaas|kerst in the address tries one.

export type Feest = 'halloween' | 'sinterklaas' | 'kerst';

export const FEEST_LINE: Record<Feest, string> = {
  halloween: 'Het is Allerheiligenavond. Men zegt dat de doden vannacht rondgaan.',
  sinterklaas: 'Het is Sinterklaasavond. Vannacht rijdt de Sint over de daken.',
  kerst: 'Het is Kerstmis. In de verte blaast iemand op de midwinterhoorn.',
};

export function feest(now = new Date()): Feest | null {
  if (typeof location !== 'undefined') {
    const asked = new URLSearchParams(location.search).get('feest');
    if (asked === 'halloween' || asked === 'sinterklaas' || asked === 'kerst') return asked;
    if (asked === 'geen') return null;
  }
  const m = now.getMonth(), d = now.getDate();
  if ((m === 9 && d >= 30) || (m === 10 && d <= 1)) return 'halloween';
  if (m === 11 && d >= 4 && d <= 6) return 'sinterklaas';
  if (m === 11 && d >= 24 && d <= 26) return 'kerst';
  return null;
}

const INK = '#2a211a';
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

/** A carved pumpkin by the door, 20×18; `lit` gives it a glowing face. */
export function drawPumpkin(ctx: CanvasRenderingContext2D, lit: boolean) {
  const cx = 10, cy = 11;
  ctx.fillStyle = '#d9772a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  for (const [dx, rx] of [[-3.6, 4.2], [3.6, 4.2], [0, 4.6]] as [number, number][]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy, rx, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  line(ctx, [[cx, cy - 5.4], [cx + 0.6, cy - 7.8], [cx + 2, cy - 8.4]], 1.4, '#5a6a2a');
  // the face
  ctx.fillStyle = lit ? '#ffd760' : '#4a2a10';
  const tri = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.6);
    ctx.lineTo(x + s, y + s * 0.6);
    ctx.lineTo(x, y - s * 0.8);
    ctx.closePath();
    ctx.fill();
  };
  tri(cx - 2.6, cy - 1.4, 1.4);
  tri(cx + 2.6, cy - 1.4, 1.4);
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 1.6);
  for (let i = 0; i <= 6; i++) ctx.lineTo(cx - 4 + i * (8 / 6), cy + 1.6 + (i % 2 ? 1.6 : 0) + Math.sin((i / 6) * Math.PI) * 1.2);
  ctx.lineTo(cx + 4, cy + 1.6);
  ctx.quadraticCurveTo(cx, cy + 5, cx - 4, cy + 1.6);
  ctx.fill();
}

/** A bat, 18×10, wings up (frame 0) or down (1). */
export function drawBat(ctx: CanvasRenderingContext2D, frame: number) {
  const up = frame === 0;
  ctx.fillStyle = '#231c24';
  ctx.beginPath();
  ctx.moveTo(9, 5);
  if (up) {
    ctx.quadraticCurveTo(5, 0, 0.5, 1);
    ctx.lineTo(2.6, 3.2); ctx.lineTo(3.4, 2.4); ctx.lineTo(4.8, 4.6); ctx.lineTo(6, 4);
    ctx.lineTo(7.4, 6.4);
  } else {
    ctx.quadraticCurveTo(5, 7, 0.5, 9);
    ctx.lineTo(2.8, 7); ctx.lineTo(3.8, 8.2); ctx.lineTo(5, 6.4); ctx.lineTo(6.4, 7.4);
    ctx.lineTo(7.4, 6);
  }
  ctx.lineTo(9, 7.4);
  ctx.lineTo(10.6, up ? 6.4 : 6);
  if (up) {
    ctx.lineTo(12, 4); ctx.lineTo(13.2, 4.6); ctx.lineTo(14.6, 2.4); ctx.lineTo(15.4, 3.2); ctx.lineTo(17.5, 1);
    ctx.quadraticCurveTo(13, 0, 9, 5);
  } else {
    ctx.lineTo(11.6, 7.4); ctx.lineTo(13, 6.4); ctx.lineTo(14.2, 8.2); ctx.lineTo(15.2, 7); ctx.lineTo(17.5, 9);
    ctx.quadraticCurveTo(13, 7, 9, 5);
  }
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(8.2, 5); ctx.lineTo(8.4, 3.2); ctx.lineTo(9, 4.6); ctx.lineTo(9.6, 3.2); ctx.lineTo(9.8, 5);
  ctx.fill();
}

/** Saint Nicholas on his white horse, galloping through the air, 64×64; 6 frames. */
export const SINT_FRAMES = 6;
export function drawSint(ctx: CanvasRenderingContext2D, f: number) {
  const a = (f / SINT_FRAMES) * Math.PI * 2;
  const bob = Math.sin(a) * 1.4;
  const coat = '#f4f0e6';
  // legs, flying gallop: front pair reaching, hind pair pushing
  const legs: [number, number, number][] = [[40, 0, 1], [43, 0.6, 1], [20, Math.PI, -1], [23, Math.PI + 0.6, -1]];
  for (const [x, ph, dir] of legs) {
    const s = Math.sin(a + ph);
    const knee: P = [x + dir * (3 + s * 2), 44 + bob];
    const hoof: P = [x + dir * (6 + s * 4), 50 + bob - Math.max(0, s) * 2];
    line(ctx, [[x, 38 + bob], knee, hoof], 2.2, '#d8d2c4');
    line(ctx, [hoof, [hoof[0] + dir * 1, hoof[1] + 0.6]], 1.6, '#6a6058');
  }
  // body
  ctx.fillStyle = coat;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(31, 36 + bob, 13, 5.8, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // tail streaming
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.moveTo(18.5, 34 + bob);
  ctx.quadraticCurveTo(10, 32 + Math.sin(a) * 2, 6, 38 + Math.sin(a + 1) * 2);
  ctx.quadraticCurveTo(12, 37, 18.5, 37.5 + bob);
  ctx.fill();
  ctx.stroke();
  // neck and head
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(40, 33 + bob);
  ctx.lineTo(46, 24 + bob);
  ctx.lineTo(52, 25 + bob);
  ctx.lineTo(53.5, 28.4 + bob);
  ctx.lineTo(49, 29 + bob);
  ctx.lineTo(44, 37 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(49.2, 25.6 + bob, 1, 1);
  line(ctx, [[45.4, 24 + bob], [46.4, 21.6 + bob]], 1, '#d8d2c4');
  // mane
  line(ctx, [[40, 31 + bob], [43, 26 + Math.sin(a) + bob], [46, 23.6 + bob]], 1.6, '#e2dccd');
  // the saint: red cloak blowing back, white beard, the mitre and the crook
  ctx.fillStyle = '#b3261e';
  ctx.beginPath();
  ctx.moveTo(29, 30 + bob);
  ctx.lineTo(35, 30 + bob);
  ctx.lineTo(34, 18 + bob);
  ctx.lineTo(29.5, 18 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(29.6, 19 + bob);
  ctx.quadraticCurveTo(22, 22 + Math.sin(a) * 1.5, 18, 31 + Math.sin(a + 0.7) * 2);
  ctx.lineTo(29, 31 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  line(ctx, [[31.6, 18.4 + bob], [31.6, 30 + bob]], 0.9, '#e2b84a');
  // face and beard
  ctx.fillStyle = '#f0d6be';
  ctx.beginPath();
  ctx.arc(33.4, 14.6 + bob, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f8f6f0';
  ctx.beginPath();
  ctx.moveTo(31.2, 15 + bob);
  ctx.quadraticCurveTo(33.6, 23 + bob, 36.2, 15.4 + bob);
  ctx.quadraticCurveTo(33.8, 17.4 + bob, 31.2, 15 + bob);
  ctx.fill();
  ctx.stroke();
  // mitre
  ctx.fillStyle = '#b3261e';
  ctx.beginPath();
  ctx.moveTo(30.6, 12.6 + bob);
  ctx.lineTo(31.6, 6.4 + bob);
  ctx.lineTo(33.4, 4.6 + bob);
  ctx.lineTo(35.2, 6.4 + bob);
  ctx.lineTo(36.2, 12.6 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  line(ctx, [[33.4, 5.2 + bob], [33.4, 12 + bob]], 0.9, '#e2b84a');
  line(ctx, [[31.6, 9.4 + bob], [35.2, 9.4 + bob]], 0.9, '#e2b84a');
  // the crook in his hand, gold
  line(ctx, [[37.8, 34 + bob], [40, 8 + bob]], 1.3, '#d9b04a');
  ctx.strokeStyle = '#d9b04a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(41.8, 8 + bob, 1.8, Math.PI, Math.PI * 2.3);
  ctx.stroke();
  line(ctx, [[35, 22 + bob], [38.4, 24 + bob]], 1.8, '#b3261e');
}

/** A Christmas star, 16×16, with a soft halo. */
export function drawStar(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,236,170,0.9)');
  g.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#ffe9a0';
  ctx.strokeStyle = '#8a6a1a';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 2.2 : 5.8, ang = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = 8 + Math.cos(ang) * r, y = 8 + Math.sin(ang) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
