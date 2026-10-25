// Names, dates and the little sentences that describe how a story changed.
import type { Meta, Variant } from './data';
import { Rng } from './rng';
import { L } from './i18n';

// Village names in the toponymic style of each region (partly invented, partly borrowed from small hamlets)
const PLACE_NAMES: Record<string, string[]> = {
  friesland: ['Wâldsein', 'Easterwierum', 'Jirnsterbrêge', 'Haskerwâld', 'Aldeterp', 'Sânfeart', 'Nijemardum', 'Tsjerkegea', 'Westerlinde', 'Feanhuzen', 'Ikkerwier', 'Boelingahuzen'],
  limburg: ['Haeselbroek', 'Sint-Odilienrade', 'Mortelveld', 'Kesselhei', 'Brunssum-Aerde', 'Overhoven', 'Lindenrade', 'Grubbenhof', 'Heukelom-Veld', 'Swalmerberg', 'Elsloo-Heide', 'Truibroek'],
  westvl: ['Sint-Baafskapelle', 'Wulvergem-Veld', 'Moerkerke-Broek', 'Hoogstade', 'Loppemhoek', 'Vladsloo-Meersen', 'Keiem-Polder', 'Westrozebeke', 'Zillebeke-Dorp', 'Merkembrugge', 'Oostnieuwkerke', 'Elverdinge-Hoek'],
  brabant: ['Kortenaken-Veld', 'Sint-Joris-Rode', 'Molenbeek-Wersbeek', 'Tielt-Winge', 'Hakendover', 'Linkebeekhoek', 'Wezemaal-Heide', 'Neervelp', 'Kumtich-Bos', 'Oplinter', 'Assent-Dorp', 'Rillaar-Broek'],
  antwerpen: ['Mol-Wezel', 'Kasterlee-Heide', 'Retie-Schoonbroek', 'Lichtaart-Veld', 'Zammel', 'Gierle-Hoek', 'Poederlee', 'Achterbos', 'Sint-Jozef-Rijkevorsel', 'Vorselaar-Heide', 'Grobbendonk-Broek', 'Tongerlo-Hoeven'],
  oostvl: ['Sint-Lievens-Esse', 'Zomergem-Kouter', 'Lovendegem-Veld', 'Ertvelde-Hoek', 'Waarschoot-Bos', 'Kaprijke-Meers', 'Eksaarde', 'Moerbeke-Polder', 'Hamme-Zogge', 'Lede-Papegem', 'Nazareth-Kouter', 'Bachte-Leerne'],
  oosten: ['Ootmarsum-Veld', 'Haarle', 'Lemselo', 'Geesteren-Esch', 'Holtheme', 'Mander', 'Vasse-Hoek', 'Tilligte', 'Eschveld', 'Reutum', 'Saasveld-Broek', 'Hezingen'],
};

export function placeNames(region: string, rng: Rng): string[] {
  return rng.shuffle([...(PLACE_NAMES[region] ?? PLACE_NAMES.brabant)]);
}

export function makeNamer(meta: Meta, region: string, rng: Rng) {
  const r = meta.regions[region];
  const firsts = r.firsts.length > 20 ? r.firsts : [...r.firsts, ...meta.regions.brabant.firsts];
  const lasts = r.lasts.length > 30 ? r.lasts : [...r.lasts, ...meta.regions.brabant.lasts];
  const used = new Set<string>();
  return () => {
    for (let i = 0; i < 20; i++) {
      // skew towards common names, as in the teller metadata
      const f = firsts[Math.floor(rng.next() ** 1.6 * firsts.length)];
      const l = lasts[Math.floor(rng.next() ** 1.3 * lasts.length)];
      const name = `${f} ${l}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return `${rng.pick(firsts)} ${rng.pick(lasts)}`;
  };
}

export const SEASONS = ['lente', 'zomer', 'herfst', 'winter'] as const;
export const WEEKS_PER_YEAR = 52;

export function seasonOf(week: number): number {
  const w = ((week % WEEKS_PER_YEAR) + WEEKS_PER_YEAR) % WEEKS_PER_YEAR;
  return Math.floor(w / 13);
}

export function dateLabel(startYear: number, week: number): string {
  const y = startYear + Math.floor(week / WEEKS_PER_YEAR);
  return `${SEASONS[seasonOf(week)]} ${y}`;
}

export function yearOf(startYear: number, week: number): number {
  return startYear + Math.floor(week / WEEKS_PER_YEAR);
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export function fullDate(startYear: number, week: number): string {
  const y = yearOf(startYear, week);
  const w = week % WEEKS_PER_YEAR;
  const m = Math.min(11, Math.floor((w / WEEKS_PER_YEAR) * 12));
  const d = 1 + ((w * 7) % 28);
  return `${d} ${MONTHS[(m + 2) % 12]} ${m >= 10 ? y + 1 : y}`;
}

// ---------------------------------------------------------------------------
// Describing change between two variants of the same tale type

function tagsBy(meta: Meta, v: Variant, cat: string): string[] {
  return v.g.filter((g) => meta.tags[g]?.cat === cat).map((g) => meta.tags[g].id);
}

function label(meta: Meta, id: string): string {
  return meta.tags.find((t) => t.id === id)?.label ?? id;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PLURAL = new Set(['witte_wieven', 'kabouter', 'dwaallicht', 'bokkenrijder', 'vrijmetselaar', 'ketting', 'soldaat', 'schoen', 'zout']);
const v = (ids: string[], sg: string, pl: string) => (ids.length > 1 || PLURAL.has(ids[0]) ? pl : sg);

/** One or two Dutch sentences that say what changed when `a` became `b`. */
export function describeChange(meta: Meta, a: Variant, b: Variant): string {
  const out: string[] = [];
  for (const cat of ['being', 'place', 'motif']) {
    const A = new Set(tagsBy(meta, a, cat)), B = new Set(tagsBy(meta, b, cat));
    const gone = [...A].filter((x) => !B.has(x));
    const added = [...B].filter((x) => !A.has(x));
    if (!gone.length && !added.length) continue;
    if (cat === 'being') {
      if (gone.length && added.length) out.push(`${cap(label(meta, gone[0]))} ${v([gone[0]], 'werd', 'werden')} ${label(meta, added[0])}.`);
      else if (added.length) out.push(`Nu ${v([added[0]], 'speelt', 'spelen')} ook ${label(meta, added[0])} mee.`);
      else out.push(`${cap(label(meta, gone[0]))} ${v([gone[0]], 'verdween', 'verdwenen')} uit het verhaal.`);
    } else if (cat === 'place') {
      if (gone.length && added.length) out.push(`Het speelt nu bij ${label(meta, added[0])}, niet meer bij ${label(meta, gone[0])}.`);
      else if (added.length) out.push(`Het verhaal kreeg ${label(meta, added[0])} erbij.`);
      else out.push(`${cap(label(meta, gone[0]))} raakte uit het verhaal.`);
    } else {
      const parts: string[] = [];
      const ad = added.slice(0, 2), go = gone.slice(0, 2);
      if (ad.length) parts.push(`er ${v(ad, 'kwam', 'kwamen')} ${ad.map((x) => label(meta, x)).join(' en ')} in`);
      if (go.length) parts.push(`${go.map((x) => label(meta, x)).join(' en ')} ${v(go, 'verdween', 'verdwenen')}`);
      out.push(cap(parts.join('; ')) + '.');
    }
    if (out.length >= 2) break;
  }
  return out.length ? out.join(' ') : 'Andere woorden, andere mensen, hetzelfde verhaal.';
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What the land looks like, and so what the generated sheet will show. */
export const REGION_LAND: Record<string, string> = {
  friesland: 'Klei langs de kust, laagveen en meren in het zuidwesten, zandgrond met houtwallen in de Wouden. Op het blad: veel water en veen, weinig heide.',
  oosten: 'Zandgronden met esdorpen, heide en hoogveen, van het Groninger wierdenland tot de Achterhoek. Op het blad: heide, veen en bos.',
  limburg: 'Het Maasdal, met bossen en heide op de hogere gronden en löss in het zuiden. Op het blad: veel bos en heide.',
  brabant: 'Zandgrond met akkers, bossen en vennen, dorpen rond een kerk en een plein. Op het blad: akkers en bos.',
  antwerpen: 'De Kempen: heide, vennen, dennenbossen en schrale zandgrond, met de dorpen ver uit elkaar. Op het blad: veel heide.',
  oostvl: 'Het Meetjesland en het Waasland: akkers en weiden, bomenrijen langs de beken, polders naar het noorden. Op het blad: open akkerland.',
  westvl: 'Polders achter de duinen, akkers en hofsteden in het binnenland: vlak en open land. Op het blad: akkers, weinig heide of bos.',
};

/** "Wever, F." → "F. Wever" */
export function personName(s: string): string {
  const m = s.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : s;
}

/** "a, b en c" */
export function listOf(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${L('en', 'and')} ${items[items.length - 1]}`;
}
