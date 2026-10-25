// The end of the season: your notebook set against the story world it was taken from,
// and against the real archive of the region.
import { G } from './game';
import { openColofon } from './colofon';
import { MISC_ICONS, beingIcon, svg } from './icons';
import { DAYS, SEASON_NAME, themeName } from './field';
import { RED } from './sheet';
import { esc, personName, plural } from './text';

export function openEnd(show: (html: string) => void, openTale: (num: number) => void) {
  const f = G.field;
  const sim = f.sim;
  const meta = sim.corpus.meta;
  const R = meta.regions[f.region];
  const nb = f.notebook;
  const told = f.toldTypes();
  const mine = new Map<string, number>();
  for (const e of nb) mine.set(e.t, (mine.get(e.t) ?? 0) + 1);
  const sObs = mine.size;
  // what someone with only your notebook could infer: Chao1 from the counts per tale type
  const f1 = [...mine.values()].filter((c) => c === 1).length;
  const f2 = [...mine.values()].filter((c) => c === 2).length;
  const chao1 = sObs + (f2 > 0 ? (f1 * f1) / (2 * f2) : (f1 * (f1 - 1)) / 2);
  const tellers = new Set(nb.map((e) => e.narrator)).size;
  const lostTypes = new Set(f.lost.flatMap((l) => l.types).filter((t) => !mine.has(t)));

  // who knew most, and was never asked
  const missed = sim.alive().filter((n) => !f.met.has(n.id) && n.know.size >= 4).sort((a, b) => b.know.size - a.know.size).slice(0, 4);
  // the villages you never came to
  const unvisited = f.land.places.filter((p) => !f.visitedPlaces.has(p.id));

  const verdict = sObs === 0
    ? 'Uw schrift bleef leeg. Wat er in deze streek verteld werd, weet niemand meer.'
    : sObs >= told.size * 0.5
      ? 'Een rijk schrift. Toch is het een keuze: wie u opzocht, waar u heen ging, waar u naar vroeg.'
      : `U schreef ${plural(sObs, 'verhaal', 'verhalen')} op van de ${told.size} die in deze streek verteld werden. Wat in uw schrift staat, is wat het archief later van deze streek weet.`;

  const bar = (label: string, v: number, max: number, red = false) =>
    `<div><span class="bar-wrap"><span class="bar ${red ? 'red' : ''}" style="width:${(v / Math.max(1, max)) * 100}%"></span>${v}</span><span class="m">${label}</span></div>`;
  const max = Math.max(told.size, chao1, sObs);
  const real = sim.archetype.real;
  // how the tales came in
  const via = (v: string) => nb.filter((e) => e.via === v).length;
  const ways = ([['bezoek', 'bij mensen thuis'], ['avond', 'op de vertelavond'], ['buurten', 'bij het buurten'], ['onderweg', 'onderweg, van wie u tegenkwam'], ['brief', 'per brief, na uw oproep']] as const)
    .filter(([v]) => via(v) > 0).map(([v, l]) => `<li><b>${via(v)}</b> ${l}</li>`).join('');
  const viaLead = [...f.met].filter((id) => f.leads.some((l) => l.narrator === id)).length;
  const frags = nb.filter((e) => e.frag);
  const exhausted = [...f.met].filter((id) => { const n = sim.narrators[id]; return n.know.size > 0 && [...n.know.keys()].every((t) => f.toldUs.get(id)?.has(t)); }).length;
  // the other collector
  const rv = f.rival;
  const his = new Set(rv?.got.map((g) => g.t) ?? []);
  const onlyHis = [...his].filter((t) => !mine.has(t)).length;
  const onlyMine = [...mine.keys()].filter((t) => !his.has(t)).length;
  const asked = [...f.asked.entries()].sort((a, b) => b[1] - a[1]);
  const sc = f.score();
  const rs = f.rivalScore();
  const RANKS: [number, string][] = [[25, 'Een paar losse aantekeningen'], [45, 'Een schrift vol'], [65, 'Een bundel sagen'], [95, 'Een sagenboek'], [Infinity, 'Een standaardwerk']];
  const rank = RANKS.find(([t]) => sc.total < t)![1];
  const pts = (k: 'new' | 'version' | 'same') => nb.filter((e) => !e.frag && e.kind === k).reduce((a, e) => a + f.points(e), 0);
  const fragPts = nb.filter((e) => e.frag).length;
  const cnt = (k: 'new' | 'version' | 'same') => nb.filter((e) => !e.frag && e.kind === k).length;
  const rarePts = nb.filter((e) => !e.frag && e.rare).length;
  const savedN = nb.filter((e) => !e.frag && sim.narrators[e.narrator].died !== null).length;
  const scoopN = nb.filter((e) => e.scoop).length;
  const finds = f.finds().sort((a, b) => f.points(b) - f.points(a));
  const rivalFinds = rv ? [...his].filter((t) => f.knowers(t) <= 1 || f.tier(t) === 'zeldzaam').length : 0;

  show(`
    <div class="leaf sheet wide end">
      <div class="kicker">${DAYS} dagen in ${esc(R.name)}, ${SEASON_NAME[f.season]} ${f.year}</div>
      <h1>${plural(nb.length, 'verhaal', 'verhalen')} in uw schrift</h1>
      <p class="rank">${esc(rank)} · ${sc.total} punten${f.rival ? ` · de ander: ${rs}` : ''}</p>
      <p class="verdict">${esc(verdict)}${f.rival ? (sc.total > rs ? ' Uw schrift is rijker dan dat van de ander.' : sc.total === rs ? ' U en de ander hielden elkaar in evenwicht.' : ' De ander bracht meer mee naar huis.') : ''}</p>
      <table class="scoretable">
        <tr class="th"><td></td><td>aantal</td><td>punten</td></tr>
        <tr><td>Nieuwe verhalen</td><td>${cnt('new')}</td><td>${pts('new')}</td></tr>
        <tr><td>Andere versies</td><td>${cnt('version')}</td><td>${pts('version')}</td></tr>
        ${cnt('same') ? `<tr><td>Hetzelfde nog eens gehoord</td><td>${cnt('same')}</td><td>0</td></tr>` : ''}
        ${fragPts ? `<tr><td>Fragmenten</td><td>${fragPts}</td><td>${fragPts}</td></tr>` : ''}
        <tr><td>Hoofdstukken af</td><td>${sc.done} van ${f.chapters.length}</td><td>${sc.chapters}</td></tr>
        <tr class="tot"><td>Samen</td><td></td><td>${sc.total}</td></tr>
      </table>
      <p class="sub">${[
        rarePts ? `${plural(rarePts, 'verhaal', 'verhalen')} die verder niemand kende` : '',
        savedN ? `${plural(savedN, 'verhaal', 'verhalen')} van vertellers die er nu niet meer zijn` : '',
      ].filter(Boolean).map((x, i) => (i ? x : `Daarin: ${x}`)).join(', en ')}${rarePts || savedN ? '. ' : ''}${scoopN ? `${plural(scoopN, 'verhaal', 'verhalen')} had de ander al: die telden maar half.` : ''}</p>
      <div class="bigfigs">
        <div class="figure"><b>${sObs}</b><span>verschillende verhalen</span></div>
        <div class="figure"><b>${nb.filter((e) => e.kind === 'version').length}</b><span>andere versies</span></div>
        <div class="figure"><b>${tellers}</b><span>vertellers</span></div>
        <div class="figure"><b>${f.visitedPlaces.size}/${f.land.places.length}</b><span>dorpen bezocht</span></div>
      </div>

      ${(() => {
        const q = f.quest;
        if (!q) return '';
        const n = sim.narrators[q.target];
        const where = f.land.places[q.village].name;
        return `<h2>Het verloren verhaal</h2>
          ${q.stage === 4
            ? `<p>U volgde het spoor van ${esc(q.grand)}: van het begin dat in ${esc(f.land.places[0].name)} nog werd onthouden, langs het graf in ${esc(f.land.places[q.church].name)} en ${esc(f.land.sites[q.site].name)} in het donker, naar ${esc(sim.name(n))} in ${esc(where)}. „${esc(sim.type(q.t).name)}” staat nu in uw schrift: ${f.archiveCount(q.t)}× opgetekend in de hele Verhalenbank.</p>`
            : `<p>Het spoor van ${esc(q.grand)} liep dood${q.stage > 0 ? ` bij ${['', 'het begin', 'het graf', 'het oord waar de familie vandaan kwam'][q.stage]}` : ''}. ${esc(sim.name(n))} in ${esc(where)} kende het verhaal nog: „${esc(sim.type(q.t).name)}”, ${f.archiveCount(q.t)}× opgetekend in de hele Verhalenbank. Niemand heeft het opgeschreven.</p>`}`;
      })()}

      <h2>Uw vondsten</h2>
      ${finds.length ? `<p>${plural(finds.length, 'verhaal', 'verhalen')} in uw schrift ${finds.length === 1 ? 'is' : 'zijn'} een vondst: alleen uw verteller kende het nog, of het is in het hele archief zeldzaam.${rv ? ` De ander had er ${rivalFinds}.` : ''}</p>
        <ul class="findlist">${finds.slice(0, 8).map((e) => {
          const n = sim.narrators[e.narrator];
          const bits = [e.holders <= 1 ? 'alleen bij deze verteller' : '', f.tier(e.t) === 'zeldzaam' ? `${f.archiveCount(e.t)}× in de hele Verhalenbank` : ''].filter(Boolean).join(', ');
          return `<li><button class="linkish" data-num="${e.num}">„${esc(sim.type(e.t).name)}”</button> <span class="muted">van ${esc(sim.name(n))}, ${esc(f.land.places[n.place].name)} · ${esc(bits)}${n.died !== null ? ' · <span class="red">inmiddels overleden</span>' : ''}</span></li>`;
        }).join('')}</ul>` : `<p>Geen vondsten: alles in uw schrift wordt ook door anderen verteld, of staat al vaak in het archief.${rv && rivalFinds ? ` De ander had er ${rivalFinds}.` : ''}</p>`}

      <h2>Wat er verteld werd, en wat uw schrift ervan weet</h2>
      <p>In de streek werden ${plural(told.size, 'verschillend verhaal', 'verschillende verhalen')} verteld. Iemand die alleen uw schrift had,
        zou met de schatter van Chao (dezelfde waarmee het verlies van middeleeuwse ridderverhalen is geschat) uitkomen op ongeveer <b>${Math.round(chao1)}</b>:
        ${f1} verhalen hoorde u één keer, ${f2} twee keer.</p>
      <div class="unseen">
        ${bar('in uw schrift', sObs, max)}
        ${bar('geschat uit uw schrift (Chao1)', Math.round(chao1), max)}
        ${bar('werkelijk verteld', told.size, max, true)}
      </div>

      ${f.lost.length ? `<h2>Wat verloren ging</h2>
        <ul class="lostlist">${f.lost.map((l) => {
          const n = sim.narrators[l.narrator];
          return `<li>${esc(sim.name(n))} uit ${esc(f.land.places[n.place].name)} overleed op dag ${l.day}${l.types.length ? `, met ${plural(l.types.length, 'verhaal', 'verhalen')} die u niet had opgeschreven` : ', maar wat er te vertellen was, staat in uw schrift'}.</li>`;
        }).join('')}</ul>
        ${lostTypes.size ? `<p class="sub">${plural(lostTypes.size, 'verhaal', 'verhalen')} daarvan kende verder niemand meer.</p>` : ''}` : ''}

      <h2>Hoe u aan uw verhalen kwam</h2>
      <ul class="ways">${ways || '<li>Nergens.</li>'}</ul>
      <p>${viaLead ? `${plural(viaLead, 'verteller', 'vertellers')} vond u doordat iemand anders u de naam gaf. ` : ''}${exhausted ? `${plural(exhausted, 'verteller heeft', 'vertellers hebben')} u alles verteld wat ${exhausted === 1 ? 'die wist' : 'ze wisten'}; van de anderen kent u maar een deel.` : 'Van niemand kent u het hele repertoire.'}
        ${frags.length ? `${plural(frags.length, 'verhaal kwam', 'verhalen kwamen')} maar half boven, en ${frags.length === 1 ? 'is' : 'zijn'} nooit afgemaakt.` : ''}
        ${asked.length ? `U vroeg het vaakst naar ${asked.slice(0, 2).map(([b]) => esc(themeName(b))).join(' en ')}.` : ''}</p>
      <p class="sub">Ook echte verzamelaars vonden hun vertellers via anderen, kwamen terug om af te maken wat de vorige keer niet bovenkwam, en vroegen vooral naar wat ze zelf zochten.</p>

      ${rv ? `<h2>De andere verzamelaar</h2>
        <p>Vanaf dag ${rv.since} werkte ook ${esc(rv.who)} in de streek, bij ${plural(rv.visited.size, 'verteller', 'vertellers')}.
          Samen hebt u ${plural(new Set([...his, ...mine.keys()]).size, 'verschillend verhaal', 'verschillende verhalen')}: ${onlyMine} alleen in uw schrift, ${onlyHis} alleen in het zijne.
          Wie het archief later gebruikt, ziet twee schriften, niet de streek.</p>` : ''}

      ${missed.length || unvisited.length ? `<h2>Wie u niet sprak</h2>
        <ul class="lostlist">${missed.map((n) => `<li>${esc(sim.name(n))} (${f.age(n)}), ${esc(f.whereName(f.whereIs(n)))}, kende ${plural(n.know.size, 'verhaal', 'verhalen')}.</li>`).join('')}</ul>
        ${unvisited.length ? `<p class="sub">Nooit geweest: ${unvisited.map((p) => esc(p.name)).join(', ')}.</p>` : ''}` : ''}

      <h2>Zonder verzamelaars geen sagen</h2>
      <p>Wat niet in uw schrift staat, werd daarom nog wel verteld. Lang dacht men dat er in Nederland bijna geen sprookjes meer verteld werden,
        omdat er bijna geen waren opgetekend. Waar een volhardende verzamelaar kwam, bleek het tegendeel. Wat het archief van een streek weet,
        zegt minstens zoveel over wie er verzamelde als over wat er verteld werd.</p>

      <h2>In het echte archief</h2>
      <p>In de Verhalenbank komen de sagen uit ${esc(R.name)} vooral van ${R.collectors.slice(0, 3).map(([c, n]) => `${esc(personName(c))} (${n.toLocaleString('nl-NL')})`).join(', ')}.
        U werkte naar het patroon van ${esc(real.name)}: ${real.sage.toLocaleString('nl-NL')} sagen van ${real.tellers.toLocaleString('nl-NL')} vertellers,
        ${Math.round(real.top5 * 100)}% daarvan van de vijf meest bevraagde. Ook hun schriften zijn een keuze.</p>

      <h2>Uw schrift</h2>
      ${nb.length ? `<div class="cards">${nb.map((e) => {
        const n = sim.narrators[e.narrator];
        return `<button class="card ${e.kind}" data-num="${e.num}"><div class="no"><span>nr. ${e.num}</span><span>dag ${e.day}</span></div>
          <div class="ti">${svg(beingIcon(sim.type(e.t).being), 16, RED)} ${esc(sim.type(e.t).name)}</div>
          <div class="who">${esc(sim.name(n))}, ${esc(f.land.places[e.place].name)}</div></button>`;
      }).join('')}</div>` : '<p class="sub">Leeg.</p>'}

      <p style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" id="end-again">${svg(MISC_ICONS.kaart, 16)} Een nieuw seizoen, een andere streek</button>
        <button class="btn" id="end-map">Bekijk de kaart</button></p>
      <p class="colophon">Over verzamelaars en hun vertellers: A.J. Dekker, ‘150 jaar Nederlands volksverhaalonderzoek’, <i>Volkskundig Bulletin</i> 4 (1978);
        T. Dekker, ‘Zonder verzamelaars geen sprookjes’, <i>Volkskundig Bulletin</i> 24 (1998); E. Venbrux en T. Meder, ‘Authenticity as an analytic concept in folkloristics’, <i>Etnofoor</i> 17 (2004).<br/>Muziek bij nacht: N.91music (n91music.itch.io). <button class="linkbtn" data-colofon>Colofon</button></p>
    </div>`);
  const m = document.querySelector('#modal')!;
  m.querySelector('[data-colofon]')?.addEventListener('click', openColofon);
  m.querySelectorAll<HTMLElement>('[data-num]').forEach((el) => el.addEventListener('click', () => openTale(+el.dataset.num!)));
  m.querySelector('#end-again')!.addEventListener('click', () => location.reload());
  m.querySelector('#end-map')!.addEventListener('click', () => {
    m.classList.add('hidden');
    m.innerHTML = '';
  });
}
