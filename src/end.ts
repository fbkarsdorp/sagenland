// The end of the season: your notebook set against the story world it was taken from,
// and against the real archive of the region.
import { G } from './game';
import { openColofon } from './colofon';
import { MISC_ICONS, beingIcon, svg } from './icons';
import { DAYS, SEASON_NAME, themeName } from './field';
import { RED } from './sheet';
import { esc, personName, plural } from './text';
import { EN, L, LOCALE } from './i18n';

const tales = (n: number) => plural(n, L('verhaal', 'tale'), L('verhalen', 'tales'));

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
    ? L('Uw schrift bleef leeg. Wat er in deze streek verteld werd, weet niemand meer.', 'Your notebook stayed empty. What was told in this region, nobody knows any more.')
    : sObs >= told.size * 0.5
      ? L('Een rijk schrift. Toch is het een keuze: wie u opzocht, waar u heen ging, waar u naar vroeg.', 'A rich notebook. Still, it is a choice: whom you called on, where you went, what you asked about.')
      : L(`U schreef ${plural(sObs, 'verhaal', 'verhalen')} op van de ${told.size} die in deze streek verteld werden. Wat in uw schrift staat, is wat het archief later van deze streek weet.`,
        `You wrote down ${plural(sObs, 'tale', 'tales')} of the ${told.size} told in this region. What is in your notebook is what the archive will later know of this region.`);

  const bar = (label: string, v: number, max: number, red = false) =>
    `<div><span class="bar-wrap"><span class="bar ${red ? 'red' : ''}" style="width:${(v / Math.max(1, max)) * 100}%"></span>${v}</span><span class="m">${label}</span></div>`;
  const max = Math.max(told.size, chao1, sObs);
  const real = sim.archetype.real;
  // how the tales came in
  const via = (v: string) => nb.filter((e) => e.via === v).length;
  const ways = ([['bezoek', L('bij mensen thuis', 'in people’s homes')], ['avond', L('op de vertelavond', 'at the storytelling evening')], ['buurten', L('bij het buurten', 'at a neighbours’ gathering')], ['onderweg', L('onderweg, van wie u tegenkwam', 'on the road, from people you met')], ['brief', L('per brief, na uw oproep', 'by letter, after your appeal')]] as const)
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
  const RANKS: [number, string][] = [[25, L('Een paar losse aantekeningen', 'A few loose notes')], [45, L('Een schrift vol', 'A full notebook')], [65, L('Een bundel sagen', 'A collection of legends')], [95, L('Een sagenboek', 'A book of legends')], [Infinity, L('Een standaardwerk', 'The standard work')]];
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
      <div class="kicker">${L(`${DAYS} dagen in ${esc(R.name)}, ${SEASON_NAME[f.season]} ${f.year}`, `${DAYS} days in ${esc(R.name)}, ${SEASON_NAME[f.season]} ${f.year}`)}</div>
      <h1>${L(`${plural(nb.length, 'verhaal', 'verhalen')} in uw schrift`, `${plural(nb.length, 'tale', 'tales')} in your notebook`)}</h1>
      <p class="rank">${esc(rank)} · ${sc.total} ${L('punten', sc.total === 1 ? 'point' : 'points')}${f.rival ? ` · ${L('de ander', 'the other collector')}: ${rs}` : ''}</p>
      <p class="verdict">${esc(verdict)}${f.rival ? (sc.total > rs ? L(' Uw schrift is rijker dan dat van de ander.', ' Your notebook is richer than the other collector’s.') : sc.total === rs ? L(' U en de ander hielden elkaar in evenwicht.', ' You and the other collector came out even.') : L(' De ander bracht meer mee naar huis.', ' The other collector took more home.')) : ''}</p>
      <table class="scoretable">
        <tr class="th"><td></td><td>${L('aantal', 'number')}</td><td>${L('punten', 'points')}</td></tr>
        <tr><td>${L('Nieuwe verhalen', 'New tales')}</td><td>${cnt('new')}</td><td>${pts('new')}</td></tr>
        <tr><td>${L('Andere versies', 'Other versions')}</td><td>${cnt('version')}</td><td>${pts('version')}</td></tr>
        ${cnt('same') ? `<tr><td>${L('Hetzelfde nog eens gehoord', 'The same heard again')}</td><td>${cnt('same')}</td><td>0</td></tr>` : ''}
        ${fragPts ? `<tr><td>${L('Fragmenten', 'Fragments')}</td><td>${fragPts}</td><td>${fragPts}</td></tr>` : ''}
        <tr><td>${L('Hoofdstukken af', 'Chapters complete')}</td><td>${sc.done} ${L('van', 'of')} ${f.chapters.length}</td><td>${sc.chapters}</td></tr>
        <tr class="tot"><td>${L('Samen', 'Total')}</td><td></td><td>${sc.total}</td></tr>
      </table>
      <p class="sub">${[
        rarePts ? L(`${plural(rarePts, 'verhaal', 'verhalen')} die verder niemand kende`, `${tales(rarePts)} nobody else knew`) : '',
        savedN ? L(`${plural(savedN, 'verhaal', 'verhalen')} van vertellers die er nu niet meer zijn`, `${tales(savedN)} from storytellers who are no longer alive`) : '',
      ].filter(Boolean).map((x, i) => (i ? x : `${L('Daarin', 'Among them')}: ${x}`)).join(L(', en ', ', and '))}${rarePts || savedN ? '. ' : ''}${scoopN ? L(`${plural(scoopN, 'verhaal', 'verhalen')} had de ander al: die telden maar half.`, `The other collector already had ${tales(scoopN)}: ${scoopN === 1 ? 'it' : 'they'} counted only half.`) : ''}</p>
      <div class="bigfigs">
        <div class="figure"><b>${sObs}</b><span>${L('verschillende verhalen', 'different tales')}</span></div>
        <div class="figure"><b>${nb.filter((e) => e.kind === 'version').length}</b><span>${L('andere versies', 'other versions')}</span></div>
        <div class="figure"><b>${tellers}</b><span>${L('vertellers', 'storytellers')}</span></div>
        <div class="figure"><b>${f.visitedPlaces.size}/${f.land.places.length}</b><span>${L('dorpen bezocht', 'villages visited')}</span></div>
      </div>

      ${(() => {
        const q = f.quest;
        if (!q) return '';
        const n = sim.narrators[q.target];
        const where = f.land.places[q.village].name;
        if (EN) return `<h2>The lost tale</h2>
          ${q.stage === 4
            ? `<p>You followed the trail of ${esc(q.grand)}: from the opening still remembered in ${esc(f.land.places[0].name)}, past the grave in ${esc(f.land.places[q.church].name)} and ${esc(f.land.sites[q.site].name)} in the dark, to ${esc(sim.name(n))} in ${esc(where)}. “${esc(sim.type(q.t).name)}” is now in your notebook: recorded ${f.archiveCount(q.t)}× in the whole Verhalenbank.</p>`
            : `<p>The trail of ${esc(q.grand)} went cold${q.stage > 0 ? ` at ${['', 'the opening', 'the grave', 'the place the family came from'][q.stage]}` : ''}. ${esc(sim.name(n))} in ${esc(where)} still knew the tale: “${esc(sim.type(q.t).name)}”, recorded ${f.archiveCount(q.t)}× in the whole Verhalenbank. Nobody wrote it down.</p>`}`;
        return `<h2>Het verloren verhaal</h2>
          ${q.stage === 4
            ? `<p>U volgde het spoor van ${esc(q.grand)}: van het begin dat in ${esc(f.land.places[0].name)} nog werd onthouden, langs het graf in ${esc(f.land.places[q.church].name)} en ${esc(f.land.sites[q.site].name)} in het donker, naar ${esc(sim.name(n))} in ${esc(where)}. „${esc(sim.type(q.t).name)}” staat nu in uw schrift: ${f.archiveCount(q.t)}× opgetekend in de hele Verhalenbank.</p>`
            : `<p>Het spoor van ${esc(q.grand)} liep dood${q.stage > 0 ? ` bij ${['', 'het begin', 'het graf', 'het oord waar de familie vandaan kwam'][q.stage]}` : ''}. ${esc(sim.name(n))} in ${esc(where)} kende het verhaal nog: „${esc(sim.type(q.t).name)}”, ${f.archiveCount(q.t)}× opgetekend in de hele Verhalenbank. Niemand heeft het opgeschreven.</p>`}`;
      })()}

      <h2>${L('Uw vondsten', 'Your finds')}</h2>
      ${finds.length ? `<p>${L(`${plural(finds.length, 'verhaal', 'verhalen')} in uw schrift ${finds.length === 1 ? 'is' : 'zijn'} een vondst: alleen uw verteller kende het nog, of het is in het hele archief zeldzaam.`, `${tales(finds.length)} in your notebook ${finds.length === 1 ? 'is a find' : 'are finds'}: only your storyteller still knew ${finds.length === 1 ? 'it' : 'them'}, or ${finds.length === 1 ? 'it is' : 'they are'} rare in the whole archive.`)}${rv ? L(` De ander had er ${rivalFinds}.`, ` The other collector had ${rivalFinds}.`) : ''}</p>
        <ul class="findlist">${finds.slice(0, 8).map((e) => {
          const n = sim.narrators[e.narrator];
          const bits = [e.holders <= 1 ? L('alleen bij deze verteller', 'only this storyteller') : '', f.tier(e.t) === 'zeldzaam' ? L(`${f.archiveCount(e.t)}× in de hele Verhalenbank`, `${f.archiveCount(e.t)}× in the whole Verhalenbank`) : ''].filter(Boolean).join(', ');
          return `<li><button class="linkish" data-num="${e.num}">${L('„', '“')}${esc(sim.type(e.t).name)}”</button> <span class="muted">${L('van', 'from')} ${esc(sim.name(n))}, ${esc(f.land.places[n.place].name)} · ${esc(bits)}${n.died !== null ? ` · <span class="red">${L('inmiddels overleden', 'since died')}</span>` : ''}</span></li>`;
        }).join('')}</ul>` : `<p>${L('Geen vondsten: alles in uw schrift wordt ook door anderen verteld, of staat al vaak in het archief.', 'No finds: everything in your notebook is told by others too, or is already common in the archive.')}${rv && rivalFinds ? L(` De ander had er ${rivalFinds}.`, ` The other collector had ${rivalFinds}.`) : ''}</p>`}

      <h2>${L('Wat er verteld werd, en wat uw schrift ervan weet', 'What was told, and what your notebook knows of it')}</h2>
      <p>${L(`In de streek werden ${plural(told.size, 'verschillend verhaal', 'verschillende verhalen')} verteld. Iemand die alleen uw schrift had,
        zou met de schatter van Chao (dezelfde waarmee het verlies van middeleeuwse ridderverhalen is geschat) uitkomen op ongeveer <b>${Math.round(chao1)}</b>:
        ${f1} verhalen hoorde u één keer, ${f2} twee keer.`, `${plural(told.size, 'different tale was', 'different tales were')} told in the region. Someone with only your notebook,
        using Chao’s estimator (the same one used to estimate how many medieval chivalric romances were lost), would arrive at about <b>${Math.round(chao1)}</b>:
        you heard ${plural(f1, 'tale', 'tales')} once and ${f2} twice.`)}</p>
      <div class="unseen">
        ${bar(L('in uw schrift', 'in your notebook'), sObs, max)}
        ${bar(L('geschat uit uw schrift (Chao1)', 'estimated from your notebook (Chao1)'), Math.round(chao1), max)}
        ${bar(L('werkelijk verteld', 'actually told'), told.size, max, true)}
      </div>

      ${f.lost.length ? `<h2>${L('Wat verloren ging', 'What was lost')}</h2>
        <ul class="lostlist">${f.lost.map((l) => {
          const n = sim.narrators[l.narrator];
          return EN
            ? `<li>${esc(sim.name(n))} from ${esc(f.land.places[n.place].name)} died on day ${l.day}${l.types.length ? `, with ${tales(l.types.length)} you had not written down` : ', but what there was to tell is in your notebook'}.</li>`
            : `<li>${esc(sim.name(n))} uit ${esc(f.land.places[n.place].name)} overleed op dag ${l.day}${l.types.length ? `, met ${plural(l.types.length, 'verhaal', 'verhalen')} die u niet had opgeschreven` : ', maar wat er te vertellen was, staat in uw schrift'}.</li>`;
        }).join('')}</ul>
        ${lostTypes.size ? `<p class="sub">${L(`${plural(lostTypes.size, 'verhaal', 'verhalen')} daarvan kende verder niemand meer.`, `Nobody else knew ${lostTypes.size === 1 ? 'one of them' : `${lostTypes.size} of them`} any more.`)}</p>` : ''}` : ''}

      <h2>${L('Hoe u aan uw verhalen kwam', 'How you came by your tales')}</h2>
      <ul class="ways">${ways || `<li>${L('Nergens.', 'Nowhere.')}</li>`}</ul>
      ${EN
        ? `<p>${viaLead ? `You found ${plural(viaLead, 'storyteller', 'storytellers')} because someone else gave you the name. ` : ''}${exhausted ? `${plural(exhausted, 'storyteller has', 'storytellers have')} told you everything they knew; of the others you know only part.` : 'You know nobody’s whole repertoire.'}
        ${frags.length ? `${frags.length === 1 ? 'One tale' : `${frags.length} tales`} came back only in part and ${frags.length === 1 ? 'was' : 'were'} never finished.` : ''}
        ${asked.length ? `You asked most often about ${asked.slice(0, 2).map(([b]) => esc(themeName(b))).join(' and ')}.` : ''}</p>`
        : `<p>${viaLead ? `${plural(viaLead, 'verteller', 'vertellers')} vond u doordat iemand anders u de naam gaf. ` : ''}${exhausted ? `${plural(exhausted, 'verteller heeft', 'vertellers hebben')} u alles verteld wat ${exhausted === 1 ? 'die wist' : 'ze wisten'}; van de anderen kent u maar een deel.` : 'Van niemand kent u het hele repertoire.'}
        ${frags.length ? `${plural(frags.length, 'verhaal kwam', 'verhalen kwamen')} maar half boven, en ${frags.length === 1 ? 'is' : 'zijn'} nooit afgemaakt.` : ''}
        ${asked.length ? `U vroeg het vaakst naar ${asked.slice(0, 2).map(([b]) => esc(themeName(b))).join(' en ')}.` : ''}</p>`}
      <p class="sub">${L('Ook echte verzamelaars vonden hun vertellers via anderen, kwamen terug om af te maken wat de vorige keer niet bovenkwam, en vroegen vooral naar wat ze zelf zochten.', 'Real collectors, too, found their storytellers through others, came back to finish what had not come up the time before, and asked mostly about what they themselves were looking for.')}</p>

      ${rv ? (EN ? `<h2>The other collector</h2>
        <p>From day ${rv.since}, ${esc(rv.who)} was also working in the region, with ${plural(rv.visited.size, 'storyteller', 'storytellers')}.
          Together you have ${plural(new Set([...his, ...mine.keys()]).size, 'different tale', 'different tales')}: ${onlyMine} only in your notebook, ${onlyHis} only in the other one.
          Anyone using the archive later sees two notebooks, not the region.</p>` : `<h2>De andere verzamelaar</h2>
        <p>Vanaf dag ${rv.since} werkte ook ${esc(rv.who)} in de streek, bij ${plural(rv.visited.size, 'verteller', 'vertellers')}.
          Samen hebt u ${plural(new Set([...his, ...mine.keys()]).size, 'verschillend verhaal', 'verschillende verhalen')}: ${onlyMine} alleen in uw schrift, ${onlyHis} alleen in het zijne.
          Wie het archief later gebruikt, ziet twee schriften, niet de streek.</p>`) : ''}

      ${missed.length || unvisited.length ? `<h2>${L('Wie u niet sprak', 'Who you did not talk to')}</h2>
        <ul class="lostlist">${missed.map((n) => `<li>${esc(sim.name(n))} (${f.age(n)}), ${esc(f.whereName(f.whereIs(n)))}, ${L('kende', 'knew')} ${tales(n.know.size)}.</li>`).join('')}</ul>
        ${unvisited.length ? `<p class="sub">${L('Nooit geweest', 'Never visited')}: ${unvisited.map((p) => esc(p.name)).join(', ')}.</p>` : ''}` : ''}

      <h2>${L('Zonder verzamelaars geen sagen', 'No collectors, no legends')}</h2>
      <p>${L(`Wat niet in uw schrift staat, werd daarom nog wel verteld. Lang dacht men dat er in Nederland bijna geen sprookjes meer verteld werden,
        omdat er bijna geen waren opgetekend. Waar een volhardende verzamelaar kwam, bleek het tegendeel. Wat het archief van een streek weet,
        zegt minstens zoveel over wie er verzamelde als over wat er verteld werd.`, `What is not in your notebook was still told. For a long time people thought hardly any fairy tales were still told in the Netherlands,
        because hardly any had been recorded. Wherever a persistent collector came, the opposite turned out to be true. What the archive knows of a region
        says at least as much about who collected there as about what was told.`)}</p>

      <h2>${L('In het echte archief', 'In the real archive')}</h2>
      <p>${L(`In de Verhalenbank komen de sagen uit ${esc(R.name)} vooral van ${R.collectors.slice(0, 3).map(([c, n]) => `${esc(personName(c))} (${n.toLocaleString(LOCALE)})`).join(', ')}.
        U werkte naar het patroon van ${esc(real.name)}: ${real.sage.toLocaleString(LOCALE)} sagen van ${real.tellers.toLocaleString(LOCALE)} vertellers,
        ${Math.round(real.top5 * 100)}% daarvan van de vijf meest bevraagde. Ook hun schriften zijn een keuze.`, `In the Verhalenbank, the legends from ${esc(R.name)} come mostly from ${R.collectors.slice(0, 3).map(([c, n]) => `${esc(personName(c))} (${n.toLocaleString(LOCALE)})`).join(', ')}.
        You worked to the pattern of ${esc(real.name)}: ${real.sage.toLocaleString(LOCALE)} legends from ${real.tellers.toLocaleString(LOCALE)} storytellers,
        ${Math.round(real.top5 * 100)}% of them from the five most interviewed. Their notebooks are a choice too.`)}</p>

      <h2>${L('Uw schrift', 'Your notebook')}</h2>
      ${nb.length ? `<div class="cards">${nb.map((e) => {
        const n = sim.narrators[e.narrator];
        return `<button class="card ${e.kind}" data-num="${e.num}"><div class="no"><span>${L('nr.', 'no.')} ${e.num}</span><span>${L('dag', 'day')} ${e.day}</span></div>
          <div class="ti">${svg(beingIcon(sim.type(e.t).being), 16, RED)} ${esc(sim.type(e.t).name)}</div>
          <div class="who">${esc(sim.name(n))}, ${esc(f.land.places[e.place].name)}</div></button>`;
      }).join('')}</div>` : `<p class="sub">${L('Leeg.', 'Empty.')}</p>`}

      <p style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" id="end-again">${svg(MISC_ICONS.kaart, 16)} ${L('Een nieuw seizoen, een andere streek', 'A new season, another region')}</button>
        <button class="btn" id="end-map">${L('Bekijk de kaart', 'Look at the map')}</button></p>
      <p class="colophon">${L('Over verzamelaars en hun vertellers', 'On collectors and their storytellers')}: A.J. Dekker, ‘150 jaar Nederlands volksverhaalonderzoek’, <i>Volkskundig Bulletin</i> 4 (1978);
        T. Dekker, ‘Zonder verzamelaars geen sprookjes’, <i>Volkskundig Bulletin</i> 24 (1998); E. Venbrux ${L('en', 'and')} T. Meder, ‘Authenticity as an analytic concept in folkloristics’, <i>Etnofoor</i> 17 (2004).<br/>${L('Muziek bij nacht', 'Night music')}: N.91music (n91music.itch.io). <button class="linkbtn" data-colofon>${L('Colofon', 'Colophon')}</button></p>
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
