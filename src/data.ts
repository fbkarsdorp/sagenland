// Data bundles produced by scripts/build_data.py

export interface Variant {
  n: number;            // Verhalenbank item number
  t: string;            // SINSAG type code
  d: string;            // Standard Dutch summary
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
  if (!res.ok) throw new Error(`Kon ${path} niet laden (${res.status})`);
  return res.json() as Promise<T>;
}

let metaPromise: Promise<Meta> | null = null;
export function loadMeta(): Promise<Meta> {
  metaPromise ??= getJSON<Meta>('meta.json');
  return metaPromise;
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
  const data = await getJSON<{ variants: Variant[] }>(`${region}.json`);
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
