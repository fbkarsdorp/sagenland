// The admin panel (?admin in the address): look at any moment of a season without playing up to it. Set the
// time and the weather, show everything seen at night, put the collector anywhere, follow the lost tale step by
// step, jump to the end, or start another season by its seed. What it changes is for looking, not for playing:
// skipping days does not let the region's year go on.
import { G } from './game';
import { APPARITION, DAYS, PERSONA, partName, SEASON_NL, WEATHER, clockTime, type Season, type Weather, type Where } from './field';
import { esc } from './text';
import { loadMeta } from './data';
import { nightTrack, setNightTrack, type NightTrack } from './sound';
import { feest } from './feest';
import { diorama, setDioramaPref, type Diorama } from './scene';

const REGIONS: [string, string][] = [['friesland', 'Friesland'], ['oosten', 'Het Oosten'], ['limburg', 'Limburg'], ['antwerpen', 'Antwerpse Kempen'],
  ['brabant', 'Brabant'], ['oostvl', 'Oost-Vlaanderen'], ['westvl', 'West-Vlaanderen']];

export function mountAdmin(season: { region: string; arch: string; seed: number; home: string; season: Season }) {
  const f = G.field;
  const el = document.createElement('div');
  el.id = 'admin';
  el.className = 'sheet';
  document.body.appendChild(el);
  // on a phone it starts folded away, so the map stays in view
  let open = !matchMedia('(max-width: 700px), (max-height: 520px)').matches;
  let allSpirits = false;
  const canSee = f.canSee.bind(f);
  f.canSee = (id, at) => (allSpirits ? !f.seen.has(id) && !!APPARITION[f.land.sites[id].kind] : canSee(id, at));

  const link = (o: { region: string; arch: string; seed: number; season: Season; feest?: string }, go = true) =>
    `?admin&region=${o.region}&arch=${o.arch}&seed=${o.seed}${o.season !== 'herfst' ? `&season=${o.season}` : ''}${o.feest ? `&feest=${o.feest}` : ''}${go ? '&go' : ''}`;
  const asked = new URLSearchParams(location.search).get('feest') ?? '';

  const draw = () => {
    if (!open) {
      el.innerHTML = `<button class="adm-toggle" data-a="open" title="Beheer">⚙</button>`;
      el.classList.add('closed');
      return;
    }
    el.classList.remove('closed');
    const q = f.quest;
    const slotNow = f.part * 2 + f.slot;
    el.innerHTML = `
      <div class="adm-head"><b>Beheer</b><span>${esc(season.home)} · seed ${season.seed}</span><button data-a="close" title="Inklappen">–</button></div>
      <div class="adm-row"><label>Dag</label>
        <button data-a="day-">‹</button><b class="adm-val">${f.day}</b><button data-a="day+">›</button>
        <span class="adm-note">van ${DAYS}</span></div>
      <div class="adm-row adm-times">${[0, 1, 2, 3, 4, 5].map((k) => `<button data-a="time" data-k="${k}" class="${k === slotNow ? 'on' : ''}" title="${partName(k >> 1, k & 1)}">${clockTime(k >> 1, k & 1).replace(' uur', '')}</button>`).join('')}</div>
      <div class="adm-row"><label>Seizoen</label>${(['lente', 'zomer', 'herfst', 'winter'] as Season[]).map((x) => `<button data-a="year" data-s="${x}" class="${f.season === x ? 'on' : ''}" title="Hetzelfde land en dezelfde mensen, in het ${SEASON_NL[x]}">${x}</button>`).join('')}</div>
      <div class="adm-row"><label>Feest</label>${[['geen', 'geen'], ['halloween', 'halloween'], ['sinterklaas', 'sint'], ['kerst', 'kerst']].map(([k, n]) => `<button data-a="feest" data-f="${k}" class="${(feest() ?? 'geen') === k ? 'on' : ''}" title="Het feest van de dag (normaal volgens de echte datum)">${n}</button>`).join('')}</div>
      <div class="adm-row"><label>Weer</label>${(['helder', 'bewolkt', 'regen', 'mist', ...(f.season === 'winter' ? ['sneeuw'] : [])] as Weather[]).map((w) => `<button data-a="wx" data-w="${w}" class="${f.weather === w ? 'on' : ''}">${WEATHER[w].nl}</button>`).join('')}</div>
      <div class="adm-row"><label>Muziek</label>${([['lucht', 'N.91music'], ['nacht', 'Suno']] as [NightTrack, string][]).map(([k, n]) => `<button data-a="music" data-m="${k}" class="${nightTrack() === k ? 'on' : ''}" title="De muziek bij nacht">${n}</button>`).join('')}</div>
      <div class="adm-row"><label>Beeld</label>${([['0', 'gewoon'], ['1', 'band'], ['phaser', 'phaser']] as [Diorama, string][]).map(([k, n]) => `<button data-a="diorama" data-d="${k}" class="${diorama() === k ? 'on' : ''}" title="Het miniatuureffect">${n}</button>`).join('')}<span class="adm-note" id="adm-fps"></span></div>
      <div class="adm-row"><label>Kaart</label><button data-a="reveal">alles onthullen</button><button data-a="overview">overzicht</button></div>
      <div class="adm-row"><label>Nacht</label><button data-a="spirits" class="${allSpirits ? 'on' : ''}">alle verschijningen</button><button data-a="unsee">opnieuw zien</button></div>
      <div class="adm-row"><label>Naar</label><select data-a="go">
        <option value="">kies een plek…</option>
        <optgroup label="Dorpen">${f.land.places.map((p) => `<option value="place:${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>
        <optgroup label="Plekken">${f.land.sites.map((s) => `<option value="site:${s.id}">${esc(s.name)}</option>`).join('')}</optgroup>
      </select></div>
      <div class="adm-row"><label>Mensen</label><button data-a="trust">iedereen vertrouwt u</button></div>
      ${q ? `<div class="adm-quest"><label>Het verloren verhaal</label>
        <ol>${[
          `${esc(f.sim.name(f.sim.narrators[q.starter]))} in ${esc(f.land.places[0].name)}`,
          `het graf in ${esc(f.land.places[q.church].name)}`,
          `${esc(f.land.sites[q.site].name)}, ’s nachts`,
          `${esc(f.sim.name(f.sim.narrators[q.target]))} in ${esc(f.land.places[q.village].name)} (${q.mark})`,
        ].map((t, i) => `<li class="${i < q.stage ? 'done' : i === q.stage ? 'now' : ''}">${t}</li>`).join('')}</ol>
        ${q.stage < 4 ? `<button data-a="quest">naar de volgende stap</button>` : '<span class="adm-note">gevonden</span>'}</div>` : ''}
      <div class="adm-row"><label>Einde</label><button data-a="end">naar het eindscherm</button></div>
      <div class="adm-season"><label>Ander seizoen</label>
        <div class="adm-row"><select data-k="region">${REGIONS.map(([k, n]) => `<option value="${k}" ${k === season.region ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select data-k="arch">${archOptions(season.region, season.arch)}</select></div>
        <div class="adm-row"><input data-k="seed" value="${season.seed}" inputmode="numeric" /><button data-a="dice" title="Willekeurige seed">⚄</button><button data-a="season">start</button></div>
        <p class="adm-note">Met dezelfde seed krijgt u hetzelfde seizoen terug.</p>
        <p class="adm-note"><a href="${link(season)}">link naar dit seizoen</a></p>
      </div>`;
  };

  const setTime = (day: number, k: number) => {
    f.day = Math.max(1, Math.min(DAYS, day));
    f.part = k >> 1;
    f.slot = k & 1;
    f.over = false;
    G.clock = null;
    f.changed();
  };

  const goTo = (w: Where) => {
    f.at = w;
    if (w.kind === 'place') f.visitedPlaces.add(w.id);
    const [x, y] = f.tileOf(w);
    f.known.push({ x, y, r: w.kind === 'place' ? 5.5 : 3.5 });
    G.emit('teleport', undefined);
    f.changed();
    // whatever waits at that place (the trail of the lost tale) shows as on arrival
    G.emit('arrived', undefined);
  };

  // which collectors worked in which region, as in the archive
  let regionsOf: Record<string, string[]> = {};
  let names: Record<string, string> = {};
  loadMeta().then((m) => {
    regionsOf = Object.fromEntries(Object.entries(m.archetypes).map(([k, a]) => [k, Object.keys(a.regions)]));
    names = Object.fromEntries(Object.entries(m.archetypes).map(([k, a]) => [k, a.nl]));
    draw();
  });
  const archOptions = (region: string, chosen: string) => Object.keys(PERSONA)
    .filter((k) => !regionsOf[k] || regionsOf[k].includes(region))
    .map((k) => `<option value="${k}" ${k === chosen ? 'selected' : ''}>${esc(names[k] ?? k)}</option>`).join('');

  el.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.k === 'region') {
      const arch = el.querySelector<HTMLSelectElement>('[data-k="arch"]')!;
      arch.innerHTML = archOptions(t.value, arch.value);
      return;
    }
    if (t.dataset.a === 'go' && t.value) {
      const [kind, id] = t.value.split(':');
      goTo({ kind: kind as 'place' | 'site', id: +id });
    }
  });

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.a;
    const q = f.quest;
    if (a === 'open' || a === 'close') open = a === 'open';
    else if (a === 'day-' || a === 'day+') setTime(f.day + (a === 'day+' ? 1 : -1), f.part * 2 + f.slot);
    else if (a === 'time') setTime(f.day, +b.dataset.k!);
    else if (a === 'wx') {
      f.weathers[f.day] = b.dataset.w as Weather;
      f.changed();
    } else if (a === 'reveal') {
      for (const p of f.land.places) f.known.push({ x: p.x, y: p.y, r: 9 });
      for (const s of f.land.sites) f.known.push({ x: s.x, y: s.y, r: 6 });
      f.known.push({ x: 30, y: 21, r: 60 });
      G.emit('teleport', undefined);
      f.changed();
      G.emit('overview', true);
    } else if (a === 'overview') G.emit('overview', true);
    else if (a === 'spirits') {
      allSpirits = !allSpirits;
      f.changed();
    } else if (a === 'unsee') {
      f.seen.clear();
      f.changed();
    } else if (a === 'trust') {
      for (const n of f.sim.alive()) f.trust.set(n.id, 1);
      f.changed();
    } else if (a === 'quest' && q) {
      // put the collector where the next clue is, at a time it can be found
      if (q.stage === 0) {
        f.trust.set(q.starter, 1);
        goTo({ kind: 'place', id: 0 });
      } else if (q.stage === 1) goTo({ kind: 'place', id: q.church });
      else if (q.stage === 2) {
        setTime(f.day, 5);
        goTo({ kind: 'site', id: q.site });
      } else if (q.stage === 3) {
        f.trust.set(q.target, 1);
        goTo({ kind: 'place', id: q.village });
      }
    } else if (a === 'end') {
      f.over = true;
      f.day = DAYS;
      f.part = 2;
      f.slot = 1;
      f.changed();
      G.emit('arrived', undefined);
    } else if (a === 'diorama') {
      const v = b.dataset.d as Diorama;
      setDioramaPref(v);
      G.emit('diorama', v);
    } else if (a === 'feest') {
      location.search = link({ ...season, feest: b.dataset.f });
      return;
    } else if (a === 'music') {
      setNightTrack(b.dataset.m as NightTrack);
    } else if (a === 'year') {
      // the same land and people at another time of year: the map is painted anew, so the page reloads
      location.search = link({ ...season, season: b.dataset.s as Season, feest: asked });
      return;
    } else if (a === 'dice') {
      (el.querySelector('[data-k="seed"]') as HTMLInputElement).value = String(Math.floor(Math.random() * 0xffffff));
      return;
    } else if (a === 'season') {
      const v = (k: string) => (el.querySelector(`[data-k="${k}"]`) as HTMLInputElement).value;
      location.search = link({ region: v('region'), arch: v('arch'), seed: +v('seed') || 1, season: season.season, feest: asked });
      return;
    }
    draw();
  });

  f.on(draw);
  // frames per second, to see what the miniature look costs
  let frames = 0, since = performance.now();
  const count = (t: number) => {
    frames++;
    if (t - since > 1000) {
      const el2 = document.querySelector('#adm-fps');
      if (el2) el2.textContent = `${Math.round((frames * 1000) / (t - since))} fps`;
      frames = 0;
      since = t;
    }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  draw();
}
