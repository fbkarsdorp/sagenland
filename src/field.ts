// The collector's season in the field: days of travelling, visits and listening, what people tell you
// about one another, and what got written down. The story world itself runs in the Sim, out of sight.
//
// Much of how the field behaves follows the history of Dutch folktale collecting: tellers who laugh off
// the collector's questions or fear being laughed at (Dykstra, Wolf), shy tellers with great memories who
// answer a named tale with 'no, but I do know…' (Jaarsma and Mrs Kobus), tales that come back in pieces
// over several visits (Poortinga), appeals in the papers that bring in a few correspondents (Dykstra,
// Boekenoogen), a tale from the rower on a night trip (Bakker), and a rival who calls on your best tellers
// (Poortinga and Jaarsma). See A.J. Dekker 1978, T. Dekker 1998, Meder & Venbrux 2005.
import type { Corpus } from './data';
import { Rng } from './rng';
import { Sim, type Narrator } from './sim';
import { SITE, VILLAGE, generateLand, type Land, type Site } from './land';
import { W, idx, inb, placeRoadTile, roadPath } from './world';
import { placeNames } from './text';

export const PARTS = ['ochtend', 'middag', 'avond'] as const;
/** Each part of the day has two stretches of about two hours: a visit takes one, a journey as many as it needs. */
export const HOURS: [number, number][] = [[9, 11], [13, 15], [19, 21]];
export function clockTime(part: number, slot: number): string {
  return `${HOURS[part][Math.min(1, slot)]}.00 uur`;
}
/** A duration in stretches of two hours, in words. */
export function durationText(halves: number): string {
  return halves === 1 ? 'twee uur' : halves === 2 ? 'vier uur' : halves === 3 ? 'zes uur' : `${halves * 2} uur`;
}
export const DAYS = 12;
const BURN_YEARS = 8;

export type Where = { kind: 'place'; id: number } | { kind: 'site'; id: number };

/** Who you are in the field: modelled on the collecting patterns in the archive's metadata. */
export const PERSONA: Record<string, { travel: string; verb: string; speed: number; year: number; perk: string; title: string }> = {
  volhouder: { travel: 'fiets', verb: 'fietsen', speed: 22, year: 1952, title: 'meneer', perk: 'Wie u een keer gesproken hebt, vertrouwt u sneller.' },
  rondreiziger: { travel: 'auto', verb: 'rijden', speed: 36, year: 1963, title: 'meneer', perk: 'Met de bandrecorder neemt u op wat er verteld wordt, soms ook een tweede verhaal. Maar niet iedereen praat vrij tegen dat apparaat.' },
  student: { travel: 'voet', verb: 'lopen', speed: 13, year: 1968, title: 'jongeman', perk: 'In uw eigen dorp kent iedereen u al.' },
  notabele: { travel: 'rijtuig', verb: 'rijden', speed: 18, year: 1905, title: 'dokter', perk: 'Als dokter komt u bij de zieken binnen, en die vertellen u veel. Maar voor de dokter houden de mensen hun bijgeloof liever verborgen.' },
};

/** Tales people do not tell a stranger. */
const SHY = new Set(['heks', 'mare', 'voorgezicht', 'tovenaar']);

/** How a teller takes to the collector. */
export type Temper = 'schuchter' | 'verteller' | 'gelovig' | 'spotter';
export const TEMPER: Record<Temper, { name: string; hint: string }> = {
  schuchter: { name: 'schuchter, maar weet veel', hint: 'Vertelt niet zomaar. Noem een verhaal dat u kent: dan komt er vaak iets boven.' },
  verteller: { name: 'een rasverteller', hint: 'Vertelt graag en goed, liefst iets om om te lachen. Gelooft er zelf niet zo in.' },
  gelovig: { name: 'gelooft wat er verteld wordt', hint: 'Vertelt het als iets wat echt gebeurd is, maar is bang om uitgelachen te worden.' },
  spotter: { name: 'lacht om oudewijvenpraat', hint: 'Weet zelf niet veel, maar weet wel wie er wat weet.' },
};

export type Via = 'bezoek' | 'avond' | 'buurten' | 'onderweg' | 'brief';

export interface Entry {
  num: number;
  node: number;
  t: string;
  n: number;
  narrator: number;
  place: number;
  site: number | null;
  day: number;
  part: number;
  kind: 'new' | 'version' | 'same';
  /** only part of it came back; another visit may bring the rest */
  frag: boolean;
  via: Via;
  /** nobody else in the region knew it when you wrote it down */
  rare: boolean;
  /** the lost tale of the trail of clues */
  quest?: boolean;
  /** how many people in the region knew this tale, and this very version, when you wrote it down */
  holders: number;
  vholders: number;
  /** the other collector already had this tale */
  scoop: boolean;
}

export interface Lead {
  id: number;
  kind: 'person' | 'site' | 'evening' | 'place' | 'quest';
  lines: string[];
  at: Where;
  narrator: number | null;
  source: string;
  day: number;
  done: boolean;
}

export interface Diary {
  day: number;
  part: number;
  text: string;
  kind: 'travel' | 'visit' | 'death' | 'evening' | 'arrive' | 'day' | 'letter' | 'rival';
}

/** A storytelling occasion: the evening at the inn, or neighbours gathering at a farm. */
export interface Occasion {
  kind: 'herberg' | 'buurten';
  place: number;
  day: number;
  host: number | null;
  known: boolean;
  attended: boolean;
}

export interface Letter {
  day: number;
  from: number | null;
  text: string;
  entries: Entry[];
  lead: Lead | null;
  read: boolean;
}

export interface Encounter {
  /** index in the travelled tiles where the meeting happens */
  at: number;
  narrator: number;
  who: string;
  entry: Entry | null;
  lines: string[];
}

export type Ask = { kind: 'theme'; being: string } | { kind: 'free' } | { kind: 'others' } | { kind: 'prompt'; t: string } | { kind: 'again'; num: number } | { kind: 'eigen' };
/** A move in a conversation: warming up, or asking. */
export type Move = Ask | { kind: 'praat' } | { kind: 'leven' } | { kind: 'verloren' };

/**
 * The lost tale: a rare tale only one person in the region still knows, found by following a trail of clues.
 * An old man or woman at the lodgings knows only how it begins, and whose it was; her grave says where she came
 * from; at that place, after dark, you learn where her sister's family went; and there you must recognise the one
 * who still has it, by what they wear.
 */
export interface Quest {
  t: string;
  n: number;
  /** the grandmother whose tale it was */
  grand: string;
  starter: number;
  church: number;
  site: number;
  village: number;
  target: number;
  mark: 'oorijzer' | 'pijp';
  /** 0: not begun, 1: heard the beginning, 2: found the grave, 3: learnt where the family went, 4: found it */
  stage: number;
  clues: string[];
  /** the beginning of the tale, as the starter told it */
  opening: string;
  hinted: boolean;
}

/** Bonus for the lost tale, on top of what it is worth as a rare tale. */
export const QUEST_BONUS = 10;

export interface TalkLine {
  who: 'u' | 'zij' | 'info';
  text: string;
  /** the beginning of the lost tale */
  opening?: string;
  entry?: Entry;
  lead?: Lead;
}

/** A visit: a few moves to make, and how open the other is at this moment. */
export interface Talk {
  nid: number;
  open: number;
  start: number;
  moves: number;
  used: Map<string, number>;
  lines: TalkLine[];
  entries: Entry[];
  ended: boolean;
  /** told to go: no more moves */
  closed: boolean;
}

export const OPEN_WORDS: [number, string][] = [[0.25, 'afwachtend'], [0.45, 'ontdooit wat'], [0.65, 'op het gemak'], [1.01, 'vertrouwelijk']];
export function openWord(o: number): string {
  return OPEN_WORDS.find(([t]) => o < t)?.[1] ?? 'vertrouwelijk';
}

/** Points for the archive: what makes a collection worth something. */
export const POINTS = { same: 0, frag: 1, version: 1, ownVersion: 1, unique: 4, few: 2, saved: 2, chapter: 5 };

/**
 * How rare a kind of tale is in the whole Verhalenbank: a quarter of the types were written down a dozen times
 * or fewer. Finding one of those is what collectors hoped for ('maybe it is very rare', Poortinga wrote to Voskuil).
 */
export type Tier = 'bekend' | 'ongewoon' | 'zeldzaam';
export const TIER: Record<Tier, { nl: string; pts: number }> = {
  bekend: { nl: 'bekend', pts: 1 },
  ongewoon: { nl: 'ongewoon', pts: 3 },
  zeldzaam: { nl: 'zeldzaam', pts: 6 },
};
export const CHAPTER_NEED = 3;

export interface VisitResult {
  lines: string[];
  entries: Entry[];
  lead: Lead | null;
  trust: [number, number];
}

/** The time of year of the twelve days. Most collecting was done in autumn and winter, when the work on the land was done. */
export type Season = 'lente' | 'zomer' | 'herfst' | 'winter';
export const SEASON_NAME: Record<Season, string> = { lente: 'voorjaar', zomer: 'zomer', herfst: 'najaar', winter: 'winter' };
/** the week of the year the twelve days begin, for the world's own calendar */
const SEASON_WEEK: Record<Season, number> = { lente: 4, zomer: 17, herfst: 30, winter: 43 };

/** The weather of a day in the field: in autumn as often wet as dry, with mist over the low ground some mornings. */
export type Weather = 'helder' | 'bewolkt' | 'regen' | 'mist' | 'sneeuw';
export const WEATHER: Record<Weather, { name: string; line: string }> = {
  helder: { name: 'helder', line: 'Een heldere herfstdag. Wie kan, is op het land.' },
  bewolkt: { name: 'bewolkt', line: 'Grijs en stil. Het blad valt.' },
  regen: { name: 'regen', line: 'Het regent. Op de wegen is het modder, maar de mensen zitten binnen bij de kachel.' },
  mist: { name: 'mist', line: 'Mist over het veen en de heide. Buiten de wegen verdwaal je zo.' },
  sneeuw: { name: 'sneeuw', line: 'Er is sneeuw gevallen. Niemand is op het land; de wegen zijn glad en stil.' },
};
/** What a day's weather is like in each season, for the morning's card. */
const WEATHER_LINE: Record<Season, Partial<Record<Weather, string>>> = {
  lente: {
    helder: 'Een zachte voorjaarsdag. Er wordt geploegd en gezaaid; wie kan, is op het land.',
    bewolkt: 'Grijs, maar zacht. De eerste bloesem staat aan de bomen.',
    regen: 'Een voorjaarsbui. De mensen schuilen binnen, de wegen zijn zacht.',
    mist: 'Ochtendmist over de natte weiden. Buiten de wegen verdwaal je zo.',
  },
  zomer: {
    helder: 'Een warme zomerdag. Het is oogsttijd: bijna iedereen is op het land.',
    bewolkt: 'Drukkend en grijs. Op het land wordt doorgewerkt.',
    regen: 'Een zomerse onweersbui. Het werk ligt stil; de mensen zijn thuis.',
    mist: 'Nevel over het veen in de vroege ochtend. Hij trekt snel op.',
  },
  herfst: {},
  winter: {
    helder: 'Een heldere vriesdag. Er is weinig werk op het land; de mensen zitten bij de kachel.',
    bewolkt: 'Grijs en guur. Het wordt vroeg donker, en dan wordt er verteld.',
    regen: 'Natte sneeuw en regen. Niemand gaat de deur uit die niet hoeft.',
    mist: 'IJzige mist over het land. Buiten de wegen verdwaal je zo.',
  },
};
/**
 * How dark it is (0: day, about 0.6: night) at a time of day in a season and weather. A summer evening stays light
 * until late; on a winter afternoon the dusk already comes at three.
 */
export function darkness(season: Season, weather: Weather, part: number, slot: number): number {
  const night = weather === 'regen' ? 0.72 : weather === 'sneeuw' ? 0.5 : 0.62;
  // late afternoon, early evening, late evening
  const dark: Record<Season, [number, number, number]> = {
    lente: [0, 0.3, night],
    zomer: [0, 0.16, 0.5],
    herfst: [0, 0.45, night],
    winter: [0.3, 0.55, night + 0.06],
  };
  const [dusk, eve, deep] = dark[season];
  return part === 2 ? (slot === 1 ? deep : eve) : part === 1 && slot === 1 ? dusk : 0;
}
/** Dark enough for the lamps and the lamplight in the windows. */
export const DARK = 0.35;

/**
 * Night, as distinct from the evening: the late stretch of the evening (21.00), and in winter, when the sun has
 * set by half past four, the whole evening. Only at night do the things that are seen come out, and the music plays.
 */
export function nightAt(season: Season, part: number, slot: number): boolean {
  return part === 2 && (slot === 1 || season === 'winter');
}
/** The name of a time of day: the late evening is the night. */
export function partName(part: number, slot = 0): string {
  return part === 2 && slot === 1 ? 'nacht' : PARTS[part];
}

export function weatherLine(season: Season, w: Weather): string {
  return WEATHER_LINE[season][w] ?? WEATHER[w].line;
}

/** What is seen at night at a place tales are tied to, and what kind of tale it belongs to. */
export const APPARITION: Record<string, { being: string; seen: string }> = {
  veen: { being: 'dwaallicht', seen: 'Boven het veen dansen lichtjes, nu eens hier, dan weer daar. Als u beter kijkt, zijn ze weg.' },
  heide: { being: 'witte_wieven', seen: 'Bij de stenen op de heide staat iets wits in de nevel. Even later is het er niet meer.' },
  galg: { being: 'spook', seen: 'Onder de galg staat een gestalte. U knippert met uw ogen, en er is niemand.' },
  bos: { being: 'spookdier', seen: 'Aan de rand van het bos kijken twee gloeiende ogen u aan. Dan kraakt er een tak en zijn ze weg.' },
  water: { being: 'watergeest', seen: 'Bij het veer rimpelt het water, terwijl er geen wind staat.' },
  kruisweg: { being: 'duivel', seen: 'Op de kruisweg staat een zwarte man die u nakijkt. Als u omkijkt, is de weg leeg.' },
  linde: { being: 'heks', seen: 'Onder de linde bewegen schimmen in een kring, alsof er gedanst wordt.' },
};

export interface Known {
  x: number;
  y: number;
  r: number;
}

/** Another collector in the region, calling on the tellers you found. */
export interface Rival {
  who: string;
  travel: string;
  at: number;
  from: number | null;
  /** where the rival goes tomorrow: the landlady hears these things */
  next: number | null;
  since: number;
  visited: Map<number, number>;
  got: { t: string; narrator: number; day: number }[];
}

export function newField(corpus: Corpus, archetype: string, seed: number, lodging?: string, season: Season = 'herfst'): Field {
  const region = corpus.region;
  const rng = new Rng(seed);
  const names = placeNames(region, rng).filter((n) => n !== lodging);
  if (lodging) names.unshift(lodging);
  const land = generateLand(rng, region, names);
  const persona = PERSONA[archetype] ?? PERSONA.volhouder;
  const sim = new Sim({ corpus, archetype, seed, map: land, startYear: persona.year - BURN_YEARS, quiet: true });
  for (const s of land.sites) {
    if (s.hut === null) continue;
    for (const n of sim.alive()) if (n.home === s.hut) sim.seedFromAttractor(n, SITE[s.kind].attract, 2 + rng.int(3));
  }
  // let the world settle into its own shape before the collector arrives, in the season of the visit
  for (let w = 0; w < BURN_YEARS * 52 + SEASON_WEEK[season]; w++) sim.tick();
  return new Field(sim, land, archetype, season);
}

export class Field {
  readonly rng: Rng;
  readonly persona: (typeof PERSONA)[string];
  day = 1;
  part = 0;
  /** which of the two stretches of the part of the day */
  slot = 0;
  over = false;
  at: Where = { kind: 'place', id: 0 };
  /** tiles walked, in order */
  trail: number[] = [];
  known: Known[] = [];
  trust = new Map<number, number>();
  introduced = new Set<number>();
  met = new Set<number>();
  visits = new Map<number, number>();
  toldUs = new Map<number, Set<string>>();
  notebook: Entry[] = [];
  leads: Lead[] = [];
  diary: Diary[] = [];
  ill = new Set<number>();
  /** who died while you were in the field, and what they knew that you had not written down */
  lost: { narrator: number; day: number; types: string[] }[] = [];
  occasions: Occasion[] = [];
  letters: Letter[] = [];
  appealDay: number | null = null;
  rival: Rival | null = null;
  /** themes asked about, for the end */
  asked = new Map<string, number>();
  quest: Quest | null = null;
  /** the chapters of your sagenboek: the region's most told kinds of tale */
  chapters: string[] = [];
  /** the last journey's meeting on the road, for the scene and the HTML layer */
  encounter: Encounter | null = null;
  visitedPlaces = new Set<number>([0]);
  /** the time the last journey set out, and how many parts of the day it took */
  departed: { day: number; part: number; slot: number; parts: number; footStart: number; footEnd: number } | null = null;
  /** the weather, day by day */
  weathers: Weather[] = [];
  /** sites where you have seen something */
  seen = new Set<number>();
  visitedSites = new Set<number>();
  /** the passer-by met at an open site, per day */
  private passers = new Map<string, number | null>();
  private metOnRoad = -1;
  private listeners: (() => void)[] = [];

  constructor(readonly sim: Sim, readonly land: Land, readonly archetype: string, readonly season: Season = 'herfst') {
    this.rng = new Rng(sim.seed ^ 0x5eed);
    this.persona = PERSONA[archetype] ?? PERSONA.volhouder;
    const home = land.places[0];
    this.known.push({ x: home.x, y: home.y, r: 6 });
    this.trail.push(idx(home.x, home.y));

    // the old and ill, away from the lodgings: the reason not to wait
    const old = sim.alive().filter((n) => this.age(n) >= 74 && n.know.size >= 3 && n.place !== 0 && !this.isLoner(n))
      .sort((a, b) => b.know.size - a.know.size);
    for (const n of old.slice(0, 3)) this.ill.add(n.id);

    // a storytelling evening at an inn, known from the start; neighbours gathering at a farm, to be found out
    const inns = land.places.filter((p) => p.id !== 0 && sim.placeBuildings(p.id).some((b) => b.kind === 'herberg'));
    const ev = inns.length ? this.rng.pick(inns) : land.places[0];
    this.occasions.push({ kind: 'herberg', place: ev.id, day: 4 + this.rng.int(4), host: null, known: true, attended: false });
    const farms = land.places.filter((p) => p.id !== ev.id && p.id !== 0 && sim.alive(p.id).length >= 6);
    const bp = farms.length ? this.rng.pick(farms) : land.places[1] ?? land.places[0];
    const elders = sim.alive(bp.id).filter((n) => !this.isLoner(n)).sort((a, b) => b.know.size * b.talent - a.know.size * a.talent);
    let bday = 3 + this.rng.int(7);
    if (bday === this.occasions[0].day) bday++;
    this.occasions.push({ kind: 'buurten', place: bp.id, day: bday, host: elders[0]?.id ?? null, known: false, attended: false });
    this.chapters = this.themes().slice(0, 6);
    // the weather for all twelve days, with spells: a wet day is often followed by another
    const odds: Record<Season, Partial<Record<Weather, number>>> = {
      lente: { helder: 4, bewolkt: 3, regen: 2.5, mist: 0.8 },
      zomer: { helder: 6, bewolkt: 2.5, regen: 1.4, mist: 0.4 },
      herfst: { helder: 3, bewolkt: 3, regen: 3, mist: 1.4 },
      winter: { helder: 2.5, bewolkt: 3, regen: 1.2, mist: 1.4, sneeuw: 2.6 },
    };
    const kinds = Object.keys(odds[season]) as Weather[];
    let w: Weather = 'bewolkt';
    for (let d = 0; d <= DAYS; d++) {
      if (!this.rng.chance(0.45)) w = this.rng.weighted<Weather>(kinds, (x) => odds[season][x] ?? 0)!;
      this.weathers.push(w);
    }
    if (this.weathers[1] === 'regen' || this.weathers[1] === 'sneeuw') this.weathers[1] = 'bewolkt';
    this.firstLeads();
    this.quest = this.makeQuest();
    this.write('arrive', `Aangekomen in ${home.name}. ${cap(this.lodgingLine())}`);
  }

  on(fn: () => void) {
    this.listeners.push(fn);
  }
  changed() {
    for (const f of this.listeners) f();
  }

  /** The evening at the inn (kept for the parts of the game that only know about that one). */
  get evening(): Occasion {
    return this.occasions[0];
  }

  // ------------------------------------------------------------------ who and where

  get region() {
    return this.sim.corpus.region;
  }
  get year() {
    return this.sim.year;
  }
  age(n: Narrator) {
    return this.year - n.born;
  }
  isLoner(n: Narrator) {
    return this.sim.map.buildings[n.home]?.kind === 'hut';
  }
  siteOf(n: Narrator): Site | null {
    return this.land.sites.find((s) => s.hut === n.home) ?? null;
  }
  whereIs(n: Narrator): Where {
    const s = this.siteOf(n);
    return s ? { kind: 'site', id: s.id } : { kind: 'place', id: n.place };
  }
  whereName(w: Where): string {
    return w.kind === 'place' ? this.land.places[w.id].name : cap(this.land.sites[w.id].name);
  }
  tileOf(w: Where): [number, number] {
    const o = w.kind === 'place' ? this.land.places[w.id] : this.land.sites[w.id];
    return [o.x, o.y];
  }
  same(a: Where, b: Where) {
    return a.kind === b.kind && a.id === b.id;
  }

  role(n: Narrator): string {
    const b = this.sim.map.buildings[n.home];
    const r = new Rng(n.id * 7919 + 13);
    if (!b) return 'woont in het dorp';
    switch (b.kind) {
      case 'hut': return SITE[this.siteOf(n)?.kind ?? 'heide'].loner ?? 'woont buiten het dorp';
      case 'boerderij': return r.pick(['op de boerderij', 'boert op de es', 'op de hoeve']);
      case 'herberg': return 'houdt de herberg';
      case 'smidse': return 'aan de smidse';
      case 'kerk': return 'koster van de kerk';
      case 'school': return 'van de school';
      default: return r.pick(['dagloner', 'naait voor de buren', 'klompenmaker', 'werkt op het land', 'timmert', 'houdt een winkeltje', 'wever', 'werkt bij de boeren']);
    }
  }

  /** How this teller takes to being asked: read from memory, talent and age. */
  temper(n: Narrator): Temper {
    if (n.know.size >= 6 && n.talent < 0.85) return 'schuchter';
    if (n.talent > 1.05) return 'verteller';
    if (this.age(n) < 48 && n.know.size <= 4) return 'spotter';
    return 'gelovig';
  }

  /** Out working at this time of day: farmers and labourers are often in the fields; in the evening everyone is in. */
  get weather(): Weather {
    return this.weathers[this.day] ?? 'bewolkt';
  }
  /** Mist lifts by the afternoon. */
  get misty(): boolean {
    return this.weather === 'mist' && this.part === 0;
  }
  /** Rain or snow: nobody on the land, and slow roads. */
  get wet(): boolean {
    return this.weather === 'regen' || this.weather === 'sneeuw';
  }

  away(n: Narrator): boolean {
    // in the rain nobody works outside
    if (this.part === 2 || this.wet || this.age(n) >= 68 || this.ill.has(n.id) || this.isLoner(n)) return false;
    const kind = this.sim.map.buildings[n.home]?.kind;
    const working = kind === 'boerderij' || kind === 'huis' || kind === 'smidse';
    if (!working) return false;
    const r = new Rng(n.id * 313 + this.day * 17 + this.part);
    // the land keeps people busy through spring and harvest; in winter there is little to do outside
    const work = { lente: 0.1, zomer: 0.2, herfst: 0, winter: -0.35 }[this.season];
    return r.chance((kind === 'boerderij' ? 0.6 : 0.4) + (this.weather === 'helder' ? 0.15 : 0) + work);
  }

  /** People you could visit here. */
  people(w: Where): Narrator[] {
    const sim = this.sim;
    if (w.kind === 'place')
      return sim.alive(w.id).filter((n) => !this.isLoner(n) && this.age(n) >= 16).sort((a, b) => this.age(b) - this.age(a));
    const s = this.land.sites[w.id];
    if (s.hut !== null) return sim.alive().filter((n) => n.home === s.hut && this.age(n) >= 16);
    // at an open site you might meet someone from the nearest village
    const key = `${s.id}:${this.day}`;
    if (!this.passers.has(key)) {
      const r = new Rng(this.sim.seed + s.id * 31 + this.day * 977);
      const cands = sim.alive(s.place).filter((n) => !this.ill.has(n.id) && !this.isLoner(n) && this.age(n) >= 16);
      this.passers.set(key, r.chance(0.7) && cands.length ? r.pick(cands).id : null);
    }
    const id = this.passers.get(key);
    return id !== null && id !== undefined && sim.narrators[id].died === null ? [sim.narrators[id]] : [];
  }

  trustOf(n: Narrator): number {
    const t = this.trust.get(n.id);
    if (t !== undefined) return t;
    let base = 0.2;
    if (n.place === 0) base = this.archetype === 'student' ? 0.55 : 0.3;
    if (this.sim.map.buildings[n.home]?.kind === 'herberg') base += 0.15;
    if (this.introduced.has(n.id)) base = Math.max(base, 0.45);
    if (this.ill.has(n.id) && this.archetype === 'notabele') base = Math.max(base, 0.6);
    return base;
  }

  /** Whether the other collector was here lately: then they are tired of telling. */
  rivalWasHere(n: Narrator): boolean {
    const d = this.rival?.visited.get(n.id);
    return d !== undefined && this.day - d <= 3;
  }

  /** What you can tell about someone: only what you have seen or heard. */
  traits(n: Narrator): string[] {
    const out: string[] = [];
    const met = this.met.has(n.id);
    if (this.ill.has(n.id)) out.push('ziek');
    if (met) {
      out.push(TEMPER[this.temper(n)].name);
      const left = [...n.know.keys()].filter((t) => !this.toldUs.get(n.id)?.has(t)).length;
      out.push(left === 0 ? 'heeft u alles verteld' : left > 4 ? 'weet nog veel' : 'weet nog wat');
      const frags = this.notebook.filter((e) => e.narrator === n.id && e.frag).length;
      if (frags) out.push(frags === 1 ? 'een verhaal half verteld' : `${frags} verhalen half verteld`);
    }
    if (this.rivalWasHere(n)) out.push('had bezoek van de ander');
    return out;
  }

  /** How often this kind of tale was written down in the whole archive, and what that makes it. */
  archiveCount(t: string): number {
    return this.sim.type(t)?.total ?? 0;
  }
  tier(t: string): Tier {
    const c = this.archiveCount(t);
    return c <= 12 ? 'zeldzaam' : c <= 60 ? 'ongewoon' : 'bekend';
  }
  /** How many living people in the region know this kind of tale. */
  knowers(t: string): number {
    return this.sim.alive().filter((x) => x.know.has(t)).length;
  }

  themes(): string[] {
    const counts = new Map<string, number>();
    for (const n of this.sim.alive()) for (const t of n.know.keys()) {
      const b = this.sim.type(t)?.being;
      if (b && b !== 'mens') counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b);
  }

  /** Tales from your notebook you could name to jog someone's memory, the latest first. */
  prompts(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = this.notebook.length - 1; i >= 0 && out.length < 10; i--) {
      const e = this.notebook[i];
      if (e.frag || seen.has(e.t)) continue;
      seen.add(e.t);
      out.push(e.t);
    }
    return out;
  }

  // ------------------------------------------------------------------ travel

  /** The way there over the roads, with the last stretch on foot across the land; and how long it takes. */
  route(to: Where): { tiles: number[]; parts: number; foot: number; footStart: number; footEnd: number } | null {
    if (this.same(this.at, to)) return null;
    const map = this.land;
    const ends = [this.at, to].map((w) => {
      if (w.kind === 'place') return { road: placeRoadTile(map, map.places[w.id]), off: [] as number[] };
      const s = map.sites[w.id];
      if (map.tiles[idx(s.x, s.y)].road) return { road: idx(s.x, s.y), off: [] };
      // the nearest road, and a straight walk from it
      let best: number | null = null, bd = Infinity;
      for (let y = s.y - 10; y <= s.y + 10; y++)
        for (let x = s.x - 10; x <= s.x + 10; x++) {
          if (!inb(x, y) || !map.tiles[idx(x, y)].road) continue;
          const d = Math.abs(x - s.x) + Math.abs(y - s.y);
          if (d < bd) { bd = d; best = idx(x, y); }
        }
      return { road: best, off: best === null ? [] : line(best % W, Math.floor(best / W), s.x, s.y) };
    });
    const [a, b] = ends;
    if (a.road === null || b.road === null) return null;
    const road = roadPath(map, a.road, b.road);
    if (!road) return null;
    const tiles = [...[...a.off].reverse(), ...road, ...b.off];
    const foot = a.off.length + b.off.length;
    // mud slows the roads; in mist the way across open land is hard to find
    const wet = this.weather === 'sneeuw' ? (this.persona.travel === 'auto' ? 0.6 : 0.65) : this.wet ? (this.persona.travel === 'auto' ? 0.85 : 0.7) : 1;
    const lost = this.misty ? 0.5 : 1;
    // in stretches of two hours (half a part of the day)
    const parts = Math.max(1, Math.ceil(2 * (road.length / (this.persona.speed * wet) + foot / (8 * lost))));
    return { tiles, parts, foot, footStart: a.off.length, footEnd: b.off.length };
  }

  travel(to: Where): number[] | null {
    const r = this.route(to);
    if (!r || this.over) return null;
    const from = this.whereName(this.at);
    const fromWhere = this.at;
    const evening = this.part === 2;
    this.at = to;
    this.trail.push(...r.tiles);
    for (let i = 0; i < r.tiles.length; i += 3) this.known.push({ x: r.tiles[i] % W, y: Math.floor(r.tiles[i] / W), r: 2.4 });
    const [x, y] = this.tileOf(to);
    this.known.push({ x, y, r: to.kind === 'place' ? 5.5 : 3.5 });
    const first = to.kind === 'place' ? !this.visitedPlaces.has(to.id) : !this.visitedSites.has(to.id);
    if (to.kind === 'place') this.visitedPlaces.add(to.id);
    else this.visitedSites.add(to.id);
    for (const l of this.leads) if ((l.kind === 'site' || l.kind === 'place') && this.same(l.at, to)) l.done = true;
    const dur = durationText(r.parts);
    this.write('travel', `Van ${from} naar ${this.whereName(to)} (${dur}).${first ? ' ' + this.arrivalLine(to) : ''}`);
    this.encounter = this.meetOnRoad(r.tiles, fromWhere, to, evening);
    // when the journey began, so the day can pass by on the way rather than all at once
    this.departed = { day: this.day, part: this.part, slot: this.slot, parts: r.parts, footStart: r.footStart, footEnd: r.footEnd };
    this.advance(r.parts);
    return r.tiles;
  }

  /**
   * Now and then someone on the road tells you something on the way: a carter, a peddler, a ferryman.
   * (Bakker had some of his best tales from the man who rowed him to a patient at night.)
   */
  private meetOnRoad(tiles: number[], from: Where, to: Where, evening: boolean): Encounter | null {
    if (this.metOnRoad === this.day || tiles.length < 8) return null;
    const r = new Rng(this.sim.seed + this.day * 131 + this.part * 7 + tiles.length);
    if (!r.chance(Math.min(0.5, 0.12 + tiles.length * 0.008))) return null;
    const near = (p: { x: number; y: number }) => tiles.some((t) => Math.abs((t % W) - p.x) + Math.abs(Math.floor(t / W) - p.y) <= 6);
    const cands = this.sim.alive().filter((n) => !this.met.has(n.id) && !this.ill.has(n.id) && !this.isLoner(n) && n.know.size > 0
      && this.age(n) >= 16 && this.age(n) < 75 && near(this.land.places[n.place])
      && !(from.kind === 'place' && from.id === n.place) && !(to.kind === 'place' && to.id === n.place));
    if (!cands.length) return null;
    const n = r.pick(cands);
    this.metOnRoad = this.day;
    const bridge = tiles.some((t) => this.land.tiles[t].bridge);
    const who = bridge && r.chance(0.5) ? 'de man bij de brug' : r.pick(['een voerman met paard en wagen', 'een marskramer met zijn kist', 'een boerin op weg naar de markt', 'een jongen met een kruiwagen turf', 'een veldwachter', 'een schaapherder met zijn kudde']);
    const at = Math.floor(tiles.length * r.range(0.35, 0.65));
    this.met.add(n.id);
    this.trust.set(n.id, Math.max(this.trustOf(n), 0.4));
    if (!this.toldUs.has(n.id)) this.toldUs.set(n.id, new Set());
    const t = [...n.know.entries()].sort((a, b) => b[1].s - a[1].s).find(([t]) => !this.notebook.some((e) => e.t === t))?.[0]
      ?? [...n.know.keys()][0];
    const entry = this.record(n, t, { via: 'onderweg', site: null, frag: r.chance(0.2) });
    const lines = [
      `Onderweg loopt u een eind op met ${who}: ${this.sim.name(n)} uit ${this.land.places[n.place].name}.`,
      evening ? 'Het wordt al donker. Om de tijd te doden begint die te vertellen.' : 'Over het weer, over de weg, en dan ineens over iets heel anders.',
    ];
    return { at, narrator: n.id, who, entry, lines };
  }

  arrivalLine(w: Where): string {
    if (w.kind === 'place') return VILLAGE[this.land.kinds[w.id]].desc;
    const s = this.land.sites[w.id];
    return s.hut !== null ? `Er staat een huisje. Iemand ${SITE[s.kind].loner}.` : 'Er is niemand. Het is er stil.';
  }

  /** Wait until the next part of the day begins. */
  wait() {
    this.write('day', `Gewacht in ${this.whereName(this.at)}.`);
    // in the evening you can stay up for the night; at night you go to bed
    this.advance(this.part === 2 && this.slot === 0 && this.season !== 'winter' ? 1 : 2 - this.slot);
  }

  /** Let time pass, in stretches of two hours. */
  private advance(halves: number) {
    for (let i = 0; i < halves && !this.over; i++) {
      this.slot++;
      if (this.slot < 2) continue;
      this.slot = 0;
      this.part++;
      if (this.part > 2) {
        this.part = 0;
        this.day++;
        this.newDay();
      }
    }
    this.changed();
  }

  private newDay() {
    if (this.day > DAYS) {
      this.over = true;
      this.day = DAYS;
      this.part = 2;
      this.slot = 1;
      return;
    }
    if (this.day % 7 === 0) this.sim.tick();
    for (const id of [...this.ill]) {
      const n = this.sim.narrators[id];
      // the first days are safe; after that, any day may be the last
      if (n.died !== null || this.day < 4 || !this.rng.chance(0.08)) continue;
      const untold = [...n.know.keys()].filter((t) => !this.toldUs.get(n.id)?.has(t));
      this.lost.push({ narrator: n.id, day: this.day, types: untold });
      this.sim.die(n);
      this.ill.delete(id);
      const where = this.land.places[n.place].name;
      this.write('death', untold.length
        ? `${this.sim.name(n)} uit ${where} is overleden. ${untold.length === 1 ? 'Eén verhaal dat niemand had opgeschreven, ging' : `${untold.length} verhalen die niemand had opgeschreven, gingen`} mee in het graf.`
        : `${this.sim.name(n)} uit ${where} is overleden. Wat er te vertellen was, staat in uw schrift.`);
      for (const l of this.leads) if (l.narrator === id) l.done = true;
    }
    this.post();
    this.rivalDay();
  }

  // ------------------------------------------------------------------ visits

  canVisit(n: Narrator): boolean {
    return !this.over && n.died === null && !this.away(n) && this.people(this.at).includes(n);
  }

  /** How likely a tale comes out only in part: shy and very old tellers, strangers, the ill. */
  private fragChance(n: Narrator, will: number): number {
    // `will` is how open the teller is just now
    const tm = this.temper(n);
    let p = { schuchter: 0.45, gelovig: 0.22, spotter: 0.15, verteller: 0.05 }[tm];
    if (this.age(n) >= 80) p += 0.15;
    if (this.ill.has(n.id)) p += 0.15;
    return Math.max(0, Math.min(0.8, p - (will - 0.4) * 0.4));
  }

  // ------------------------------------------------------------------ a conversation

  startTalk(nid: number): Talk {
    const n = this.sim.narrators[nid];
    const tm = this.temper(n);
    let open = this.trustOf(n) + (this.part === 2 ? 0.08 : 0) + (this.ill.has(nid) ? 0.08 : 0) + (tm === 'verteller' ? 0.05 : 0)
      + (this.wet ? 0.05 : 0)
      // the long evenings of winter were the time for telling
      + (this.season === 'winter' ? 0.05 : this.season === 'zomer' ? -0.03 : 0);
    const lines: TalkLine[] = [];
    if (this.rivalWasHere(n)) {
      open -= 0.15;
      lines.push({ who: 'zij', text: `„Ik heb pas nog zoveel verteld aan ${this.rival!.who.replace(/^een /, 'die ')}. Wat wilt u nou nog?”` });
    }
    const first = !this.met.has(nid);
    lines.push({ who: 'info', text: first
      ? `${n.first} doet de deur open en kijkt u afwachtend aan.`
      : `${n.first} herkent u${this.trustOf(n) >= 0.5 ? ' en laat u binnen' : ''}.` });
    this.met.add(nid);
    this.visits.set(nid, (this.visits.get(nid) ?? 0) + 1);
    for (const l of this.leads) if (l.narrator === nid) l.done = true;
    if (!this.toldUs.has(nid)) this.toldUs.set(nid, new Set());
    open = Math.max(0.05, Math.min(1, open));
    return { nid, open, start: open, moves: this.part === 2 ? 4 : 3, used: new Map(), lines, entries: [], ended: false, closed: false };
  }

  /** What each kind of teller needs before they will tell this way: higher means more warming up first. */
  need(talk: Talk, m: Move): number {
    const n = this.sim.narrators[talk.nid];
    const tm = this.temper(n);
    switch (m.kind) {
      case 'free': return { verteller: 0.3, gelovig: 0.45, spotter: 0.4, schuchter: 0.75 }[tm];
      case 'theme': {
        if (tm === 'spotter') return 0.8;
        let need = 0.45 + (SHY.has(m.being) ? 0.15 : 0);
        if (this.archetype === 'notabele' && SHY.has(m.being)) need += 0.1;
        return need;
      }
      case 'prompt': return { schuchter: 0.3, gelovig: 0.35, verteller: 0.4, spotter: 0.5 }[tm];
      case 'again': return 0.35;
      case 'eigen': return { verteller: 0.45, gelovig: 0.55, spotter: 0.65, schuchter: 0.6 }[tm];
      case 'verloren': return this.quest?.stage === 0 ? 0.35 : 0.5;
      case 'others': return { spotter: 0.15, verteller: 0.3, gelovig: 0.3, schuchter: 0.45 }[tm];
      default: return 0;
    }
  }

  /** Make one move in a conversation. Returns the new lines. */
  move(talk: Talk, m: Move): TalkLine[] {
    const sim = this.sim;
    const n = sim.narrators[talk.nid];
    const name = n.first;
    const tm = this.temper(n);
    const out: TalkLine[] = [];
    if (talk.ended || talk.closed || talk.moves <= 0) return out;
    talk.moves--;
    const key = m.kind === 'theme' ? `theme:${m.being}` : m.kind;
    const times = talk.used.get(key) ?? 0;
    talk.used.set(key, times + 1);
    const r = new Rng(sim.seed + talk.nid * 101 + this.day * 7 + this.part * 3 + talk.moves);
    const told = this.toldUs.get(talk.nid)!;
    const heardHere = new Set(this.notebook.filter((e) => e.place === n.place).map((e) => e.t));
    const heardAny = new Set(this.notebook.map((e) => e.t));
    const untold = [...n.know.entries()].filter(([t]) => !told.has(t))
      .map(([t, mem]) => [t, mem, (0.4 + mem.s) * (heardHere.has(t) ? 0.15 : heardAny.has(t) ? 0.6 : 1) * r.range(0.6, 1.4)] as const)
      .sort((a, b) => b[2] - a[2]);
    const shift = (d: number) => (talk.open = Math.max(0, Math.min(1, talk.open + d)));
    const ok = () => talk.open + r.range(-0.05, 0.05) >= this.need(talk, m);
    const tell = (t: string, fragScale = 1) => {
      const frag = r.chance(this.fragChance(n, talk.open) * fragScale);
      const e = this.record(n, t, { frag });
      talk.entries.push(e);
      out.push({ who: 'zij', text: '', entry: e });
      // a teller who held a tale back last time, as one of Bakker's tellers did
      if ((this.visits.get(talk.nid) ?? 0) >= 2 && !frag && r.chance(0.2)) out.push({ who: 'zij', text: '„Dit vond ik de vorige keer eigenlijk te kinderachtig om te vertellen.”' });
      shift(0.05);
    };
    const say = (who: TalkLine['who'], text: string) => out.push({ who, text });

    if (m.kind === 'praat') {
      say('u', 'U praat wat over het weer, de oogst en de prijzen op de markt.');
      const gain = { verteller: 0.15, spotter: 0.12, gelovig: 0.1, schuchter: 0.08 }[tm] / (times + 1);
      shift(gain);
      say('zij', times ? `${name} knikt beleefd. Daar is alles nu wel over gezegd.` : tm === 'spotter' ? `${name} maakt een grap over de pastoor. U lacht mee.` : `${name} praat graag mee.`);
    } else if (m.kind === 'leven') {
      say('u', `U vraagt naar vroeger: de ouders, het werk, het dorp zoals het was.`);
      const gain = { gelovig: 0.16, schuchter: 0.16, verteller: 0.08, spotter: 0.05 }[tm] / (times + 1);
      shift(gain);
      say('zij', tm === 'schuchter' ? `${name} vertelt, eerst zachtjes, over een moeder die alles wist van vroeger.`
        : tm === 'gelovig' ? `„Vroeger was het hier anders, hoor. Toen gebeurden er nog dingen.”`
        : tm === 'spotter' ? `„Vroeger? Toen was iedereen arm en bang in het donker.”` : `${name} haalt herinneringen op, met handen en voeten.`);
    } else if (m.kind === 'free') {
      say('u', 'U vraagt of er vroeger verhalen verteld werden.');
      if (!untold.length) say('zij', `„Ik weet u echt niets meer te vertellen.”`);
      else if (ok()) {
        say('zij', tm === 'verteller' ? `${name} gaat er eens goed voor zitten.`
          : tm === 'spotter' ? `„Ze zeggen dat het echt gebeurd is, maar ik geloof er niks van.”`
          : tm === 'gelovig' ? `„Het is echt gebeurd, hoor. Mijn moeder heeft het zelf gezien.”` : `${name} begint aarzelend te vertellen.`);
        tell(untold[0][0]);
        const tape = this.archetype === 'rondreiziger';
        if (untold[1] && tape && tm !== 'schuchter' && talk.open >= 0.55) {
          say('info', 'De band loopt nog. Er komt er nog een.');
          tell(untold[1][0]);
        }
        if (tape && tm === 'schuchter') say('info', `${name} kijkt steeds naar de bandrecorder.`);
      } else {
        shift(-0.06);
        say('zij', tm === 'schuchter' ? `„Ik weet niet zo goed wat u wilt horen,” zegt ${name}, en zoekt naar woorden.`
          : `${name} haalt de schouders op. „Verhalen? Daar heb ik nooit zo op gelet.”`);
        if (tm === 'schuchter') say('info', 'Misschien helpt het als u zelf een verhaal vertelt.');
      }
    } else if (m.kind === 'theme') {
      const being = m.being;
      this.asked.set(being, (this.asked.get(being) ?? 0) + 1);
      say('u', `U vraagt naar ${themeName(being)}.`);
      const cands = untold.filter(([t]) => sim.type(t)?.being === being);
      if (tm === 'spotter' && !ok()) {
        shift(-0.04);
        say('zij', `${name} schiet in de lach. „${cap(themeName(being))}? Daar geloven alleen oude wijven in.”`);
        if (talk.open >= 0.25) {
          const lead = this.leadFor(being, n);
          if (lead) out.push({ who: 'zij', text: `„Vraag het ${this.leadName(lead)} maar. Die gelooft het allemaal.”`, lead });
        }
      } else if (!cands.length) {
        const knewSome = [...told].some((t) => sim.type(t)?.being === being);
        say('zij', knewSome ? `„Meer weet ik daar niet van.”` : `„Daar weet ik niets van.”`);
        if (talk.open >= 0.3) {
          const lead = this.leadFor(being, n);
          if (lead) out.push({ who: 'zij', text: `„Maar vraag het eens aan ${this.leadName(lead)}.”`, lead });
        }
      } else if (ok()) {
        say('zij', tm === 'gelovig' ? `${name} gaat zachter praten. „Ik zal u vertellen wat er gebeurd is.”` : tm === 'spotter' ? 'Half lachend vertelt die het toch.' : `${name} denkt even na, en begint dan te vertellen.`);
        tell(cands[0][0]);
      } else if (tm === 'gelovig' && SHY.has(being)) {
        shift(-0.2);
        say('zij', `${name} kijkt u wantrouwig aan. „U wilt ons zeker uitlachen.”`);
      } else {
        shift(-0.1);
        say('zij', SHY.has(being) ? `${name} kijkt even weg. „Daar praten we hier niet over met vreemden.”` : `„Ach, dat zijn maar praatjes.”`);
      }
    } else if (m.kind === 'prompt') {
      // telling a tale yourself jogs the memory: 'no, I don't know that one, but I do know…' (Jaarsma and Mrs Kobus)
      const ty = sim.type(m.t);
      say('u', `U vertelt zelf het verhaal van ${ty.name.toLowerCase()}, zoals u het hoorde.`);
      const same = untold.find(([t]) => t === m.t);
      const v = sim.variant(this.notebook.find((e) => e.t === m.t)?.n ?? 0);
      const tags = new Set(v?.g ?? []);
      const related = untold.map(([t, mem]) => {
        const w = sim.variant(sim.nodes[mem.node].n);
        return [t, w.g.filter((g) => tags.has(g)).length + (sim.type(t).being === ty.being ? 2 : 0)] as const;
      }).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]);
      if (told.has(m.t)) say('zij', '„Dat heb ik u toch al verteld?”');
      else if (ok() && same) {
        tell(same[0], 0.6);
        const e = talk.entries[talk.entries.length - 1];
        out.splice(out.length - 1, 0, { who: 'zij', text: e.kind === 'same' ? '„Ja, dat ken ik. Zo heb ik het ook altijd gehoord.”' : '„Ja, dat ken ik. Maar bij ons ging het anders.”' });
      } else if (ok() && related.length) {
        say('zij', `${name} denkt lang na. „Nee, dat ken ik niet. Maar ik weet wel iets anders…”`);
        tell(related[0][0], tm === 'schuchter' ? 0.4 : 0.8);
      } else if (tm === 'spotter') {
        shift(-0.03);
        say('zij', `${name} grinnikt. „En dat gelooft u allemaal?”`);
      } else {
        shift(0.1);
        say('zij', related.length || same ? `${name} luistert aandachtig. Er komt nog niets, maar het ijs is gebroken.` : `„${ty.name}? Nee, daar zegt het me niets. Maar mooi verteld.”`);
      }
    } else if (m.kind === 'again') {
      const e = this.notebook[m.num - 1];
      say('u', 'U vraagt naar het verhaal dat de vorige keer maar half bovenkwam.');
      if (!e || e.narrator !== talk.nid || !e.frag) say('zij', `${name} weet niet wat u bedoelt.`);
      else if (ok()) {
        e.frag = false;
        say('zij', '„O ja, dat verhaal. Nu weet ik het weer. Het ging zo:”');
        out.push({ who: 'zij', text: '', entry: e });
        if (!talk.entries.includes(e)) talk.entries.push(e);
        shift(0.05);
      } else say('zij', '„Het wil nog niet boven komen. Komt u nog eens terug.”');
    } else if (m.kind === 'verloren') {
      const q = this.quest!;
      if (q.stage === 0) {
        say('u', 'U vraagt naar het verhaal dat niemand meer kan afmaken.');
        if (!ok()) {
          shift(-0.05);
          say('zij', `${name} schudt het hoofd. „Dat is te lang geleden. Een andere keer misschien.”`);
        } else {
          q.stage = 1;
          const church = this.land.places[q.church];
          say('zij', `„Mijn grootmoeder vertelde het, en die had het van ${q.grand}. Ik weet alleen nog hoe het begint:”`);
          out.push({ who: 'zij', text: '', opening: q.opening });
          say('zij', `„Hoe het afloopt, weet niemand meer. ${q.grand} ligt begraven bij de kerk van ${church.name}. Misschien vindt u daar meer.”`);
          const clue = `${sim.name(n)} weet nog hoe het verhaal van ${q.grand} begint. ${q.grand.split(' ')[0]} ligt begraven in ${church.name}.`;
          q.clues.push(clue);
          this.questLead([`Het graf van ${q.grand}`, `bij de kerk van ${church.name}.`], { kind: 'place', id: church.id });
          shift(0.05);
        }
      } else {
        say('u', `U vraagt naar het verhaal van ${q.grand}.`);
        if (talk.nid !== q.target) {
          shift(-0.12);
          say('zij', `${name} kijkt verbaasd. „${q.grand.split(' ')[0]}? Nooit van gehoord. Dat moet u bij een ander vragen.”`);
        } else if (!ok()) {
          shift(-0.05);
          say('zij', `${name} wordt stil, en kijkt naar het vuur. „Waarom wilt u dat weten?” Zo ver is het nog niet.`);
        } else {
          say('zij', `${name} kijkt u lang aan. „Dat verhaal… dat heb ik van mijn moeder, en die had het van ${q.grand.split(' ')[0]}. Niemand heeft het me ooit gevraagd.”`);
          const e = this.record(n, q.t);
          e.quest = true;
          talk.entries.push(e);
          out.push({ who: 'zij', text: '', entry: e });
          q.stage = 4;
          q.clues.push(`Gevonden: het verhaal van ${q.grand}, bij ${sim.name(n)} in ${this.land.places[n.place].name}.`);
          for (const l of this.leads) if (l.kind === 'quest') l.done = true;
          this.write('day', `Het verloren verhaal gevonden bij ${sim.name(n)}.`);
          shift(0.1);
        }
      }
    } else if (m.kind === 'eigen') {
      // the rarest thing this teller knows: what hardly anyone else in the region still tells
      say('u', 'U vraagt of er iets is wat ze alleen hier vertellen, wat u nergens anders zult horen.');
      const rarest = untold.map(([t]) => [t, this.knowers(t)] as const).sort((a, b) => a[1] - b[1] || this.archiveCount(a[0]) - this.archiveCount(b[0]))[0];
      if (!rarest) say('zij', '„Ik heb u alles verteld wat ik weet.”');
      else if (!ok()) {
        shift(-0.08);
        say('zij', `${name} kijkt u even aan. „Waarom wilt u dat weten?” Zo ver is het nog niet.`);
      } else if (rarest[1] > 3) {
        say('zij', `${name} denkt na en schudt het hoofd. „Wat ik weet, kent iedereen hier wel. Maar als u wilt…”`);
        tell(untold[0][0]);
      } else {
        say('zij', rarest[1] <= 1 ? `${name} aarzelt. „Dit heb ik van mijn grootmoeder. Ik denk niet dat iemand anders het nog weet.”` : `„Er is wel iets. Dat hoor je niet vaak meer.”`);
        tell(rarest[0], 0.7);
      }
    } else if (m.kind === 'others') {
      say('u', 'U vraagt wie er in de buurt nog meer kan vertellen.');
      if (!ok()) say('zij', tm === 'schuchter' ? '„Ik kom niet zoveel bij de mensen.”' : '„Ik zou het niet weten.”');
      else {
        const lead = this.leadFor(null, n);
        if (lead) out.push({ who: 'zij', text: `„Dan moet u bij ${this.leadName(lead)} zijn. Die kan vertellen!”`, lead });
        else say('zij', `${name} weet niemand meer te noemen die u nog niet kent.`);
      }
    }
    // pushed too far: the visit is over
    if (talk.open < 0.06) {
      talk.closed = true;
      say('info', `${name} staat op. „Ik moet de koeien nog doen.” Het bezoek is voorbij.`);
    } else if (talk.moves === 0) say('info', 'Het is tijd om te gaan.');
    talk.lines.push(...out);
    return out;
  }

  /** Leave: the visit has taken its part of the day, and left the other a little more or less at ease with you. */
  endTalk(talk: Talk): TalkLine[] {
    if (talk.ended) return [];
    talk.ended = true;
    const sim = this.sim;
    const n = sim.narrators[talk.nid];
    const out: TalkLine[] = [];
    const before = this.trustOf(n);
    const went = talk.open - talk.start;
    const gain = (this.archetype === 'volhouder' ? 0.12 : 0.07) + Math.max(0, went) * 0.5 + (talk.entries.length ? 0.05 : 0);
    const after = Math.max(0.05, Math.min(1, went < -0.08 ? before - 0.06 : before + gain));
    this.trust.set(talk.nid, after);
    if (went < -0.08) out.push({ who: 'info', text: `U voelt dat u te snel ging. ${n.first} zal de volgende keer wat terughoudender zijn.` });
    else if (after > before + 0.1) out.push({ who: 'info', text: `${n.first} kent u nu beter.` });
    // in a village where the neighbours gather, someone will mention it
    const buurt = this.occasions.find((o) => o.kind === 'buurten' && !o.known && o.place === n.place && o.day >= this.day);
    if (buurt && talk.open >= 0.35 && new Rng(sim.seed + talk.nid).chance(0.6)) {
      buurt.known = true;
      const host = buurt.host !== null ? sim.name(sim.narrators[buurt.host]) : 'een van de boeren';
      const l = this.addLead('evening', [`Dag ${buurt.day}: ’s avonds buurten`, `bij ${host} in ${this.land.places[buurt.place].name}.`], { kind: 'place', id: buurt.place }, null, n.first);
      out.push({ who: 'zij', text: `„Op dag ${buurt.day} komen de buren ’s avonds bij ${host}. Dan wordt er verteld. Komt u ook?”`, lead: l });
    }
    talk.lines.push(...out);
    const what = talk.entries.length ? `${talk.entries.length === 1 ? 'een verhaal' : `${talk.entries.length} verhalen`} opgeschreven` : 'niets opgeschreven';
    this.write('visit', `Bij ${sim.name(n)} in ${this.whereName(this.at)}: ${what}.`);
    this.advance(1);
    return out;
  }

  /** The old one-step visit, for the balancing scripts: warm up as needed, then ask. */
  visit(nid: number, ask: Ask): VisitResult {
    const talk = this.startTalk(nid);
    const before = talk.open;
    while (talk.moves > 1 && !talk.closed && talk.open + 0.02 < this.need(talk, ask)) this.move(talk, { kind: talk.used.has('praat') ? 'leven' : 'praat' });
    if (!talk.closed && talk.moves > 0) this.move(talk, ask);
    this.endTalk(talk);
    const lead = [...talk.lines].reverse().find((l) => l.lead)?.lead ?? null;
    return { lines: talk.lines.filter((l) => l.text).map((l) => l.text), entries: talk.entries, lead, trust: [before, this.trustOf(this.sim.narrators[nid])] };
  }

  private record(n: Narrator, t: string, o: { frag?: boolean; via?: Via; site?: number | null } = {}): Entry {
    const sim = this.sim;
    const mem = n.know.get(t)!;
    const node = sim.nodes[mem.node];
    if (!this.toldUs.has(n.id)) this.toldUs.set(n.id, new Set());
    this.toldUs.get(n.id)!.add(t);
    n.recordedNodes.add(node.id);
    const kind: Entry['kind'] = this.notebook.some((e) => e.n === node.n) ? 'same' : this.notebook.some((e) => e.t === t) ? 'version' : 'new';
    const site = o.site !== undefined ? o.site : this.at.kind === 'site' ? this.at.id : null;
    const holders = sim.alive().filter((x) => x.know.has(t)).length;
    const vholders = sim.alive().filter((x) => x.know.get(t)?.node === node.id).length;
    const e: Entry = {
      num: this.notebook.length + 1, node: node.id, t, n: node.n, narrator: n.id, place: n.place, site, day: this.day, part: this.part, kind,
      frag: !!o.frag, via: o.via ?? 'bezoek', rare: holders <= 1, holders, vholders, scoop: !!this.rival?.got.some((g) => g.t === t),
    };
    this.notebook.push(e);
    // a tale told at a place gives the place its name on your map
    if (site !== null && !this.land.sites[site].legend) this.land.sites[site].legend = t;
    return e;
  }

  /** Someone who knows about this (or who knows a lot), whom you have not yet met. */
  private leadFor(being: string | null, from: Narrator | null, source?: string): Lead | null {
    const sim = this.sim;
    const here = this.tileOf(this.at);
    const cands = sim.alive().filter((n) => n.id !== from?.id && !this.met.has(n.id) && this.age(n) >= 16 && !this.leads.some((l) => l.narrator === n.id && !l.done));
    let best: Narrator | null = null, bs = 0;
    for (const n of cands) {
      // people point you to those who know a lot, and to those who know what nobody else does
      const own = [...n.know.keys()].filter((t) => this.knowers(t) <= 1).length;
      const k = being ? [...n.know.keys()].filter((t) => sim.type(t)?.being === being).length : n.know.size * (0.5 + n.talent / 2) + own * 2;
      if (!k) continue;
      const [x, y] = this.tileOf(this.whereIs(n));
      const s = k / (1 + Math.hypot(x - here[0], y - here[1]) / 18);
      if (s > bs) { bs = s; best = n; }
    }
    if (!best) return null;
    this.introduced.add(best.id);
    const w = this.whereIs(best);
    const own = [...best.know.keys()].filter((t) => this.knowers(t) <= 1).length;
    const about = being ? `weet van ${themeName(being)}` : own >= 2 ? 'weet dingen die je nergens anders hoort' : 'kan vertellen';
    const by = source ?? from?.first ?? 'iemand';
    const lines = [`${sim.name(best)} (${this.age(best)})`, `in ${this.whereName(w)} ${about}.`, `— zegt ${by}`];
    return this.addLead('person', lines, w, best.id, source ?? (from ? sim.name(from) : 'iemand'));
  }

  leadName(l: Lead): string {
    const n = this.sim.narrators[l.narrator!];
    return `${this.sim.name(n)} ${l.at.kind === 'site' ? 'bij' : 'in'} ${this.whereName(l.at)}`;
  }

  private addLead(kind: Lead['kind'], lines: string[], at: Where, narrator: number | null, source: string): Lead {
    const l: Lead = { id: this.leads.length, kind, lines, at, narrator, source, day: this.day, done: false };
    this.leads.push(l);
    return l;
  }

  private firstLeads() {
    const sim = this.sim, land = this.land;
    const host = 'de waardin';
    const ev = this.evening;
    this.addLead('evening', [`Dag ${ev.day}: vertelavond`, `in de herberg van ${land.places[ev.place].name}.`], { kind: 'place', id: ev.place }, null, host);
    const sick = [...this.ill].map((id) => sim.narrators[id]).sort((a, b) => b.know.size - a.know.size)[0];
    if (sick) {
      this.introduced.add(sick.id);
      this.addLead('person', [`${sim.name(sick)} in ${land.places[sick.place].name},`, `${this.age(sick)} jaar, „weet alles van vroeger”.`, 'Is ziek.'], this.whereIs(sick), sick.id, host);
    }
    // a loner far out, and a place nobody likes to talk about
    const loners = land.sites.filter((s) => s.hut !== null).sort((a, b) => dist(b, land.places[0]) - dist(a, land.places[0]));
    const lone = loners[0];
    if (lone) {
      const n = sim.alive().find((x) => x.home === lone.hut);
      if (n) {
        this.introduced.add(n.id);
        this.addLead('person', [`Bij ${lone.name} woont iemand die`, `${SITE[lone.kind].loner}.`, '„Die heeft dingen gezien.”'], { kind: 'site', id: lone.id }, n.id, host);
      }
    }
    // the village that keeps most tales of its own: the landlady has heard as much
    const own = land.places.filter((p) => p.id !== 0).map((p) => {
      const types = new Set(sim.alive(p.id).flatMap((n) => [...n.know.keys()]));
      return [p, [...types].filter((t) => sim.alive().every((n) => n.place === p.id || !n.know.has(t))).length] as const;
    }).sort((a, b) => b[1] - a[1])[0];
    if (own && own[1] >= 2) this.addLead('place', [`In ${own[0].name} vertellen ze`, 'dingen die je nergens anders hoort.'], { kind: 'place', id: own[0].id }, null, host);
    const open = land.sites.find((s) => s.kind === 'galg') ?? land.sites.find((s) => s.hut === null);
    if (open) this.addLead('site', [cap(`${open.name}:`), '„Daar wil niemand over praten.”'], { kind: 'site', id: open.id }, null, host);
  }

  private lodgingLine(): string {
    return `${this.persona.perk} Bij de waardin hoort u over een vertelavond, over een zieke oude man of vrouw die veel weet, en over plekken waar het niet pluis is.`;
  }

  // ------------------------------------------------------------------ the lost tale

  private makeQuest(): Quest | null {
    const sim = this.sim, land = this.land, r = new Rng(sim.seed + 2024);
    const home = land.places[0];
    // a tale seldom written down anywhere, that nobody here tells
    const known = new Set(sim.alive().flatMap((n) => [...n.know.keys()]));
    const cands = [...sim.corpus.byType.keys()].filter((t) => !known.has(t) && sim.type(t))
      .sort((a, b) => this.archiveCount(a) - this.archiveCount(b));
    if (!cands.length) return null;
    const t = cands[r.int(Math.min(4, cands.length))];
    const variant = r.pick(sim.corpus.byType.get(t)!);
    // the place it came from: somewhere tales are tied to, as far from the lodgings as can be
    const sites = land.sites.filter((s) => APPARITION[s.kind] && s.kind !== 'kruisweg').sort((a, b) => dist(b, home) - dist(a, home));
    const site = sites[0] ?? land.sites[0];
    if (!site) return null;
    // the village the family went to: not the lodgings, not by the site, with people enough to choose from
    const villages = land.places.filter((p) => p.id !== 0 && p.id !== site.place && sim.alive(p.id).filter((n) => !this.isLoner(n)).length >= 4)
      .sort((a, b) => dist(b, site) - dist(a, site));
    const village = villages[0] ?? land.places.find((p) => p.id !== 0);
    if (!village) return null;
    const pool = sim.alive(village.id).filter((n) => !this.isLoner(n) && !this.ill.has(n.id) && this.age(n) >= 55).sort((a, b) => this.age(b) - this.age(a));
    const target = pool[r.int(Math.min(3, pool.length))] ?? sim.alive(village.id).find((n) => !this.isLoner(n));
    const starter = sim.alive(0).filter((n) => !this.isLoner(n) && !this.ill.has(n.id)).sort((a, b) => this.age(b) - this.age(a))[0];
    if (!target || !starter) return null;
    // a church: where she is buried
    const churches = land.places.filter((p) => p.id !== village.id && sim.placeBuildings(p.id).some((b) => b.kind === 'kerk'));
    const church = churches.find((p) => p.id !== 0) ?? churches[0] ?? land.places[0];
    sim.implant(target, variant);
    const firsts = sim.corpus.meta.regions[this.region].firsts;
    const grand = `${firsts[r.int(Math.min(40, firsts.length))]} ${sim.narrators[starter.id].last === target.last ? 'van ' + site.name.replace(/^(het|de) /, '') : r.pick(sim.corpus.meta.regions[this.region].lasts.slice(0, 60))}`;
    const words = variant.d.split(' ');
    const opening = words.slice(0, Math.max(8, Math.floor(words.length * 0.4))).join(' ');
    const q: Quest = { t, n: variant.n, grand, starter: starter.id, church: church.id, site: site.id, village: village.id, target: target.id,
      mark: r.chance(0.6) ? 'oorijzer' : 'pijp', stage: 0, clues: [], opening, hinted: false };
    this.addLead('quest', [`${sim.name(starter)} (${this.age(starter)}) begint soms`, 'over een verhaal dat niemand', 'meer kan afmaken.'], { kind: 'place', id: 0 }, starter.id, 'de waardin');
    return q;
  }

  /** How the one who still knows the tale can be recognised. */
  questLook(): string {
    const q = this.quest!;
    const n = this.sim.narrators[q.target];
    const age = `ruim ${Math.floor(this.age(n) / 10) * 10}`;
    return q.mark === 'oorijzer' ? `${age}, en draagt nog het gouden oorijzer van de familie` : `${age}, en rookt altijd een pijpje`;
  }

  private questLead(lines: string[], at: Where) {
    for (const l of this.leads) if (l.kind === 'quest') l.done = true;
    this.addLead('quest', lines, at, null, 'speurtocht');
  }

  /** Whether the lost tale can be asked about in this conversation. */
  canAskLost(nid: number): boolean {
    const q = this.quest;
    if (!q) return false;
    const n = this.sim.narrators[nid];
    return (q.stage === 0 && nid === q.starter) || (q.stage === 3 && n.place === q.village && !this.isLoner(n));
  }

  /** Something at the place you have come to, for the trail: the grave, or what is seen and said at the site. */
  questHere(): { title: string; lines: string[] } | null {
    const q = this.quest;
    if (!q || this.over) return null;
    const land = this.land, sim = this.sim;
    if (q.stage === 1 && this.at.kind === 'place' && this.at.id === q.church) {
      q.stage = 2;
      const s = land.sites[q.site];
      const clue = `Op het kerkhof van ${land.places[q.church].name}: „Hier rust ${q.grand}, geboren bij ${s.name}.”`;
      q.clues.push(clue);
      this.questLead([`${cap(s.name)}: waar ${q.grand.split(' ')[0]}`, 'vandaan kwam.'], { kind: 'site', id: s.id });
      this.write('day', clue);
      return { title: 'Het kerkhof', lines: [
        `Tussen de scheve stenen achter de kerk vindt u het graf. Het mos is van de letters geschraapt, door iemand die er nog komt.`,
        `„Hier rust ${q.grand}, geboren bij ${s.name}.”`,
        `Bij ${s.name} moet u zijn. Daar weten ze misschien waar de familie gebleven is.`,
      ] };
    }
    if (q.stage === 2 && this.at.kind === 'site' && this.at.id === q.site) {
      const s = land.sites[q.site];
      if (!this.isNight()) {
        if (q.hinted) return null;
        q.hinted = true;
        return { title: cap(s.name), lines: [
          `Overdag is het hier stil. ${s.hut !== null ? 'Wie hier woont, is niet thuis.' : 'Er is niemand.'}`,
          `Maar men zegt dat je hier ’s nachts dingen ziet. Wacht tot het nacht is.`,
        ] };
      }
      q.stage = 3;
      const v = land.places[q.village];
      const clue = `Bij ${s.name}: de familie van ${q.grand.split(' ')[0]} is naar ${v.name} getrokken. Wie het verhaal nog kent, is ${this.questLook()}.`;
      q.clues.push(clue);
      this.questLead([`In ${v.name}: iemand van`, this.questLook().replace(/^ruim (\d+), en /, 'ruim $1 die ') + '.'], { kind: 'place', id: v.id });
      this.write('day', clue);
      const loner = sim.alive().find((n) => n.home === s.hut);
      return { title: 'In het donker', lines: [
        loner
          ? `Bij het licht van een lantaarn vertelt ${sim.name(loner)}: „${q.grand.split(' ')[0]}? Die woonde hier, lang geleden. De familie is later naar ${v.name} getrokken. Daar hebben ze het verhaal nog.”`
          : `In de nevel staat een witte gestalte. Ze heft een arm en wijst, over het land, naar ${v.name}. Dan is ze weg.`,
        `„Je herkent het aan dit: ${this.questLook()}.”`,
      ] };
    }
    return null;
  }

  // ------------------------------------------------------------------ what is seen at night

  /** Apparitions show at night, and in the morning mist over the low ground. */
  /** Whether it is dark now, or at a time passing by on the road. */
  isDark(at: { day: number; part: number; slot?: number } = { day: this.day, part: this.part, slot: this.slot }): boolean {
    return darkness(this.season, this.weathers[at.day] ?? this.weather, at.part, at.slot ?? 0) >= DARK;
  }

  /** Whether it is night now (not just evening), or at a time passing by on the road. */
  isNight(at: { day: number; part: number; slot?: number } = { day: this.day, part: this.part, slot: this.slot }): boolean {
    return nightAt(this.season, at.part, at.slot ?? 0);
  }

  canSee(siteId: number, at: { day: number; part: number; slot?: number } = { day: this.day, part: this.part, slot: this.slot }): boolean {
    const s = this.land.sites[siteId];
    if (this.over || this.seen.has(siteId) || !APPARITION[s.kind]) return false;
    const misty = (this.weathers[at.day] ?? this.weather) === 'mist' && at.part === 0;
    return this.isNight(at) || (misty && ['veen', 'heide', 'water'].includes(s.kind));
  }

  /** Having seen something gives you something to ask about, and someone to ask. */
  see(siteId: number): { lines: string[]; lead: Lead | null; being: string } {
    const s = this.land.sites[siteId];
    const a = APPARITION[s.kind];
    this.seen.add(siteId);
    const lines = [a.seen];
    const near = this.sim.alive(s.place)[0] ?? this.sim.alive()[0];
    const lead = this.leadFor(a.being, null, "men");
    if (lead) lines.push(`Wie weet er meer van ${themeName(a.being)}? In ${this.whereName(lead.at)} zou ${this.sim.name(this.sim.narrators[lead.narrator!])} het weten.`);
    else lines.push(`Niemand die u kent, weet hier iets van. Maar vraag er eens naar.`);
    void near;
    this.write('day', `Bij ${s.name} iets gezien: ${themeName(a.being)}?`);
    this.changed();
    return { lines, lead, being: a.being };
  }

  // ------------------------------------------------------------------ storytelling occasions

  attendable(): Occasion | null {
    if (this.over || this.part !== 2) return null;
    return this.occasions.find((o) => o.known && !o.attended && o.day === this.day && this.same(this.at, { kind: 'place', id: o.place })) ?? null;
  }

  canAttendEvening(): boolean {
    return this.attendable() !== null;
  }

  attendEvening(): VisitResult {
    const sim = this.sim;
    const o = this.attendable() ?? this.evening;
    o.attended = true;
    for (const l of this.leads) if (l.kind === 'evening' && this.same(l.at, { kind: 'place', id: o.place })) l.done = true;
    const people = this.people({ kind: 'place', id: o.place });
    const r = new Rng(sim.seed + 404 + o.day);
    const tellers: Narrator[] = [];
    if (o.host !== null && sim.narrators[o.host].died === null) tellers.push(sim.narrators[o.host]);
    while (tellers.length < 3) {
      const pick = r.weighted(people.filter((n) => !tellers.includes(n)), (n) => (o.kind === 'buurten' ? this.age(n) / 40 : n.talent) * (1 + n.know.size));
      if (!pick) break;
      tellers.push(pick);
    }
    const entries: Entry[] = [];
    const lines = o.kind === 'herberg'
      ? ['De gelagkamer zit vol. Er wordt gerookt, gedronken, en verteld.']
      : ['In de keuken van de boerderij zitten de buren om de kachel. De ouderen vertellen over vroeger, de jongeren luisteren en lachen.'];
    for (const n of tellers) {
      this.met.add(n.id);
      if (!this.toldUs.has(n.id)) this.toldUs.set(n.id, new Set());
      const t = [...n.know.entries()].filter(([t]) => !this.toldUs.get(n.id)!.has(t)).sort((a, b) => b[1].s - a[1].s)[0];
      if (!t) continue;
      entries.push(this.record(n, t[0], { via: o.kind === 'herberg' ? 'avond' : 'buurten', frag: r.chance(0.08) }));
      lines.push(`${sim.name(n)} vertelt.`);
    }
    for (const n of people) this.trust.set(n.id, Math.max(this.trustOf(n), 0.5));
    lines.push(o.kind === 'herberg' ? 'Na vanavond kent het hele dorp u.' : 'U mag terugkomen, zegt de boer bij de deur.');
    this.write('evening', `${o.kind === 'herberg' ? 'Vertelavond' : 'Buurten'} in ${this.land.places[o.place].name}: ${entries.length} verhalen opgeschreven.`);
    this.advance(2 - this.slot);
    return { lines, entries, lead: null, trust: [0, 0] };
  }

  // ------------------------------------------------------------------ an appeal in the paper

  /** An appeal can be placed once, from the lodgings, with the local weekly. */
  canAppeal(): boolean {
    return !this.over && this.appealDay === null && this.at.kind === 'place' && this.at.id === 0;
  }

  appeal() {
    this.appealDay = this.day;
    this.write('letter', 'Een oproep geschreven voor het weekblad: wie kent nog oude verhalen, van spoken, heksen en witte wieven? Schrijft u mij.');
    this.advance(1);
  }

  /**
   * The post. An appeal brings in little, and late (Grimm's and Westendorp's brought nothing at all), but a few
   * readers write back: a tale they heard as a child, a name. Not every reader approves.
   */
  private post() {
    if (this.appealDay === null || this.day < this.appealDay + 2 || this.letters.length >= 4) return;
    const r = new Rng(this.sim.seed + this.day * 53);
    if (!r.chance(0.55)) return;
    const sim = this.sim;
    // one reader, at most, disapproves (as some readers of Iduna did of Dykstra's appeals)
    if (r.chance(0.3) && !this.letters.some((l) => !l.entries.length)) {
      this.letters.push({ day: this.day, from: null, entries: [], lead: null, read: false,
        text: 'Een lezer schrijft aan het weekblad dat zulke bakerpraatjes en spookgeschiedenissen niet in een fatsoenlijke krant thuishoren.' });
      this.write('letter', 'Een boze brief in het weekblad over uw oproep.');
      return;
    }
    // a reader somewhere you have not been, who remembers something from childhood
    const far = sim.alive().filter((n) => !this.met.has(n.id) && n.know.size > 0 && this.age(n) >= 30 && !this.isLoner(n) && !this.visitedPlaces.has(n.place));
    const pool = far.length ? far : sim.alive().filter((n) => !this.met.has(n.id) && n.know.size > 0 && this.age(n) >= 30);
    if (!pool.length) return;
    const n = r.pick(pool);
    const t = [...n.know.entries()].sort((a, b) => b[1].s - a[1].s)[0][0];
    const entry = this.record(n, t, { via: 'brief', site: null, frag: r.chance(0.3) });
    this.met.add(n.id);
    this.trust.set(n.id, Math.max(this.trustOf(n), 0.5));
    const lead = r.chance(0.6) ? this.leadFor(null, n, sim.name(n)) : null;
    const role = this.role(n);
    this.letters.push({ day: this.day, from: n.id, entries: [entry], lead, read: false,
      text: `${sim.name(n)} uit ${this.land.places[n.place].name} (${role}) schrijft u naar aanleiding van uw oproep. Het verhaal hieronder hoorde ${n.first} als kind.${lead ? ` En: „${this.leadName(lead)} weet er veel meer van.”` : ''}` });
    this.write('letter', `Een brief van ${sim.name(n)} uit ${this.land.places[n.place].name}, met een verhaal.`);
  }

  // ------------------------------------------------------------------ the other collector

  /**
   * From the fourth day another collector works the region. Like Poortinga calling on Jaarsma's best tellers,
   * the rival goes where you found good tellers, and leaves them tired of telling.
   */
  private rivalDay() {
    const sim = this.sim;
    if (this.day < 3) return;
    const r = new Rng(sim.seed + this.day * 977);
    if (!this.rival) {
      const tape = this.year >= 1950 && this.archetype !== 'rondreiziger';
      const far = [...this.land.places].sort((a, b) => dist(b, this.land.places[0]) - dist(a, this.land.places[0]))[0];
      this.rival = { who: tape ? 'een meneer met een bandrecorder' : 'een onderwijzer die ook verhalen verzamelt', travel: tape ? 'auto' : 'fiets', at: far.id, from: null, next: null, since: this.day, visited: new Map(), got: [] };
      this.write('rival', `Er is nog iemand in de streek die verhalen verzamelt: ${this.rival.who}. Gezien in ${far.name}. Wat die het eerst opschrijft, is voor u minder waard.`);
    } else if (this.rival.next !== null) {
      this.rival.from = this.rival.at;
      this.rival.at = this.rival.next;
    }
    const rv = this.rival;
    // the best two tellers there whom the rival has not had yet, and the ill first of all
    const there = sim.alive(rv.at).filter((n) => !this.isLoner(n) && n.know.size > 0 && !rv.visited.has(n.id))
      .sort((a, b) => (this.ill.has(b.id) ? 100 : 0) + b.know.size - (this.ill.has(a.id) ? 100 : 0) - a.know.size).slice(0, r.chance(0.7) ? 3 : 2);
    for (const n of there.filter((x) => x.id !== this.quest?.target)) {
      rv.visited.set(n.id, this.day);
      for (const t of r.shuffle([...n.know.keys()]).slice(0, 1 + r.int(2)))
        if (!rv.got.some((g) => g.t === t && g.narrator === n.id)) rv.got.push({ t, narrator: n.id, day: this.day });
      // a lead you had not followed up yet: the rival was there first
      for (const l of this.leads) if (l.narrator === n.id && !l.done) {
        l.done = true;
        l.lines = [...l.lines, '(De ander was u voor.)'];
        this.write('rival', `De andere verzamelaar was u voor bij ${sim.name(n)}.`);
      }
    }
    this.write('rival', `De andere verzamelaar was vandaag in ${this.land.places[rv.at].name}${there.length ? `, bij ${there.map((n) => sim.name(n)).join(' en ')}` : ''}.`);
    // tomorrow: where your best tellers live, half the time; otherwise somewhere with tellers left
    const yours = [...this.met].map((id) => sim.narrators[id])
      .filter((n) => n.died === null && !this.isLoner(n) && n.know.size >= 5 && !rv.visited.has(n.id) && n.place !== rv.at)
      .sort((a, b) => b.know.size - a.know.size);
    const fresh = this.land.places.filter((p) => p.id !== rv.at && sim.alive(p.id).some((n) => !rv.visited.has(n.id) && n.know.size > 0));
    rv.next = yours.length && r.chance(0.55) ? yours[0].place : fresh.length ? r.pick(fresh).id : null;
    if (rv.next !== null) this.write('rival', `Morgen gaat de andere verzamelaar naar ${this.land.places[rv.next].name}, hoort u.`);
  }

  // ------------------------------------------------------------------ the score: what the notebook is worth

  /**
   * Points for one entry. What counts most is what is rare: a kind of tale seldom written down anywhere,
   * one that only this teller still knows, a version nobody else tells. Tales the other collector had first count half.
   */
  points(e: Entry): number {
    if (e.frag) return POINTS.frag;
    let p = 0;
    if (e.kind === 'new') p = TIER[this.tier(e.t)].pts + (e.holders <= 1 ? POINTS.unique : e.holders <= 3 ? POINTS.few : 0);
    else if (e.kind === 'version') p = POINTS.version + (e.vholders <= 1 ? POINTS.ownVersion : 0);
    if (p && this.sim.narrators[e.narrator].died !== null) p += POINTS.saved;
    if (e.quest) p += QUEST_BONUS;
    return e.scoop ? Math.floor(p / 2) : p;
  }

  /** Your finds: entries that are unique in the region or rare in the archive. */
  finds(): Entry[] {
    return this.notebook.filter((e) => !e.frag && e.kind === 'new' && (e.holders <= 1 || this.tier(e.t) === 'zeldzaam'));
  }

  chapterProgress(): { being: string; have: number }[] {
    return this.chapters.map((being) => ({
      being,
      have: new Set(this.notebook.filter((e) => !e.frag && this.sim.type(e.t).being === being).map((e) => e.t)).size,
    }));
  }

  score(): { total: number; tales: number; chapters: number; done: number } {
    const tales = this.notebook.reduce((a, e) => a + this.points(e), 0);
    const done = this.chapterProgress().filter((c) => c.have >= CHAPTER_NEED).length;
    return { total: tales + done * POINTS.chapter, tales, chapters: done * POINTS.chapter, done };
  }

  /** The other collector's tally, counted the same way (without chapters). */
  rivalScore(): number {
    const rv = this.rival;
    if (!rv) return 0;
    const seen = new Set<string>();
    let p = 0;
    for (const g of rv.got) {
      if (seen.has(g.t)) continue;
      seen.add(g.t);
      const k = this.knowers(g.t);
      p += TIER[this.tier(g.t)].pts + (k <= 1 ? POINTS.unique : k <= 3 ? POINTS.few : 0);
    }
    return p;
  }

  // ------------------------------------------------------------------ the record

  private write(kind: Diary['kind'], text: string) {
    this.diary.push({ day: this.day, part: this.part, kind, text });
  }

  /** What was told in the region while you were there: every tale someone knows. */
  toldTypes(): Map<string, number> {
    const m = new Map<string, number>();
    for (const n of this.sim.alive()) for (const t of n.know.keys()) m.set(t, (m.get(t) ?? 0) + 1);
    for (const l of this.lost) for (const t of l.types) if (!m.has(t)) m.set(t, 1);
    return m;
  }
}

function line(x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  let x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    if (x !== x1 && (Math.abs(x1 - x) >= Math.abs(y1 - y))) x += Math.sign(x1 - x);
    else y += Math.sign(y1 - y);
    if (inb(x, y)) out.push(idx(x, y));
  }
  return out;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function themeName(being: string): string {
  return ({
    duivel: 'de duivel', heks: 'heksen', spook: 'spoken', witte_wieven: 'witte wieven', kabouter: 'kabouters', weerwolf: 'weerwolven',
    mare: 'de nachtmerrie', dwaallicht: 'dwaallichten', watergeest: 'watergeesten', spookdier: 'spookdieren', voorgezicht: 'voorgezichten',
    tovenaar: 'tovenaars', reus: 'reuzen', heilige: 'heiligen', schat: 'schatten', vrijmetselaar: 'vrijmetselaars', dood: 'de dood',
  } as Record<string, string>)[being] ?? being;
}
