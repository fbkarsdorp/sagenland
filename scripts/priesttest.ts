// The priest's good word, in every region and eight seeds: two identical seasons go to his village on day 4 and visit
// everyone, one after asking him and one without; then whether asking about witches afterwards costs the good word.
//   npx tsx scripts/priesttest.ts
import { readFileSync } from 'node:fs';
import { buildCorpus, nameMeta, type Meta } from '../src/data';
import { newField, type Field, type Move } from '../src/field';
const meta: Meta = nameMeta(JSON.parse(readFileSync('public/data/meta.json', 'utf8')));
let villages = 0, gotGood = 0, withW = 0, withoutW = 0, lost = 0, risk = 0, leads = 0, noPatron = 0;
const regions = Object.keys(meta.regions);
for (const region of regions) {
  const corpus = buildCorpus(region, meta, JSON.parse(readFileSync(`public/data/${region}.json`, 'utf8')).variants);
  const arch = Object.entries(meta.archetypes).find(([, a]) => a.regions[region])![0];
  for (let seed = 1; seed <= 8; seed++) {
    const mk = () => {
      const f = newField(corpus, arch, seed * 104729);
      while (f.day < 4) f.wait();
      return f;
    };
    const a = mk();
    if (!a.patrons.length) { noPatron++; continue; }
    if (a.leads.some((l) => l.kind === 'person' && l.lines[0].includes(a.patrons[0].title))) leads++;
    const pat = [...a.patrons].sort((x, y) => (a.route({ kind: 'place', id: x.place })?.parts ?? 99) - (a.route({ kind: 'place', id: y.place })?.parts ?? 99))[0];
    const run = (f: Field, vouch: boolean) => {
      f.travel({ kind: 'place', id: pat.place });
      while (f.part !== 2) f.wait(); // the evening: everyone is home
      const t = f.startTalk(pat.nid);
      f.move(t, { kind: 'praat' });
      if (vouch) { f.move(t, { kind: 'leven' }); f.move(t, { kind: 'voorspraak' }); } else { f.move(t, { kind: 'leven' }); f.move(t, { kind: 'free' }); }
      f.endTalk(t);
      if (vouch && f.patronOf(pat.place)!.state === 'given') gotGood++;
      // then everyone else in the village, one plain visit each (no warming up), as long as the evening lasts and the next day
      let n = 0;
      for (const p of f.people({ kind: 'place', id: pat.place })) {
        if (p.id === pat.nid || f.over) continue;
        if (f.part !== 2) while (f.part !== 2) f.wait();
        n += f.visit(p.id, { kind: 'free' }).entries.length;
      }
      return n;
    };
    villages++;
    withW += run(a, true);
    withoutW += run(mk(), false);
    // the risk: with the good word, ask a parishioner about witches
    const c = mk();
    c.travel({ kind: 'place', id: pat.place });
    while (c.part !== 2) c.wait();
    const t = c.startTalk(pat.nid);
    c.move(t, { kind: 'praat' }); c.move(t, { kind: 'leven' }); c.move(t, { kind: 'voorspraak' }); c.endTalk(t);
    if (c.patronOf(pat.place)!.state === 'given') {
      risk++;
      const other = c.people({ kind: 'place', id: pat.place }).find((p) => p.id !== pat.nid)!;
      const tk = c.startTalk(other.id);
      c.move(tk, { kind: 'theme', being: 'heks' } as Move);
      c.endTalk(tk);
      if (c.patronOf(pat.place)!.state === 'lost' && c.diary.some((d) => d.notice && d.text.includes(c.patrons[0].title))) lost++;
    }
  }
}
console.log(`villages tested ${villages} (no priest in ${noPatron}); landlady's lead on day 4 in ${leads}`);
console.log(`good word given ${gotGood}/${villages}; tales from one visit each, warming up as needed: with the good word ${withW}, without ${withoutW}`);
console.log(`asking about witches afterwards cost the good word in ${lost}/${risk}`);
