// The colophon: who made the game, with what, and where the tales, the data and the research behind it can be
// found. A leaf of its own over whatever is on screen, so it can be opened from the start page as well as in play.

import { EN } from './i18n';

const A = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

const HTML_NL = `
  <div class="leaf sheet colofon-leaf" role="dialog" aria-label="Colofon">
    <button class="iconbtn close" data-colofon-close aria-label="Sluiten">×</button>
    <div class="kicker">Sagenland</div>
    <h1>Colofon</h1>

    <h2>Gemaakt door</h2>
    <p>Folgert Karsdorp en Claude (Anthropic), samen, in gesprek, in oktober 2026.
      Het spel, de kaart, de figuren, de gezichten en de geluiden zijn in code getekend en gemaakt; alleen de muziek komt van elders.</p>

    <h2>De verhalen</h2>
    <p>Elke sage in het spel is een echte, opgetekende variant uit de
      ${A('https://www.verhalenbank.nl', 'Nederlandse Volksverhalenbank')} van het
      ${A('https://www.meertens.knaw.nl', 'Meertens Instituut')} (KNAW). De samenvattingen en de opgetekende teksten komen
      uit de Verhalenbank; bij elk verhaal in uw schrift staat een link naar het oorspronkelijke record, met de verteller,
      de verzamelaar, de plaats en het jaar. De verhaaltypen volgen de SINSAG-catalogus van sagentypen waarmee de Verhalenbank werkt.</p>
    <p>In de Engelse uitgave van het spel zijn de samenvattingen met Claude uit het Nederlands vertaald; de opgetekende teksten
      zelf staan er in het Nederlands of in het dialect waarin ze werden opgeschreven.</p>
    <p>De streken, dorpen en vertellers in het spel zijn verzonnen. Hoe de verzamelaars werken, wie wat vertelt en hoe
      verhalen zich verspreiden, is afgeleid uit de metadata van het archief: wie verzamelde waar, wanneer, en bij wie.</p>

    <h2>Achtergrond</h2>
    <p>Hoe verzamelaars hun vertellers vonden en hoe vertellers op hen reageerden, is gebaseerd op:</p>
    <ul>
      <li>A.J. Dekker, ‘150 jaar Nederlands volksverhaalonderzoek’, <i>Volkskundig Bulletin</i> 4:1 (1978).
        ${A('https://meertenspublicaties.meertens.knaw.nl/pdf/vb/021_VB_1978_4.1.pdf', 'PDF bij het Meertens Instituut')}</li>
      <li>T. Dekker, ‘Zonder verzamelaars geen sprookjes’, <i>Volkskundig Bulletin</i> 24:2 (1998).
        ${A('https://meertenspublicaties.meertens.knaw.nl/pdf/vb/296_VB_1998_24.2.pdf', 'PDF bij het Meertens Instituut')}</li>
      <li>E. Venbrux en T. Meder, ‘Authenticity as an analytic concept in folkloristics: a case of collecting folktales in Friesland’,
        <i>Etnofoor</i> 17:1/2 (2004), 199–214.
        ${A('https://www.jstor.org/action/doBasicSearch?Query=%22Authenticity+as+an+analytic+concept+in+folkloristics%22', 'Zoeken in JSTOR')}</li>
    </ul>

    <h2>Gemaakt met</h2>
    <ul>
      <li>${A('https://phaser.io', 'Phaser')} 3, voor de kaart en alles wat daarop beweegt; ${A('https://www.typescriptlang.org', 'TypeScript')}
        en ${A('https://vite.dev', 'Vite')}.</li>
      <li>Lettertypen: IM Fell English (Igino Marini) en EB Garamond (Georg Duffner), via ${A('https://fontsource.org', 'Fontsource')}, onder de SIL Open Font License.</li>
      <li>Geluid: met de Web Audio API in het spel zelf gemaakt, van het klokgelui tot de midwinterhoorn.</li>
      <li>Muziek bij nacht: ${A('https://n91music.itch.io/free-atmospheric-assets', 'N.91music')}.</li>
    </ul>

    <h2>Broncode</h2>
    <p>${A('https://github.com/fbkarsdorp/sagenland', 'github.com/fbkarsdorp/sagenland')}</p>
  </div>`;

const HTML_EN = `
  <div class="leaf sheet colofon-leaf" role="dialog" aria-label="Colophon">
    <button class="iconbtn close" data-colofon-close aria-label="Close">×</button>
    <div class="kicker">Sagenland</div>
    <h1>Colophon</h1>

    <h2>Made by</h2>
    <p>Folgert Karsdorp and Claude (Anthropic), together, in conversation, in October 2026.
      The game, the map, the figures, the faces and the sounds were drawn and made in code; only the music comes from elsewhere.</p>

    <h2>The tales</h2>
    <p>Every legend in the game is a real recorded variant from the
      ${A('https://www.verhalenbank.nl', 'Dutch Folktale Database')} (Nederlandse Volksverhalenbank) of the
      ${A('https://www.meertens.knaw.nl', 'Meertens Institute')} (KNAW). The summaries and the recorded texts come
      from the Verhalenbank; every tale in your notebook links to the original record, with the storyteller,
      the collector, the place and the year. The tale types follow the SINSAG catalogue of legend types used by the Verhalenbank.</p>
    <p>In this English edition the summaries were translated from Dutch with Claude. The recorded texts themselves
      are in Dutch, or in the dialect they were written down in.</p>
    <p>The regions, villages and storytellers in the game are invented. How the collectors work, who tells what and how
      tales spread is derived from the archive’s metadata: who collected where, when, and from whom.</p>

    <h2>Background</h2>
    <p>How collectors found their storytellers and how storytellers responded to them is based on:</p>
    <ul>
      <li>A.J. Dekker, ‘150 jaar Nederlands volksverhaalonderzoek’, <i>Volkskundig Bulletin</i> 4:1 (1978).
        ${A('https://meertenspublicaties.meertens.knaw.nl/pdf/vb/021_VB_1978_4.1.pdf', 'PDF at the Meertens Institute')}</li>
      <li>T. Dekker, ‘Zonder verzamelaars geen sprookjes’, <i>Volkskundig Bulletin</i> 24:2 (1998).
        ${A('https://meertenspublicaties.meertens.knaw.nl/pdf/vb/296_VB_1998_24.2.pdf', 'PDF at the Meertens Institute')}</li>
      <li>E. Venbrux and T. Meder, ‘Authenticity as an analytic concept in folkloristics: a case of collecting folktales in Friesland’,
        <i>Etnofoor</i> 17:1/2 (2004), 199–214.
        ${A('https://www.jstor.org/action/doBasicSearch?Query=%22Authenticity+as+an+analytic+concept+in+folkloristics%22', 'Search JSTOR')}</li>
    </ul>

    <h2>Made with</h2>
    <ul>
      <li>${A('https://phaser.io', 'Phaser')} 3, for the map and everything that moves on it; ${A('https://www.typescriptlang.org', 'TypeScript')}
        and ${A('https://vite.dev', 'Vite')}.</li>
      <li>Typefaces: IM Fell English (Igino Marini) and EB Garamond (Georg Duffner), via ${A('https://fontsource.org', 'Fontsource')}, under the SIL Open Font License.</li>
      <li>Sound: made with the Web Audio API in the game itself, from the church bells to the midwinter horn.</li>
      <li>Night music: ${A('https://n91music.itch.io/free-atmospheric-assets', 'N.91music')}.</li>
    </ul>

    <h2>Source code</h2>
    <p>${A('https://github.com/fbkarsdorp/sagenland', 'github.com/fbkarsdorp/sagenland')}</p>
  </div>`;

const HTML = EN ? HTML_EN : HTML_NL;

export function openColofon() {
  if (document.querySelector('#colofon')) return;
  const el = document.createElement('div');
  el.id = 'colofon';
  el.innerHTML = HTML;
  document.body.appendChild(el);
  const close = () => {
    el.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    if (e.target === el || (e.target as HTMLElement).closest('[data-colofon-close]')) close();
  });
}
