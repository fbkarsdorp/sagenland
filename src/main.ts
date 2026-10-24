import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500.css';
import './style.css';

import { loadCorpus, loadMeta, type Meta } from './data';
import { G } from './game';
import { Rng } from './rng';
import { PERSONA, newField, type Season } from './field';
import { BOX, IDLE_FRAMES, RIDE_FRAMES, drawRider } from './rider';
import { mountHero } from './hero';
import { placeNames, esc, personName } from './text';
import { mountLocator, regionProfile } from './region';
import { initSound } from './sound';
import { catalogue } from './catalogue';

const ORDER = ['friesland', 'oosten', 'limburg', 'antwerpen', 'brabant', 'oostvl', 'westvl'];
/** ?admin opens the admin panel; ?region=…&arch=…&seed=… replays a season, with &go straight into it */
const PARAMS = new URLSearchParams(location.search);

async function main() {
  initSound();
  const setup = document.querySelector<HTMLElement>('#setup')!;
  setup.innerHTML = '<div class="leaf sheet" style="text-align:center"><p class="fell" style="font-size:22px">Sagenland</p><p class="sub">De kaart wordt opgehaald…</p></div>';
  let meta: Meta;
  try {
    meta = await loadMeta();
  } catch (e) {
    setup.innerHTML = `<div class="leaf sheet"><p>Het archief kon niet worden geladen: ${esc(String(e))}</p></div>`;
    return;
  }
  const r = PARAMS.get('region'), a = PARAMS.get('arch');
  if (PARAMS.has('go') && r && meta.regions[r] && a && archetypesFor(meta, r).includes(a)) {
    start(r, a, placeNames(r, new Rng(+(PARAMS.get('seed') ?? 1)))[0], setup);
    return;
  }
  renderSetup(meta, setup);
}

function archetypesFor(meta: Meta, region: string): string[] {
  return Object.entries(meta.archetypes)
    .filter(([, a]) => a.regions[region])
    .sort((a, b) => b[1].regions[region] - a[1].regions[region])
    .map(([k]) => k);
}

function renderSetup(meta: Meta, setup: HTMLElement) {
  const rng = new Rng(Date.now() & 0xffff);
  const askedRegion = PARAMS.get('region');
  let region = askedRegion && meta.regions[askedRegion] ? askedRegion : ORDER[rng.int(ORDER.length)];
  const askedArch = PARAMS.get('arch');
  let arch = askedArch && archetypesFor(meta, region).includes(askedArch) ? askedArch : archetypesFor(meta, region)[0];
  let name = placeNames(region, rng)[0];
  let nameTouched = false;
  const blurb: Record<string, string> = {
    volhouder: 'U komt terug bij wie al veel vertelde. Op de fiets.',
    rondreiziger: 'U reist met de auto en de bandrecorder langs zoveel dorpen als u kunt.',
    student: 'U schrijft een scriptie over de verhalen van uw eigen streek. Te voet.',
    notabele: 'U bent dokter en komt overal binnen, al gaat het met paard en rijtuig niet snel.',
  };

  setup.innerHTML = `
    <canvas id="setup-bg" aria-hidden="true"></canvas>
    <div class="leaf sheet setup-leaf">
      <div class="hero">
        <canvas id="hero" aria-hidden="true"></canvas>
        <div class="cartouche">
          <h1>Sagenland</h1>
          <div class="tag">Twaalf dagen in het veld, en wat het archief ervan bewaarde</div>
        </div>
        <div class="hero-region" id="hero-region"></div>
      </div>
      <p class="intro">U bent verzamelaar van volksverhalen. Twaalf dagen hebt u in een streek met een handvol dorpen, waar mensen nog vertellen over de duivel bij de molen, de nachtmerrie in de stal, lichtjes boven het veen.
      U fietst, loopt of rijdt van dorp naar dorp, zoekt mensen op en luistert. Wie u kent, vertelt meer; wie oud en ziek is, kan niet op u wachten.
      Wat u opschrijft, is wat het archief later van deze streek weet. Aan het eind ziet u wat er verteld werd, en wat er in uw schrift staat.</p>
      <div class="start-row">
        <button class="btn primary big" id="start">Begin het spel</button>
        <p class="sub">Kies eerst een streek en wie u bent, of <button class="linkbtn" id="quick">speel meteen in <span id="quick-region"></span></button>.</p>
      </div>
      <p class="sub" style="text-align:center">Elke versie in het spel is een echte, opgetekende variant uit de Nederlandse Volksverhalenbank.</p>

      <div class="choose-intro" id="choose">
        <b>Voor u begint: drie keuzes.</b> Ze zijn alle drie al ingevuld. Kijk gerust rond en verander wat u wilt,
        of begin meteen met de knop onderaan.
      </div>

      <h2 class="step">I · De streek</h2>
      <p class="step-why">Waar u gaat verzamelen. Elke streek heeft zijn eigen verhalen: hier meer heksen, daar meer spoken of voortekens. Klik op een naam of op de kaart.</p>
      <div class="region-pick">
        <figure class="locator">
          <canvas id="locator" aria-label="Kaart van Nederland en Vlaanderen; klik een streek aan"></canvas>
          <figcaption>Elke stip is een plaats waar het archief verhalen optekende. <span class="red">Rood</span>: de gekozen streek. <span id="loc-note"></span></figcaption>
        </figure>
        <div>
          <div class="region-list" id="region-list"></div>
          <div class="region-profile" id="region-profile"></div>
        </div>
      </div>

      <h2 class="step">II · Wie u bent</h2>
      <p class="step-why">Elke verzamelaar werkt anders, naar het voorbeeld van echte verzamelaars uit het archief: hoe u reist, hoe snel, en hoe mensen op u reageren.</p>
      <div class="choices" id="arch-list"></div>

      <h2 class="step">III · Waar u logeert</h2>
      <p class="step-why">Het dorp waar u begint en elke avond kunt terugkeren. Verzin een naam, of laat er een voor u kiezen.</p>
      <div class="begin-row">
        <div class="choice-sum" id="choice-sum"></div>
        <div class="field"><label for="village" class="sub">Logeert in</label><input id="village" maxlength="28" autocomplete="off" />
          <button class="iconbtn reroll" id="reroll" title="Een andere naam">↻</button></div>
        <button class="btn primary" id="begin">Begin in <span id="begin-region"></span></button>
      </div>

      <details class="howto-wrap">
        <summary>Hoe het werkt</summary>
        <div class="howto">
          <p><b>Erheen.</b> Klik op een dorp of een plek op de kaart. Waar u geweest bent, krijgt de kaart kleur; de rest blijft een gedrukte, verbleekte kaart.</p>
          <p><b>Luisteren.</b> Zoek mensen op en vraag naar heksen, spoken of de duivel, laat ze vertellen wat ze willen, of vraag wie er nog meer weet.</p>
          <p><b>Gehoord.</b> Wat mensen over anderen vertellen, schrijft u in potlood op de kaart: iemand die veel weet, een plek waar het spookt, een vertelavond.</p>
          <p><b>De tijd.</b> Elke dag heeft een ochtend, een middag, een avond en een nacht. Reizen en bezoeken kosten tijd. ’s Avonds hebben mensen meer tijd voor u; ’s nachts ziet u soms dingen die er overdag niet zijn.</p>
        </div>
      </details>
      <p class="colophon">Gebaseerd op de Nederlandse Volksverhalenbank (Meertens Instituut). Typenummers volgen de SINSAG-catalogus.<br/>Verzamelaars in het spel werken naar patronen die uit de metadata van het archief zijn afgeleid.<br/>Muziek bij nacht: N.91music (n91music.itch.io).</p>
    </div>`;

  const input = setup.querySelector<HTMLInputElement>('#village')!;
  const pick = (r: string) => {
    if (r === region) return;
    region = r;
    if (!nameTouched) name = placeNames(region, new Rng(Date.now() & 0xffff))[0];
    draw();
  };
  const loc = mountLocator(setup.querySelector<HTMLCanvasElement>('#locator')!, meta, region, { all: true, onPick: pick });
  const hero = mountHero(setup.querySelector<HTMLCanvasElement>('#hero')!, region, meta.regions[region].nl, PERSONA[arch]?.travel ?? 'fiets',
    setup.querySelector<HTMLCanvasElement>('#setup-bg')!);
  let heroRegion = region;

  const draw = () => {
    loc.set(region);
    hero.setTravel(PERSONA[arch]?.travel ?? 'fiets');
    if (heroRegion !== region) {
      heroRegion = region;
      hero.setRegion(region, meta.regions[region].nl);
    }
    setup.querySelector('#hero-region')!.textContent = `${meta.regions[region].nl}, najaar ${PERSONA[arch]?.year ?? ''}`;
    const archs = archetypesFor(meta, region);
    if (!archs.includes(arch)) arch = archs[0];
    setup.querySelector('#region-list')!.innerHTML = ORDER.filter((r) => meta.regions[r]).map((r) => {
      const known = Object.keys(catalogue(r).types).length;
      return `<button class="rchip ${r === region ? 'on' : ''}" data-region="${r}">${esc(meta.regions[r].nl)}${known ? `<small>${known}/${meta.regions[r].types}</small>` : ''}</button>`;
    }).join('');
    setup.querySelector('#region-profile')!.innerHTML = `<h3>${esc(meta.regions[region].nl)}</h3>${regionProfile(meta, region)}`;
    setup.querySelector('#arch-list')!.innerHTML = archs.map((k) => {
      const a = meta.archetypes[k];
      return `<button class="choice ${k === arch ? 'on' : ''}" data-arch="${k}"><canvas class="rider-pic" data-travel="${PERSONA[k]?.travel ?? 'fiets'}" width="${BOX * 2}" height="${BOX * 2}"></canvas><b>${esc(a.nl)}</b>
        <span>${blurb[k]}</span>
        <span class="muted" style="margin-top:4px;font-size:12.5px">${PERSONA[k]?.year ?? ''} · naar het patroon van ${esc(personName(a.real.name))}, ${a.real.years[0]}–${a.real.years[1]}</span></button>`;
    }).join('');
    input.value = name;
    setup.querySelector('#loc-note')!.textContent = meta.regions[region].pts.length < 30
      ? 'Bij de Vlaamse verhalen noteerde het archief zelden een plaats; daarom is de streek alleen gearceerd.' : '';
    setup.querySelector('#begin-region')!.textContent = meta.regions[region].nl;
    setup.querySelector('#quick-region')!.textContent = meta.regions[region].nl;
    setup.querySelector('#choice-sum')!.innerHTML = `<span>${esc(meta.regions[region].nl)}</span> · <span>${esc(meta.archetypes[arch].nl.toLowerCase())}</span>`;
    setup.querySelectorAll<HTMLElement>('[data-region]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.region!)));
    setup.querySelectorAll<HTMLElement>('[data-arch]').forEach((b) => b.addEventListener('click', () => {
      arch = b.dataset.arch!;
      draw();
    }));
  };
  input.addEventListener('input', () => {
    name = input.value;
    nameTouched = true;
  });
  setup.querySelector('#reroll')!.addEventListener('click', () => {
    const names = placeNames(region, new Rng(Date.now() & 0xffff));
    name = names.find((n) => n !== name) ?? names[0];
    nameTouched = false;
    input.value = name;
    setup.querySelector('#loc-note')!.textContent = meta.regions[region].pts.length < 30
      ? 'Bij de Vlaamse verhalen noteerde het archief zelden een plaats; daarom is de streek alleen gearceerd.' : '';
  });
  // the collectors in their cards: the chosen one rides, the others stand and write
  let frame = 0, raf = 0, last = 0;
  const animate = (t: number) => {
    raf = requestAnimationFrame(animate);
    if (t - last < 90) return;
    last = t;
    frame++;
    setup.querySelectorAll<HTMLCanvasElement>('canvas.rider-pic').forEach((c) => {
      const on = c.closest('.choice')!.classList.contains('on');
      const ctx = c.getContext('2d')!;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, BOX, BOX);
      if (on) drawRider(ctx, c.dataset.travel!, frame % RIDE_FRAMES, null);
      else drawRider(ctx, c.dataset.travel!, 0, Math.floor(frame / 3) % IDLE_FRAMES);
    });
  };
  raf = requestAnimationFrame(animate);
  // the button at the top: on to the choices, with the start always at hand at the bottom of the screen from then on
  setup.querySelector('#start')!.addEventListener('click', () => {
    setup.classList.add('choosing');
    setup.querySelector('#choose')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // point at the three choices, one after the other
    setup.querySelectorAll<HTMLElement>('.step').forEach((h, i) => {
      h.classList.remove('lit');
      setTimeout(() => h.classList.add('lit'), 700 + i * 350);
    });
  });
  setup.querySelector('#quick')!.addEventListener('click', () => setup.querySelector<HTMLButtonElement>('#begin')!.click());
  setup.querySelector('#begin')!.addEventListener('click', () => {
    cancelAnimationFrame(raf);
    hero.destroy();
    loc.destroy();
    start(region, arch, name.trim() || placeNames(region, rng)[0], setup);
  });
  draw();
}

async function start(region: string, arch: string, homeName: string, setup: HTMLElement) {
  setup.innerHTML = `<div class="leaf sheet" style="text-align:center;margin-top:20vh;width:min(520px,100%)"><p class="fell" style="font-size:24px">${esc(homeName)}</p><p class="sub">De streek wordt opgemeten. Er wordt gezocht in het archief…</p></div>`;
  const [corpus] = await Promise.all([
    loadCorpus(region),
    document.fonts.load('16px "IM Fell English"'),
    document.fonts.load('italic 16px "IM Fell English"'),
    document.fonts.load('16px "IM Fell English SC"'),
    document.fonts.load('16px "EB Garamond"'),
  ]);
  const seed = PARAMS.has('seed') ? +PARAMS.get('seed')! : (Date.now() & 0xffffff) ^ 0x5a17;
  const asked = PARAMS.get('season');
  const season: Season = asked === 'lente' || asked === 'zomer' || asked === 'winter' ? asked : 'herfst';
  G.field = newField(corpus, arch, seed, homeName, season);
  const { mountUI } = await import('./ui');
  const { startGame } = await import('./scene');
  if (import.meta.env.DEV) (window as unknown as { __G: typeof G }).__G = G;
  mountUI();
  const game = startGame(document.querySelector('#game')!);
  if (import.meta.env.DEV) (window as unknown as { __game: typeof game }).__game = game;
  setup.remove();
  if (PARAMS.has('admin')) (await import('./admin')).mountAdmin({ region, arch, seed, home: homeName, season });
}

main();
