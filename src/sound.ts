// Synthesized sound: paper ticks, ink scratches, bells and a quiet countryside bed. Web Audio only, no assets.

export type Sfx =
  | 'click'      // UI button / tool pick: tiny paper tick
  | 'build'      // a building placed: soft wooden knock
  | 'road'       // one road tile laid while dragging: faint gravel scratch
  | 'sighting'   // a legend appears: eerie soft minor bell
  | 'mutation'   // a story changed into another version: shimmering two-note glide
  | 'record'     // the collector writes a story down: quill scratch
  | 'collector'  // the collector arrives: small hand bell
  | 'death'      // a narrator dies: low muffled church-bell toll
  | 'era'        // a historical era event: low drone swell
  | 'page'       // a modal/leaf opens: page turn
  | 'end'        // end of the run: descending three-note bell phrase
  | 'hoorn';     // the midwinter horn, far away over the land (Christmas)

export interface Ambience {
  season: 0 | 1 | 2 | 3;
  night?: boolean;
  paused: boolean;
  church: boolean;
  mill: boolean;
  water: boolean;
}

const MASTER = 0.35;     // overall level
const SFX_LEVEL = 0.8;   // sfx bus, relative to master
const AMB_LEVEL = 0.7;   // ambience bus, relative to master
const DUCK = 0.3;        // ambience level while paused
const KEY = 'sagenland.sound';

// Minimum ms between two plays of the same sound.
const MIN_GAP: Record<Sfx, number> = {
  click: 90, build: 120, road: 160, sighting: 400, mutation: 300, record: 350,
  collector: 1500, death: 2500, era: 2500, page: 200, end: 4000, hoorn: 20000,
};

type Partials = [number, number][];  // [frequency ratio, amplitude]
const BELL: Partials = [[1, 1], [2, 0.5], [2.76, 0.35], [5.4, 0.15]];
const CHURCH: Partials = [[0.5, 0.7], [1, 1], [1.19, 0.5], [1.5, 0.3], [2, 0.45], [2.66, 0.15]];

interface Bed {
  wind: GainNode; windDepth: GainNode; windBp: BiquadFilterNode;
  brook: GainNode; crickets: GainNode;
}

interface Bus {
  c: AudioContext;
  master: GainNode;
  sfx: GainNode;
  amb: GainNode;
  duck: GainNode;
  send: GainNode;
  noise: AudioBuffer;
  bed: Bed;
}

let A: Bus | null = null;
let failed = false;
let listening = false;
let muted = readMuted();
let amb: Ambience | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const last: Partial<Record<Sfx, number>> = {};
const targets = new Map<AudioParam, number>();
const due = { bird: 0, owl: 0, creak: 0, toll: 0 };

// ---------- public API ----------

export function initSound(): void {
  if (listening || failed || typeof window === 'undefined') return;
  listening = true;
  // on an iPhone, sound from a web page is silenced by the ring/silent switch unless the page plays as media
  const nav0 = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav0.audioSession) nav0.audioSession.type = 'playback';
  } catch {
    // not supported
  }
  const onGesture = () => {
    const b = ensure();
    if (b && b.c.state !== 'running') b.c.resume().catch(() => undefined);
    unmuteIOS();
  };
  // pointerdown does not count as activation for touch on iOS, hence pointerup/touchend too
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    window.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
  // putting the phone down, switching app or tab: everything goes quiet, and comes back when you return.
  // (As a 'player' the page would otherwise go on sounding in your pocket.)
  const away = () => {
    keepAlive?.pause();
    if (A && A.c.state === 'running') A.c.suspend().catch(() => undefined);
  };
  const back = () => {
    if (document.hidden || !A) return;
    A.c.resume().catch(() => undefined);
    unmuteIOS();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? away() : back()));
  window.addEventListener('pagehide', away);
  window.addEventListener('pageshow', back);
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  if (nav.userActivation?.hasBeenActive) onGesture();
}

/**
 * Older iPhones without the audio session API: a silent sound looping in an <audio> element puts the page in the
 * media category, so the Web Audio sounds are heard even with the silent switch on.
 */
let keepAlive: HTMLAudioElement | null = null;
function unmuteIOS(): void {
  const nav = navigator as Navigator & { audioSession?: unknown };
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios || nav.audioSession || muted) return;
  if (!keepAlive) {
    // half a second of silence, 8 kHz mono
    const n = 4000;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const w = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    keepAlive = document.createElement('audio');
    keepAlive.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    keepAlive.loop = true;
    keepAlive.setAttribute('playsinline', '');
    keepAlive.setAttribute('x-webkit-airplay', 'deny');
  }
  if (keepAlive.paused) keepAlive.play().catch(() => undefined);
}

export function sfx(name: Sfx): void {
  if (muted || !A || A.c.state !== 'running') return;
  const now = performance.now();
  if (now - (last[name] ?? -1e9) < MIN_GAP[name]) return;
  last[name] = now;
  try {
    PLAY[name](A, A.c.currentTime + 0.005);
  } catch {
    // ignore: sound is decoration
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? '0' : '1');
  } catch {
    // storage unavailable
  }
  if (A) setParam(A.master.gain, m ? 0 : MASTER, 0.08);
  if (m) {
    stopLoop();
    stopNight(0.3);
    keepAlive?.pause();
  } else {
    unmuteIOS();
    loop();
    if (musicWanted) startNight();
  }
}

// ---------- music: only at night, as the dark comes ----------

/** The night music: N.91music's loop of air (free, with credit), or the longer Suno piece, played through and rested. */
export type NightTrack = 'lucht' | 'nacht';
const TRACKS: Record<NightTrack, { level: number; loop: boolean }> = {
  lucht: { level: 1.0, loop: true },
  nacht: { level: 1.4, loop: false },
};
let track: NightTrack = 'lucht';
const MUSIC_LEVEL = 1;
/** silence between one playing of the night piece and the next */
const MUSIC_REST = 25;
const nightBuffers = new Map<NightTrack, Promise<AudioBuffer | null>>();
let music: { src: AudioBufferSourceNode; out: GainNode } | null = null;
let musicWanted = false;
let musicChain: GainNode | null = null;
let restTimer: ReturnType<typeof setTimeout> | null = null;

function loadNight(c: AudioContext): Promise<AudioBuffer | null> {
  const which = track;
  let p = nightBuffers.get(which);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}music/${which}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((d) => c.decodeAudioData(d))
      .catch((e) => {
        console.warn('De nachtmuziek kon niet worden geladen:', e);
        nightBuffers.delete(which);
        return null;
      });
    nightBuffers.set(which, p);
  }
  return p;
}

/** Where the sound really begins and ends: an mp3 carries a little digital silence at both ends, which would tick in a loop. */
function trimmed(buf: AudioBuffer): [number, number] {
  const d = buf.getChannelData(0);
  let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < 1e-5) a++;
  while (b > a && Math.abs(d[b]) < 1e-5) b--;
  return [a / buf.sampleRate, (b + 1) / buf.sampleRate];
}

/** Close and clear, with a little of the room around it. */
function musicIn(b: Bus): GainNode {
  if (musicChain) return musicChain;
  const c = b.c;
  const input = c.createGain();
  const high = filter(c, 'highpass', 50, 0.7);
  input.connect(high).connect(gain(c, MUSIC_LEVEL, b.master));
  high.connect(gain(c, 0.12, b.send));
  musicChain = input;
  return input;
}

function startNight(): void {
  const b = A;
  if (!b || muted || music || b.c.state !== 'running') return;
  loadNight(b.c).then((buf) => {
    if (!buf || !A || muted || music || !musicWanted) return;
    const c = b.c, t = c.currentTime + 0.05;
    const spec = TRACKS[track];
    const out = gain(c, 0, musicIn(b));
    out.gain.setTargetAtTime(spec.level, t, 1.2);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    if (spec.loop) {
      // a loop made to go round: all night long, without a seam
      const [from, to] = trimmed(buf);
      src.loop = true;
      src.loopStart = from;
      src.loopEnd = to;
      src.start(t, from);
    } else src.start(t);
    const me = { src, out };
    music = me;
    // when it has played through and it is still night, after a while it begins again
    src.onended = () => {
      if (music !== me) return;
      music = null;
      out.disconnect();
      if (restTimer) clearTimeout(restTimer);
      restTimer = setTimeout(() => {
        restTimer = null;
        if (musicWanted) startNight();
      }, MUSIC_REST * 1000);
    };
  });
}

function stopNight(fade: number): void {
  if (restTimer) {
    clearTimeout(restTimer);
    restTimer = null;
  }
  const m = music;
  if (!m || !A) return;
  music = null;
  const t = A.c.currentTime;
  m.out.gain.cancelScheduledValues(t);
  m.out.gain.setTargetAtTime(0, t, fade / 3);
  try {
    m.src.stop(t + fade + 0.2);
  } catch {
    // already stopped
  }
  setTimeout(() => m.out.disconnect(), (fade + 0.5) * 1000);
}

/** Choose the night music (from the admin panel); a change is heard at once if it is night. */
export function setNightTrack(t: NightTrack): void {
  if (t === track) return;
  track = t;
  stopNight(1.5);
  if (musicWanted) setTimeout(startNight, 1600);
}

export function nightTrack(): NightTrack {
  return track;
}

/** The night piece plays while it is dark, and fades away with the morning. */
export function setNightMusic(on: boolean): void {
  if (on === musicWanted) {
    if (on && !music && !restTimer) startNight();
    return;
  }
  musicWanted = on;
  if (on) startNight();
  else stopNight(5);
}

export function isMuted(): boolean {
  return muted;
}

export function setAmbience(a: Ambience): void {
  amb = { ...a };
  applyAmbience();
  if (active()) loop(); else stopLoop();
}

// ---------- setup ----------

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '0';
  } catch {
    return false;
  }
}

function ensure(): Bus | null {
  if (A || failed) return A;
  try {
    const w = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    const c = new AC();
    const master = c.createGain();
    master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(comp).connect(c.destination);
    const sfxBus = gain(c, SFX_LEVEL, master);
    const duck = gain(c, 1, master);
    const ambBus = gain(c, AMB_LEVEL, duck);
    const verb = c.createConvolver();
    verb.buffer = impulse(c, 2.2);
    verb.connect(gain(c, 0.55, master));
    const send = gain(c, 1, verb);
    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A = { c, master, sfx: sfxBus, amb: ambBus, duck, send, noise, bed: null as unknown as Bed };
    A.bed = buildBed(A);
    setParam(master.gain, muted ? 0 : MASTER, 0.4);
    c.onstatechange = () => {
      if (c.state === 'running') {
        loop();
        if (musicWanted) startNight();
      } else stopLoop();
    };
    applyAmbience();
    loop();
  } catch {
    failed = true;
    A = null;
  }
  return A;
}

function impulse(c: AudioContext, secs: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.35 * ((Math.random() * 2 - 1) - lp);  // darken a little
      d[i] = lp * Math.pow(1 - i / len, 3);
    }
  }
  return buf;
}

function buildBed(b: Bus): Bed {
  const { c } = b;
  // wind: bandpassed noise with two slow gust LFOs on level and colour
  const windBp = filter(c, 'bandpass', 450, 0.7);
  const wind = gain(c, 0, b.amb);
  noiseSrc(b, 0, 0, true).connect(windBp).connect(filter(c, 'lowpass', 1400, 0.5)).connect(wind);
  const windDepth = gain(c, 0);
  windDepth.connect(wind.gain);
  const fDepth = gain(c, 160);
  fDepth.connect(windBp.frequency);
  for (const [f, a] of [[0.071, 1], [0.163, 0.6]]) {
    const l = osc(c, 'sine', f);
    const s = gain(c, a);
    l.connect(s);
    s.connect(windDepth);
    s.connect(fDepth);
    l.start();
  }
  // brook: two bandpassed noise bands whose centres wobble
  const brook = gain(c, 0, b.amb);
  const brookLp = filter(c, 'lowpass', 2200, 0.5);
  brookLp.connect(brook);
  for (const [f, q, rate, depth, a] of [[700, 1.5, 0.37, 220, 1], [1600, 3, 1.9, 380, 0.5]]) {
    const bp = filter(c, 'bandpass', f, q);
    noiseSrc(b, 0, 0, true).connect(bp).connect(gain(c, a)).connect(brookLp);
    const l = osc(c, 'sine', rate);
    l.connect(gain(c, depth)).connect(bp.frequency);
    l.start();
  }
  // crickets: high carrier gated by a fast and a slow square
  const crickets = gain(c, 0, b.amb);
  const chirp = gain(c, 0.5, crickets);
  const pulse = gain(c, 0.5, chirp);
  for (const [f, a] of [[4300, 1], [4370, 0.5]]) {
    const o = osc(c, 'sine', f);
    o.connect(gain(c, a, pulse));
    o.start();
  }
  for (const [f, p] of [[27, pulse], [1.3, chirp]] as [number, GainNode][]) {
    const l = osc(c, 'square', f);
    l.connect(gain(c, 0.5)).connect(p.gain);
    l.start();
  }
  return { wind, windDepth, windBp, brook, crickets };
}

function applyAmbience(): void {
  if (!A || !amb) return;
  const { bed } = A;
  const { season, paused, water } = amb;
  const night = !!amb.night;
  const w = [0.05, 0.028, 0.085, 0.1][season] * (night ? 1.2 : 1);
  setParam(bed.wind.gain, w, 2);
  setParam(bed.windDepth.gain, w * 0.45, 2);
  setParam(bed.windBp.frequency, [480, 380, 430, 560][season], 3);
  setParam(bed.windBp.Q, [0.7, 0.5, 1.1, 2.2][season], 3);
  setParam(bed.brook.gain, water ? (season === 3 ? 0.012 : 0.035) : 0, 2);
  const cr = season === 1 ? (night ? 0.012 : 0.005) : season === 0 && night ? 0.003 : 0;
  setParam(bed.crickets.gain, cr, 2);
  setParam(A.duck.gain, paused ? DUCK : 1, 0.4);
}

// ---------- random ambience events ----------

function active(): boolean {
  return !!A && A.c.state === 'running' && !muted && !!amb && !amb.paused;
}

function stopLoop(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function loop(): void {
  if (timer !== null || !active()) return;
  const now = performance.now() / 1000;
  if (due.bird < now) due.bird = now + rand(2, 8);
  if (due.owl < now) due.owl = now + rand(15, 40);
  if (due.creak < now) due.creak = now + rand(2, 8);
  if (due.toll < now) due.toll = now + rand(15, 60);
  timer = setTimeout(step, 600);
}

function step(): void {
  timer = null;
  if (!active() || !A || !amb) return;
  const now = performance.now() / 1000;
  const t = A.c.currentTime + 0.05;
  const night = !!amb.night;
  try {
    if (now >= due.bird && amb.season <= 1 && !night) { birdsong(A, t); due.bird = now + rand(4, 15); }
    if (now >= due.owl && night && amb.season !== 3) { owl(A, t); due.owl = now + rand(25, 60); }
    if (now >= due.creak && amb.mill) { creak(A, t); due.creak = now + rand(6, 10); }
    if (now >= due.toll && amb.church) { toll(A, t); due.toll = now + rand(40, 90); }
  } catch {
    // ignore
  }
  timer = setTimeout(step, rand(400, 900));
}

function birdsong(b: Bus, t: number): void {
  const { c } = b;
  const out = pan(c, rand(-0.7, 0.7), b.amb);
  const base = rand(2600, 4200);
  const up = Math.random() < 0.5;
  for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
    const d = rand(0.04, 0.09);
    const f = base * vary(1, 0.08);
    const o = osc(c, 'sine', f);
    o.frequency.setValueAtTime(f * (up ? 0.8 : 1.25), t);
    o.frequency.exponentialRampToValueAtTime(f, t + d);
    const g = gain(c, 0, out);
    o.connect(g);
    env(g.gain, t, 0.006, rand(0.012, 0.022), d);
    play(o, t, d + 0.05);
    t += d + rand(0.03, 0.09);
  }
}

function owl(b: Bus, t: number): void {
  const { c } = b;
  const out = pan(c, rand(-0.8, 0.8), b.amb);
  out.connect(gain(c, 0.5, b.send));
  const f = rand(360, 400);
  for (const [dt, d] of [[0, 0.3], [0.55, 0.6]]) {
    const o = osc(c, 'sine', f);
    o.frequency.setValueAtTime(f * 1.03, t + dt);
    o.frequency.exponentialRampToValueAtTime(f * 0.95, t + dt + d);
    const g = gain(c, 0, out);
    o.connect(filter(c, 'lowpass', 800, 0.5)).connect(g);
    env(g.gain, t + dt, 0.06, 0.022, d);
    play(o, t + dt, d + 0.1);
  }
}

function creak(b: Bus, t: number): void {
  const { c } = b;
  const d = rand(0.6, 1);
  const f = vary(95, 0.15);
  const o = osc(c, 'sawtooth', f);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 0.75, t + d);
  const am = gain(c, 0.5);
  const slip = osc(c, 'square', rand(14, 22));
  slip.connect(gain(c, 0.5)).connect(am.gain);
  const g = gain(c, 0, pan(c, rand(-0.5, 0.5), b.amb));
  o.connect(am).connect(filter(c, 'bandpass', rand(500, 800), 6)).connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  play(o, t, d + 0.05);
  play(slip, t, d + 0.05);
}

function toll(b: Bus, t: number): void {
  bell(b, vary(196, 0.01), t, { g: 0.06, dur: 4, wet: 0.9, lp: 700, p: CHURCH, dest: pan(b.c, rand(-0.4, 0.4), b.amb) });
}

// ---------- sound effects ----------

/**
 * The midwinter horn: a long wooden horn blown over a well from Advent to Epiphany, in Twente and the Achterhoek.
 * It plays only the notes of its natural harmonics, breathy, rising and falling, far off.
 */
function hoorn(b: Bus, t: number): void {
  const c = b.c, base = 98;
  const phrase: [number, number][] = [[4, 0.7], [5, 0.5], [6, 1.1], [5, 0.45], [4, 0.6], [6, 0.5], [8, 1.4], [6, 1.6]];
  const out = gain(c, 0, b.amb);
  const far = filter(c, 'lowpass', 1100, 0.6);
  far.connect(out);
  far.connect(gain(c, 0.9, b.send));
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.16, t + 0.3);
  let at = t;
  for (const [h, dur] of phrase) {
    const o = osc(c, 'sawtooth', base * h);
    const shape = filter(c, 'lowpass', 600 + h * 60, 1.2);
    const env2 = gain(c, 0, far);
    o.connect(shape).connect(env2);
    // each note swells in with breath and a slight scoop up to the pitch
    o.frequency.setValueAtTime(base * h * 0.97, at);
    o.frequency.linearRampToValueAtTime(base * h, at + 0.12);
    env2.gain.setValueAtTime(0.0001, at);
    env2.gain.exponentialRampToValueAtTime(0.5, at + 0.09);
    env2.gain.setTargetAtTime(0.32, at + 0.1, dur * 0.4);
    env2.gain.setTargetAtTime(0.0001, at + dur - 0.06, 0.05);
    o.start(at);
    o.stop(at + dur + 0.2);
    o.onended = () => o.disconnect();
    const breath = noiseSrc(b, at, dur + 0.1);
    const bp = filter(c, 'bandpass', base * h * 2, 3);
    breath.connect(bp).connect(gain(c, 0.05, env2));
    at += dur + 0.06;
  }
  out.gain.setTargetAtTime(0, at, 0.4);
}

const PLAY: Record<Sfx, (b: Bus, t: number) => void> = {
  hoorn,
  click(b, t) {
    const { c } = b;
    const g = gain(c, 0, b.sfx);
    noiseSrc(b, t, 0.05).connect(filter(c, 'bandpass', vary(3200, 0.1), 1.2)).connect(g);
    env(g.gain, t, 0.002, vary(0.1, 0.15), 0.03);
    const o = osc(c, 'triangle', vary(1900, 0.04));
    const og = gain(c, 0, b.sfx);
    o.connect(og);
    env(og.gain, t, 0.001, 0.03, 0.025);
    play(o, t, 0.05);
  },

  build(b, t) {
    const { c } = b;
    const f = vary(150, 0.06);
    const o = osc(c, 'sine', f);
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const g = gain(c, 0, b.sfx);
    o.connect(g);
    env(g.gain, t, 0.004, vary(0.35, 0.1), 0.18);
    play(o, t, 0.25);
    const o2 = osc(c, 'triangle', f * 2.7);
    const g2 = gain(c, 0, b.sfx);
    o2.connect(g2);
    env(g2.gain, t, 0.002, 0.07, 0.06);
    play(o2, t, 0.1);
    const gn = gain(c, 0, b.sfx);
    noiseSrc(b, t, 0.06).connect(filter(c, 'lowpass', 1200, 0.7)).connect(gn);
    env(gn.gain, t, 0.001, 0.12, 0.04);
  },

  road(b, t) {
    const { c } = b;
    const level = vary(1, 0.25);
    for (let i = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++) {
      const g = gain(c, 0, b.sfx);
      const d = rand(0.02, 0.04);
      noiseSrc(b, t, d + 0.02).connect(filter(c, 'bandpass', rand(1500, 3500), 1.5)).connect(g);
      env(g.gain, t, 0.002, rand(0.025, 0.045) * level, d);
      t += vary(0.022, 0.3);
    }
  },

  sighting(b, t) {
    const { c } = b;
    const r = vary(659.25, 0.015);
    bell(b, r, t, { g: 0.09, dur: 2.2, wet: 0.7 });
    bell(b, r * 1.1892, t + 0.14, { g: 0.06, dur: 2, wet: 0.7 });
    // glassy overtone with a slow wobble
    const o = osc(c, 'sine', r * 2);
    const vib = osc(c, 'sine', 5);
    vib.connect(gain(c, 4)).connect(o.frequency);
    const g = gain(c, 0, b.sfx);
    g.connect(gain(c, 0.8, b.send));
    o.connect(g);
    env(g.gain, t, 0.3, 0.018, 1.2);
    play(o, t, 1.6);
    play(vib, t, 1.6);
  },

  mutation(b, t) {
    const { c } = b;
    const f = vary(587.3, 0.02);
    const f2 = f * (Math.random() < 0.5 ? 1.335 : 0.749);
    const trem = gain(c, 0.7, b.sfx);
    trem.connect(gain(c, 0.4, b.send));
    const lfo = osc(c, 'sine', 9);
    lfo.connect(gain(c, 0.3)).connect(trem.gain);
    play(lfo, t, 1);
    for (const [mul, det, a] of [[1, -5, 0.05], [1, 5, 0.05], [2, 0, 0.012]]) {
      const o = osc(c, 'sine', f * mul);
      o.detune.value = det;
      o.frequency.setValueAtTime(f * mul, t + 0.14);
      o.frequency.exponentialRampToValueAtTime(f2 * mul, t + 0.26);
      const g = gain(c, 0, trem);
      o.connect(g);
      env(g.gain, t, 0.02, a, 0.75);
      play(o, t, 0.85);
    }
  },

  record(b, t) {
    const { c } = b;
    for (let i = 0, n = 3 + Math.floor(Math.random() * 3); i < n; i++) {
      const d = rand(0.04, 0.1);
      const f = rand(2600, 4200);
      const bp = filter(c, 'bandpass', f, 2.5);
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.exponentialRampToValueAtTime(f * rand(0.7, 1.3), t + d);
      const g = gain(c, 0, b.sfx);
      noiseSrc(b, t, d + 0.03).connect(filter(c, 'highpass', 1500, 0.7)).connect(bp).connect(g);
      env(g.gain, t, 0.008, rand(0.03, 0.05), d);
      t += d + rand(0.03, 0.09);
    }
  },

  collector(b, t) {
    const f = vary(1244, 0.01);
    const hits: [number, number, number][] = [[0, 1, 1], [0.18, 0.89, 0.7], [0.36, 1, 0.85], [0.62, 0.89, 0.5]];
    for (const [dt, r, a] of hits) bell(b, f * r, t + dt + rand(0, 0.03), { g: 0.045 * a, dur: 1.1, wet: 0.35 });
  },

  death(b, t) {
    bell(b, vary(146.8, 0.01), t, { g: 0.28, dur: 5, wet: 0.6, lp: 900, p: CHURCH });
  },

  era(b, t) {
    const { c } = b;
    const lp = filter(c, 'lowpass', 180, 0.8);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.9);
    lp.frequency.exponentialRampToValueAtTime(150, t + 2.2);
    const g = gain(c, 0, b.sfx);
    g.connect(gain(c, 0.3, b.send));
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    for (const [f, a] of [[55, 1], [82.5, 0.7], [110.3, 0.6], [130.8, 0.25]]) {
      const o = osc(c, 'sawtooth', f * vary(1, 0.003));
      o.connect(gain(c, a, lp));
      play(o, t, 2.3);
    }
    const gn = gain(c, 0.4, lp);
    noiseSrc(b, t, 2.3).connect(filter(c, 'lowpass', 200, 0.7)).connect(gn);
  },

  page(b, t) {
    const { c } = b;
    const d = vary(0.32, 0.1);
    const bp = filter(c, 'bandpass', 500, 0.9);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(1400, t + d);
    const crinkle = gain(c, 0.7);
    const lfo = osc(c, 'square', rand(18, 28));
    lfo.connect(gain(c, 0.3)).connect(crinkle.gain);
    play(lfo, t, d + 0.05);
    const g = gain(c, 0, b.sfx);
    noiseSrc(b, t, d + 0.05).connect(bp).connect(crinkle).connect(g);
    const p = vary(0.09, 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(p, t + d * 0.35);
    g.gain.linearRampToValueAtTime(p * 0.45, t + d * 0.6);
    g.gain.linearRampToValueAtTime(p * 0.75, t + d * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const flap = gain(c, 0, b.sfx);
    noiseSrc(b, t + d * 0.85, 0.12).connect(filter(c, 'lowpass', 300, 0.7)).connect(flap);
    env(flap.gain, t + d * 0.85, 0.005, 0.06, 0.08);
  },

  end(b, t) {
    const notes: [number, number, number][] = [[440, 0, 3], [349.23, 0.9, 3], [293.66, 1.9, 4.5]];
    for (const [f, dt, dur] of notes) bell(b, f, t + dt, { g: 0.12, dur, wet: 0.6, lp: 3000 });
  },
};

// ---------- building blocks ----------

interface BellOpts { g: number; dur: number; wet?: number; lp?: number; p?: Partials; dest?: AudioNode }

function bell(b: Bus, f: number, t: number, o: BellOpts): void {
  const { c } = b;
  const dest = o.dest ?? b.sfx;
  const out = gain(c, o.g);
  if (o.lp) out.connect(filter(c, 'lowpass', o.lp, 0.5)).connect(dest); else out.connect(dest);
  if (o.wet) out.connect(gain(c, o.wet, b.send));
  (o.p ?? BELL).forEach(([r, a], i) => {
    if (f * r > 15000) return;
    const d = o.dur / (1 + i * 0.9);
    const s = osc(c, 'sine', f * r);
    s.detune.value = rand(-3, 3);
    const g = gain(c, 0, out);
    s.connect(g);
    env(g.gain, t, 0.003, a, d);
    play(s, t, d + 0.05);
  });
  // strike
  const gs = gain(c, 0, out);
  noiseSrc(b, t, 0.03).connect(filter(c, 'bandpass', Math.min(f * 3, 9000), 4)).connect(gs);
  env(gs.gain, t, 0.001, 0.15, 0.02);
}

function gain(c: AudioContext, v: number, dest?: AudioNode): GainNode {
  const g = c.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

function osc(c: AudioContext, type: OscillatorType, f: number): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  return o;
}

function filter(c: AudioContext, type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function pan(c: AudioContext, x: number, dest: AudioNode): AudioNode {
  if (typeof c.createStereoPanner !== 'function') return dest;
  const p = c.createStereoPanner();
  p.pan.value = x;
  p.connect(dest);
  return p;
}

// Looping white noise from the shared buffer, starting at a random offset.
function noiseSrc(b: Bus, t: number, dur: number, forever = false): AudioBufferSourceNode {
  const s = b.c.createBufferSource();
  s.buffer = b.noise;
  s.loop = true;
  s.start(t, Math.random() * 1.9);
  if (!forever) {
    s.stop(t + dur);
    s.onended = () => s.disconnect();
  }
  return s;
}

function play(s: OscillatorNode, t: number, dur: number): void {
  s.start(t);
  s.stop(t + dur);
  s.onended = () => s.disconnect();
}

function env(p: AudioParam, t: number, attack: number, peak: number, decay: number): void {
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function setParam(p: AudioParam, v: number, tc: number): void {
  if (!A || targets.get(p) === v) return;
  targets.set(p, v);
  p.setTargetAtTime(v, A.c.currentTime, tc);
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function vary(x: number, amt: number): number {
  return x * (1 + (Math.random() * 2 - 1) * amt);
}
