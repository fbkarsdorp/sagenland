// The game in Dutch or in English. The language is fixed for a page load: ?lang=en|nl, else the last choice,
// else the browser's language (Dutch for Dutch readers, English for everyone else). Switching reloads the page,
// so tables of text built when a module loads are always in the right language.

export type Lang = 'nl' | 'en';
const KEY = 'sagenland-lang';

function detect(): Lang {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'nl' || asked === 'en') return asked;
  try {
    const kept = localStorage.getItem(KEY);
    if (kept === 'nl' || kept === 'en') return kept;
  } catch {
    // no storage: fall through to the browser's language
  }
  return (navigator.languages ?? [navigator.language]).some((l) => /^nl\b/i.test(l)) ? 'nl' : 'en';
}

export const LANG: Lang = detect();
export const EN = LANG === 'en';
export const LOCALE = EN ? 'en-GB' : 'nl-NL';

/** The Dutch text, or its English counterpart in the English edition. */
export const L = (nl: string, en: string): string => (EN ? en : nl);

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // without storage the choice holds through the URL alone
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  location.href = url.toString();
}

// Names from the archive's metadata, for the English edition
export const REGION_EN: Record<string, string> = {
  friesland: 'Friesland', oosten: 'Eastern Netherlands', limburg: 'Limburg', brabant: 'Brabant',
  antwerpen: 'Antwerp Kempen', oostvl: 'East Flanders', westvl: 'West Flanders',
};

export const ARCHETYPE_EN: Record<string, string> = {
  volhouder: 'The regular', rondreiziger: 'The traveller', student: 'The student', notabele: 'The village doctor',
};

export const TAG_EN: Record<string, string> = {
  duivel: 'the devil', heks: 'a witch', spook: 'a ghost', witte_wieven: 'the white women', kabouter: 'gnomes',
  weerwolf: 'a werewolf', mare: 'the nightmare', dwaallicht: "will-o'-the-wisps", watergeest: 'a water spirit',
  spookdier: 'a ghostly animal', voorgezicht: 'second sight', tovenaar: 'a sorcerer', reus: 'a giant',
  heilige: 'a saint', bokkenrijder: 'the goat riders', vrijmetselaar: 'the freemasons', dood: 'death',
  molen: 'the mill', kerk: 'the church', kerkhof: 'the churchyard', put: 'the well', kruisweg: 'the crossroads',
  herberg: 'the inn', smidse: 'the smithy', brug: 'the bridge', boerderij: 'the farm', huis: 'the house',
  heide: 'the heath', veen: 'the bog', bos: 'the woods', water: 'the water', kasteel: 'the castle',
  kapel: 'the chapel', galg: 'the gallows', weg: 'the road', zee: 'the sea',
  kat: 'a cat', hond: 'a dog', haas: 'a hare', paard: 'a horse', varken: 'a pig', koe: 'a cow', bok: 'a billy goat',
  pad: 'a toad', boter: 'the butter', melk: 'the milk', kaarten: 'a card game', dans: 'a dance', geld: 'money',
  kist: 'a chest', licht: 'a light', vuur: 'fire', kruis: 'a cross', gebed: 'a prayer', pastoor: 'the priest',
  middernacht: 'midnight', kind: 'a child', bruid: 'a wedding', mes: 'a knife', ketting: 'chains',
  zout: 'salt and bread', schoen: 'shoes', wagen: 'a cart', soldaat: 'soldiers', dief: 'a thief', hoofd: 'no head',
};
