// Data bundles produced by scripts/build_data.py, and the English summaries from scripts/translate.ts
import { ARCHETYPE_EN, EN, L, REGION_EN, TAG_EN } from './i18n';

export interface Variant {
  n: number;            // Verhalenbank item number
  t: string;            // SINSAG type code
  d: string;            // summary: Standard Dutch, or English in the English edition
  y: number | null;     // year recorded
  c: number;            // collector index into meta.collectors
  r: string;            // archive record identifier
  l: number;            // language/dialect index into meta.langs
  g: number[];          // motif tags (indices into meta.tags)
  nb: [number, number][]; // nearest same-type variants in the region: [n, cosine]
}

export interface TypeInfo {
  nl: string;
  en: string;
  name: string;         // the name to show: nl or en
  being: string;
  places: string[];
  gist: string;
  total: number;
}

export interface RealStats {
  name: string;
  n: number;
  sage: number;
  tellers: number;
  years: [number, number];
  days?: number;
  per_visit: number;
  visits_per_teller: number;
  top5: number;
  places?: number;
  radius_km?: number;
  tellers_median?: number;
}

export interface Archetype {
  nl: string;
  name: string;
  real: RealStats;
  alt?: RealStats[];
  regions: Record<string, number>;
  params: {
    mode: 'return' | 'tour' | 'parish' | 'resident';
    every?: number;
    stay: number;
    sessions: number;
    per_visit: number;
    revisit: number;
    radius: number;
    prolific: number;
    start_frac: number;
  };
}

export interface RegionMeta {
  nl: string;
  name: string;
  count: number;
  types: number;
  firsts: string[];
  lasts: string[];
  collectors: [string, number][];
  attract: Record<string, [string, number][]>;
  years: [number, number] | null;
  decades: [number, number][];
  langs: [string, number][];
  top: [string, number][];
  beings: [string, number][];
  typical: string[];
  pts: [number, number, number][];
}

export interface Tag { id: string; cat: 'being' | 'place' | 'motif'; label: string }

export interface Meta {
  archetypes: Record<string, Archetype>;
  regions: Record<string, RegionMeta>;
  tags: Tag[];
  types: Record<string, TypeInfo>;
  collectors: string[];
  langs: string[];
  geo: [number, number, number][];
}

export interface Corpus {
  region: string;
  meta: Meta;
  variants: Map<number, Variant>;
  byType: Map<string, Variant[]>;
  texts?: Record<string, string>;
}

const base = import.meta.env?.BASE_URL ?? './';

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(L(`Kon ${path} niet laden (${res.status})`, `Could not load ${path} (${res.status})`));
  return res.json() as Promise<T>;
}

let metaPromise: Promise<Meta> | null = null;
export function loadMeta(): Promise<Meta> {
  metaPromise ??= getJSON<Meta>('meta.json').then(nameMeta);
  return metaPromise;
}

/** Fills in the names to show, in the language of this edition. */
export function nameMeta(meta: Meta): Meta {
  for (const t of Object.values(meta.types)) t.name = EN ? t.en : t.nl;
  for (const [k, r] of Object.entries(meta.regions)) r.name = EN ? (REGION_EN[k] ?? r.nl) : r.nl;
  for (const [k, a] of Object.entries(meta.archetypes)) {
    a.name = EN ? (ARCHETYPE_EN[k] ?? a.nl) : a.nl;
    // the student collections are named by a description, not a person
    if (EN) a.real.name = a.real.name.replace(/^(\d+) Vlaamse en Limburgse studenten$/, '$1 Flemish and Limburg students');
  }
  if (EN) for (const t of meta.tags) t.label = TAG_EN[t.id] ?? t.label;
  return meta;
}

export function buildCorpus(region: string, meta: Meta, variants: Variant[]): Corpus {
  const map = new Map<number, Variant>();
  const byType = new Map<string, Variant[]>();
  for (const v of variants) {
    if (!meta.types[v.t]) continue;
    map.set(v.n, v);
    let arr = byType.get(v.t);
    if (!arr) byType.set(v.t, (arr = []));
    arr.push(v);
  }
  return { region, meta, variants: map, byType };
}

export async function loadCorpus(region: string): Promise<Corpus> {
  const meta = await loadMeta();
  const [data, en] = await Promise.all([
    getJSON<{ variants: Variant[] }>(`${region}.json`),
    EN ? getJSON<Record<string, string>>(`${region}-en.json`) : null,
  ]);
  if (en) for (const v of data.variants) v.d = en[v.n] ?? v.d;
  return buildCorpus(region, meta, data.variants);
}

const textCache = new Map<string, Promise<Record<string, string>>>();
export async function loadText(region: string, n: number): Promise<string | null> {
  if (!textCache.has(region)) textCache.set(region, getJSON<Record<string, string>>(`${region}-texts.json`));
  const texts = await textCache.get(region)!;
  return texts[String(n)] ?? null;
}

export function verhalenbankUrl(n: number): string {
  return `https://www.verhalenbank.nl/items/show/${n}`;
}
