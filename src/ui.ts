// The HTML layer: the day and the notebook along the top, where you are on the right, what you have heard
// on the left, and the conversations, tales, notebook, diary and end as leaves of paper.
import { loadText, verhalenbankUrl } from './data';
import { G } from './game';
import { BEING_NL, MISC_ICONS, beingIcon, svg } from './icons';
import { CHAPTER_NEED, DAYS, PARTS, SEASON_NL, partName, clockTime, durationNl, weatherLine, TEMPER, WEATHER, cap, openWord, themeNl, type Entry, type Weather, type Letter, type Move, type Talk, type TalkLine, type VisitResult, type Where } from './field';
import { VILLAGE, SITE } from './land';
import type { Narrator } from './sim';
import { RED, RES, knownAt, px, sheets } from './sheet';
import { esc, plural } from './text';
import { isMuted, setAmbience, setMuted, setNightMusic, sfx } from './sound';
import { FEEST_LINE, feest } from './feest';
import { openColofon } from './colofon';
import { markRead } from './catalogue';
import { openEnd } from './end';
import { drawPortrait } from './portrait';
import { TILE, W } from './world';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
/** On a phone or tablet: tap rather than click, and no keyboard. */
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

let modalOpen = false;
/** the person whose card is open in the panel */
let chosen: number | null = null;
/** the place or site picked on the map, if not where the collector is */
let dest: Where | null = null;

export function mountUI() {
  const root = $('#ui');
  root.innerHTML = `
    <header id="topbar" class="sheet">
      <div class="brand">Sagenland</div>
      <button class="iconbtn" id="btn-overview" title="De hele kaart (0)">${svg(MISC_ICONS.kaart, 18)}</button>
      <div class="sep"></div>
      <div class="stat date"><b id="day"></b><span id="season"></span></div>
      <span id="wx" class="wx"></span>
      <div class="days" id="days" title="Dagen in het veld"></div>
      <div class="sep"></div>
      <div class="stat score" title="Wat uw schrift waard is, en dat van de andere verzamelaar"><b id="score">0</b><span id="rivalscore">punten</span></div>
      <div class="sep"></div>
      <button class="iconbtn labelled" id="btn-notebook" title="Uw schrift: alles wat u opschreef">${svg(MISC_ICONS.notitieboek, 18)}<span class="hide-narrow">schrift</span><span class="count" id="nrec">0</span></button>
      <button class="iconbtn labelled" id="btn-diary" title="Dagboek">${svg(MISC_ICONS.kroniek, 18)}<span class="hide-narrow">dagboek</span></button>
      <button class="iconbtn" id="btn-help" title="Hoe het werkt">?</button>
      <button class="iconbtn" id="btn-sound" title="Geluid aan/uit (M)"></button>
      ${document.fullscreenEnabled ? `<button class="iconbtn" id="btn-full" title="Volledig scherm">${FULL_ICON}</button>` : ''}
    </header>
    <aside id="leads" class="sheet">
      <button id="drawerbar" class="drawerbar"></button>
      <div id="book"></div>
      <h3 class="gehoord">Gehoord</h3><div id="leadlist"></div></aside>
    <section id="here" class="sheet"></section>
    <div id="notice" class="sheet hidden"></div>
    <div id="dayveil" class="hidden"></div>
    <div id="daycard" class="hidden"></div>
    <div id="tooltip" class="hidden"></div>
    <div id="modal" class="hidden"></div>
  `;
  $('#btn-overview').addEventListener('click', () => {
    const on = !$('#btn-overview').classList.contains('on');
    $('#btn-overview').classList.toggle('on', on);
    G.emit('overview', on);
  });
  $('#btn-notebook').addEventListener('click', openNotebook);
  $('#btn-diary').addEventListener('click', openDiary);
  $('#btn-help').addEventListener('click', () => openIntro(false));
  document.querySelector('#btn-full')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  });
  // a tap on the card or the dark skips the passing of the night
  const skipDay = () => {
    clearTimeout(dayTimer);
    for (const id of ['#daycard', '#dayveil']) $(id).classList.add('skip');
    G.emit('dawnskip', undefined);
    dayTimer = setTimeout(endDay, 700);
  };
  $('#daycard').addEventListener('click', skipDay);
  $('#dayveil').addEventListener('click', skipDay);
  G.on('apparition', (site) => showApparition(site));
  // at Christmas, after dark, now and then the midwinter horn sounds from far away
  if (feest() === 'kerst') setInterval(() => {
    if (G.field.isDark(G.clock ?? undefined) && Math.random() < 0.6) sfx('hoorn');
  }, 35000);
  $('#btn-sound').addEventListener('click', () => {
    setMuted(!isMuted());
    renderSound();
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) closeModal();
  });
  $('#here').addEventListener('click', onHereClick);
  swipePanel($('#here'));
  $('#leads h3.gehoord').addEventListener('click', () => $('#leads').classList.toggle('open'));
  // on a phone the book and the hearsay live in a drawer along the bottom
  $('#drawerbar').addEventListener('click', () => $('#leads').classList.toggle('open'));
  $('#leadlist').addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-lead]');
    if (el) pick(G.field.leads[+el.dataset.lead!].at);
  });
  // buttons should not keep focus
  root.addEventListener('click', (e) => (e.target as HTMLElement).closest('button')?.blur());

  G.on('pick', pick);
  G.on('clock', renderClock);
  G.on('changed', render);
  G.on('arrived', () => {
    chosen = null;
    render();
    const f = G.field;
    if (f.encounter) {
      const enc = f.encounter;
      f.encounter = null;
      showEncounter(enc);
    } else if (f.over) setTimeout(finish, 600);
    else if (!checkQuest()) showPost();
  });
  G.on('hover', (h) => {
    const tip = $('#tooltip');
    if (!h) return tip.classList.add('hidden');
    tip.textContent = h.text;
    tip.classList.remove('hidden');
    tip.style.left = Math.min(window.innerWidth - 290, h.x + 14) + 'px';
    tip.style.top = h.y + 14 + 'px';
  });
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if ((e.key === 'h' || e.key === 'H') && !modalOpen && !(e.target as HTMLElement).closest('input, textarea')) {
      $('#here').classList.toggle('min');
      renderHere();
      G.emit('panel', undefined);
      return;
    }
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else if (dest) {
        dest = null;
        render();
      }
    }
    if (e.key === '0') $('#btn-overview').click();
    if (e.key === ' ' && G.walking) {
      e.preventDefault();
      G.emit('hurry', undefined);
    }
    if (e.key === 'm' || e.key === 'M') $('#btn-sound').click();
  });

  let diaryLen = G.field.diary.length;
  G.field.on(() => {
    // deaths are worth a notice; the rest is in the diary
    const f = G.field;
    for (const d of f.diary.slice(diaryLen)) {
      if (d.kind === 'death') {
        sfx('death');
        notice(`${svg(MISC_ICONS.kroniek, 20)} ${esc(d.text)}`);
      }
    }
    for (const d of f.diary.slice(diaryLen)) {
      if (d.kind === 'rival' && (d.text.startsWith('Er is nog iemand') || d.text.startsWith('Morgen gaat') || d.text.includes('was u voor'))) notice(`${svg(MISC_ICONS.verzamelaar, 20)} ${esc(d.text)}`);
    }
    diaryLen = f.diary.length;
    G.emit('changed', undefined);
    if (!G.walking && !modalOpen) setTimeout(showPost, 400);
    if (f.over && !G.walking && !modalOpen) setTimeout(finish, 600);
  });
  render();
  renderSound();
  openIntro(true);
}

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  sfx('end');

  openEnd(showModal, openTale);
}

function renderSound() {
  const b = $('#btn-sound');
  b.innerHTML = svg(isMuted() ? MISC_ICONS.stil : MISC_ICONS.geluid, 18);
  b.classList.toggle('on', isMuted());
}

// ------------------------------------------------------------------ the frame

function render() {
  const f = G.field;
  renderClock();
  $('#season').textContent = `${SEASON_NL[f.season]} ${f.year}`;

  // a new day: a moment to take in where you are
  if (f.day > lastDay && !modalOpen && !G.walking && !f.over) {
    lastDay = f.day;
    showDay();
  }
  $('#days').innerHTML = Array.from({ length: DAYS }, (_, d) => {
    const day = d + 1;
    const cls = day < f.day ? 'past' : day === f.day ? 'now' : '';
    const occ = f.occasions.find((o) => o.known && o.day === day);
    const ev = occ ? ` ev${occ.kind === 'buurten' ? ' bu' : ''}` : '';
    const label = occ ? (occ.kind === 'herberg' ? ': vertelavond' : ': buurten') : '';
    return `<i class="${cls}${ev}" title="Dag ${day}${label}">${day === f.day ? `<b style="width:${((f.part * 2 + f.slot + 1) / 6) * 100}%"></b>` : ''}</i>`;
  }).join('');
  $('#nrec').textContent = String(f.notebook.length);
  const sc = f.score();
  countUp(sc.total);
  // a chapter of the sagenboek completed: its own moment
  if (sc.done > chaptersDone) {
    const done = f.chapterProgress().filter((c) => c.have >= CHAPTER_NEED).map((c) => c.being);
    const fresh = done.filter((b) => !chaptersSeen.has(b));
    fresh.forEach((b) => {
      chaptersSeen.add(b);
      justDone.add(b);
      setTimeout(() => justDone.delete(b), 1500);
    });
    if (fresh.length) {
      sfx('era');
      notice(`${svg(beingIcon(fresh[0]), 22, RED)} <b>Hoofdstuk af: ${esc(BEING_NL[fresh[0]] ?? fresh[0])}</b> · drie verhalen bij elkaar, +5 punten voor uw sagenboek.`);
    }
  }
  chaptersDone = sc.done;
  $('#rivalscore').textContent = f.rival ? `punten · de ander ${f.rivalScore()}` : 'punten';
  renderBook();
  renderLeads();
  renderHere();
  const here = f.at.kind === 'place' ? f.sim.placeBuildings(f.at.id).map((b) => b.kind) : [];
  const [x, y] = f.tileOf(f.at);
  const nearWater = f.land.tiles.some((t, i) => t.t === 'water' && Math.abs((i % W) - x) + Math.abs(Math.floor(i / W) - y) < 6);
  setAmbience({ season: (['lente', 'zomer', 'herfst', 'winter'] as const).indexOf(f.season) as 0 | 1 | 2 | 3, night: f.part === 2, paused: f.over, church: here.includes('kerk'), mill: here.includes('molen'), water: nearWater });
}

function renderLeads() {
  const f = G.field;
  const open = f.leads.filter((l) => !l.done);
  const done = f.leads.filter((l) => l.done).slice(-3);
  $('#leadlist').innerHTML = [...open, ...done].map((l) => `<button class="lead ${l.done ? 'done' : ''}" data-lead="${l.id}" title="${l.done ? '' : 'Op de kaart'}">
    ${l.lines.map((s) => esc(s)).join(' ')}</button>`).join('') || '<p class="sub">Nog niets.</p>';
  $('#leads h3.gehoord').innerHTML = `Gehoord <span class="count">${open.length}</span>`;
  const sc = f.score();
  $('#drawerbar').innerHTML = `<span>Sagenboek <b>${sc.done}/${f.chapters.length}</b></span><span>Vondsten <b>${f.finds().length}</b></span><span>Gehoord <b>${open.length}</b></span><i>${$('#leads').classList.contains('open') ? '▾' : '▴'}</i>`;
}

/** The chapters of the sagenboek you are filling: three tales of a kind make a chapter. */
function renderBook() {
  const f = G.field;
  const sc = f.score();
  const finds = f.finds();
  $('#book').innerHTML = `<h3>Uw sagenboek <span class="count">${sc.done}/${f.chapters.length} hoofdstukken</span></h3>
    <div class="finds${finds.length ? '' : ' zero'}" title="Verhalen die alleen uw verteller nog kende, of die in het hele archief zeldzaam zijn">${svg(MISC_ICONS.catalogus, 16, RED)}<span>Vondsten</span><b>${finds.length}</b></div>
    ${f.chapterProgress().map((c) => ` <div class="chapter ${c.have >= CHAPTER_NEED ? 'done' : ''}${justDone.has(c.being) ? ' just' : ''}" title="${esc(BEING_NL[c.being] ?? c.being)}: ${c.have} van ${CHAPTER_NEED} verhalen">
      ${svg(beingIcon(c.being), 16, c.have >= CHAPTER_NEED ? RED : undefined)}<span>${esc(BEING_NL[c.being] ?? c.being)}</span>
      <i>${Array.from({ length: CHAPTER_NEED }, (_, k) => `<b class="${k < c.have ? 'on' : ''}"></b>`).join('')}</i></div>`).join('')}
    ${questBox()}`;
}

/** The trail of the lost tale: what you know so far, and what to do next. */
function questBox(): string {
  const f = G.field;
  const q = f.quest;
  if (!q) return '';
  const steps = ['Het begin', 'Het graf', 'Waar de familie bleef', 'Het verhaal'];
  const next = [
    `Vraag ${esc(f.sim.name(f.sim.narrators[q.starter]))} naar het verhaal dat niemand meer kan afmaken.`,
    `Zoek het graf van ${esc(q.grand)} bij de kerk van ${esc(f.land.places[q.church].name)}.`,
    `Ga ’s nachts naar ${esc(f.land.sites[q.site].name)}.`,
    `Zoek in ${esc(f.land.places[q.village].name)} iemand van ${esc(f.questLook())}.`,
    `Gevonden.`,
  ][q.stage];
  return `<div class="quest-box ${q.stage === 4 ? 'solved' : ''}">
    <h3>Het verloren verhaal</h3>
    <div class="q-steps">${steps.map((s, i) => `<span class="${i < q.stage ? 'on' : i === q.stage ? 'now' : ''}" title="${s}"></span>`).join('')}</div>
    <p class="q-next">${next}</p>
  </div>`;
}

/** If the trail leads here, show what is found. */
function checkQuest(): boolean {
  const f = G.field;
  if (modalOpen || G.walking) return false;
  const ev = f.questHere();
  if (!ev) return false;
  sfx(ev.title === 'In het donker' ? 'sighting' : 'page');
  showModal(`
    <div class="leaf sheet visit-leaf quest-leaf">
      ${closeBtn()}
      <div class="kicker">${svg(MISC_ICONS.kroniek, 22)} Het verloren verhaal</div>
      <h1>${esc(ev.title)}</h1>
      ${ev.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      <p style="margin-top:16px"><button class="btn primary" id="res-ok">Verder</button></p>
    </div>`);
  $('#res-ok').addEventListener('click', closeModal);
  render();
  return true;
}

// ------------------------------------------------------------------ where you are, and where you might go

function pick(w: Where) {
  const f = G.field;
  if (G.walking) return;
  $('#here').classList.remove('min');
  chosen = null;
  dest = f.same(w, f.at) ? null : w;
  // the panel first: its new size decides where the free middle of the screen is
  render();
  const [x, y] = f.tileOf(w);
  G.emit('focus', { x, y });
}

/** A view of the place cut from the sheet: in colour if you know it, printed if you do not. */
function vignette(w: Where): string {
  const f = G.field;
  const [x, y] = f.tileOf(w);
  const k = knownAt(f.known, x, y);
  const src = k > 0.5 ? sheets.colour : sheets.sepia;
  if (!src) return '';
  const c = document.createElement('canvas');
  const cw = 340, ch = 120;
  c.width = cw * 2;
  c.height = ch * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#efe5cb';
  ctx.fillRect(0, 0, c.width, c.height);
  const span = w.kind === 'place' ? 7.5 : 4.5;
  const sw = span * TILE * 2, sh = (sw * ch) / cw;
  ctx.drawImage(src, (px(x) - sw / 2) * RES, (px(y) - sh / 2 - 12) * RES, sw * RES, sh * RES, 0, 0, c.width, c.height);
  return `<img class="vignette" src="${c.toDataURL('image/jpeg', 0.85)}" alt="" />`;
}

function renderHere() {
  const f = G.field;
  const el = $('#here');
  // redrawing must not throw away where the row of faces and the panel were scrolled to
  const row = el.querySelector<HTMLElement>('.faces');
  const left = row?.scrollLeft ?? 0, rowTop = row?.scrollTop ?? 0, top = el.scrollTop;
  renderHereBody(f, el);
  el.insertAdjacentHTML('afterbegin', '<button class="grip" data-act="grip" aria-label="Paneel in- of uitklappen"><i></i></button>'
    + `<button class="fold" data-act="grip" title="${el.classList.contains('min') ? 'Paneel uitklappen' : 'Paneel inklappen, om de kaart te zien'} (H)" aria-label="Paneel in- of uitklappen">${el.classList.contains('min') ? '‹' : '›'}</button>`);
  const now = el.querySelector<HTMLElement>('.faces');
  if (now) {
    now.scrollLeft = left;
    now.scrollTop = rowTop;
  }
  el.scrollTop = top;
  // and the one picked stays in sight, sideways on a phone, up and down on a big screen
  const on = now?.querySelector<HTMLElement>('.face.on');
  if (on && now) {
    const l = on.offsetLeft - now.offsetLeft, r = l + on.offsetWidth;
    if (l < now.scrollLeft) now.scrollLeft = l - 8;
    else if (r > now.scrollLeft + now.clientWidth) now.scrollLeft = r - now.clientWidth + 8;
    const t = on.offsetTop - now.offsetTop, b = t + on.offsetHeight;
    if (t < now.scrollTop) now.scrollTop = t - 4;
    else if (b > now.scrollTop + now.clientHeight) now.scrollTop = b - now.clientHeight + 4;
  }
}

function renderHereBody(f: typeof G.field, el: HTMLElement) {
  if (G.walking) {
    el.innerHTML = `
      ${vignette(f.at)}
      <div class="here-body">
        <div class="kicker">Onderweg naar</div>
        <h2>${esc(f.whereName(f.at))}</h2>
        <p class="sub" id="road-time">${esc(cap(partName(G.clock?.part ?? f.part, G.clock?.slot ?? f.slot)))} van dag ${G.clock?.day ?? f.day}.</p>
        <div class="here-foot"><button class="btn" data-act="hurry">Sneller</button>
          <span class="muted">${touch ? 'Of tik op de kaart.' : 'Of klik op de kaart, of druk op de spatiebalk.'}</span></div>
      </div>`;
    return;
  }
  if (dest) {
    el.innerHTML = destView(dest);
    return;
  }
  const w = f.at;
  const people = f.people(w);
  const name = f.whereName(w);
  const s = w.kind === 'site' ? f.land.sites[w.id] : null;
  const sub = w.kind === 'place'
    ? `${cap(VILLAGE[f.land.kinds[w.id]].nl)} · ${plural(people.length, 'bewoner', 'bewoners')}`
    : s!.hut !== null ? `Buiten ${f.land.places[s!.place].name}. Iemand ${SITE[s!.kind].loner}.` : `Buiten ${f.land.places[s!.place].name}.`;
  let evening = '';
  const occ = f.attendable();
  if (occ) evening = `<button class="btn primary big" data-act="evening">${occ.kind === 'herberg' ? 'Ga naar de vertelavond in de herberg' : 'Ga ’s avonds buurten'}</button>`;
  else {
    const today = f.occasions.find((o) => o.known && !o.attended && w.kind === 'place' && o.place === w.id && o.day === f.day);
    if (today) evening = `<p class="hint">${today.kind === 'herberg' ? 'Vanavond is er vertelavond in de herberg.' : 'Vanavond komen de buren bij elkaar.'} Blijf tot de avond.</p>`;
  }
  const appeal = f.canAppeal() ? `<button class="linkbtn" data-act="appeal" title="Kost twee uur. Misschien schrijft iemand terug, misschien niet.">${svg(MISC_ICONS.notitieboek, 14)} oproep in het weekblad</button>` : '';
  if (chosen !== null && !people.some((n) => n.id === chosen)) chosen = null;
  const card = chosen !== null ? personCard(f.sim.narrators[chosen]) : '';
  el.innerHTML = `
    ${vignette(w)}
    <div class="here-body">
      <div class="kicker">${f.part === 2 ? `${LAMP}Avond ${w.kind === 'place' ? 'in' : 'bij'}` : `U bent ${w.kind === 'place' ? 'in' : 'bij'}`}</div>
      <h2>${esc(name)}</h2>
      <p class="sub">${esc(sub)}</p>
      ${evening}
      ${people.length ? `<div class="faces">${people.map(faceChip).join('')}</div>` : `<p class="sub">${s && s.hut === null ? 'Er is hier vandaag niemand. Misschien morgen.' : 'Er is hier niemand meer.'}</p>`}
      ${card || (people.length ? `<p class="sub small pick-hint">${touch ? 'Tik' : 'Klik'} op iemand om te zien wie het is.</p>` : '')}
      <div class="here-foot"><button class="btn" data-act="wait">${f.part === 2 && (f.slot === 1 || f.season === 'winter') ? 'Ga slapen' : f.part === 2 ? 'Wacht tot de nacht' : `Wacht tot de ${PARTS[f.part + 1]}`}</button>${appeal}</div>
    </div>`;
}

/** A face in the row of people here: who they are shows when you pick them. */
function faceChip(n: Narrator): string {
  const f = G.field;
  const t = f.trustOf(n);
  const lead = f.leads.some((l) => l.narrator === n.id && !l.done);
  const pips = [0.3, 0.55, 0.8].map((v) => `<i class="${t >= v ? 'on' : ''}"></i>`).join('');
  return `<button class="face ${chosen === n.id ? 'on' : ''} ${f.away(n) ? 'is-away' : ''} ${f.met.has(n.id) ? 'met' : ''}" data-act="choose" data-n="${n.id}" title="${esc(f.sim.name(n))}, ${f.age(n)}">
    ${portrait(n, 52)}${lead ? '<em class="flag" title="Iemand heeft u over deze persoon verteld">✎</em>' : ''}${f.ill.has(n.id) ? '<em class="flag ill" title="ziek">+</em>' : ''}
    <span class="fname">${esc(n.first)}</span><span class="fage">${f.away(n) ? 'op het land' : f.age(n)}</span>
    <span class="trust">${pips}</span></button>`;
}

/** The card of the person picked: what you know of them, and the door to knock on. */
function personCard(n: Narrator): string {
  const f = G.field;
  const traits = f.traits(n);
  const lead = f.leads.find((l) => l.narrator === n.id);
  const said = lead && !f.met.has(n.id) ? `<span class="said">${esc(`${lead.source}: „${lead.lines.slice(1).join(' ')}”`)}</span>` : '';
  return `<div class="person-card">
    <div class="pinfo"><span class="pname"><b>${esc(f.sim.name(n))}</b> <span class="age">${f.age(n)}</span></span>
      <span class="role">${esc(f.role(n))}${traits.length ? ' · ' + traits.map((x) => (x === 'ziek' ? `<span class="red">${x}</span>` : esc(x))).join(' · ') : ''}</span>
      ${said}</div>
    ${f.away(n) ? '<span class="away">op het land, kom ’s avonds terug</span>' : `<button class="btn primary" data-act="visit" data-n="${n.id}">Bezoek</button>`}
  </div>`;
}

function destView(w: Where): string {
  const f = G.field;
  const r = f.route(w);
  const name = f.whereName(w);
  const been = w.kind === 'place' ? f.visitedPlaces.has(w.id) : f.visitedSites.has(w.id);
  const leads = f.leads.filter((l) => !l.done && f.same(l.at, w));
  const desc = been ? f.arrivalLine(w) : w.kind === 'place' ? `Een ${VILLAGE[f.land.kinds[w.id]].nl}. U bent er nog niet geweest.` : 'U bent er nog niet geweest.';
  const recs = f.notebook.filter((e) => (w.kind === 'place' ? e.place === w.id && e.site === null : e.site === w.id)).length;
  const how = r ? `${durationNl(r.parts)} ${r.foot > 3 && f.persona.travel !== 'voet' ? `${f.persona.verb}, het laatste stuk te voet` : f.persona.verb}` : '';
  const arrive = r ? f.part * 2 + f.slot + r.parts : 0;
  const late = (r && arrive > 5 ? ' U komt er pas morgen aan.' : r && Math.floor(arrive / 2) > f.part ? ` U komt aan in de ${PARTS[Math.floor(arrive / 2)]}.` : '')
    + (r && f.weather === 'regen' ? ' Door de regen gaat het langzaam.' : '')
    + (r && f.misty && r.foot > 3 ? ' In de mist is het pad buiten de weg moeilijk te vinden.' : '');
  return `
    ${vignette(w)}
    <div class="here-body">
      <div class="kicker">Erheen?</div>
      <h2>${esc(name)}</h2>
      <p>${esc(desc)}${recs ? ` <span class="red">${recs} opgetekend.</span>` : ''}</p>
      ${leads.map((l) => `<p class="pencil">${l.lines.map(esc).join(' ')}</p>`).join('')}
      ${r ? `<p class="sub">${esc(cap(how))}.${late}</p>
        <div class="here-foot"><button class="btn primary" data-act="go">Ga erheen</button><button class="btn" data-act="stay">Blijf hier</button></div>`
        : `<p class="sub">Daar komt u vanaf hier niet.</p><div class="here-foot"><button class="btn" data-act="stay">Terug</button></div>`}
    </div>`;
}

/**
 * On a phone the panel can be swiped down to a single line, and up again. The swipe starts on the grip or the
 * place's name, or anywhere once it is folded; the panel follows the finger while it is dragged.
 */
function swipePanel(el: HTMLElement) {
  let start: { x: number; y: number; t: number } | null = null;
  let dy = 0;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const target = e.target as HTMLElement;
    const handle = target.closest('.grip, h2, .sub:not(.small)') || el.classList.contains('min');
    if (e.touches.length !== 1 || !handle || target.closest('.faces')) return;
    start = { x: t.clientX, y: t.clientY, t: Date.now() };
    dy = 0;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!start) return;
    const t = e.touches[0];
    dy = t.clientY - start.y;
    if (Math.abs(t.clientX - start.x) > Math.abs(dy) * 1.5) return;
    // follow the finger, downwards only while open, upwards only while folded
    const min = el.classList.contains('min');
    const shift = min ? Math.min(0, Math.max(-60, dy)) * 0.5 : Math.max(0, dy);
    el.style.transform = `translateY(${shift}px)`;
    el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (!start) return;
    el.style.transition = 'transform 0.2s';
    el.style.transform = '';
    const min = el.classList.contains('min');
    if ((!min && dy > 40) || (min && dy < -30)) {
      el.classList.toggle('min');
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 400);
    }
    start = null;
  });
}
let suppressClick = false;

function onHereClick(e: Event) {
  // a swipe ends with a click on what was under the finger: that one is not meant
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  // a tap anywhere on the folded panel opens it again
  if ($('#here').classList.contains('min') && !(e.target as HTMLElement).closest('[data-act="grip"]')) {
    $('#here').classList.remove('min');
    renderHere();
    G.emit('panel', undefined);
    return;
  }
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b) return;
  const f = G.field;
  const act = b.dataset.act;
  if (act === 'grip') {
    $('#here').classList.toggle('min');
    renderHere();
    G.emit('panel', undefined);
    return;
  }
  if (act === 'choose') {
    const id = +b.dataset.n!;
    chosen = chosen === id ? null : id;
    renderHere();
    return;
  }
  if (act === 'hurry') return G.emit('hurry', undefined);
  if (G.walking) return;
  if (act === 'go' && dest) {
    const to = dest;
    dest = null;
    $('#btn-overview').classList.remove('on');
    // on the road from here: the scene rides it, the panel says where to
    G.walking = true;
    // the light stays as it is at departure; the scene lets the day pass along the way
    G.clock = { day: f.day, part: f.part, slot: f.slot };
    const tiles = f.travel(to);
    if (!tiles) G.clock = null;
    if (tiles) G.emit('walk', tiles);
    else G.walking = false;
    render();
  } else if (act === 'stay') {
    dest = null;
    render();
  } else if (act === 'wait') {
    f.wait();
    setTimeout(checkQuest, 300);
  } else if (act === 'visit') {
    openVisit(+b.dataset.n!);
  } else if (act === 'evening') {
    const kind = f.attendable()?.kind;
    showResult(null, f.attendEvening(), kind === 'buurten' ? 'Buurten' : 'De vertelavond');
  } else if (act === 'appeal') {
    f.appeal();
    notice(`${svg(MISC_ICONS.notitieboek, 20)} Uw oproep staat volgende week in het weekblad. Wie weet schrijft er iemand terug.`);
  }
}

// ------------------------------------------------------------------ a visit

// ------------------------------------------------------------------ a conversation

let talk: Talk | null = null;
let talkFrom = 0;

function openVisit(nid: number) {
  talk = G.field.startTalk(nid);
  talkFrom = 0;
  renderTalk();
}

function renderTalk() {
  const f = G.field;
  const t = talk!;
  const n = f.sim.narrators[t.nid];
  const tm = f.temper(n);
  const known = (f.visits.get(t.nid) ?? 0) > 1;
  const live = !t.ended && !t.closed && t.moves > 0;
  const frags = f.notebook.filter((e) => e.narrator === t.nid && e.frag);
  const prompts = f.prompts();
  const themes = f.themes();
  const mv = (kind: string, inner: string, extra = '', cls = '') => `<button class="ask ${cls}" data-move="${kind}" ${extra}>${inner}</button>`;
  const html = `
    <div class="leaf sheet visit-leaf talk">
      ${closeBtn()}
      <div class="visit-head">${portrait(n, 64)}<div>
        <div class="kicker">${cap(partName(f.part, f.slot))}, ${clockTime(f.part, f.slot)} · ${esc(f.whereName(f.at))}</div>
        <h1>${esc(f.sim.name(n))}</h1>
        <p class="sub">${f.age(n)} jaar · ${esc(f.role(n))}${f.ill.has(t.nid) ? ' · <span class="red">ziek</span>' : ''}</p></div></div>
      <div class="mood">
        <span class="mood-k">Sfeer</span><span class="mood-bar"><i style="width:${Math.round(t.open * 100)}%"></i></span><span class="mood-w">${openWord(t.open)}</span>
        <span class="moves" title="Wat u nog kunt zeggen voor het tijd is om te gaan">${Array.from({ length: f.part === 2 ? 4 : 3 }, (_, k) => `<b class="${k < t.moves ? 'on' : ''}"></b>`).join('')}</span>
      </div>
      ${known ? `<p class="temper"><b>${esc(cap(TEMPER[tm].nl))}.</b> ${esc(TEMPER[tm].hint)}</p>` : ''}
      <div class="talk-log" id="talk-log">${t.lines.map((l, i) => `<div class="tl" data-i="${i}">${lineHtml(l)}</div>`).join('')}</div>
      ${live ? `
        <h3 class="ask-h">Op gang komen</h3>
        <div class="asks wide">
          ${mv('praat', '<span><b>Praat over koetjes en kalfjes</b><br/><small>Het weer, de oogst, de buren.</small></span>')}
          ${mv('leven', `<span><b>Vraag naar vroeger</b><br/><small>Over de ouders, het werk, het dorp zoals het was.</small></span>`)}
        </div>
        ${prompts.length ? `<h3 class="ask-h">Vertel zelf een verhaal</h3>
          <div class="asks prompts">${prompts.map((ty) => mv('prompt', `${svg(beingIcon(f.sim.type(ty).being), 16, RED)}<span>${esc(f.sim.type(ty).nl)}</span>`, `data-t="${ty}"`)).join('')}</div>` : ''}
        <h3 class="ask-h">Vragen</h3>
        ${frags.length ? `<div class="asks wide">${frags.map((e) => mv('again', `<span><b>Het verhaal van laatst</b><br/><small>„${esc(f.sim.type(e.t).nl)}”, dat maar half bovenkwam.</small></span>`, `data-num="${e.num}"`)).join('')}</div>` : ''}
        <div class="asks">
          ${themes.map((b) => {
            const have = new Set(f.notebook.filter((e) => f.sim.type(e.t).being === b).map((e) => e.t)).size;
            return mv('theme', `${svg(beingIcon(b), 20, RED)}<span>${esc(BEING_NL[b] ?? b)}</span>${have ? `<em title="Al in uw schrift">${have}</em>` : ''}`, `data-being="${b}"`);
          }).join('')}
        </div>
        <div class="asks wide">
          ${mv('free', `<span><b>Kent u nog oude verhalen?</b><br/><small>Laat ${esc(n.first)} zelf kiezen.</small></span>`)}
          ${mv('others', `<span><b>Wie kan er nog meer vertellen?</b><br/><small>Geen verhaal, wel een naam.</small></span>`)}
        </div>
        <div class="asks wide">
          ${mv('eigen', `<span><b>Vertelt men hier iets wat ik nergens anders hoor?</b><br/><small>Het zeldzaamste wat ${esc(n.first)} weet. Vraagt om vertrouwen.</small></span>`, '', 'rare')}
        </div>
        ${f.canAskLost(t.nid) ? `<div class="asks wide">${mv('verloren', f.quest!.stage === 0
          ? `<span><b>Het verhaal dat niemand meer kan afmaken</b><br/><small>Waar de waardin het over had.</small></span>`
          : `<span><b>Kent u het verhaal van ${esc(f.quest!.grand)}?</b><br/><small>Alleen de goede persoon weet het. Wie het niet weet, vindt de vraag vreemd.</small></span>`, '', 'quest')}</div>` : ''}` : ''}
      <p class="talk-foot">${t.ended
        ? '<button class="btn primary" id="talk-ok">Verder</button>'
        : `<button class="btn ${live ? '' : 'primary'}" id="talk-end">Neem afscheid</button> <span class="sub">Een bezoek duurt een uur of twee, hoe het ook gaat.</span>`}</p>
    </div>`;
  if (modalOpen && $('#modal .talk')) {
    $('#modal').innerHTML = html;
    $('#modal').querySelectorAll('.close').forEach((b) => b.addEventListener('click', closeModal));
  } else showModal(html);
  // show what was just said from its beginning, so a tale is read from its title
  const log = $('#talk-log');
  const first = log.querySelector<HTMLElement>(`[data-i="${talkFrom}"]`);
  log.scrollTop = first ? first.offsetTop - log.offsetTop - 6 : log.scrollHeight;
  wireTales();
  $('#modal').querySelectorAll<HTMLElement>('[data-move]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.move!;
    const m: Move = kind === 'theme' ? { kind, being: b.dataset.being! }
      : kind === 'prompt' ? { kind, t: b.dataset.t! }
      : kind === 'again' ? { kind, num: +b.dataset.num! }
      : { kind: kind as 'praat' | 'leven' | 'free' | 'others' | 'eigen' | 'verloren' };
    talkFrom = t.lines.length;
    const out = f.move(t, m);
    if (out.some((l) => l.entry && f.finds().includes(l.entry))) sfx('sighting');
    else if (out.some((l) => l.entry)) sfx('record');
    else sfx('click');
    renderTalk();
    $('#modal').scrollTop = 0;
  }));
  $('#modal').querySelector('#talk-end')?.addEventListener('click', () => {
    talkFrom = t.lines.length;
    f.endTalk(t);
    renderTalk();
  });
  $('#modal').querySelector('#talk-ok')?.addEventListener('click', closeModal);
}

function lineHtml(l: TalkLine): string {
  if (l.entry) return taleCard(l.entry);
  if (l.opening) return `<article class="tale-card opening"><div class="kicker">${svg(MISC_ICONS.kroniek, 18)} <span>Het begin van een verloren verhaal</span></div><p class="summary">${esc(l.opening)} …</p></article>`;
  if (l.lead) return `<p class="line zij">${esc(l.text)}</p><div class="pencil-card">${svg(MISC_ICONS.kaart, 18)} <span>In potlood, in uw schrift en op de kaart: ${l.lead.lines.map(esc).join(' ')}</span></div>`;
  return `<p class="line ${l.who}">${esc(l.text)}</p>`;
}

function showResult(n: Narrator | null, r: VisitResult, title: string) {
  const f = G.field;
  if (r.entries.length) sfx('record');
  showModal(`
    <div class="leaf sheet visit-leaf">
      ${closeBtn()}
      ${n ? `<div class="visit-head">${portrait(n, 56)}<div><div class="kicker">${esc(title)}</div><h1>${esc(f.sim.name(n))}</h1></div></div>`
        : `<div class="kicker">${esc(f.whereName(f.at))}</div><h1>${esc(title)}</h1>`}
      ${r.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      ${r.entries.map(taleCard).join('')}
      ${r.lead ? `<div class="pencil-card">${svg(MISC_ICONS.kaart, 18)} <span>In potlood in uw schrift en op de kaart: ${r.lead.lines.map(esc).join(' ')}</span></div>` : ''}
      ${n && r.trust[1] > r.trust[0] ? `<p class="sub">${esc(n.first)} kent u nu beter.</p>` : ''}
      <p style="margin-top:18px"><button class="btn primary" id="res-ok">Verder</button></p>
    </div>`);
  wireTales();
  $('#res-ok').addEventListener('click', closeModal);
}

function entryBadge(e: Entry): string {
  const f = G.field;
  if (e.kind === 'new') return '<span class="stamp">nieuw in uw schrift</span>';
  const earlier = f.notebook.find((x) => x.num < e.num && (e.kind === 'same' ? x.n === e.n : x.t === e.t));
  return e.kind === 'version'
    ? `<span class="stamp soft">een andere versie dan nr. ${earlier?.num ?? '?'}</span>`
    : `<span class="stamp grey">hetzelfde als nr. ${earlier?.num ?? '?'}</span>`;
}

function taleCard(e: Entry): string {
  const f = G.field;
  const ty = f.sim.type(e.t);
  const v = f.sim.variant(e.n);
  if (e.frag) {
    // only the beginning came back
    const words = v.d.split(' ');
    const part = words.slice(0, Math.max(6, Math.floor(words.length * 0.35))).join(' ');
    return `<article class="tale-card frag">
      <div class="kicker">${svg(beingIcon(ty.being), 20, RED)} <span>nr. ${e.num} · ${esc(BEING_NL[ty.being] ?? ty.being)}</span> <span class="stamp grey">fragment</span></div>
      <h2>${esc(ty.nl)}?</h2>
      <p class="summary">${esc(part)} …</p>
      <p class="sub">Verder wil het niet boven komen. Misschien op een andere dag.</p>
    </article>`;
  }
  const via = e.via === 'onderweg' ? ' · onderweg gehoord' : e.via === 'brief' ? ' · per brief' : e.via === 'buurten' ? ' · bij het buurten' : e.via === 'avond' ? ' · op de vertelavond' : '';
  const pts = f.points(e);
  const why = e.quest ? 'het verloren verhaal' : e.scoop ? 'de ander had het al: half' : '';
  const tier = f.tier(e.t);
  const count = f.archiveCount(e.t);
  const rarity = e.kind === 'new'
    ? `<div class="rarity"><span class="tier ${tier}">${tier === 'zeldzaam' ? 'zeldzaam' : tier === 'ongewoon' ? 'ongewoon' : 'bekend'}: ${count}× in de hele Verhalenbank</span>
        ${e.holders <= 1 ? '<span class="uniq">alleen nog bij deze verteller</span>' : e.holders <= 3 ? `<span class="few">nog maar ${e.holders} mensen kennen het</span>` : `<span class="common">${e.holders} mensen in de streek kennen het</span>`}</div>`
    : e.kind === 'version' && e.vholders <= 1 ? '<div class="rarity"><span class="uniq">een versie die verder niemand vertelt</span></div>' : '';
  // the first time a tale is shown it is written in, word by word; a find is marked as one
  const fresh = !shownOnce.has(e.num);
  shownOnce.add(e.num);
  const find = f.finds().includes(e);
  const summary = fresh
    ? v.d.split(' ').map((w, i) => `<span class="ink" style="animation-delay:${Math.min(4, i * 0.045).toFixed(2)}s">${esc(w)} </span>`).join('')
    : esc(v.d);
  return `<article class="tale-card${fresh ? ' fresh' : ''}${find ? ' find' : ''}">
    ${find ? '<div class="find-ribbon">Vondst</div>' : ''}
    <div class="kicker">${svg(beingIcon(ty.being), 20, RED)} <span>nr. ${e.num} · ${esc(BEING_NL[ty.being] ?? ty.being)}${via}</span> ${entryBadge(e)}</div>
    <h2>${esc(ty.nl)} <span class="pts" title="punten voor uw schrift">+${pts}${why ? ` <small>${esc(why)}</small>` : ''}</span></h2>
    ${rarity}
    <p class="summary">${summary}</p>
    <div class="orig-wrap"><button class="btn small" data-orig="${e.n}">Lees de opgetekende tekst</button>
      <a href="${verhalenbankUrl(v.n)}" target="_blank" rel="noopener" class="muted">in de Verhalenbank ↗</a></div>
  </article>`;
}

function wireTales() {
  const f = G.field;
  $('#modal').querySelectorAll<HTMLElement>('[data-orig]').forEach((b) => b.addEventListener('click', async () => {
    const n = +b.dataset.orig!;
    const wrap = b.parentElement!;
    markRead(f.region, f.sim.variant(n).t);
    wrap.innerHTML = '<p class="sub">Het archief wordt doorzocht…</p>';
    const text = await loadText(f.region, n).catch(() => null);
    wrap.innerHTML = text ? `<div class="original">${esc(text)}</div>` : '<p class="sub">Van deze variant is alleen de samenvatting bewaard.</p>';
  }));
}

export function openTale(num: number) {
  const f = G.field;
  const e = f.notebook[num - 1];
  if (!e) return;
  const n = f.sim.narrators[e.narrator];
  const where = e.site !== null ? f.land.sites[e.site].name : f.land.places[e.place].name;
  showModal(`
    <div class="leaf sheet visit-leaf">
      ${closeBtn()}
      ${taleCard(e)}
      <p class="sub">Verteld door ${esc(f.sim.name(n))} (${f.age(n)}), ${esc(where)}, dag ${e.day} in de ${PARTS[e.part]}.${n.died !== null ? ' <span class="red">Inmiddels overleden.</span>' : ''}</p>
    </div>`);
  wireTales();
}

// ------------------------------------------------------------------ the notebook and the diary

function openNotebook() {
  const f = G.field;
  const nb = f.notebook;
  const types = new Set(nb.map((e) => e.t)).size;
  showModal(`
    <div class="leaf sheet wide">
      ${closeBtn()}
      <div class="kicker">${svg(MISC_ICONS.notitieboek, 22)} Uw schrift</div>
      <h1>${plural(nb.length, 'verhaal', 'verhalen')} opgeschreven</h1>
      <p class="sub">${plural(types, 'verschillend verhaal', 'verschillende verhalen')}, van ${plural(new Set(nb.map((e) => e.narrator)).size, 'verteller', 'vertellers')}. ${nb.filter((e) => e.kind === 'version').length} andere versies, ${nb.filter((e) => e.kind === 'same').length} keer hetzelfde gehoord${nb.some((e) => e.frag) ? `, ${nb.filter((e) => e.frag).length} nog maar half` : ''}.</p>
      ${nb.length ? (() => {
        const finds = f.finds();
        const card = (e: Entry) => {
          const n = f.sim.narrators[e.narrator];
          const where = e.site !== null ? f.land.sites[e.site].name : f.land.places[e.place].name;
          return `<button class="card ${e.kind}${finds.includes(e) ? ' find' : ''}" data-num="${e.num}"><div class="no"><span>nr. ${e.num}</span><span>+${f.points(e)} · dag ${e.day}</span></div>
            <div class="ti">${svg(beingIcon(f.sim.type(e.t).being), 16, RED)} ${esc(f.sim.type(e.t).nl)}</div>
            <div class="who">${esc(f.sim.name(n))}, ${esc(where)}${e.frag ? ' · <i>fragment</i>' : e.kind === 'same' ? ' · <i>al gehoord</i>' : e.kind === 'version' ? ' · <i>andere versie</i>' : ''}</div></button>`;
        };
        // by chapter: the kinds of tale in your sagenboek first, then the rest
        const groups = new Map<string, Entry[]>();
        for (const e of [...nb].reverse()) {
          const b = f.sim.type(e.t).being;
          const key = f.chapters.includes(b) ? b : 'overig';
          groups.set(key, [...(groups.get(key) ?? []), e]);
        }
        const order = [...f.chapters.filter((b) => groups.has(b)), ...(groups.has('overig') ? ['overig'] : [])];
        return (finds.length ? `<h2 class="nb-h">Vondsten</h2><div class="cards">${finds.map(card).join('')}</div>` : '')
          + order.map((b) => {
            const have = f.chapterProgress().find((c) => c.being === b)?.have ?? 0;
            return `<h2 class="nb-h">${b === 'overig' ? 'Overige verhalen' : `${svg(beingIcon(b), 18, RED)} ${esc(BEING_NL[b] ?? b)}`}${b !== 'overig' ? ` <span class="${have >= CHAPTER_NEED ? 'red' : 'muted'}">${have >= CHAPTER_NEED ? 'hoofdstuk af' : `${have} van ${CHAPTER_NEED}`}</span>` : ''}</h2>
              <div class="cards">${groups.get(b)!.map(card).join('')}</div>`;
          }).join('');
      })() : '<p class="sub">Nog leeg. Zoek iemand op en luister.</p>'}
    </div>`);
  $('#modal').querySelectorAll<HTMLElement>('[data-num]').forEach((el) => el.addEventListener('click', () => openTale(+el.dataset.num!)));
}

function openDiary() {
  const f = G.field;
  let day = 0;
  const body = f.diary.map((d) => {
    const head = d.day !== day ? `<h3 class="chron-year">Dag ${(day = d.day)} <span class="wx">${WX_ICON[f.weathers[d.day] ?? 'bewolkt']} ${WEATHER[f.weathers[d.day] ?? 'bewolkt'].nl}</span></h3>` : '';
    return `${head}<div class="entry d-${d.kind}"><span class="d">${PARTS[d.part]}</span>${esc(d.text)}</div>`;
  }).join('');
  showModal(`
    <div class="leaf sheet">
      ${closeBtn()}
      <div class="kicker">${svg(MISC_ICONS.kroniek, 22)} Dagboek</div>
      <h1>${esc(f.sim.corpus.meta.regions[f.region].nl)}, ${SEASON_NL[f.season]} ${f.year}</h1>
      <div id="chron">${body}</div>
    </div>`);
}

// ------------------------------------------------------------------ the start

function openIntro(first: boolean) {
  const f = G.field;
  const home = f.land.places[0].name;
  showModal(`
    <div class="leaf sheet intro-leaf">
      ${closeBtn()}
      <div class="kicker">${cap(SEASON_NL[f.season])} ${f.year} · ${esc(f.sim.corpus.meta.regions[f.region].nl)}</div>
      <h1>${first ? `Aangekomen in ${esc(home)}` : 'Hoe het werkt'}</h1>
      <p class="lead-in">U hebt ${DAYS} dagen om in deze streek sagen op te tekenen. Wat u niet opschrijft, verdwijnt vroeg of laat.</p>
      <ol class="steps">
        <li>${svg(MISC_ICONS.kaart, 26)}<span><b>Ga op pad.</b> ${touch ? 'Tik' : 'Klik'} op een dorp of plek op de kaart.</span></li>
        <li>${svg(MISC_ICONS.verzamelaar, 26)}<span><b>Maak een praatje.</b> Wie u nog niet kent, moet eerst wat ontdooien. Vraag te vroeg, en de sfeer slaat om.</span></li>
        <li>${svg(MISC_ICONS.catalogus, 26, RED)}<span><b>Zoek vondsten.</b> Wat alleen uw verteller nog weet, of wat zelden is opgetekend, telt het meest.</span></li>
        <li>${svg(MISC_ICONS.notitieboek, 26, RED)}<span><b>Volg het spoor.</b> Ergens leeft nog één verhaal dat nog maar één mens kent. De waardin weet waar het spoor begint.</span></li>
        <li>${svg(MISC_ICONS.kroniek, 26)}<span><b>De tijd dringt.</b> Wie oud en ziek is, kan niet wachten, en vanaf dag drie verzamelt er nog iemand.</span></li>
      </ol>
      <details class="more"${first ? '' : ' open'}><summary>Meer uitleg</summary>
      <div class="howto">
        <p><b>Erheen.</b> Waar u geweest bent, krijgt de kaart kleur. Onderweg komt u soms iemand tegen die iets vertelt.</p>
        <p><b>Een bezoek.</b> U hebt een paar beurten. Praat eerst wat, vraag naar vroeger, of vertel zelf een verhaal: dan komen herinneringen los. De een vertelt graag, de ander lacht om oudewijvenpraat of is bang uitgelachen te worden.</p>
        <p><b>Vondsten.</b> Vraag ernaar als men u genoeg vertrouwt: „Vertelt men hier iets wat ik nergens anders hoor?”</p>
        <p><b>Uw sagenboek.</b> ${touch ? 'Onderaan' : 'Links'} staan de hoofdstukken van het boek dat u maakt: drie verhalen van een soort maken een hoofdstuk.</p>
        <p><b>Terugkomen.</b> Soms komt een verhaal maar half boven. Op een andere dag lukt het misschien wel. En wie u kent, vertelt meer.</p>
        <p><b>Gehoord.</b> Wat mensen over anderen vertellen, staat ${touch ? 'onderaan' : 'links'} en in potlood op de kaart.</p>
        <p><b>Weer en nacht.</b> Als het regent, werkt niemand buiten, maar de wegen zijn modderig. In de mist verdwaal je buiten de wegen. ’s Nachts, of in de ochtendmist, ziet u soms iets bij het veen, de galg of de linde: ${touch ? 'tik' : 'klik'} erop als u dichtbij bent.</p>
        <p><b>De ander.</b> U hoort steeds waar de andere verzamelaar morgen heen gaat. Wat die het eerst opschrijft, is voor u maar half zoveel waard.</p>
      </div></details>
      <p class="persona">${esc(f.persona.perk)}</p>
      ${first && feest() ? `<p class="feest-line">${esc(FEEST_LINE[feest()!])}</p>` : ''}
      <p style="margin-top:16px"><button class="btn primary" id="intro-ok">${first ? 'Aan de slag' : 'Verder'}</button>
        ${first ? '' : '<button class="linkbtn colofon-btn" id="intro-colofon">Colofon</button>'}</p>
    </div>`);
  $('#intro-ok').addEventListener('click', closeModal);
  document.querySelector('#intro-colofon')?.addEventListener('click', openColofon);
}

// ------------------------------------------------------------------ leaves and notices

function closeBtn() {
  return `<button class="iconbtn close" title="Sluiten (Esc)">${svg(MISC_ICONS.sluit, 18)}</button>`;
}

export function showModal(html: string) {
  const m = $('#modal');
  modalOpen = true;
  m.innerHTML = html;
  m.classList.remove('hidden');
  m.scrollTop = 0;
  m.querySelectorAll('.close').forEach((b) => b.addEventListener('click', closeModal));
  sfx('page');
}

export function closeModal() {
  if (talk && !talk.ended) G.field.endTalk(talk);
  talk = null;
  // whatever was written down meanwhile leaves a splash of ink on the map
  const f = G.field;
  const fresh = f.notebook.slice(inked);
  inked = f.notebook.length;
  if (fresh.length) G.emit('inked', fresh.map((e) => ({ place: e.place, site: e.site, find: f.finds().includes(e) })));
  $('#modal').classList.add('hidden');
  $('#modal').innerHTML = '';
  modalOpen = false;
  render();
  if (G.field.over && !G.walking) setTimeout(finish, 300);
  else if (!G.walking) setTimeout(() => checkQuest() || showPost(), 300);
}

/** Someone met on the road, and what they told. */
function showEncounter(enc: NonNullable<typeof G.field.encounter>) {
  const f = G.field;
  const n = f.sim.narrators[enc.narrator];
  if (enc.entry) sfx('record');
  showModal(`
    <div class="leaf sheet visit-leaf">
      ${closeBtn()}
      <div class="visit-head">${portrait(n, 56)}<div><div class="kicker">Onderweg</div><h1>${esc(f.sim.name(n))}</h1>
        <p class="sub">${esc(enc.who)} · uit ${esc(f.land.places[n.place].name)}</p></div></div>
      ${enc.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      ${enc.entry ? taleCard(enc.entry) : ''}
      <p style="margin-top:18px"><button class="btn primary" id="res-ok">Verder</button></p>
    </div>`);
  wireTales();
  $('#res-ok').addEventListener('click', closeModal);
}

/** Letters in answer to the appeal: shown once, when there is a quiet moment. */
function showPost() {
  const f = G.field;
  if (modalOpen || G.walking || f.over) return;
  const unread = f.letters.filter((l) => !l.read);
  if (!unread.length) return;
  for (const l of unread) l.read = true;
  if (unread.some((l) => l.entries.length)) sfx('record');
  showModal(`
    <div class="leaf sheet visit-leaf">
      ${closeBtn()}
      <div class="kicker">${svg(MISC_ICONS.notitieboek, 22)} Post, dag ${f.day}</div>
      <h1>${unread.length === 1 ? 'Een brief' : `${unread.length} brieven`} op uw oproep</h1>
      ${unread.map(letterHtml).join('')}
      <p style="margin-top:18px"><button class="btn primary" id="res-ok">Verder</button></p>
    </div>`);
  wireTales();
  $('#res-ok').addEventListener('click', closeModal);
}

function letterHtml(l: Letter): string {
  return `<div class="letter-in">
    <p class="said-line">${esc(l.text)}</p>
    ${l.entries.map(taleCard).join('')}
  </div>`;
}

let noticeTimer = 0;
function notice(html: string) {
  const el = $('#notice');
  el.innerHTML = html;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => el.classList.add('hidden'), 7000);
}

// ------------------------------------------------------------------ portraits

/** A drawn bust, the same every time for the same person. */
export function portrait(n: Narrator, size: number): string {
  const f = G.field;
  const q = f.quest;
  // in the village of the lost tale, only the one who has it wears the mark of the clue
  const mark = q && n.place === q.village ? (n.id === q.target ? q.mark : 'none') : undefined;
  return drawPortrait({ seed: n.id + f.sim.seed * 7, age: f.age(n), temper: f.temper(n), work: f.sim.map.buildings[n.home]?.kind, ill: f.ill.has(n.id), mark }, size);
}

// ------------------------------------------------------------------ atmosphere in the HTML layer

const shownOnce = new Set<number>();
let inked = 0;
let lastDay = 1;

const FULL_ICON = `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12 V5 H12 M20 5 H27 V12 M27 20 V27 H20 M12 27 H5 V20"/></svg>`;

const WX_ICON: Record<Weather, string> = {
  helder: `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="16" cy="16" r="6"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M10 22l-3 3"/></svg>`,
  bewolkt: `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 23 Q3 23 4 17 Q5 12 11 13 Q13 7 19 8 Q25 9 25 15 Q30 16 29 20 Q28 23 24 23 Z"/></svg>`,
  regen: `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18 Q3 18 4 13 Q5 8 11 9 Q13 4 19 5 Q25 6 25 11 Q30 12 29 15 Q28 18 24 18 Z M10 22l-2 5M16 22l-2 5M22 22l-2 5"/></svg>`,
  mist: `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 10h20M8 15h20M4 20h18M9 25h16"/></svg>`,
  sneeuw: `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 4v24M5.6 10l20.8 12M5.6 22l20.8-12M12.5 5.5L16 9l3.5-3.5M12.5 26.5L16 23l3.5 3.5"/></svg>`,
};

/** The morning of a new day: a card with the day and its weather, over a map coming out of the dark. */
function showDay() {
  const f = G.field;
  const el = $('#daycard');
  el.innerHTML = `<div class="dc-day">Dag ${f.day}</div><div class="dc-wx">${WX_ICON[f.weather]} ${esc(weatherLine(f.season, f.weather))}</div>
    ${f.day === DAYS ? '<div class="dc-last">De laatste dag in het veld.</div>' : feest() && f.day === 2 ? `<div class="dc-last">${esc(FEEST_LINE[feest()!])}</div>` : ''}`;
  // the night passes: the screen goes dark, the new day's card comes up, and the morning comes slowly back
  const veil = $('#dayveil');
  clearTimeout(dayTimer);
  for (const e of [el, veil]) {
    e.classList.remove('hidden', 'skip');
    e.style.animation = 'none';
    void e.offsetWidth;
    e.style.animation = '';
  }
  G.emit('dawn', undefined);
  dayTimer = setTimeout(endDay, DAY_MS);
}

/** How long the passing of a night takes on screen, in ms (as in the CSS). */
const DAY_MS = 6400;
let dayTimer: ReturnType<typeof setTimeout> | undefined;
function endDay() {
  for (const id of ['#daycard', '#dayveil']) $(id).classList.add('hidden');
}

/** Something seen at night: what it looked like, and whom to ask about it. */
function showApparition(site: number) {
  const f = G.field;
  if (!f.canSee(site)) return;
  const s = f.land.sites[site];
  const r = f.see(site);
  sfx('sighting');
  showModal(`
    <div class="leaf sheet visit-leaf apparition">
      ${closeBtn()}
      <div class="kicker">${svg(beingIcon(r.being), 22, RED)} ${f.isNight() ? 'Nacht' : 'Mist'} · ${esc(s.name)}</div>
      <h1>Wat was dat?</h1>
      ${r.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      ${r.lead ? `<div class="pencil-card">${svg(MISC_ICONS.kaart, 18)} <span>In potlood: ${r.lead.lines.map(esc).join(' ')}</span></div>` : ''}
      <p class="sub">Nu weet u waar u naar kunt vragen: ${esc(themeNl(r.being))}.</p>
      <p style="margin-top:16px"><button class="btn primary" id="res-ok">Verder</button></p>
    </div>`);
  $('#res-ok').addEventListener('click', closeModal);
}

// ------------------------------------------------------------------ the score, counting up

let shownScore = 0;
let scoreRaf = 0;
let chaptersDone = 0;
const chaptersSeen = new Set<string>();
const justDone = new Set<string>();

/** The score in the top bar runs up to its new value, and glows while it does. */
function countUp(to: number) {
  const el = $('#score');
  if (to === shownScore) {
    el.textContent = String(to);
    return;
  }
  cancelAnimationFrame(scoreRaf);
  const from = shownScore, t0 = performance.now(), dur = Math.min(1400, 300 + Math.abs(to - from) * 90);
  el.parentElement!.classList.add('rising');
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) scoreRaf = requestAnimationFrame(step);
    else {
      shownScore = to;
      el.parentElement!.classList.remove('rising');
    }
  };
  scoreRaf = requestAnimationFrame(step);
}

/** The day and part of the day in the top bar: on the road it is the time passing by, not the time of arrival. */
function renderClock() {
  const f = G.field;
  const c = G.clock ?? { day: Math.min(f.day, DAYS), part: f.part, slot: f.slot };
  const narrow = matchMedia('(max-width: 700px), (max-height: 520px)').matches;
  const time = clockTime(c.part, c.slot ?? 0).replace(' uur', '');
  const rt = document.querySelector('#road-time');
  if (rt) rt.textContent = `${cap(partName(c.part, c.slot))} van dag ${c.day}.`;
  // music only in the dark: it comes with the evening, on the road as it comes, and stays over the end
  // (not by the clock: a summer evening is light until late, a winter afternoon dark early)
  const dark = f.isDark(c);
  // music and the things seen come with the night, not already with the evening
  setNightMusic(f.isNight(c));
  // the panels and leaves go to lamplight when the evening comes, on the road as it comes
  document.body.classList.toggle('night', dark && !f.over);
  $('#day').textContent = narrow ? `Dag ${c.day}/${DAYS} · ${time}` : `Dag ${c.day} van ${DAYS}, ${partName(c.part, c.slot)} ${time}`;
  // and the weather of that day
  const w = f.weathers[c.day] ?? f.weather;
  const misty = w === 'mist' && c.part === 0;
  const shown: Weather = misty ? 'mist' : w === 'mist' ? 'bewolkt' : w;
  // a clear evening has stars, not sun
  const clearNight = shown === 'helder' && f.isDark(c);
  $('#wx').innerHTML = `${clearNight ? MOON_ICON : WX_ICON[shown]}<span>${clearNight ? 'sterrenhemel' : WEATHER[shown].nl}</span>`;
  $('#wx').title = weatherLine(f.season, w);
}

/** A small oil lamp, flickering, for the evening. */
const LAMP = `<svg class="lamp" width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path class="flame" d="M8 1 C10 4 10.5 6 8 8 C5.5 6 6 4 8 1 Z" fill="#f2b84a"/><path d="M5 9 h6 l1 2 h-8 Z M4 11 h8 c0 4 -1 5 -4 5 c-3 0 -4 -1 -4 -5 Z" fill="#7a5a2a" stroke="#2a211a" stroke-width="0.7"/></svg>`;

const MOON_ICON = `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 5 A11 11 0 1 0 27 21 A9 9 0 1 1 20 5 Z"/><path d="M8 6 l0.8 1.6 1.6 0.8 -1.6 0.8 -0.8 1.6 -0.8 -1.6 -1.6 -0.8 1.6 -0.8 Z" fill="currentColor" stroke="none"/></svg>`;
