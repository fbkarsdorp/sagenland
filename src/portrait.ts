// Small drawn busts of the people in the region. Every part varies with a seed (face shape, skin, hair and
// headwear, eyes, brows, nose, mouth, beard, clothes, a pipe now and then), and age leaves its lines.
// The expression leans a little towards the kind of teller someone is, so a face can be read.

export interface PortraitSpec {
  seed: number;
  age: number;
  /** schuchter, verteller, gelovig, spotter */
  temper: string;
  /** what they do, by the building they live in */
  work: string | undefined;
  ill: boolean;
  /** a feature someone can be recognised by: the gold ear irons of the old costume, or a pipe; 'none' rules both out */
  mark?: 'oorijzer' | 'pijp' | 'none';
}

const INK = '#2a211a';
let uid = 0;

function mixHex(a: string, b: string, k: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

export function drawPortrait(o: PortraitSpec, size: number): string {
  let s = (o.seed * 2654435761 + 12345) >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const chance = (p: number) => rnd() < p;
  const age = o.age;
  const id = `pc${++uid}`;

  // ---------------------------------------------------------------- the face
  const cx = 32, cy = 30 + rnd() * 1.5;
  const shape = pick(['oval', 'rond', 'lang', 'hoekig', 'smal'] as const);
  const rx = { oval: 12, rond: 13.5, lang: 11, hoekig: 12.8, smal: 10.6 }[shape] + rnd() * 1.2;
  const ry = { oval: 14, rond: 12.8, lang: 15.5, hoekig: 13.6, smal: 14.6 }[shape] + rnd() * 1.2;
  const jaw = { oval: 0.45, rond: 0.7, lang: 0.35, hoekig: 0.95, smal: 0.3 }[shape];
  let skin = pick(['#efd3b4', '#e8c39d', '#dcb08a', '#eacaa9', '#d9a982', '#f0d9c0']);
  if (o.ill) skin = mixHex(skin, '#c8c8bc', 0.4);
  const skinShade = mixHex(skin, '#7a4a30', 0.25);
  const j2 = 0.5 + 0.38 * jaw;
  const headPath = `M${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy} C${cx + rx},${cy + ry * 0.62} ${cx + rx * j2},${cy + ry} ${cx},${cy + ry} C${cx - rx * j2},${cy + ry} ${cx - rx},${cy + ry * 0.62} ${cx - rx},${cy} Z`;

  // hair colour goes with age
  const young = pick(['#2a2018', '#3b2a1c', '#5a3a22', '#7a5530', '#a07840', '#c8a060', '#8a3a1c']);
  const hair = age >= 70 ? pick(['#ebe6da', '#e0dbcf', '#f2efe6']) : age >= 56 ? pick(['#a8a296', '#9a948a', '#b8b2a6']) : age >= 44 && chance(0.4) ? mixHex(young, '#a8a296', 0.45) : young;
  const hairLine = mixHex(hair, INK, 0.45);

  // ---------------------------------------------------------------- what they wear
  const work = o.work;
  const drawn = work === 'smidse' ? 'pet'
    : pick(['geen', 'geen', 'geen', 'pet', 'hoed', 'kap', 'hoofddoek', 'baret', 'muts', 'kap'] as const);
  const headwear = o.mark === 'oorijzer' ? 'kap' : drawn;
  const veiled = headwear === 'kap' || headwear === 'hoofddoek';
  const hairStyle = veiled ? 'onder' : pick(age >= 55 ? ['kaal', 'kort', 'scheiding', 'knot', 'krullen', 'kaal'] as const : ['kort', 'scheiding', 'krullen', 'knot', 'lang', 'vlechten'] as const);
  const facial = veiled || chance(0.55) ? 'geen' : pick(['baard', 'sik', 'snor', 'snor', 'bakkebaarden', 'stoppels'] as const);
  const clothes = work === 'boerderij' ? pick(['kiel', 'kiel', 'vest', 'trui'] as const)
    : work === 'kerk' || work === 'school' ? 'jas'
    : work === 'herberg' ? pick(['vest', 'schort'] as const)
    : veiled ? pick(['omslagdoek', 'schort', 'omslagdoek'] as const) : pick(['jas', 'vest', 'trui', 'kiel', 'omslagdoek'] as const);
  const cloth = pick(['#3d4a5a', '#4a3a2e', '#2f3b33', '#5a4632', '#463c4e', '#2e2a28', '#55422e']);

  // ---------------------------------------------------------------- expression, leaning to the temper
  const t = o.temper;
  const mouth = t === 'verteller' && chance(0.7) ? pick(['smile', 'grin', 'smile'] as const)
    : t === 'spotter' && chance(0.6) ? 'smirk'
    : t === 'schuchter' && chance(0.6) ? 'small'
    : t === 'gelovig' && chance(0.5) ? pick(['flat', 'frown'] as const)
    : age >= 80 && chance(0.5) ? 'pursed' : pick(['smile', 'flat', 'small', 'smile', 'frown'] as const);
  const eyes = t === 'schuchter' && chance(0.6) ? 'down'
    : t === 'verteller' && chance(0.4) ? 'happy'
    : pick(['dot', 'dot', 'oval', 'oval', 'squint'] as const);
  const brows = t === 'gelovig' && chance(0.5) ? 'worried' : t === 'spotter' && chance(0.6) ? 'raised' : pick(['flat', 'flat', 'arched', 'frown', 'worried'] as const);
  const nose = pick(['button', 'long', 'hook', 'broad', 'button'] as const);
  const glasses = chance(age >= 50 ? 0.25 : 0.1);
  const pipeDrawn = !veiled && facial !== 'baard' && mouth !== 'grin' && chance(0.1);
  const pipe = o.mark === 'pijp' ? true : o.mark === 'none' ? false : pipeDrawn;
  const cheeks = chance(0.5);
  const earrings = veiled && chance(0.3);

  const parts: string[] = [];
  const P = (x: string) => parts.push(x);

  // background
  P(`<circle cx="32" cy="32" r="31" fill="${pick(['#e9dfc6', '#e6dcc2', '#ebe2cc', '#e2d8bd'])}"/>`);
  P(`<g clip-path="url(#${id})">`);

  // long hair and braids fall behind the head
  if (hairStyle === 'lang') P(`<path d="M${cx - rx - 1},${cy - 4} Q${cx - rx - 4},${cy + 16} ${cx - rx + 2},${cy + 22} L${cx + rx - 2},${cy + 22} Q${cx + rx + 4},${cy + 16} ${cx + rx + 1},${cy - 4} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.7"/>`);
  if (hairStyle === 'vlechten') for (const side of [-1, 1]) P(`<path d="M${cx + side * (rx - 1)},${cy + 2} q${side * 3},6 ${side * 1},12 q${side * -2},6 ${side * 1},10" fill="none" stroke="${hair}" stroke-width="3.2" stroke-linecap="round"/><circle cx="${cx + side * (rx + 1)}" cy="${cy + 24}" r="1.4" fill="#a8321f"/>`);
  if (headwear === 'hoofddoek') P(`<path d="M${cx - rx - 3},${cy - 2} Q${cx - rx - 2},${cy + 16} ${cx},${cy + ry + 3} Q${cx + rx + 2},${cy + 16} ${cx + rx + 3},${cy - 2} Z" fill="${pick(['#7a3a2a', '#3a4a6a', '#5a5a3a', '#6a2a3a'])}" stroke="${INK}" stroke-width="0.7"/>`);

  // body and clothes
  const body = `M2 66 Q5 47 20 44.5 Q32 42.5 44 44.5 Q59 47 62 66 Z`;
  if (clothes === 'kiel') {
    P(`<path d="${body}" fill="#5d7a9a" stroke="${INK}" stroke-width="0.9"/>`);
    P(`<path d="M24 48 L25 62 M32 46 L32 64 M40 48 L39 62" stroke="#3e5a78" stroke-width="0.6" fill="none"/>`);
    P(`<path d="M25 44 Q32 50 39 44 L36 49 Q32 52 28 49 Z" fill="#a8321f" stroke="${INK}" stroke-width="0.5"/><circle cx="30" cy="47" r="0.5" fill="#f3efe4"/><circle cx="34" cy="48" r="0.5" fill="#f3efe4"/>`);
  } else if (clothes === 'vest') {
    P(`<path d="${body}" fill="#efe8da" stroke="${INK}" stroke-width="0.9"/>`);
    P(`<path d="M17 66 L19 46 Q26 44 29 50 L32 66 Z M47 66 L45 46 Q38 44 35 50 L32 66 Z" fill="${cloth}" stroke="${INK}" stroke-width="0.8"/>`);
    for (let k = 0; k < 3; k++) P(`<circle cx="${31}" cy="${54 + k * 3.5}" r="0.7" fill="#c9a046"/>`);
  } else if (clothes === 'trui') {
    P(`<path d="${body}" fill="${pick(['#6a5a48', '#4a5a4a', '#7a4a3a', '#5a5a6a'])}" stroke="${INK}" stroke-width="0.9"/>`);
    P(`<path d="M25 45 Q32 49 39 45" stroke="${INK}" stroke-width="2.2" fill="none" opacity="0.35"/>`);
    for (let k = 0; k < 6; k++) P(`<path d="M${12 + k * 8} 56 l2 3 l2 -3" stroke="#00000033" stroke-width="0.6" fill="none"/>`);
  } else if (clothes === 'omslagdoek') {
    P(`<path d="${body}" fill="${cloth}" stroke="${INK}" stroke-width="0.9"/>`);
    const shawl = pick(['#8a5a4a', '#5a6a8a', '#7a6a4a', '#6a4a5a']);
    P(`<path d="M8 56 Q20 44 32 52 Q44 44 56 56 L50 64 Q32 56 14 64 Z" fill="${shawl}" stroke="${INK}" stroke-width="0.7"/>`);
    P(`<path d="M12 58 Q32 50 52 58" stroke="#ffffff55" stroke-width="0.8" fill="none" stroke-dasharray="1.5 1.5"/>`);
  } else if (clothes === 'schort') {
    P(`<path d="${body}" fill="${cloth}" stroke="${INK}" stroke-width="0.9"/>`);
    P(`<path d="M22 50 L42 50 L44 66 L20 66 Z" fill="#f1ece0" stroke="${INK}" stroke-width="0.7"/><path d="M22 50 L19 45 M42 50 L45 45" stroke="#f1ece0" stroke-width="1.6"/>`);
  } else {
    P(`<path d="${body}" fill="${cloth}" stroke="${INK}" stroke-width="0.9"/>`);
    P(`<path d="M26 44.5 L32 56 L38 44.5 Z" fill="#f1ece0" stroke="${INK}" stroke-width="0.6"/><path d="M26 44.5 L24 52 L32 60 M38 44.5 L40 52 L32 60" stroke="${INK}" stroke-width="0.7" fill="none"/>`);
    if (chance(0.4)) P(`<path d="M30 46 L32 51 L34 46 Z" fill="${pick(['#2a2a2a', '#7a2a2a', '#2a3a5a'])}"/>`);
  }

  // from here on the head, turned a little to one side or the other
  const tilt = (rnd() - 0.5) * 9;
  P(`<g transform="rotate(${tilt.toFixed(1)} ${cx} ${cy + ry})">`);
  // neck and ears
  P(`<path d="M${cx - 4.6},${cy + ry - 5} L${cx - 4.8},${46} Q${cx},${48} ${cx + 4.8},${46} L${cx + 4.6},${cy + ry - 5} Z" fill="${skinShade}" stroke="${INK}" stroke-width="0.6"/>`);
  if (!veiled) for (const side of [-1, 1]) P(`<ellipse cx="${cx + side * (rx - 0.2)}" cy="${cy + 1.5}" rx="2.1" ry="3.3" fill="${skin}" stroke="${INK}" stroke-width="0.7"/>`);
  if (earrings) for (const side of [-1, 1]) P(`<circle cx="${cx + side * (rx - 0.5)}" cy="${cy + 2}" r="1.6" fill="#d9b04a" stroke="${INK}" stroke-width="0.5"/>`);

  // the head
  P(`<path d="${headPath}" fill="${skin}" stroke="${INK}" stroke-width="0.9"/>`);
  if (cheeks) for (const side of [-1, 1]) P(`<ellipse cx="${cx + side * 6.5}" cy="${cy + 5}" rx="2.6" ry="1.7" fill="#d9786a" opacity="${o.ill ? 0.12 : 0.3}"/>`);

  if (age < 30 && chance(0.4)) for (let k = 0; k < 10; k++) P(`<circle cx="${cx + (rnd() - 0.5) * 12}" cy="${cy + 2 + rnd() * 4}" r="0.35" fill="#b0704a" opacity="0.7"/>`);
  // lines of age
  const wr = mixHex(skin, '#5a3a2a', 0.45);
  if (age >= 48) P(`<path d="M${cx - 5},${cy - 8.5} q5,-1 10,0" stroke="${wr}" stroke-width="0.5" fill="none"/>`);
  if (age >= 60) P(`<path d="M${cx - 4},${cy - 10.5} q4,-1 8,0" stroke="${wr}" stroke-width="0.5" fill="none"/>`);
  if (age >= 55) for (const side of [-1, 1]) P(`<path d="M${cx + side * 8.6},${cy - 1.2} l${side * 1.6},-0.8 M${cx + side * 8.6},${cy} l${side * 1.8},0.3" stroke="${wr}" stroke-width="0.45" fill="none"/>`);
  if (age >= 64) for (const side of [-1, 1]) P(`<path d="M${cx + side * 2.8},${cy + 4.5} q${side * 1.8},2.4 ${side * 1.6},5" stroke="${wr}" stroke-width="0.5" fill="none"/>`);
  if (age >= 74) for (const side of [-1, 1]) P(`<path d="M${cx + side * 6.2},${cy + 1.6} q${side * -1.5},1 ${side * -3},0" stroke="${wr}" stroke-width="0.45" fill="none"/>`);
  if (o.ill) for (const side of [-1, 1]) P(`<path d="M${cx + side * 6.4},${cy + 1.4} q${side * -1.6},1.2 ${side * -3.2},0" stroke="#8a7a8a" stroke-width="0.8" fill="none" opacity="0.6"/>`);

  // eyes
  const ey = cy - 1, ex = 4.6 + rnd() * 1;
  for (const side of [-1, 1]) {
    const x = cx + side * ex;
    if (eyes === 'dot') P(`<circle cx="${x}" cy="${ey}" r="1.15" fill="${INK}"/>`);
    else if (eyes === 'oval') P(`<ellipse cx="${x}" cy="${ey}" rx="1.9" ry="1.25" fill="#fbf8f0" stroke="${INK}" stroke-width="0.45"/><circle cx="${x + 0.2}" cy="${ey + 0.1}" r="0.85" fill="${pick(['#3a2a1a', '#3a5a7a', '#4a5a3a'])}"/>`);
    else if (eyes === 'happy') P(`<path d="M${x - 1.6},${ey + 0.4} q1.6,-1.8 3.2,0" stroke="${INK}" stroke-width="0.9" fill="none"/>`);
    else if (eyes === 'down') P(`<path d="M${x - 1.6},${ey} q1.6,1 3.2,0" stroke="${INK}" stroke-width="0.8" fill="none"/><circle cx="${x}" cy="${ey + 0.9}" r="0.7" fill="${INK}"/>`);
    else P(`<path d="M${x - 1.5},${ey} l3,0" stroke="${INK}" stroke-width="0.9"/>`);
  }
  // brows
  const by = ey - 3.4, bw = 0.7 + rnd() * 1.1;
  const bc = age >= 56 ? mixHex(hair, '#6a645a', 0.35) : hairLine;
  for (const side of [-1, 1]) {
    const x0 = cx + side * (ex - 2), x1 = cx + side * (ex + 2);
    let y0 = by, y1 = by;
    if (brows === 'worried') y0 -= 1.1;
    if (brows === 'frown') y0 += 0.9;
    if (brows === 'raised' && side === 1) { y0 -= 1.2; y1 -= 1.4; }
    const arch = brows === 'arched' ? -1 : 0;
    P(`<path d="M${x0},${y0} Q${(x0 + x1) / 2},${Math.min(y0, y1) + arch - 0.3} ${x1},${y1}" stroke="${bc}" stroke-width="${bw}" stroke-linecap="round" fill="none"/>`);
  }
  if (glasses) {
    P(`<g fill="none" stroke="${pick(['#4a3a2a', '#8a7a4a', '#2a2a2a'])}" stroke-width="0.6"><circle cx="${cx - ex}" cy="${ey}" r="3"/><circle cx="${cx + ex}" cy="${ey}" r="3"/>`
      + `<path d="M${cx - ex + 3},${ey} q${ex - 3},-1 ${(ex - 3) * 2},0 M${cx - ex - 3},${ey} L${cx - rx + 0.5},${ey - 0.6} M${cx + ex + 3},${ey} L${cx + rx - 0.5},${ey - 0.6}"/></g>`);
  }
  // nose
  const ny = cy + 1.5;
  const nc = mixHex(skin, '#6a3a24', 0.5);
  if (nose === 'button') P(`<path d="M${cx - 1.6},${ny + 3.6} q1.6,1.4 3.2,0" stroke="${nc}" stroke-width="0.8" fill="none"/>`);
  else if (nose === 'long') P(`<path d="M${cx},${ny - 1} L${cx + 0.8},${ny + 4.8} q-0.8,0.8 -2,0.2" stroke="${nc}" stroke-width="0.8" fill="none"/>`);
  else if (nose === 'hook') P(`<path d="M${cx - 0.3},${ny - 1.5} q2.6,2.4 1.4,6.4 q-1.2,0.8 -2.4,-0.2" stroke="${nc}" stroke-width="0.85" fill="none"/>`);
  else P(`<path d="M${cx - 2.4},${ny + 4} q0.4,1.4 2.4,1.2 q2,0.2 2.4,-1.2" stroke="${nc}" stroke-width="0.85" fill="none"/>`);

  // facial hair under the mouth, moustaches over it
  const my = cy + 8.6;
  if (facial === 'baard') P(`<path d="M${cx - rx + 1.2},${cy + 2} Q${cx - rx + 1},${cy + ry - 1} ${cx},${cy + ry + 3.5} Q${cx + rx - 1},${cy + ry - 1} ${cx + rx - 1.2},${cy + 2} Q${cx + 6},${my + 3} ${cx},${my + 2} Q${cx - 6},${my + 3} ${cx - rx + 1.2},${cy + 2} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.6"/>`);
  if (facial === 'sik') P(`<path d="M${cx - 2.6},${my + 2.4} Q${cx},${cy + ry + 4.5} ${cx + 2.6},${my + 2.4} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.5"/>`);
  if (facial === 'bakkebaarden') for (const side of [-1, 1]) P(`<path d="M${cx + side * (rx - 0.6)},${cy - 3} L${cx + side * (rx - 0.4)},${cy + 7} Q${cx + side * (rx - 3)},${cy + 10} ${cx + side * (rx - 4)},${cy + 6} L${cx + side * (rx - 2.6)},${cy - 3} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.5"/>`);
  if (facial === 'stoppels') for (let k = 0; k < 18; k++) P(`<circle cx="${cx + (rnd() - 0.5) * rx * 1.5}" cy="${my + 1 + rnd() * (ry - 9)}" r="0.28" fill="${hairLine}" opacity="0.6"/>`);

  // mouth
  const mc = '#7a3a2a';
  if (mouth === 'smile') P(`<path d="M${cx - 3.2},${my} Q${cx},${my + 2.4} ${cx + 3.2},${my}" stroke="${mc}" stroke-width="0.9" fill="none"/>`);
  else if (mouth === 'grin') P(`<path d="M${cx - 3.4},${my - 0.3} Q${cx},${my + 4} ${cx + 3.4},${my - 0.3} Z" fill="#5a2a22" stroke="${mc}" stroke-width="0.6"/><path d="M${cx - 2.6},${my + 0.2} L${cx + 2.6},${my + 0.2}" stroke="#f3efe4" stroke-width="0.9"/>`);
  else if (mouth === 'flat') P(`<path d="M${cx - 2.6},${my + 0.6} L${cx + 2.6},${my + 0.6}" stroke="${mc}" stroke-width="0.85"/>`);
  else if (mouth === 'frown') P(`<path d="M${cx - 2.8},${my + 1.2} Q${cx},${my - 0.6} ${cx + 2.8},${my + 1.2}" stroke="${mc}" stroke-width="0.85" fill="none"/>`);
  else if (mouth === 'smirk') P(`<path d="M${cx - 2.6},${my + 0.8} Q${cx + 0.6},${my + 1.2} ${cx + 3},${my - 0.8}" stroke="${mc}" stroke-width="0.9" fill="none"/>`);
  else if (mouth === 'pursed') P(`<path d="M${cx - 1.8},${my + 0.8} q1.8,-0.8 3.6,0" stroke="${mc}" stroke-width="0.8" fill="none"/><path d="M${cx - 2.2},${my + 2.2} l0.8,-0.6 M${cx + 2.2},${my + 2.2} l-0.8,-0.6" stroke="${wr}" stroke-width="0.4"/>`);
  else P(`<path d="M${cx - 1.6},${my + 0.6} Q${cx},${my + 1.4} ${cx + 1.6},${my + 0.6}" stroke="${mc}" stroke-width="0.8" fill="none"/>`);
  if (facial === 'snor' || facial === 'baard') {
    const walrus = chance(0.5);
    P(walrus
      ? `<path d="M${cx},${my - 1.6} Q${cx - 3},${my - 2.6} ${cx - 5},${my + 1.2} Q${cx - 2.6},${my - 0.2} ${cx},${my - 0.4} Q${cx + 2.6},${my - 0.2} ${cx + 5},${my + 1.2} Q${cx + 3},${my - 2.6} ${cx},${my - 1.6} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.5"/>`
      : `<path d="M${cx - 3.6},${my - 0.6} Q${cx},${my - 2.6} ${cx + 3.6},${my - 0.6}" stroke="${hair}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  }
  // a long-stemmed clay pipe, large enough to be recognised in a small portrait, with its smoke curling up
  if (pipe) P(`<path d="M${cx + 1.6},${my + 0.4} Q${cx + 8},${my + 3} ${cx + 13},${my + 2.6}" stroke="#e8e2d2" stroke-width="1.8" fill="none"/>`
    + `<path d="M${cx + 1.6},${my + 0.4} Q${cx + 8},${my + 3} ${cx + 13},${my + 2.6}" stroke="${INK}" stroke-width="0.4" fill="none"/>`
    + `<path d="M${cx + 11.2},${my - 1.6} l0.4,4.6 q0.4,2.2 2.6,2.2 q2.2,0 2.6,-2.2 l0.4,-4.6 Z" fill="#efe8d6" stroke="${INK}" stroke-width="0.6"/>`
    + `<ellipse cx="${cx + 13.9}" cy="${my - 1.6}" rx="2.7" ry="0.9" fill="#5a3a22" stroke="${INK}" stroke-width="0.4"/>`
    + `<path d="M${cx + 14},${my - 2.6} q-2.4,-3 0.4,-5.4 q2.6,-2.2 0,-5" stroke="#a8a296" stroke-width="1" fill="none" opacity="0.85"/>`);

  // hair on top
  const top = cy - ry;
  if (hairStyle === 'kort') P(`<path d="M${cx - rx + 0.3},${cy - 2} Q${cx - rx},${top - 1.2} ${cx},${top - 1.6} Q${cx + rx},${top - 1.2} ${cx + rx - 0.3},${cy - 2} Q${cx + rx - 3},${top + 4} ${cx},${top + 3} Q${cx - rx + 3},${top + 4} ${cx - rx + 0.3},${cy - 2} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.6"/>`);
  if (hairStyle === 'scheiding') P(`<path d="M${cx - rx + 0.2},${cy - 1} Q${cx - rx - 0.5},${top - 1.6} ${cx - 3},${top - 1.2} Q${cx + rx + 1},${top - 1} ${cx + rx - 0.2},${cy - 1} Q${cx + rx - 4},${top + 3} ${cx - 3},${top + 1.6} Q${cx - 5},${top + 6} ${cx - rx + 0.2},${cy - 1} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.6"/>`);
  if (hairStyle === 'kaal') for (const side of [-1, 1]) P(`<path d="M${cx + side * (rx - 0.2)},${cy - 1} q${side * 1.6},-4 ${side * -1.4},-7.4 q${side * -1.4},2.6 ${side * -0.8},7" fill="${hair}" stroke="${hairLine}" stroke-width="0.5"/>`);
  if (hairStyle === 'krullen') for (let k = 0; k < 9; k++) {
    const a = Math.PI + (k / 8) * Math.PI;
    P(`<circle cx="${cx + Math.cos(a) * (rx - 0.5)}" cy="${cy - 2 + Math.sin(a) * (ry - 0.5)}" r="${2.6 + rnd()}" fill="${hair}" stroke="${hairLine}" stroke-width="0.5"/>`);
  }
  if (hairStyle === 'knot') {
    P(`<path d="M${cx - rx + 0.3},${cy - 1} Q${cx - rx},${top - 1} ${cx},${top - 1.2} Q${cx + rx},${top - 1} ${cx + rx - 0.3},${cy - 1} Q${cx + rx - 4},${top + 3.4} ${cx},${top + 2.6} Q${cx - rx + 4},${top + 3.4} ${cx - rx + 0.3},${cy - 1} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.6"/>`);
    P(`<circle cx="${cx}" cy="${top - 2.4}" r="3.6" fill="${hair}" stroke="${hairLine}" stroke-width="0.6"/>`);
  }
  if (hairStyle === 'lang' || hairStyle === 'vlechten') P(`<path d="M${cx - rx + 0.2},${cy + 1} Q${cx - rx - 0.4},${top - 1.4} ${cx},${top - 1.6} Q${cx + rx + 0.4},${top - 1.4} ${cx + rx - 0.2},${cy + 1} Q${cx + rx - 2},${top + 5} ${cx + 1},${top + 3} Q${cx - rx + 2},${top + 5} ${cx - rx + 0.2},${cy + 1} Z" fill="${hair}" stroke="${hairLine}" stroke-width="0.6"/>`);

  // headwear
  const hc = pick(['#2e2a28', '#3a3a44', '#4a3a2e', '#2f3b33', '#55422e']);
  if (headwear === 'pet') P(`<path d="M${cx - rx - 0.5},${top + 6} Q${cx - rx + 1},${top - 3} ${cx + 2},${top - 2.4} Q${cx + rx + 2},${top - 1} ${cx + rx + 0.5},${top + 6} Z" fill="${hc}" stroke="${INK}" stroke-width="0.8"/><path d="M${cx - rx},${top + 6} L${cx + rx + 6},${top + 6.5} Q${cx + rx + 6},${top + 8.5} ${cx + rx},${top + 8} L${cx - rx},${top + 7.5} Z" fill="${mixHex(hc, '#000000', 0.3)}"/>`);
  if (headwear === 'hoed') P(`<ellipse cx="${cx}" cy="${top + 5}" rx="${rx + 6}" ry="2.4" fill="${hc}" stroke="${INK}" stroke-width="0.7"/><path d="M${cx - rx + 2},${top + 5} Q${cx - rx + 2},${top - 6} ${cx},${top - 6} Q${cx + rx - 2},${top - 6} ${cx + rx - 2},${top + 5} Z" fill="${hc}" stroke="${INK}" stroke-width="0.7"/><path d="M${cx - rx + 2},${top + 2.6} L${cx + rx - 2},${top + 2.6}" stroke="${pick(['#7a2a2a', '#1a1a1a', '#5a4a2a'])}" stroke-width="1.4"/>`);
  if (headwear === 'baret') P(`<ellipse cx="${cx - 1}" cy="${top + 1.6}" rx="${rx + 2.4}" ry="4.2" transform="rotate(-8 ${cx} ${top})" fill="${hc}" stroke="${INK}" stroke-width="0.7"/><path d="M${cx},${top - 2.4} l0.4,-1.8" stroke="${INK}" stroke-width="1"/>`);
  if (headwear === 'muts') P(`<path d="M${cx - rx - 0.6},${top + 7} Q${cx - rx},${top - 5} ${cx},${top - 5.4} Q${cx + rx},${top - 5} ${cx + rx + 0.6},${top + 7} Z" fill="${pick(['#7a3a2a', '#3a4a6a', '#5a6a4a'])}" stroke="${INK}" stroke-width="0.7"/><path d="M${cx - rx - 0.6},${top + 5} L${cx + rx + 0.6},${top + 5}" stroke="#00000044" stroke-width="2.2"/><circle cx="${cx}" cy="${top - 6}" r="2" fill="#efe8da" stroke="${INK}" stroke-width="0.5"/>`);
  if (headwear === 'kap') {
    // a white lace cap framing the face, sometimes with the gold pins at the temples
    P(`<path d="M${cx - rx - 2.4},${cy + 6} Q${cx - rx - 3},${top - 3} ${cx},${top - 3.6} Q${cx + rx + 3},${top - 3} ${cx + rx + 2.4},${cy + 6} Q${cx + rx},${top + 4} ${cx},${top + 3} Q${cx - rx},${top + 4} ${cx - rx - 2.4},${cy + 6} Z" fill="#f6f2e8" stroke="${INK}" stroke-width="0.7"/>`);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 1.02 + (k / 8) * Math.PI * 0.96;
      P(`<circle cx="${cx + Math.cos(a) * (rx + 1.4)}" cy="${cy - 2 + Math.sin(a) * (ry + 1.2)}" r="1" fill="none" stroke="#c9c2b0" stroke-width="0.5"/>`);
    }
    const pinsDrawn = chance(0.4);
    if (o.mark === 'oorijzer') {
      // the gold ear iron: a band across the forehead under the lace, ending in large gold plates at the temples
      P(`<path d="M${cx - rx + 0.4},${cy - 4.5} Q${cx},${top + 3.6} ${cx + rx - 0.4},${cy - 4.5}" fill="none" stroke="#d9b04a" stroke-width="1.6"/>`);
      for (const side of [-1, 1]) {
        P(`<ellipse cx="${cx + side * (rx - 0.2)}" cy="${cy - 4}" rx="2.6" ry="3.2" fill="#e2bc52" stroke="#8a6a1a" stroke-width="0.6"/>`);
        P(`<path d="M${cx + side * (rx - 1.2)},${cy - 5.4} l${side * 2},2.4 M${cx + side * (rx - 1.2)},${cy - 3} l${side * 2},-1.4" stroke="#fff2b0" stroke-width="0.5"/>`);
      }
    } else if (o.mark !== 'none' && pinsDrawn) for (const side of [-1, 1]) P(`<circle cx="${cx + side * (rx - 0.6)}" cy="${cy - 5}" r="1.5" fill="#d9b04a" stroke="${INK}" stroke-width="0.4"/>`);
  }
  if (headwear === 'hoofddoek') P(`<path d="M${cx - rx - 2},${cy + 4} Q${cx - rx - 2},${top - 3} ${cx},${top - 3.4} Q${cx + rx + 2},${top - 3} ${cx + rx + 2},${cy + 4} Q${cx + rx - 1},${top + 4} ${cx},${top + 3.6} Q${cx - rx + 1},${top + 4} ${cx - rx - 2},${cy + 4} Z" fill="${pick(['#7a3a2a', '#3a4a6a', '#5a5a3a', '#6a2a3a'])}" stroke="${INK}" stroke-width="0.7"/><path d="M${cx - 4},${top + 1} l2,1 l2,-1 l2,1 l2,-1" stroke="#ffffff66" stroke-width="0.6" fill="none"/>`);

  P('</g></g>');
  P(`<circle cx="32" cy="32" r="31" fill="none" stroke="${INK}" stroke-width="1"/>`);
  return `<svg class="portrait${o.ill ? ' ill' : ''}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><clipPath id="${id}"><circle cx="32" cy="32" r="30.5"/></clipPath></defs>${parts.join('')}</svg>`;
}
