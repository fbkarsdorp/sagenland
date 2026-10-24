// Map symbols (black ink) and the folklorist's annotations (red ink), as SVG on a 32×32 grid.
// The same markup is used in the HTML legend and rasterised into Phaser textures.

const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const sw = (w: number) => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const F = 'fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"';

export const BUILDING_ICONS: Record<string, string> = {
  huis: `<path ${F} d="M9 15 L16 9 L23 15 L23 23 L9 23 Z"/>`,
  boerderij: `<path ${F} d="M5 16 L10 11 L22 11 L27 16 L27 23 L5 23 Z"/><path ${S} d="M5 27 H27" stroke-dasharray="2 2"/>`,
  molen: `<circle ${F} cx="16" cy="16" r="2.6"/><path ${sw(2)} d="M7 7 L25 25 M25 7 L7 25"/><path ${sw(1)} d="M7 7 L10 5.5 M25 7 L26.5 10 M25 25 L22 26.5 M7 25 L5.5 22"/>`,
  kerk: `<path ${F} d="M6 18 L6 26 L22 26 L22 18 Z"/><path ${F} d="M20 26 L20 12 L23 8 L26 12 L26 26 Z"/><path ${S} d="M23 8 V3 M21 4.6 H25"/>`,
  kerkhof: `<rect ${S} x="5" y="8" width="22" height="18" stroke-dasharray="3 1.6"/><path ${S} d="M11 13 V19 M9 15 H13 M21 13 V19 M19 15 H23 M16 18 V24 M14 20 H18"/>`,
  put: `<circle ${S} cx="12" cy="22" r="4.5"/><path ${S} d="M20 26 V10 M8 6 L28 14"/><path ${sw(1)} d="M10 6.8 V17"/>`,
  herberg: `<path ${F} d="M7 15 L13.5 9 L20 15 L20 25 L7 25 Z"/><path ${S} d="M20 13 H27 M25 13 V16"/><rect ${S} x="22.5" y="16" width="5" height="5"/>`,
  smidse: `<path ${F} d="M6 12 H24 C24 15 21 16 19 16 L19 20 L22 24 H10 L13 20 L13 16 C9 16 7 14 6 12 Z"/><path ${S} d="M24 8 L28 4"/>`,
  kapel: `<path ${F} d="M11 17 L16 12.5 L21 17 L21 25 L11 25 Z"/><path ${S} d="M16 12 V5 M13.5 7.5 H18.5"/>`,
  galg: `<path ${sw(2)} d="M8 27 V7 H24 V27 M8 11 L12 7 M24 11 L20 7"/><path ${sw(1)} d="M16 7 V13"/><circle ${sw(1)} cx="16" cy="15" r="2"/>`,
  school: `<path ${F} d="M5 15 L16 8 L27 15 L27 25 L5 25 Z"/><path ${S} d="M16 8 V3"/><circle ${F} cx="16" cy="3.5" r="1.4"/>`,
  weg: `<path ${S} d="M3 12 C12 10 20 22 29 20 M3 17 C12 15 20 27 29 25"/>`,
  sloop: `<path ${S} d="M8 8 L24 24 M24 8 L8 24"/>`,
  kruisweg: `<path ${sw(2)} d="M16 4 V28 M4 16 H28"/><circle ${S} cx="16" cy="16" r="3"/>`,
  brug: `<path ${S} d="M4 11 C9 13 23 13 28 11 M4 21 C9 19 23 19 28 21"/><path ${sw(1)} d="M8 15 C10 16 12 15 14 16 M18 16 C20 15 22 16 24 15" opacity=".7"/>`,
};

export const BEING_ICONS: Record<string, string> = {
  duivel: `<path ${S} d="M10 12 C10 7 7 5 6 3 C9 5 12 7 13 9 M22 12 C22 7 25 5 26 3 C23 5 20 7 19 9"/><path ${S} d="M9 15 C9 10 23 10 23 15 C23 21 19 25 16 26 C13 25 9 21 9 15 Z"/><path ${sw(1.3)} d="M12 15 L14.5 16.5 M20 15 L17.5 16.5 M13 21 C15 22 17 22 19 21"/>`,
  heks: `<path ${S} d="M5 22 C10 20 22 20 27 22 C22 24 10 24 5 22 Z"/><path ${S} d="M10 21 C13 15 14 9 15 4 C17 7 19 9 23 11 C20 13 20 16 21 21"/><path ${sw(1.2)} d="M11.5 18 C15 17 18 17 21 18"/>`,
  spook: `<path ${S} d="M9 27 L9 13 C9 7 23 7 23 13 L23 27 L20 24.5 L17.5 27 L14.5 24.5 L12 27 Z"/><circle ${F} cx="13.5" cy="14" r="1.2"/><circle ${F} cx="18.5" cy="14" r="1.2"/>`,
  witte_wieven: `<path ${S} d="M16 4 C12 4 11 8 11 11 C11 17 8 22 6 28 C12 26 20 26 26 28 C24 22 21 17 21 11 C21 8 20 4 16 4 Z"/><path ${sw(1)} d="M13 12 C15 13 17 13 19 12 M12 19 C13 22 13 25 12.5 27 M20 19 C19 22 19 25 19.5 27"/>`,
  kabouter: `<path ${S} d="M10 16 L16 3 L22 16 Z"/><path ${S} d="M10 16 C10 22 13 27 16 28 C19 27 22 22 22 16"/><path ${sw(1.2)} d="M12.5 19.5 C14.5 21 17.5 21 19.5 19.5"/><circle ${F} cx="14" cy="17.7" r=".8"/><circle ${F} cx="18" cy="17.7" r=".8"/>`,
  weerwolf: `<path ${S} d="M7 5 L11 13 L8 20 L14 22 L16 27 L18 22 L24 20 L21 13 L25 5 L18 11 H14 Z"/><circle ${F} cx="13" cy="15.5" r="1"/><circle ${F} cx="19" cy="15.5" r="1"/>`,
  mare: `<path ${S} d="M21 4 C14 5 9 10 9 17 C9 23 14 28 21 28 C15 25 13 21 13 16 C13 11 16 7 21 4 Z"/><path ${sw(1.2)} d="M17 15 C18 16.5 20 16.5 21 15 M23 20 L26 19 M23.5 24 L26.5 25"/>`,
  dwaallicht: `<path ${S} d="M16 4 C19 9 22 12 22 17 C22 21 19 24 16 24 C13 24 10 21 10 17 C10 13 13 11 13 8 C15 10 15 12 16 13 C17 10 17 7 16 4 Z"/><circle ${F} cx="7" cy="27" r="1"/><circle ${F} cx="16" cy="28.5" r="1"/><circle ${F} cx="25" cy="27" r="1"/>`,
  watergeest: `<path ${S} d="M3 21 C7 18 10 24 14 21 C18 18 21 24 25 21 C27 19.5 28 20 29 21 M3 27 C7 24 10 30 14 27 C18 24 21 30 25 27"/><path ${S} d="M15 18 V8 M15 8 C15 5 19 5 19 8 V11 M12 10 L15 13 M18 15 L15 14"/>`,
  spookdier: `<path ${S} d="M5 22 L8 16 C10 13 18 13 21 14 L24 9 L25 13 L28 14 L26.5 17 L23 18 L22 22 M8 16 L6 26 M12 18 L11 26 M19 18 L20 26"/><circle ${F} cx="25" cy="13.6" r="1.1"/>`,
  voorgezicht: `<path ${S} d="M3 16 C8 8 24 8 29 16 C24 24 8 24 3 16 Z"/><circle ${S} cx="16" cy="16" r="4.5"/><circle ${F} cx="16" cy="16" r="1.8"/><path ${sw(1)} d="M16 4 V7 M8 6 L9.5 8.5 M24 6 L22.5 8.5"/>`,
  tovenaar: `<circle ${S} cx="16" cy="16" r="11"/><path ${sw(1.3)} d="M16 5.5 L22.2 24.5 L6 12.8 H26 L9.8 24.5 Z"/>`,
  reus: `<path ${S} d="M11 26 C8 22 9 15 12 11 C15 8 21 9 21 14 C21 19 17 21 17 25 C17 28 13 29 11 26 Z"/><circle ${S} cx="13" cy="6" r="1.5"/><circle ${S} cx="17.5" cy="5" r="1.5"/><circle ${S} cx="21.5" cy="7" r="1.3"/><circle ${S} cx="24" cy="10.5" r="1.2"/>`,
  heilige: `<ellipse ${S} cx="16" cy="9" rx="8" ry="3"/><path ${S} d="M16 13 V28 M11 18 H21"/>`,
  schat: `<path ${S} d="M7 14 H25 L23 26 C20 28 12 28 9 26 Z"/><path ${S} d="M7 14 C7 12 25 12 25 14"/><circle ${S} cx="12" cy="8" r="2.5"/><circle ${S} cx="19" cy="6" r="2.5"/><circle ${S} cx="16.5" cy="10.5" r="2"/>`,
  vrijmetselaar: `<path ${S} d="M16 4 L8 26 M16 4 L24 26 M5 22 L16 28 L27 22"/><circle ${S} cx="16" cy="5" r="1.6"/>`,
  mens: `<circle ${S} cx="16" cy="8" r="3.5"/><path ${S} d="M16 12 V21 M10 15 L22 15 M16 21 L11 28 M16 21 L21 28"/>`,
  dood: `<path ${S} d="M9 27 L11 13 C11 7 21 7 21 13 L23 27 Z"/><path ${S} d="M25 4 V28 M25 4 C21 4 18 6 17 8"/>`,
};

export const MISC_ICONS: Record<string, string> = {
  notitieboek: `<rect ${S} x="7" y="4" width="18" height="24" rx="1"/><path ${S} d="M11 4 V28 M14 10 H22 M14 14 H22 M14 18 H20"/>`,
  verzamelaar: `<circle ${S} cx="13" cy="7" r="3"/><path ${S} d="M13 10 V20 L9 28 M13 20 L17 28 M8 14 H18"/><rect ${S} x="18" y="12" width="7" height="9"/>`,
  kroniek: `<path ${S} d="M9 6 H24 V23 C24 27 20 28 18 25 H9 Z M9 6 C6 6 6 10 9 10 M13 11 H20 M13 15 H20 M13 19 H17"/>`,
  catalogus: `<path ${S} d="M5 6 H14 C15.5 6 16 7 16 8 V27 C16 26 15 25 14 25 H5 Z M27 6 H18 C16.5 6 16 7 16 8 V27 C16 26 17 25 18 25 H27 Z"/>`,
  kaart: `<path ${S} d="M4 7 L11 4 L21 7 L28 4 V25 L21 28 L11 25 L4 28 Z M11 4 V25 M21 7 V28"/>`,
  pause: `<path ${F} d="M10 7 H14 V25 H10 Z M18 7 H22 V25 H18 Z"/>`,
  play: `<path ${F} d="M10 6 L25 16 L10 26 Z"/>`,
  fast: `<path ${F} d="M5 7 L16 16 L5 25 Z M16 7 L27 16 L16 25 Z"/>`,
  faster: `<path ${F} d="M2 8 L11 16 L2 24 Z M11 8 L20 16 L11 24 Z M20 8 L29 16 L20 24 Z"/>`,
  sluit: `<path ${S} d="M9 9 L23 23 M23 9 L9 23"/>`,
  vertelavond: `<path ${S} d="M11 28 H21 M16 28 V17 M12 17 H20 L18.5 13 H13.5 Z"/><path ${S} d="M16 3 C13.5 6.5 13.5 9 16 10.5 C18.5 9 18.5 6.5 16 3 Z"/><path ${S} d="M7 11 C8 13 8 15 7 17 M25 11 C24 13 24 15 25 17"/>`,
  streek: `<path ${S} d="M16 29 C9 20 7 16 7 12 A9 9 0 0 1 25 12 C25 16 23 20 16 29 Z"/><circle ${S} cx="16" cy="12" r="3.2"/>`,
  geluid: `<path ${S} d="M5 12 H10 L17 6 V26 L10 20 H5 Z"/><path ${S} d="M21 11 C23 13 23 19 21 21 M24 8 C28 12 28 20 24 24"/>`,
  stil: `<path ${S} d="M5 12 H10 L17 6 V26 L10 20 H5 Z"/><path ${S} d="M21 12 L28 20 M28 12 L21 20"/>`,
};

export function svg(markup: string, size = 32, color = 'currentColor', extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" style="color:${color}" ${extra}>${markup}</svg>`;
}

export function svgDataUri(markup: string, color: string, size: number): string {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" color="${color}">${markup}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
}

export function beingIcon(being: string | undefined): string {
  return BEING_ICONS[being ?? ''] ?? BEING_ICONS.spook;
}

export const BEING_NL: Record<string, string> = {
  duivel: 'Duivel', heks: 'Heksen', spook: 'Spoken en doden', witte_wieven: 'Witte wieven', kabouter: 'Kabouters',
  weerwolf: 'Weerwolven', mare: 'Nachtmerrie', dwaallicht: 'Dwaallichten', watergeest: 'Watergeesten',
  spookdier: 'Spookdieren', voorgezicht: 'Voorgezicht', tovenaar: 'Tovenaars en bezweerders', reus: 'Reuzen',
  heilige: 'Heiligen en wonderen', schat: 'Schatten', vrijmetselaar: 'Vrijmetselaars', mens: 'Mensen', dood: 'De dood',
};
