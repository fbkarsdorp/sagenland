// The HTML layer: the day and the notebook along the top, where you are on the right, what you have heard
// on the left, and the conversations, tales, notebook, diary and end as leaves of paper.
import { loadText, verhalenbankUrl } from './data';
import { G } from './game';
import { BEING_NAME, MISC_ICONS, beingIcon, svg } from './icons';
import { CHAPTER_NEED, DARK_TITLE, DAYS, PATRON_DAY, HOURS, PARTS, SEASON_NAME, partName, clockTime, durationText, weatherLine, TEMPER, WEATHER, cap, openWord, themeName, type Entry, type Weather, type Letter, type Move, type Talk, type TalkLine, type VisitResult, type Where } from './field';
import { VILLAGE, SITE } from './land';
import type { Narrator } from './sim';
import { RED, RES, knownAt, px, sheets } from './sheet';
import { esc, plural } from './text';
import { EN, L } from './i18n';
import { isMuted, setAmbience, setMuted, setNightMusic, sfx } from './sound';
import { FEEST_LINE, feest } from './feest';
import { openColofon } from './colofon';
import { markRead } from './catalogue';
import { openEnd } from './end';
import { drawPortrait } from './portrait';
import { isWoman } from './names';
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
      <button class="iconbtn" id="btn-overview" title="${L('De hele kaart', 'The whole map')} (0)">${svg(MISC_ICONS.kaart, 18)}</button>
      <div class="sep"></div>
      <div class="stat date"><b id="day"></b><span id="season"></span></div>
      <span id="wx" class="wx"></span>
      <div class="days" id="days" title="${L('Dagen in het veld', 'Days in the field')}"></div>
      <div class="sep"></div>
      <div class="stat score" title="${L('Wat uw schrift waard is, en dat van de andere verzamelaar', 'What your notebook is worth, and the other collector’s')}"><b id="score">0</b><span id="rivalscore">${L('punten', 'points')}</span></div>
      <div class="sep"></div>
      <button class="iconbtn labelled" id="btn-notebook" title="${L('Uw schrift: alles wat u opschreef', 'Your notebook: everything you wrote down')}">${svg(MISC_ICONS.notitieboek, 18)}<span class="hide-narrow">${L('schrift', 'notebook')}</span><span class="count" id="nrec">0</span></button>
      <button class="iconbtn labelled" id="btn-diary" title="${L('Dagboek', 'Diary')}">${svg(MISC_ICONS.kroniek, 18)}<span class="hide-narrow">${L('dagboek', 'diary')}</span></button>
      <button class="iconbtn" id="btn-help" title="${L('Hoe het werkt', 'How it works')}">?</button>
      <button class="iconbtn" id="btn-sound" title="${L('Geluid aan/uit', 'Sound on/off')} (M)"></button>
      ${document.fullscreenEnabled ? `<button class="iconbtn" id="btn-full" title="${L('Volledig scherm', 'Full screen')}">${FULL_ICON}</button>` : ''}
    </header>
    <aside id="leads" class="sheet">
      <button id="drawerbar" class="drawerbar"></button>
      <div id="book"></div>
      <h3 class="gehoord">${L('Gehoord', 'Heard')}</h3><div id="leadlist"></div></aside>
    <section id="here" class="sheet"></section>
    <div id="notice" class="sheet hidden"></div>
    <div id="guide" class="sheet hidden"></div>
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
  $('#guide').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-act="skip"]')) skipPrologue();
  });
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
    // what people here have to tell, now that you are among them
    G.field.news();
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
    // the rival's news, but not the routine line about where they were today; and news of the day, like the trail
    for (const d of f.diary.slice(diaryLen)) if (d.notice) notice(`${svg(d.kind === 'rival' ? MISC_ICONS.verzamelaar : MISC_ICONS.kroniek, 20)} ${esc(d.text)}`);
    diaryLen = f.diary.length;
    G.emit('changed', undefined);
    if (!G.walking && !modalOpen) setTimeout(showPost, 400);
    if (f.over && !G.walking && !modalOpen) setTimeout(finish, 600);
  });
  lastDay = G.field.day;
  render();
  renderSound();
  if (G.field.practising) openWelcome();
  else openIntro(true);
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
  $('#season').textContent = `${SEASON_NAME[f.season]} ${f.year}`;

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
    const label = occ ? (occ.kind === 'herberg' ? L(': vertelavond', ': storytelling evening') : L(': buurten', ': at the neighbours’')) : '';
    return `<i class="${cls}${ev}" title="${L('Dag', 'Day')} ${day}${label}">${day === f.day ? `<b style="width:${((f.part * 2 + f.slot + 1) / 6) * 100}%"></b>` : ''}</i>`;
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
      notice(`${svg(beingIcon(fresh[0]), 22, RED)} ${L(`<b>Hoofdstuk af: ${esc(BEING_NAME[fresh[0]] ?? fresh[0])}</b> · drie verhalen bij elkaar, +5 punten voor uw sagenboek.`,
        `<b>Chapter complete: ${esc(BEING_NAME[fresh[0]] ?? fresh[0])}</b> · three tales together, +5 points for your book of legends.`)}`);
    }
  }
  chaptersDone = sc.done;
  // the first find: what makes a tale worth something, said once
  const finds = f.finds().length;
  if (finds && !findsSeen && !modalOpen) {
    findsSeen = finds;
    notice(`${svg(MISC_ICONS.catalogus, 20, RED)} ${L('<b>Een vondst.</b> Een verhaal dat alleen deze verteller nog kent, of dat in het hele archief zelden is opgetekend. Vondsten zijn het meeste waard.',
      '<b>A find.</b> A tale only this storyteller still knows, or one rarely recorded in the whole archive. Finds are worth the most.')}`);
  }
  $('#rivalscore').textContent = f.rival ? L(`punten · de ander ${f.rivalScore()}`, `points · rival ${f.rivalScore()}`) : L('punten', 'points');
  renderBook();
  renderLeads();
  renderHere();
  renderGuide();
  const here = f.at.kind === 'place' ? f.sim.placeBuildings(f.at.id).map((b) => b.kind) : [];
  const [x, y] = f.tileOf(f.at);
  const nearWater = f.land.tiles.some((t, i) => t.t === 'water' && Math.abs((i % W) - x) + Math.abs(Math.floor(i / W) - y) < 6);
  setAmbience({ season: (['lente', 'zomer', 'herfst', 'winter'] as const).indexOf(f.season) as 0 | 1 | 2 | 3, night: f.part === 2, paused: f.over, church: here.includes('kerk'), mill: here.includes('molen'), water: nearWater });
}

function renderLeads() {
  const f = G.field;
  const open = f.leads.filter((l) => !l.done);
  const done = f.leads.filter((l) => l.done).slice(-3);
  $('#leadlist').innerHTML = [...open, ...done].map((l) => `<button class="lead ${l.done ? 'done' : ''}" data-lead="${l.id}" title="${l.done ? '' : L('Op de kaart', 'On the map')}">
    ${l.lines.map((s) => esc(s)).join(' ')}</button>`).join('') || `<p class="sub">${L('Nog niets.', 'Nothing yet.')}</p>`;
  $('#leads h3.gehoord').innerHTML = `${L('Gehoord', 'Heard')} <span class="count">${open.length}</span>`;
  const sc = f.score();
  $('#drawerbar').innerHTML = `<span>${L('Sagenboek', 'Book')} <b>${sc.done}/${f.chapters.length}</b></span><span>${L('Vondsten', 'Finds')} <b>${f.finds().length}</b></span><span>${L('Gehoord', 'Heard')} <b>${open.length}</b></span><i>${$('#leads').classList.contains('open') ? '▾' : '▴'}</i>`;
}

/** The chapters of the sagenboek you are filling: three tales of a kind make a chapter. */
function renderBook() {
  const f = G.field;
  const sc = f.score();
  const finds = f.finds();
  $('#book').innerHTML = `<h3>${L('Uw sagenboek', 'Your book of legends')} <span class="count">${sc.done}/${f.chapters.length} ${L('hoofdstukken', 'chapters')}</span></h3>
    <div class="finds${finds.length ? '' : ' zero'}" title="${L('Verhalen die alleen uw verteller nog kende, of die in het hele archief zeldzaam zijn', 'Tales only your storyteller still knew, or that are rare in the whole archive')}">${svg(MISC_ICONS.catalogus, 16, RED)}<span>${L('Vondsten', 'Finds')}</span><b>${finds.length}</b></div>
    ${f.chapterProgress().map((c) => ` <div class="chapter ${c.have >= CHAPTER_NEED ? 'done' : ''}${justDone.has(c.being) ? ' just' : ''}" title="${esc(BEING_NAME[c.being] ?? c.being)}: ${c.have} ${L('van', 'of')} ${CHAPTER_NEED} ${L('verhalen', 'tales')}">
      ${svg(beingIcon(c.being), 16, c.have >= CHAPTER_NEED ? RED : undefined)}<span>${esc(BEING_NAME[c.being] ?? c.being)}</span>
      <i>${Array.from({ length: CHAPTER_NEED }, (_, k) => `<b class="${k < c.have ? 'on' : ''}"></b>`).join('')}</i></div>`).join('')}
    ${questBox()}`;
}

/** The trail of the lost tale: what you know so far, and what to do next. */
function questBox(): string {
  const f = G.field;
  const q = f.quest;
  if (!q || !f.questOpen) return '';
  const steps = EN ? ['The beginning', 'The grave', 'Where the family went', 'The tale'] : ['Het begin', 'Het graf', 'Waar de familie bleef', 'Het verhaal'];
  const starter = esc(f.sim.name(f.sim.narrators[q.starter]));
  const church = esc(f.land.places[q.church].name), site = esc(f.land.sites[q.site].name), village = esc(f.land.places[q.village].name);
  const next = (EN ? [
    `Ask ${starter} about the tale nobody can finish any more.`,
    `Find the grave of ${esc(q.grand)} at the church in ${church}.`,
    `Go to ${site} at night.`,
    `In ${village}, find someone ${esc(f.questLook(true))}.`,
    `Found.`,
  ] : [
    `Vraag ${starter} naar het verhaal dat niemand meer kan afmaken.`,
    `Zoek het graf van ${esc(q.grand)} bij de kerk van ${church}.`,
    `Ga ’s nachts naar ${site}.`,
    `Zoek in ${village} iemand van ${esc(f.questLook())}.`,
    `Gevonden.`,
  ])[q.stage];
  return `<div class="quest-box ${q.stage === 4 ? 'solved' : ''}">
    <h3>${L('Het verloren verhaal', 'The lost tale')}</h3>
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
  sfx(ev.title === DARK_TITLE ? 'sighting' : 'page');
  showModal(`
    <div class="leaf sheet visit-leaf quest-leaf">
      ${closeBtn()}
      <div class="kicker">${svg(MISC_ICONS.kroniek, 22)} ${L('Het verloren verhaal', 'The lost tale')}</div>
      <h1>${esc(ev.title)}</h1>
      ${ev.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      <p style="margin-top:16px"><button class="btn primary" id="res-ok">${L('Verder', 'Continue')}</button></p>
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
  const fold = L('Paneel in- of uitklappen', 'Show or hide the panel');
  el.insertAdjacentHTML('afterbegin', `<button class="grip" data-act="grip" aria-label="${fold}"><i></i></button>`
    + `<button class="fold" data-act="grip" title="${el.classList.contains('min') ? L('Paneel uitklappen', 'Show the panel') : L('Paneel inklappen, om de kaart te zien', 'Hide the panel, to see the map')} (H)" aria-label="${fold}">${el.classList.contains('min') ? '‹' : '›'}</button>`);
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
        <div class="kicker">${L('Onderweg naar', 'On the way to')}</div>
        <h2>${esc(f.whereName(f.at))}</h2>
        <p class="sub" id="road-time">${esc(roadTime(G.clock ?? f))}</p>
        <div class="here-foot"><button class="btn" data-act="hurry">${L('Sneller', 'Faster')}</button>
          <span class="muted">${touch ? L('Of tik op de kaart.', 'Or tap the map.') : L('Of klik op de kaart, of druk op de spatiebalk.', 'Or click the map, or press the space bar.')}</span></div>
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
    ? `${cap(VILLAGE[f.land.kinds[w.id]].name)} · ${plural(people.length, L('bewoner', 'inhabitant'), L('bewoners', 'inhabitants'))}`
    : s!.hut !== null ? L(`Buiten ${f.land.places[s!.place].name}. Iemand ${SITE[s!.kind].loner}.`, `Outside ${f.land.places[s!.place].name}. Someone ${SITE[s!.kind].loner}.`)
    : L(`Buiten ${f.land.places[s!.place].name}.`, `Outside ${f.land.places[s!.place].name}.`);
  let evening = '';
  const occ = f.attendable();
  if (occ) evening = `<button class="btn primary big" data-act="evening">${occ.kind === 'herberg' ? L('Ga naar de vertelavond in de herberg', 'Go to the storytelling evening at the inn') : L('Ga ’s avonds buurten', 'Spend the evening at the neighbours’')}</button>`;
  else {
    const today = f.occasions.find((o) => o.known && !o.attended && w.kind === 'place' && o.place === w.id && o.day === f.day);
    if (today) evening = `<p class="hint">${today.kind === 'herberg' ? L('Vanavond is er vertelavond in de herberg.', 'Tonight there is a storytelling evening at the inn.') : L('Vanavond komen de buren bij elkaar.', 'Tonight the neighbours get together.')} ${L('Blijf tot de avond.', 'Stay until evening.')}</p>`;
  }
  const appeal = f.canAppeal() ? `<button class="linkbtn" data-act="appeal" title="${L('Kost twee uur. Misschien schrijft iemand terug, misschien niet.', 'Takes two hours. Someone may write back, or not.')}">${svg(MISC_ICONS.notitieboek, 14)} ${L('oproep in het weekblad', 'appeal in the local paper')}</button>` : '';
  if (chosen !== null && !people.some((n) => n.id === chosen)) chosen = null;
  const card = chosen !== null ? personCard(f.sim.narrators[chosen]) : '';
  el.innerHTML = `
    ${vignette(w)}
    <div class="here-body">
      <div class="kicker">${f.part === 2 ? `${LAMP}${f.isNight() ? L('Nacht', 'Night') : L('Avond', 'Evening')} ${w.kind === 'place' ? 'in' : L('bij', 'at')}` : `${L('U bent', 'You are')} ${w.kind === 'place' ? 'in' : L('bij', 'at')}`}</div>
      <h2>${esc(name)}</h2>
      <p class="sub">${esc(sub)}</p>
      ${evening}
      ${people.length ? `<div class="faces">${people.map(faceChip).join('')}</div>` : `<p class="sub">${s && s.hut === null ? L('Er is hier vandaag niemand. Misschien morgen.', 'Nobody here today. Maybe tomorrow.') : L('Er is hier niemand meer.', 'There is nobody here any more.')}</p>`}
      ${card || (people.length ? `<p class="sub small pick-hint">${EN ? `${touch ? 'Tap' : 'Click'} someone to see who they are.` : `${touch ? 'Tik' : 'Klik'} op iemand om te zien wie het is.`}</p>` : '')}
      ${f.practising ? '' : `<div class="here-foot"><button class="btn" data-act="wait">${f.part === 2 && (f.slot === 1 || f.season === 'winter') ? L('Ga slapen', 'Go to sleep') : f.part === 2 ? L('Wacht tot de nacht', 'Wait for the night') : L(`Wacht tot de ${PARTS[f.part + 1]}`, `Wait for the ${PARTS[f.part + 1]}`)}</button>${appeal}</div>`}
    </div>`;
}

/** A face in the row of people here: who they are shows when you pick them. */
function faceChip(n: Narrator): string {
  const f = G.field;
  const t = f.trustOf(n);
  const lead = f.leads.some((l) => l.narrator === n.id && !l.done) || f.practiceWho() === n.id;
  const pips = [0.3, 0.55, 0.8].map((v) => `<i class="${t >= v ? 'on' : ''}"></i>`).join('');
  return `<button class="face ${chosen === n.id ? 'on' : ''} ${f.away(n) ? 'is-away' : ''} ${f.met.has(n.id) ? 'met' : ''}" data-act="choose" data-n="${n.id}" title="${esc(f.sim.name(n))}, ${f.age(n)}">
    ${portrait(n, 52)}${lead ? `<em class="flag" title="${L('Iemand heeft u over deze persoon verteld', 'Someone told you about this person')}">✎</em>` : ''}${f.ill.has(n.id) ? `<em class="flag ill" title="${L('ziek', 'ill')}">+</em>` : ''}${f.day >= PATRON_DAY && f.patronOf(n.place)?.nid === n.id ? `<em class="flag cross" title="${esc(cap(f.role(n)))}">✝</em>` : ''}
    <span class="fname">${esc(n.first)}</span><span class="fage">${f.away(n) ? L('op het land', 'in the fields') : f.age(n)}</span>
    <span class="trust">${pips}</span></button>`;
}

/** The card of the person picked: what you know of them, and the door to knock on. */
function personCard(n: Narrator): string {
  const f = G.field;
  const traits = f.traits(n);
  const lead = f.leads.find((l) => l.narrator === n.id);
  const said = lead && !f.met.has(n.id) ? `<span class="said">${esc(L(`${lead.source}: „${lead.lines.slice(1).join(' ')}”`, `${cap(lead.source)}: “${lead.lines.slice(1).join(' ')}”`))}</span>` : '';
  return `<div class="person-card">
    <div class="pinfo"><span class="pname"><b>${esc(f.sim.name(n))}</b> <span class="age">${f.age(n)}</span></span>
      <span class="role">${esc(f.role(n))}${traits.length ? ' · ' + traits.map((x, i) => (i === 0 && f.ill.has(n.id) ? `<span class="red">${esc(x)}</span>` : esc(x))).join(' · ') : ''}</span>
      ${said}</div>
    ${f.practising && !f.canVisit(n) ? `<span class="away">${esc(notNow(n))}</span>`
      : f.away(n) ? `<span class="away">${L('op het land, kom ’s avonds terug', 'in the fields, come back in the evening')}</span>` : `<button class="btn primary" data-act="visit" data-n="${n.id}">${L('Bezoek', 'Visit')}</button>`}
  </div>`;
}

/** On the first evening, why not this one now. */
function notNow(n: Narrator): string {
  const f = G.field;
  const p = f.prologue!;
  const who = f.practiceWho();
  const part = f.castPart(n.id);
  if (part && f.notebook.some((e) => e.narrator === n.id)) return EN ? `${cap(p.mentor)}: “You’ve had your tale from ${n.first}.”` : `${cap(p.mentor)}: „Van ${n.first} hebt u uw verhaal.”`;
  if (who !== null && part) return EN ? `${cap(p.mentor)}: “In a moment. ${f.sim.narrators[who].first} first.”` : `${cap(p.mentor)}: „Zo meteen. Eerst ${f.sim.narrators[who].first}.”`;
  if (who !== null) return EN ? `${cap(p.mentor)}: “Tomorrow. Tonight, ${f.sim.narrators[who].first} first.”` : `${cap(p.mentor)}: „Morgen. Vanavond eerst ${f.sim.narrators[who].first}.”`;
  return EN ? `${cap(p.mentor)}: “Tomorrow.”` : `${cap(p.mentor)}: „Morgen.”`;
}

function destView(w: Where): string {
  const f = G.field;
  const r = f.route(w);
  const name = f.whereName(w);
  const been = w.kind === 'place' ? f.visitedPlaces.has(w.id) : f.visitedSites.has(w.id);
  const leads = f.leads.filter((l) => !l.done && f.same(l.at, w));
  const kind = w.kind === 'place' ? VILLAGE[f.land.kinds[w.id]].name : '';
  const notYet = L('U bent er nog niet geweest.', 'You haven’t been there yet.');
  const desc = been ? f.arrivalLine(w) : kind ? `${L('Een', /^[aeiou]/i.test(kind) ? 'An' : 'A')} ${kind}. ${notYet}` : notYet;
  const recs = f.notebook.filter((e) => (w.kind === 'place' ? e.place === w.id && e.site === null : e.site === w.id)).length;
  if (f.practising && !f.mayGoTo(w)) return `
    ${vignette(w)}
    <div class="here-body">
      <div class="kicker">${L('Erheen?', 'Go there?')}</div>
      <h2>${esc(name)}</h2>
      <p class="sub">${esc(cap(f.prologue!.mentor))}: ${L('„Vanavond niet. Morgen hebt u twaalf dagen.”', '“Not tonight. Tomorrow you have twelve days.”')}</p>
      <div class="here-foot"><button class="btn" data-act="stay">${L('Terug', 'Back')}</button></div>
    </div>`;
  const how = r && f.practising ? `${durationText(r.parts)} ${L('lopen, met', 'on foot, with')} ${f.prologue!.mentor}`
    : r ? `${durationText(r.parts)} ${r.foot > 3 && f.persona.travel !== 'voet' ? `${f.persona.verb}${L(', het laatste stuk te voet', ', the last stretch on foot')}` : f.persona.verb}` : '';
  const arrive = r ? f.part * 2 + f.slot + r.parts : 0;
  const late = (r && arrive > 5 ? L(' U komt er pas morgen aan.', ' You won’t get there until tomorrow.')
    : r && Math.floor(arrive / 2) > f.part ? L(` U komt aan in de ${PARTS[Math.floor(arrive / 2)]}.`, ` You arrive in the ${PARTS[Math.floor(arrive / 2)]}.`) : '')
    + (r && f.weather === 'regen' ? L(' Door de regen gaat het langzaam.', ' The rain slows you down.') : '')
    + (r && f.misty && r.foot > 3 ? L(' In de mist is het pad buiten de weg moeilijk te vinden.', ' In the mist the path off the road is hard to find.') : '');
  return `
    ${vignette(w)}
    <div class="here-body">
      <div class="kicker">${L('Erheen?', 'Go there?')}</div>
      <h2>${esc(name)}</h2>
      <p>${esc(desc)}${recs ? ` <span class="red">${recs} ${L('opgetekend', 'recorded')}.</span>` : ''}</p>
      ${leads.map((l) => `<p class="pencil">${l.lines.map(esc).join(' ')}</p>`).join('')}
      ${r ? `<p class="sub">${esc(cap(how))}.${late}</p>
        <div class="here-foot"><button class="btn primary" data-act="go">${L('Ga erheen', 'Go')}</button><button class="btn" data-act="stay">${L('Blijf hier', 'Stay here')}</button></div>`
        : `<p class="sub">${L('Daar komt u vanaf hier niet.', 'You can’t get there from here.')}</p><div class="here-foot"><button class="btn" data-act="stay">${L('Terug', 'Back')}</button></div>`}
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
    setOut(() => f.travel(to));
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
    showResult(null, f.attendEvening(), kind === 'buurten' ? L('Buurten', 'At the neighbours’') : L('De vertelavond', 'The storytelling evening'));
  } else if (act === 'appeal') {
    f.appeal();
    notice(`${svg(MISC_ICONS.notitieboek, 20)} ${L('Uw oproep staat volgende week in het weekblad. Wie weet schrijft er iemand terug.', 'Your appeal will be in the local paper next week. Perhaps someone will write back.')}`);
  }
}

/** On the road: the scene rides it, the panel says where to. */
function setOut(go: () => number[] | null) {
  const f = G.field;
  $('#btn-overview').classList.remove('on');
  G.walking = true;
  // the light stays as it is at departure; the scene lets the day pass along the way
  G.clock = { day: f.day, part: f.part, slot: f.slot };
  const tiles = go();
  if (!tiles) G.clock = null;
  if (tiles) G.emit('walk', tiles);
  else G.walking = false;
  render();
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
  // on the first evening, the move the old collector would make lights up
  const hint = f.practiceHint(t);
  const mv = (kind: string, inner: string, extra = '', cls = '') => {
    const key = kind === 'theme' ? `theme:${/data-being="([^"]+)"/.exec(extra)?.[1]}` : kind;
    return `<button class="ask ${cls}${hint === key ? ' hint' : ''}" data-move="${kind}" ${extra}>${inner}</button>`;
  };
  const html = `
    <div class="leaf sheet visit-leaf talk">
      ${closeBtn()}
      <div class="visit-head">${portrait(n, 64)}<div>
        <div class="kicker">${cap(partName(f.part, f.slot))}, ${clockTime(f.part, f.slot)} · ${esc(f.whereName(f.at))}</div>
        <h1>${esc(f.sim.name(n))}</h1>
        <p class="sub">${f.age(n)} ${L('jaar', 'years old')} · ${esc(f.role(n))}${f.ill.has(t.nid) ? ` · <span class="red">${L('ziek', 'ill')}</span>` : ''}</p></div></div>
      <div class="mood">
        <span class="mood-k">${L('Sfeer', 'Mood')}</span><span class="mood-bar"><i style="width:${Math.round(t.open * 100)}%"></i></span><span class="mood-w">${openWord(t.open)}</span>
        <span class="moves" title="${L('Wat u nog kunt zeggen voor het tijd is om te gaan', 'What you can still say before it is time to go')}">${Array.from({ length: f.castPart(t.nid) ? 6 : f.part === 2 ? 4 : 3 }, (_, k) => `<b class="${k < t.moves ? 'on' : ''}"></b>`).join('')}</span>
      </div>
      ${known || f.castPart(t.nid) ? `<p class="temper"><b>${esc(cap(TEMPER[tm].name))}.</b> ${esc(TEMPER[tm].hint)}</p>` : ''}
      <div class="talk-log" id="talk-log">${t.lines.map((l, i) => `<div class="tl" data-i="${i}">${lineHtml(l)}</div>`).join('')}</div>
      ${live ? `
        <h3 class="ask-h">${L('Op gang komen', 'Getting started')}</h3>
        <div class="asks wide">
          ${mv('praat', L('<span><b>Praat over koetjes en kalfjes</b><br/><small>Het weer, de oogst, de buren.</small></span>',
            '<span><b>Make small talk</b><br/><small>The weather, the harvest, the neighbours.</small></span>'))}
          ${mv('leven', L(`<span><b>Vraag naar vroeger</b><br/><small>Over de ouders, het werk, het dorp zoals het was.</small></span>`,
            `<span><b>Ask about the old days</b><br/><small>Their parents, their work, the village as it was.</small></span>`))}
        </div>
        ${prompts.length ? `<h3 class="ask-h">${L('Vertel zelf een verhaal', 'Tell a tale yourself')}</h3>
          <div class="asks prompts">${prompts.map((ty) => mv('prompt', `${svg(beingIcon(f.sim.type(ty).being), 16, RED)}<span>${esc(f.sim.type(ty).name)}</span>`, `data-t="${ty}"`)).join('')}</div>` : ''}
        <h3 class="ask-h">${L('Vragen', 'Ask')}</h3>
        ${frags.length ? `<div class="asks wide">${frags.map((e) => mv('again', L(`<span><b>Het verhaal van laatst</b><br/><small>„${esc(f.sim.type(e.t).name)}”, dat maar half bovenkwam.</small></span>`,
          `<span><b>The tale from last time</b><br/><small>“${esc(f.sim.type(e.t).name)}”, which only half came back.</small></span>`), `data-num="${e.num}"`)).join('')}</div>` : ''}
        <div class="asks">
          ${themes.map((b) => {
            const have = new Set(f.notebook.filter((e) => f.sim.type(e.t).being === b).map((e) => e.t)).size;
            return mv('theme', `${svg(beingIcon(b), 20, RED)}<span>${esc(BEING_NAME[b] ?? b)}</span>${have ? `<em title="${L('Al in uw schrift', 'Already in your notebook')}">${have}</em>` : ''}`, `data-being="${b}"`);
          }).join('')}
        </div>
        <div class="asks wide">
          ${mv('free', L(`<span><b>Kent u nog oude verhalen?</b><br/><small>Laat ${esc(n.first)} zelf kiezen.</small></span>`,
            `<span><b>Do you know any old tales?</b><br/><small>Let ${esc(n.first)} choose.</small></span>`))}
          ${mv('others', L(`<span><b>Wie kan er nog meer vertellen?</b><br/><small>Geen verhaal, wel een naam.</small></span>`,
            `<span><b>Who else could tell me something?</b><br/><small>Not a tale, but a name.</small></span>`))}
        </div>
        <div class="asks wide">
          ${mv('eigen', L(`<span><b>Vertelt men hier iets wat ik nergens anders hoor?</b><br/><small>Het zeldzaamste wat ${esc(n.first)} weet. Vraagt om vertrouwen.</small></span>`,
            `<span><b>Is anything told here that I won’t hear anywhere else?</b><br/><small>The rarest thing ${esc(n.first)} knows. Takes trust.</small></span>`), '', 'rare')}
        </div>
        ${f.canAskVouch(t.nid) ? `<div class="asks wide">${mv('voorspraak', EN
          ? `<span><b>Would you put in a good word for me?</b><br/><small>Then all of ${esc(f.land.places[n.place].name)} will trust you sooner. But questions about superstition will get back to him.</small></span>`
          : `<span><b>Wilt u een goed woord voor mij doen?</b><br/><small>Dan vertrouwt heel ${esc(f.land.places[n.place].name)} u sneller. Maar vragen naar bijgeloof komen hem ter ore.</small></span>`, '', 'vouch')}</div>` : ''}
        ${f.canAskLost(t.nid) ? `<div class="asks wide">${mv('verloren', f.quest!.stage === 0
          ? L(`<span><b>Het verhaal dat niemand meer kan afmaken</b><br/><small>Waar de waardin het over had.</small></span>`,
            `<span><b>The tale nobody can finish any more</b><br/><small>The one the landlady mentioned.</small></span>`)
          : L(`<span><b>Kent u het verhaal van ${esc(f.quest!.grand)}?</b><br/><small>Alleen de goede persoon weet het. Wie het niet weet, vindt de vraag vreemd.</small></span>`,
            `<span><b>Do you know the tale of ${esc(f.quest!.grand)}?</b><br/><small>Only the right person knows it. Anyone else will find the question odd.</small></span>`), '', 'quest')}</div>` : ''}` : ''}
      <p class="talk-foot">${t.ended
        ? `<button class="btn primary" id="talk-ok">${L('Verder', 'Continue')}</button>`
        : `<button class="btn ${live ? '' : 'primary'}${hint === 'bye' ? ' hint' : ''}" id="talk-end">${L('Neem afscheid', 'Say goodbye')}</button> <span class="sub">${L('Een bezoek duurt een uur of twee, hoe het ook gaat.', 'A visit takes two hours or so, however it goes.')}</span>`}</p>
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
      : { kind: kind as 'praat' | 'leven' | 'free' | 'others' | 'eigen' | 'verloren' | 'voorspraak' };
    talkFrom = t.lines.length;
    const out = f.move(t, m);
    if (out.some((l) => l.entry && f.finds().includes(l.entry))) sfx('sighting');
    else if (out.some((l) => l.entry)) sfx('record');
    else sfx('click');
    renderTalk();
    $('#modal').scrollTop = 0;
  }));
  // taking your leave closes the leaf; how it went comes as a notice on the map
  $('#modal').querySelector('#talk-end')?.addEventListener('click', closeModal);
  $('#modal').querySelector('#talk-ok')?.addEventListener('click', closeModal);
}

function lineHtml(l: TalkLine): string {
  if (l.entry) return taleCard(l.entry);
  if (l.opening) return `<article class="tale-card opening"><div class="kicker">${svg(MISC_ICONS.kroniek, 18)} <span>${L('Het begin van een verloren verhaal', 'The beginning of a lost tale')}</span></div><p class="summary">${esc(l.opening)} …</p></article>`;
  if (l.who === 'mentor') return `<p class="line mentor">${mentorFace(26)}<span><b>${esc(cap(G.field.prologue?.mentor ?? ''))}</b> ${esc(l.text)}</span></p>`;
  if (l.lead) return `<p class="line zij">${esc(l.text)}</p><div class="pencil-card">${svg(MISC_ICONS.kaart, 18)} <span>${L('In potlood, in uw schrift en op de kaart:', 'In pencil, in your notebook and on the map:')} ${l.lead.lines.map(esc).join(' ')}</span></div>`;
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
      ${r.lead ? `<div class="pencil-card">${svg(MISC_ICONS.kaart, 18)} <span>${L('In potlood in uw schrift en op de kaart:', 'In pencil, in your notebook and on the map:')} ${r.lead.lines.map(esc).join(' ')}</span></div>` : ''}
      ${n && r.trust[1] > r.trust[0] ? `<p class="sub">${esc(n.first)} ${L('kent u nu beter.', 'knows you better now.')}</p>` : ''}
      <p style="margin-top:18px"><button class="btn primary" id="res-ok">${L('Verder', 'Continue')}</button></p>
    </div>`);
  wireTales();
  $('#res-ok').addEventListener('click', closeModal);
}

function entryBadge(e: Entry): string {
  const f = G.field;
  if (e.kind === 'new') return `<span class="stamp">${L('nieuw in uw schrift', 'new in your notebook')}</span>`;
  const earlier = f.notebook.find((x) => x.num < e.num && (e.kind === 'same' ? x.n === e.n : x.t === e.t));
  return e.kind === 'version'
    ? `<span class="stamp soft">${L('een andere versie dan nr.', 'a different version from no.')} ${earlier?.num ?? '?'}</span>`
    : `<span class="stamp grey">${L('hetzelfde als nr.', 'the same as no.')} ${earlier?.num ?? '?'}</span>`;
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
      <div class="kicker">${svg(beingIcon(ty.being), 20, RED)} <span>${L('nr.', 'no.')} ${e.num} · ${esc(BEING_NAME[ty.being] ?? ty.being)}</span> <span class="stamp grey">fragment</span></div>
      <h2>${esc(ty.name)}?</h2>
      <p class="summary">${esc(part)} …</p>
      <p class="sub">${L('Verder wil het niet boven komen. Misschien op een andere dag.', 'Nothing more will come back. Perhaps another day.')}</p>
    </article>`;
  }
  const via = e.via === 'onderweg' ? L(' · onderweg gehoord', ' · heard on the road') : e.via === 'brief' ? L(' · per brief', ' · by letter')
    : e.via === 'buurten' ? L(' · bij het buurten', ' · at the neighbours’') : e.via === 'avond' ? L(' · op de vertelavond', ' · at the storytelling evening') : '';
  const pts = f.points(e);
  const why = e.quest ? L('het verloren verhaal', 'the lost tale') : e.scoop ? L('de ander had het al: half', 'the rival had it first: half') : '';
  const tier = f.tier(e.t);
  const count = f.archiveCount(e.t);
  const rarity = e.kind === 'new'
    ? `<div class="rarity"><span class="tier ${tier}">${tier === 'zeldzaam' ? L('zeldzaam', 'rare') : tier === 'ongewoon' ? L('ongewoon', 'uncommon') : L('bekend', 'common')}: ${count}× ${L('in de hele Verhalenbank', 'in the whole Verhalenbank')}</span>
        ${e.holders <= 1 ? `<span class="uniq">${L('alleen nog bij deze verteller', 'only this storyteller still knows it')}</span>`
          : e.holders <= 3 ? `<span class="few">${L(`nog maar ${e.holders} mensen kennen het`, `only ${e.holders} people still know it`)}</span>`
          : `<span class="common">${L(`${e.holders} mensen in de streek kennen het`, `${e.holders} people in the region know it`)}</span>`}</div>`
    : e.kind === 'version' && e.vholders <= 1 ? `<div class="rarity"><span class="uniq">${L('een versie die verder niemand vertelt', 'a version nobody else tells')}</span></div>` : '';
  // the first time a tale is shown it is written in, word by word; a find is marked as one
  const fresh = !shownOnce.has(e.num);
  shownOnce.add(e.num);
  const find = f.finds().includes(e);
  const summary = fresh
    ? v.d.split(' ').map((w, i) => `<span class="ink" style="animation-delay:${Math.min(4, i * 0.045).toFixed(2)}s">${esc(w)} </span>`).join('')
    : esc(v.d);
  return `<article class="tale-card${fresh ? ' fresh' : ''}${find ? ' find' : ''}">
    ${find ? `<div class="find-ribbon">${L('Vondst', 'Find')}</div>` : ''}
    <div class="kicker">${svg(beingIcon(ty.being), 20, RED)} <span>${L('nr.', 'no.')} ${e.num} · ${esc(BEING_NAME[ty.being] ?? ty.being)}${via}</span> ${entryBadge(e)}</div>
    <h2>${esc(ty.name)} <span class="pts" title="${L('punten voor uw schrift', 'points for your notebook')}">+${pts}${why ? ` <small>${esc(why)}</small>` : ''}</span></h2>
    ${rarity}
    <p class="summary">${summary}</p>
    <div class="orig-wrap"><button class="btn small" data-orig="${e.n}">${L('Lees de opgetekende tekst', 'Read the recorded text')}</button>
      <a href="${verhalenbankUrl(v.n)}" target="_blank" rel="noopener" class="muted">${L('in de Verhalenbank', 'in the Verhalenbank')} ↗</a></div>
  </article>`;
}

function wireTales() {
  const f = G.field;
  $('#modal').querySelectorAll<HTMLElement>('[data-orig]').forEach((b) => b.addEventListener('click', async () => {
    const n = +b.dataset.orig!;
    const wrap = b.parentElement!;
    markRead(f.region, f.sim.variant(n).t);
    wrap.innerHTML = `<p class="sub">${L('Het archief wordt doorzocht…', 'Searching the archive…')}</p>`;
    const text = await loadText(f.region, n).catch(() => null);
    // the record itself stays as it was written down, in Dutch or in dialect; and the way to the archive stays open
    const link = `<a href="${verhalenbankUrl(n)}" target="_blank" rel="noopener" class="muted">${L('Bekijk het in de Verhalenbank', 'See it in the Verhalenbank')} ↗</a>`;
    wrap.innerHTML = text ? `${EN ? '<p class="sub">The original record, in Dutch or dialect:</p>' : ''}<div class="original">${esc(text)}</div><p class="orig-link">${link}</p>`
      : `<p class="sub">${L('Van deze variant is alleen de samenvatting bewaard.', 'Only the summary of this variant has been kept.')} ${link}</p>`;
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
      <p class="sub">${e.day === 0 ? L(`Verteld door ${esc(f.sim.name(n))} (${f.age(n)}), ${esc(where)}, op de eerste avond.`, `Told by ${esc(f.sim.name(n))} (${f.age(n)}), ${esc(where)}, on the first evening.`)
        : L(`Verteld door ${esc(f.sim.name(n))} (${f.age(n)}), ${esc(where)}, dag ${e.day} in de ${PARTS[e.part]}.`,
        `Told by ${esc(f.sim.name(n))} (${f.age(n)}), ${esc(where)}, day ${e.day}, in the ${PARTS[e.part]}.`)}${n.died !== null ? ` <span class="red">${L('Inmiddels overleden.', 'Has since died.')}</span>` : ''}</p>
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
      <div class="kicker">${svg(MISC_ICONS.notitieboek, 22)} ${L('Uw schrift', 'Your notebook')}</div>
      <h1>${EN ? `${plural(nb.length, 'tale', 'tales')} written down` : `${plural(nb.length, 'verhaal', 'verhalen')} opgeschreven`}</h1>
      <p class="sub">${(() => {
        const tellers = new Set(nb.map((e) => e.narrator)).size;
        const versions = nb.filter((e) => e.kind === 'version').length, same = nb.filter((e) => e.kind === 'same').length;
        const frags = nb.filter((e) => e.frag).length;
        return EN
          ? `${plural(types, 'different tale', 'different tales')}, from ${plural(tellers, 'storyteller', 'storytellers')}. ${plural(versions, 'other version', 'other versions')}, ${same} heard again${frags ? `, ${frags} only half` : ''}.`
          : `${plural(types, 'verschillend verhaal', 'verschillende verhalen')}, van ${plural(tellers, 'verteller', 'vertellers')}. ${versions} andere versies, ${same} keer hetzelfde gehoord${frags ? `, ${frags} nog maar half` : ''}.`;
      })()}</p>
      ${nb.length ? (() => {
        const finds = f.finds();
        const card = (e: Entry) => {
          const n = f.sim.narrators[e.narrator];
          const where = e.site !== null ? f.land.sites[e.site].name : f.land.places[e.place].name;
          return `<button class="card ${e.kind}${finds.includes(e) ? ' find' : ''}" data-num="${e.num}"><div class="no"><span>${L('nr.', 'no.')} ${e.num}</span><span>+${f.points(e)} · ${dayName(e.day)}</span></div>
            <div class="ti">${svg(beingIcon(f.sim.type(e.t).being), 16, RED)} ${esc(f.sim.type(e.t).name)}</div>
            <div class="who">${esc(f.sim.name(n))}, ${esc(where)}${e.frag ? ' · <i>fragment</i>' : e.kind === 'same' ? ` · <i>${L('al gehoord', 'heard before')}</i>` : e.kind === 'version' ? ` · <i>${L('andere versie', 'other version')}</i>` : ''}</div></button>`;
        };
        // by chapter: the kinds of tale in your sagenboek first, then the rest
        const groups = new Map<string, Entry[]>();
        for (const e of [...nb].reverse()) {
          const b = f.sim.type(e.t).being;
          const key = f.chapters.includes(b) ? b : 'overig';
          groups.set(key, [...(groups.get(key) ?? []), e]);
        }
        const order = [...f.chapters.filter((b) => groups.has(b)), ...(groups.has('overig') ? ['overig'] : [])];
        return (finds.length ? `<h2 class="nb-h">${L('Vondsten', 'Finds')}</h2><div class="cards">${finds.map(card).join('')}</div>` : '')
          + order.map((b) => {
            const have = f.chapterProgress().find((c) => c.being === b)?.have ?? 0;
            return `<h2 class="nb-h">${b === 'overig' ? L('Overige verhalen', 'Other tales') : `${svg(beingIcon(b), 18, RED)} ${esc(BEING_NAME[b] ?? b)}`}${b !== 'overig' ? ` <span class="${have >= CHAPTER_NEED ? 'red' : 'muted'}">${have >= CHAPTER_NEED ? L('hoofdstuk af', 'chapter complete') : `${have} ${L('van', 'of')} ${CHAPTER_NEED}`}</span>` : ''}</h2>
              <div class="cards">${groups.get(b)!.map(card).join('')}</div>`;
          }).join('');
      })() : `<p class="sub">${L('Nog leeg. Zoek iemand op en luister.', 'Still empty. Go and see someone, and listen.')}</p>`}
    </div>`);
  $('#modal').querySelectorAll<HTMLElement>('[data-num]').forEach((el) => el.addEventListener('click', () => openTale(+el.dataset.num!)));
}

function openDiary() {
  const f = G.field;
  let day = -1;
  const body = f.diary.map((d) => {
    const head = d.day !== day ? `<h3 class="chron-year">${cap(dayName((day = d.day)))} <span class="wx">${WX_ICON[f.weathers[d.day] ?? 'bewolkt']} ${WEATHER[f.weathers[d.day] ?? 'bewolkt'].name}</span></h3>` : '';
    return `${head}<div class="entry d-${d.kind}"><span class="d">${PARTS[d.part]}</span>${esc(d.text)}</div>`;
  }).join('');
  showModal(`
    <div class="leaf sheet">
      ${closeBtn()}
      <div class="kicker">${svg(MISC_ICONS.kroniek, 22)} ${L('Dagboek', 'Diary')}</div>
      <h1>${esc(f.sim.corpus.meta.regions[f.region].name)}, ${SEASON_NAME[f.season]} ${f.year}</h1>
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
      <div class="kicker">${cap(SEASON_NAME[f.season])} ${f.year} · ${esc(f.sim.corpus.meta.regions[f.region].name)}</div>
      <h1>${first ? `${L('Aangekomen in', 'Arrived in')} ${esc(home)}` : L('Hoe het werkt', 'How it works')}</h1>
      ${EN ? `<p class="lead-in">You have ${DAYS} days to record legends in this region. Whatever you don’t write down will sooner or later be gone.</p>
      <ol class="steps">
        <li>${svg(MISC_ICONS.kaart, 26)}<span><b>Set out.</b> ${touch ? 'Tap' : 'Click'} a village or a place on the map.</span></li>
        <li>${svg(MISC_ICONS.verzamelaar, 26)}<span><b>Have a chat.</b> People who don’t know you yet need to warm up first. Ask too soon, and the mood turns.</span></li>
        <li>${svg(MISC_ICONS.catalogus, 26, RED)}<span><b>Look for finds.</b> What only your storyteller still knows, or what was rarely recorded, counts most.</span></li>
        <li>${svg(MISC_ICONS.notitieboek, 26, RED)}<span><b>Follow the trail.</b> Somewhere one tale lives on that only one person still knows. From the second day, the landlady knows where the trail begins.</span></li>
        <li>${svg(MISC_ICONS.kroniek, 26)}<span><b>Time is short.</b> The old and the ill can’t wait, and from day three someone else is collecting too.</span></li>
      </ol>
      <details class="more"${first ? '' : ' open'}><summary>More</summary>
      <div class="howto">
        <p><b>Getting there.</b> Wherever you have been, the map takes on colour. On the road you sometimes meet someone with something to tell.</p>
        <p><b>A visit.</b> You have a few turns. Chat first, ask about the old days, or tell a tale yourself: that brings memories back. Some love to tell; others laugh at old wives’ tales, or are afraid of being laughed at.</p>
        <p><b>Finds.</b> Ask for them once people trust you enough: “Is anything told here that I won’t hear anywhere else?”</p>
        <p><b>Your book of legends.</b> ${touch ? 'At the bottom' : 'On the left'} are the chapters of the book you are making: three tales of a kind make a chapter.</p>
        <p><b>Coming back.</b> Sometimes a tale only half comes back. On another day it may work. And people who know you tell more.</p>
        <p><b>Heard.</b> What people tell you about others is listed ${touch ? 'at the bottom' : 'on the left'}, and pencilled on the map.</p>
        <p><b>Weather and night.</b> When it rains, nobody works outside, but the roads are muddy. In the mist you lose your way off the roads. At night, or in the morning mist, you sometimes see something by the bog, the gallows or the lime tree: ${touch ? 'tap' : 'click'} it when you are close.</p>
        <p><b>The rival.</b> You keep hearing where the other collector is going tomorrow. Whatever they write down first is worth only half as much to you.</p>
        <p><b>The priest.</b> From day ${PATRON_DAY} you can ask the priest (in Friesland the minister) of a church village for a good word: then the whole village trusts you sooner. But ask his parishioners about witches, the nightmare, second sight or sorcery, and it gets back to him. Push someone too far anywhere, and the rest of the village hears of it too.</p>
      </div></details>` : `<p class="lead-in">U hebt ${DAYS} dagen om in deze streek sagen op te tekenen. Wat u niet opschrijft, verdwijnt vroeg of laat.</p>
      <ol class="steps">
        <li>${svg(MISC_ICONS.kaart, 26)}<span><b>Ga op pad.</b> ${touch ? 'Tik' : 'Klik'} op een dorp of plek op de kaart.</span></li>
        <li>${svg(MISC_ICONS.verzamelaar, 26)}<span><b>Maak een praatje.</b> Wie u nog niet kent, moet eerst wat ontdooien. Vraag te vroeg, en de sfeer slaat om.</span></li>
        <li>${svg(MISC_ICONS.catalogus, 26, RED)}<span><b>Zoek vondsten.</b> Wat alleen uw verteller nog weet, of wat zelden is opgetekend, telt het meest.</span></li>
        <li>${svg(MISC_ICONS.notitieboek, 26, RED)}<span><b>Volg het spoor.</b> Ergens leeft nog één verhaal dat nog maar één mens kent. Vanaf de tweede dag weet de waardin waar het spoor begint.</span></li>
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
        <p><b>De pastoor.</b> Vanaf dag ${PATRON_DAY} kunt u de pastoor (in Friesland de dominee) van een kerkdorp om een goed woord vragen: dan vertrouwt het hele dorp u sneller. Maar vraag zijn parochianen naar heksen, de nachtmerrie, voorgezichten of tovenaars, en het komt hem ter ore. Wie u ergens te ver drijft, vertelt het ook door aan de rest van het dorp.</p>
      </div></details>`}
      <p class="persona">${esc(f.persona.perk)}</p>
      ${first && feest() ? `<p class="feest-line">${esc(FEEST_LINE[feest()!])}</p>` : ''}
      <p style="margin-top:16px"><button class="btn primary" id="intro-ok">${first ? L('Aan de slag', 'Get started') : L('Verder', 'Continue')}</button>
        ${first ? '' : `<button class="linkbtn colofon-btn" id="intro-colofon">${L('Colofon', 'Colophon')}</button>`}</p>
    </div>`);
  $('#intro-ok').addEventListener('click', closeModal);
  document.querySelector('#intro-colofon')?.addEventListener('click', openColofon);
}

// ------------------------------------------------------------------ the first evening

/** The old collector's face: a lace cap with the gold ear irons, and the lines of her years. */
function mentorFace(size: number): string {
  return drawPortrait({ seed: G.field.sim.seed * 7 + 1905, age: 76, temper: 'verteller', work: 'school', ill: false, mark: 'oorijzer', woman: true }, size);
}

/** Remember that this player has had the first evening, or did not want it. */
function introDone() {
  try {
    localStorage.setItem('sagenland-intro', 'done');
  } catch {
    // without storage the start page simply offers it again
  }
}

function openWelcome() {
  const f = G.field;
  const p = f.prologue!;
  const home = esc(f.land.places[0].name);
  const season = SEASON_NAME[f.season];
  const mentor = esc(p.mentor), Mentor = esc(cap(p.mentor));
  showModal(`
    <div class="leaf sheet intro-leaf welcome-leaf">
      ${closeBtn()}
      <div class="kicker">${L('De avond voor de eerste dag', 'The evening before the first day')} · ${esc(f.sim.corpus.meta.regions[f.region].name)}, ${season} ${f.year}</div>
      <div class="visit-head">${mentorFace(72)}<div><h1>${L('Aangekomen in', 'Arrived in')} ${home}</h1>
        <p class="sub">${Mentor} ${L('wacht op u bij de waardin', 'is waiting for you at the inn')}</p></div></div>
      <p class="lead-in">${EN
        ? `${Mentor} has collected tales in this region for forty years. This ${season} she is handing it over to you.`
        : `${Mentor} verzamelt al veertig jaar verhalen in deze streek. ${f.season === 'zomer' || f.season === 'winter' ? 'Deze' : 'Dit'} ${season} draagt ze die aan u over.`}</p>
      <p class="said-line">${L(`„U bent de nieuwe. Goed. Morgen gaat u alleen op pad, maar vanavond loopt u met mij mee door ${home}. Ik stel u voor aan drie mensen. Kijk goed hoe het gaat, want ze zijn alle drie anders.”`,
        `“So you’re the new one. Good. Tomorrow you go out alone, but tonight you come round ${home} with me. I’ll introduce you to three people. Watch closely, because all three are different.”`)}</p>
      <p class="persona">${esc(f.persona.perk)}</p>
      ${feest() ? `<p class="feest-line">${esc(FEEST_LINE[feest()!])}</p>` : ''}
      <p style="margin-top:16px"><button class="btn primary" id="intro-ok">${L(`Ga mee met ${mentor}`, `Go with ${mentor}`)}</button>
        <button class="linkbtn" id="intro-skip">${L('Sla de eerste avond over', 'Skip the first evening')}</button></p>
    </div>`);
  const go = () => {
    if (p.step === 'welkom') p.step = 'verteller';
    closeModal();
  };
  $('#intro-ok').addEventListener('click', go);
  $('#modal').querySelectorAll('.close').forEach((b) => b.addEventListener('click', go));
  $('#intro-skip').addEventListener('click', () => {
    closeModal();
    skipPrologue();
  });
}

/** What the old collector says on the map, between visits: whom to see, where to go, and how. */
let guideStep = '';
function renderGuide() {
  const f = G.field;
  const el = $('#guide');
  const p = f.prologue;
  const line = p && f.practising && !G.walking ? f.practiceLine() : '';
  el.classList.toggle('hidden', !line);
  if (!p || !line) return;
  const tap = touch ? L('Tik', 'Tap') : L('Klik', 'Click');
  const who = f.practiceWho();
  const site = esc(f.land.sites[p.site].name);
  const todo = who !== null
    ? EN ? `${tap} ${esc(f.sim.narrators[who].first)} ${touch ? 'below' : 'on the right'}, then Visit.` : `${tap} op ${esc(f.sim.narrators[who].first)} ${touch ? 'onderaan' : 'rechts'}, en dan op Bezoek.`
    : p.step === 'erheen' ? EN ? `${tap} ${site} on the map, then Go.` : `${tap} op ${site} op de kaart, en dan op Ga erheen.`
    : EN ? `${tap} what you see at ${site}.` : `${tap} op wat u bij ${site} ziet.`;
  el.innerHTML = `${mentorFace(44)}<div class="guide-text"><b>${esc(cap(p.mentor))}</b> <span>${esc(line)}</span>
    <p class="guide-do">${todo}</p><button class="linkbtn" data-act="skip">${L('Sla de eerste avond over', 'Skip the first evening')}</button></div>`;
  // when it is time to go out, the map shows where
  if (p.step !== guideStep && !modalOpen) {
    guideStep = p.step;
    if (p.step === 'erheen') {
      const s = f.land.sites[p.site];
      setTimeout(() => G.emit('focus', { x: s.x, y: s.y }), 400);
    }
  }
}

/** After the night out: her last words, and the walk back to the lodgings. */
function farewell(): boolean {
  const f = G.field;
  const p = f.prologue;
  if (modalOpen || G.walking || p?.step !== 'afscheid') return false;
  const Mentor = esc(cap(p.mentor));
  showModal(`
    <div class="leaf sheet visit-leaf">
      ${closeBtn()}
      <div class="visit-head">${mentorFace(64)}<div><div class="kicker">${L('Nacht', 'Night')} · ${esc(f.land.sites[p.site].name)}</div>
        <h1>${L('Morgen gaat u alleen', 'Tomorrow you go alone')}</h1></div></div>
      ${(EN ? [
        '“Now you know how it goes. One tells straight away, another must trust you first, and a third only remembers once you tell something yourself.”',
        '“Write everything down, including what people say about others. The old and the ill can’t wait for you. And you’re not the only one: in a few days someone else will come collecting.”',
        '“Twelve days. Make good use of them.”',
      ] : [
        '„Nu weet u hoe het gaat. De een vertelt zomaar, de ander moet u eerst vertrouwen, en een derde weet het pas weer als u zelf iets vertelt.”',
        '„Schrijf alles op, ook wat mensen over anderen zeggen. Wie oud en ziek is, kan niet op u wachten. En u bent niet de enige: over een paar dagen komt er nog iemand verhalen halen.”',
        '„Twaalf dagen. Maak er wat van.”',
      ]).map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      <p class="sub">${EN ? `${Mentor} lights her lantern and walks back with you to ${esc(f.land.places[0].name)}.` : `${Mentor} steekt haar lantaarn aan en loopt met u terug naar ${esc(f.land.places[0].name)}.`}</p>
      <p style="margin-top:16px"><button class="btn primary" id="res-ok">${L('Terug naar het dorp', 'Back to the village')}</button></p>
    </div>`);
  const home = () => {
    closeModal();
    introDone();
    setOut(() => f.homeward());
  };
  $('#res-ok').addEventListener('click', home);
  $('#modal').querySelectorAll('.close').forEach((b) => b.addEventListener('click', home));
  return true;
}

/** Straight on to the first morning, with the usual explanation. */
function skipPrologue() {
  const f = G.field;
  if (G.walking || !f.practising) return;
  introDone();
  // the explanation first, so the morning's card waits until it is read
  openIntro(true);
  if (f.skipPrologue()) G.emit('teleport', undefined);
  render();
}

// ------------------------------------------------------------------ leaves and notices

function closeBtn() {
  return `<button class="iconbtn close" title="${L('Sluiten', 'Close')} (Esc)">${svg(MISC_ICONS.sluit, 18)}</button>`;
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
  if (talk && !talk.ended) {
    const n = G.field.sim.narrators[talk.nid];
    const out = G.field.endTalk(talk);
    if (out.length) notice(`${portrait(n, 30)}<span>${out.map((l) => esc(l.text)).join(' ')}${out.some((l) => l.lead) ? ` <i>${L('(In potlood op uw kaart.)', '(Pencilled on your map.)')}</i>` : ''}</span>`);
  }
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
  else if (!G.walking) setTimeout(() => farewell() || checkQuest() || showPost(), 300);
}

/** Someone met on the road, and what they told. */
function showEncounter(enc: NonNullable<typeof G.field.encounter>) {
  const f = G.field;
  const n = f.sim.narrators[enc.narrator];
  if (enc.entry) sfx('record');
  showModal(`
    <div class="leaf sheet visit-leaf">
      ${closeBtn()}
      <div class="visit-head">${portrait(n, 56)}<div><div class="kicker">${L('Onderweg', 'On the road')}</div><h1>${esc(f.sim.name(n))}</h1>
        <p class="sub">${esc(enc.who)} · ${L('uit', 'from')} ${esc(f.land.places[n.place].name)}</p></div></div>
      ${enc.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      ${enc.entry ? taleCard(enc.entry) : ''}
      <p style="margin-top:18px"><button class="btn primary" id="res-ok">${L('Verder', 'Continue')}</button></p>
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
      <div class="kicker">${svg(MISC_ICONS.notitieboek, 22)} ${L('Post, dag', 'Post, day')} ${f.day}</div>
      <h1>${EN ? `${unread.length === 1 ? 'A letter' : `${unread.length} letters`} in reply to your appeal` : `${unread.length === 1 ? 'Een brief' : `${unread.length} brieven`} op uw oproep`}</h1>
      ${unread.map(letterHtml).join('')}
      <p style="margin-top:18px"><button class="btn primary" id="res-ok">${L('Verder', 'Continue')}</button></p>
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

/** A line of news at the top of the map. When several come at once, each stays at least a few seconds before the next. */
let noticeTimer = 0;
let noticeAt = 0;
const notices: string[] = [];
function notice(html: string) {
  const el = $('#notice');
  const shown = performance.now() - noticeAt;
  if (!el.classList.contains('hidden') && shown < 3200) {
    notices.push(html);
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(nextNotice, 3200 - shown);
    return;
  }
  showNotice(html);
}
function showNotice(html: string) {
  const el = $('#notice');
  el.innerHTML = html;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  noticeAt = performance.now();
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(nextNotice, notices.length ? 3200 : 7000);
}
function nextNotice() {
  const next = notices.shift();
  if (next) showNotice(next);
  else $('#notice').classList.add('hidden');
}

// ------------------------------------------------------------------ portraits

/** A drawn bust, the same every time for the same person. */
export function portrait(n: Narrator, size: number): string {
  const f = G.field;
  const q = f.quest;
  // in the village of the lost tale, only the one who has it wears the mark of the clue
  const mark = q && n.place === q.village ? (n.id === q.target ? q.mark : 'none') : undefined;
  return drawPortrait({ seed: n.id + f.sim.seed * 7, age: f.age(n), temper: f.temper(n), work: f.sim.map.buildings[n.home]?.kind, ill: f.ill.has(n.id), mark, woman: isWoman(n.first), year: f.year, cleric: f.patronOf(n.place)?.nid === n.id }, size);
}

// ------------------------------------------------------------------ atmosphere in the HTML layer

const shownOnce = new Set<number>();
let findsSeen = 0;
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
  el.innerHTML = `<div class="dc-day">${L('Dag', 'Day')} ${f.day}</div><div class="dc-wx">${WX_ICON[f.weather]} ${esc(weatherLine(f.season, f.weather))}</div>
    ${f.day === DAYS ? `<div class="dc-last">${L('De laatste dag in het veld.', 'The last day in the field.')}</div>` : feest() && f.day === 2 ? `<div class="dc-last">${esc(FEEST_LINE[feest()!])}</div>` : ''}`;
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
      <div class="kicker">${svg(beingIcon(r.being), 22, RED)} ${f.isNight() ? L('Nacht', 'Night') : L('Mist', 'Mist')} · ${esc(s.name)}</div>
      <h1>${L('Wat was dat?', 'What was that?')}</h1>
      ${r.lines.map((l) => `<p class="said-line">${esc(l)}</p>`).join('')}
      ${r.lead ? `<div class="pencil-card">${svg(MISC_ICONS.kaart, 18)} <span>${L('In potlood:', 'In pencil:')} ${r.lead.lines.map(esc).join(' ')}</span></div>` : ''}
      <p class="sub">${L('Nu weet u waar u naar kunt vragen:', 'Now you know what to ask about:')} ${esc(themeName(r.being))}.</p>
      <p style="margin-top:16px"><button class="btn primary" id="res-ok">${L('Verder', 'Continue')}</button></p>
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
  const hour = HOURS[c.part][Math.min(1, c.slot ?? 0)];
  const time = L(`${hour}.00`, `${hour}:00`);
  const rt = document.querySelector('#road-time');
  if (rt) rt.textContent = roadTime(c);
  // music only in the dark: it comes with the evening, on the road as it comes, and stays over the end
  // (not by the clock: a summer evening is light until late, a winter afternoon dark early)
  const dark = f.isDark(c);
  // music and the things seen come with the night, not already with the evening
  setNightMusic(f.isNight(c));
  // the panels and leaves go to lamplight when the evening comes, on the road as it comes
  document.body.classList.toggle('night', dark && !f.over);
  $('#day').textContent = c.day === 0 ? `${narrow ? L('Avond ervoor', 'Evening before') : L('De avond voor dag 1', 'The evening before day 1')} · ${time}`
    : narrow ? `${L('Dag', 'Day')} ${c.day}/${DAYS} · ${time}` : `${L('Dag', 'Day')} ${c.day} ${L('van', 'of')} ${DAYS}, ${partName(c.part, c.slot)} ${time}`;
  // and the weather of that day
  const w = f.weathers[c.day] ?? f.weather;
  const misty = w === 'mist' && c.part === 0;
  const shown: Weather = misty ? 'mist' : w === 'mist' ? 'bewolkt' : w;
  // a clear evening has stars, not sun
  const clearNight = shown === 'helder' && f.isDark(c);
  $('#wx').innerHTML = `${clearNight ? MOON_ICON : WX_ICON[shown]}<span>${clearNight ? L('sterrenhemel', 'starry sky') : WEATHER[shown].name}</span>`;
  $('#wx').title = weatherLine(f.season, w);
}

/** 'Evening of day 3.', or the night of the first evening. */
function roadTime(c: { day: number; part: number; slot?: number }): string {
  return `${cap(partName(c.part, c.slot))} ${c.day === 0 ? L('voor de eerste dag', 'before the first day') : `${L('van dag', 'of day')} ${c.day}`}.`;
}

/** 'dag 3', or the first evening. */
function dayName(day: number): string {
  return day === 0 ? L('de eerste avond', 'the first evening') : `${L('dag', 'day')} ${day}`;
}

/** A small oil lamp, flickering, for the evening. */
const LAMP = `<svg class="lamp" width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path class="flame" d="M8 1 C10 4 10.5 6 8 8 C5.5 6 6 4 8 1 Z" fill="#f2b84a"/><path d="M5 9 h6 l1 2 h-8 Z M4 11 h8 c0 4 -1 5 -4 5 c-3 0 -4 -1 -4 -5 Z" fill="#7a5a2a" stroke="#2a211a" stroke-width="0.7"/></svg>`;

const MOON_ICON = `<svg width="18" height="18" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 5 A11 11 0 1 0 27 21 A9 9 0 1 1 20 5 Z"/><path d="M8 6 l0.8 1.6 1.6 0.8 -1.6 0.8 -0.8 1.6 -0.8 -1.6 -1.6 -0.8 1.6 -0.8 Z" fill="currentColor" stroke="none"/></svg>`;
