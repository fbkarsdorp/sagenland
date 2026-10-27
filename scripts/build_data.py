"""Build the static data bundles for Sagenland from data/spooky.sqlite.

Outputs (public/data/):
  meta.json            regions, tags lexicon, tale types, collector archetypes
  <region>.json        variants for one region (summary, type, tags, neighbours)
  <region>-texts.json  original texts for one region (loaded lazily)
"""
import collections
import json
import math
import os
import re
import sqlite3
import statistics as st

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "spooky.sqlite")
OUT = os.path.join(ROOT, "public", "data")
LABELS = os.environ.get("TYPE_LABELS", os.path.join(ROOT, "scripts", "type_labels.json"))
os.makedirs(OUT, exist_ok=True)

# --------------------------------------------------------------------------
# Regions, assigned by dialect label (falls back to nearest centroid by lat/lon)

REGIONS = {
    "friesland": dict(nl="Friesland", lang=["fries"]),
    "limburg": dict(nl="Limburg", lang=["limburg"]),
    "westvl": dict(nl="West-Vlaanderen", lang=["west-vlaams"]),
    "brabant": dict(nl="Brabant", lang=["brabant"]),
    "antwerpen": dict(nl="Antwerpse Kempen", lang=["antwerps"]),
    "oostvl": dict(nl="Oost-Vlaanderen", lang=["oost-vlaams"]),
    "oosten": dict(nl="Het Oosten", lang=["gronings", "drents", "twents", "gelders", "achterhoek",
                                          "liemers", "overijssel", "sallands", "nedersaksisch"]),
}


def region_of(lang):
    l = (lang or "").lower()
    for key, r in REGIONS.items():
        if any(k in l for k in r["lang"]):
            return key
    return None


# --------------------------------------------------------------------------
# Motif lexicon on the Standard Dutch summaries.  (id, category, label, regex)

LEX = [
    # beings
    ("duivel", "being", "de duivel", r"\bduivel|\bsatan|\bde boze\b|\bde kwade\b|\blucifer|\bhels"),
    ("heks", "being", "een heks", r"\bheks|\btoveres|\bbehekst|\bbetover"),
    ("spook", "being", "een spook", r"\bspook|\bspoken\b|\bspookt|\bgeest\b|\bgeesten\b|\bziel\b|\bzielen\b|\boverleden(e|en)\b|\bdode\b|\bgestorven"),
    ("witte_wieven", "being", "de witte wieven", r"witte wie|witte vrouw|witte juffer|witte dame"),
    ("kabouter", "being", "kabouters", r"kabouter|aardmanne|alvermanne|\bmannekes|kleine mannetjes|ulekeerl|ierdmantsje|\bkaboutermann"),
    ("weerwolf", "being", "een weerwolf", r"weerwolf|wolf\b|\bweerwolven"),
    ("mare", "being", "de nachtmerrie", r"\bmare\b|nachtmerrie|nachtmare|\bde maar\b"),
    ("dwaallicht", "being", "dwaallichten", r"dwaallicht|lichtje|vuurman|stalkaars|vurige man|gloeiende man|vlammetje|vuurmannetje"),
    ("watergeest", "being", "een watergeest", r"nekker|watergeest|waterman|meermin|bullebak|waterwolf|\bhaakman"),
    ("spookdier", "being", "een spookdier", r"zwarte hond|zwarte kat|kludde|spookhond|spookdier|vurige hond|spookpaard|zwart paard|zwart varken|zwarte bok|witte haas|hond met vurige|\bkalf\b"),
    ("voorgezicht", "being", "een voorgezicht", r"voorgezicht|voorspook|voorteken|voorloop|voorspel|lijkstoet|begrafenisstoet|helm geboren|ziet .{0,30}(lijk|begrafenis)|voorspel"),
    ("tovenaar", "being", "een tovenaar", r"tovenaar|duivelbanner|duivelsbanner|bezweerder|\bvastzet|\bvaststa|vastgezet|zwarte kunst|zevende boek|zesde en zevende|wichelroede|duivelskunstenaar|waarzegger|waarzegster|toverdokter"),
    ("reus", "being", "een reus", r"\breus\b|\breuzen"),
    ("heilige", "being", "een heilige", r"heilige|\bmaria\b|onze lieve vrouw|\bgod\b|jezus|christus|mirakel|\bengel"),
    ("bokkenrijder", "being", "de bokkenrijders", r"bokkenrijder"),
    ("vrijmetselaar", "being", "de vrijmetselaars", r"vrijmetselaar"),
    ("dood", "being", "de dood", r"\bde dood\b|magere hein"),
    # places
    ("molen", "place", "de molen", r"\bmolen|\bmolenaar"),
    ("kerk", "place", "de kerk", r"\bkerk(?!hof)|\bkerken\b|kerktoren|\bklokken\b|\bklok\b"),
    ("kerkhof", "place", "het kerkhof", r"kerkhof|begraafplaats|\bgraf\b|\bgraven\b"),
    ("put", "place", "de put", r"\bput\b|waterput|\bputten\b"),
    ("kruisweg", "place", "de kruisweg", r"kruisweg|kruispunt|viersprong|driesprong|kruising"),
    ("herberg", "place", "de herberg", r"herberg|\bcafé|\bcafe\b|\bkroeg|taveerne|estaminet|waard\b|waardin"),
    ("smidse", "place", "de smidse", r"\bsmid\b|\bsmidse|hoefsmid|\bsmederij|\bsmeden\b"),
    ("brug", "place", "de brug", r"\bbrug\b|bruggetje|\bbruggen\b"),
    ("boerderij", "place", "de boerderij", r"boerderij|\bhoeve\b|\bboer\b|\bboerin\b|\bstal\b|\bstallen\b|\bkoeien\b|\bvee\b"),
    ("huis", "place", "het huis", r"\bhuis\b|\bkamer\b|\bbed\b|\bbedstee|\bzolder\b|\bkeuken"),
    ("heide", "place", "de heide", r"\bheide\b|\bheidevel|\bhei\b"),
    ("veen", "place", "het veen", r"\bveen\b|moeras|\bmoer\b|\bvenen\b|\bven\b"),
    ("bos", "place", "het bos", r"\bbos\b|\bbossen\b|\bwoud\b|\bbosje\b"),
    ("water", "place", "het water", r"\bwater\b|\bsloot|\brivier|\bvaart\b|\bbeek\b|\bgracht|\bvijver|\bplas\b|\bkanaal"),
    ("kasteel", "place", "het kasteel", r"kasteel|\bslot\b|\bburcht|\bheer van"),
    ("kapel", "place", "de kapel", r"\bkapel|wegkruis|\bkruisbeeld"),
    ("galg", "place", "de galg", r"\bgalg"),
    ("weg", "place", "de weg", r"\bweg\b|\bstraat\b|\bpad\b|\bdijk\b|\bonderweg"),
    ("zee", "place", "de zee", r"\bzee\b|\bschip\b|\bvisser|\bschipper|\bstrand"),
    # motifs (used for describing how variants differ)
    ("kat", "motif", "een kat", r"\bkat\b|\bkatten\b|\bpoes"),
    ("hond", "motif", "een hond", r"\bhond\b|\bhonden\b"),
    ("haas", "motif", "een haas", r"\bhaas\b|\bhazen\b"),
    ("paard", "motif", "een paard", r"\bpaard|\bros\b"),
    ("varken", "motif", "een varken", r"\bvarken|\bzeug\b"),
    ("koe", "motif", "een koe", r"\bkoe\b|\bkoeien\b|\bkalf\b"),
    ("bok", "motif", "een bok", r"\bbok\b|\bgeit\b"),
    ("pad", "motif", "een pad", r"\bpad\b(?! naar)|\bpadden\b|\bkikker"),
    ("boter", "motif", "de boter", r"\bboter|\bkarn"),
    ("melk", "motif", "de melk", r"\bmelk"),
    ("kaarten", "motif", "het kaartspel", r"\bkaart(en|spel|spelen)|\bkaartende"),
    ("dans", "motif", "een dans", r"\bdans"),
    ("geld", "motif", "geld", r"\bgeld\b|\bgoud\b|\bschat\b|\bdukaten"),
    ("kist", "motif", "een kist", r"\bkist\b|doodkist|lijkkist"),
    ("licht", "motif", "een licht", r"\blicht\b|\blantaarn|\bkaars"),
    ("vuur", "motif", "vuur", r"\bvuur\b|\bbrand\b|\bvlammen"),
    ("kruis", "motif", "een kruis", r"\bkruis\b|\bkruisteken|\bkruisje"),
    ("gebed", "motif", "een gebed", r"\bgebed|\bbidden|\bbidt\b|\brozenkrans|\bwijwater|\bgewijd"),
    ("pastoor", "motif", "de pastoor", r"\bpastoor|\bpriester|\bkapelaan|\bdominee|\bpater\b|\bmonnik"),
    ("middernacht", "motif", "middernacht", r"middernacht|twaalf uur|\b12 uur"),
    ("kind", "motif", "een kind", r"\bkind\b|\bkinderen\b|\bbaby|\bwieg"),
    ("bruid", "motif", "een bruiloft", r"\bbruid|\bbruiloft|\bverloofd|\bvrijer|\bvrijster"),
    ("mes", "motif", "een mes", r"\bmes\b|\bmessen\b|\bbijl\b|\bsikkel"),
    ("ketting", "motif", "kettingen", r"\bketting"),
    ("zout", "motif", "zout en brood", r"\bzout\b|\bbrood\b"),
    ("schoen", "motif", "schoenen", r"\bschoen|\bklomp"),
    ("wagen", "motif", "een wagen", r"\bwagen|\bkar\b|\bkoets"),
    ("soldaat", "motif", "soldaten", r"\bsoldat|\bfransen\b|\boorlog"),
    ("dief", "motif", "een dief", r"\bdief|\bdieven|\brovers?\b|\bstelen\b|\bgestolen"),
    ("hoofd", "motif", "zonder hoofd", r"zonder hoofd|\bhoofdloos|\bonthoofd"),
]
LEX_RE = [(i, cat, lab, re.compile(rx)) for i, (tid, cat, lab, rx) in enumerate(LEX)]


def tag(text):
    t = (text or "").lower()
    return [i for i, cat, lab, rx in LEX_RE if rx.search(t)]


TAG_ID = {tid: i for i, (tid, *_r) in enumerate(LEX)}

# Map buildings / terrain to the place tags they draw on
ATTRACTORS = {
    "molen": ["molen"], "kerk": ["kerk", "kerkhof"], "put": ["put"], "kruisweg": ["kruisweg"],
    "herberg": ["herberg"], "smidse": ["smidse"], "brug": ["brug"], "boerderij": ["boerderij"],
    "huis": ["huis"], "kapel": ["kapel"], "galg": ["galg"],
    "heide": ["heide"], "veen": ["veen"], "bos": ["bos"], "water": ["water"],
}


# beings that belong at an attractor in the folk imagination (used to boost and as fallback)
ATTRACTOR_BEINGS = {
    "molen": ["duivel"], "kerk": ["heilige", "spook", "duivel"], "put": ["witte_wieven", "watergeest", "spook"],
    "kruisweg": ["heks", "duivel", "weerwolf", "spookdier"], "herberg": ["duivel", "tovenaar"],
    "smidse": ["duivel", "spookdier", "heks"], "brug": ["spookdier", "watergeest", "spook"],
    "boerderij": ["heks", "mare", "kabouter"], "huis": ["voorgezicht", "mare", "spook"],
    "kapel": ["heilige", "spook"], "galg": ["spook", "duivel", "dood"],
    "heide": ["witte_wieven", "dwaallicht", "weerwolf"], "veen": ["dwaallicht", "spook"],
    "bos": ["kabouter", "witte_wieven", "spookdier"], "water": ["watergeest", "dwaallicht"],
}


def clean(s):
    s = (s or "").strip()
    s = re.sub(r"\s*\n\s*\n\s*", "\n\n", s)
    return s


PROFILE = os.path.join(ROOT, "scripts", "collectors_profile.json")


def archetypes():
    """Collector archetypes. Game parameters are tuned by hand; the 'real' block is measured
    from the Verhalenbank metadata (scripts/collectors.py -> collectors_profile.json)."""
    prof = {d["col"]: d for d in json.load(open(PROFILE))}

    def real(name):
        d = prof[name]
        return dict(name=name, n=d["n"], sage=d["sage"], tellers=d["tellers"], years=d["years"],
                    days=d["days"], per_visit=d["per_visit"], visits_per_teller=d["visits_per_teller"],
                    top5=d["top5"], places=d["places"], radius_km=d["radius_km"])

    students = [d for d in prof.values() if d["days"] <= 5 and d["places"] <= 6 and d["sage"] >= 300
                and d["years"][0] and d["years"][0] >= 1955]
    student = dict(name=f"{len(students)} Vlaamse en Limburgse studenten", n=sum(d["n"] for d in students),
                   sage=sum(d["sage"] for d in students), tellers=sum(d["tellers"] for d in students),
                   years=(min(d["years"][0] for d in students), max(d["years"][1] for d in students)),
                   per_visit=round(st.median(d["per_visit"] for d in students), 1),
                   tellers_median=int(st.median(d["tellers"] for d in students)),
                   visits_per_teller=round(st.median(d["visits_per_teller"] for d in students), 2),
                   top5=round(st.median(d["top5"] for d in students), 2))
    return {
        "volhouder": dict(
            nl="De volhouder", real=real("A.A. Jaarsma"),
            regions={"friesland": 6},
            params=dict(mode="return", every=2, stay=10, sessions=7, per_visit=6, revisit=2.5, radius=2,
                        prolific=1.2, start_frac=0.25)),
        "rondreiziger": dict(
            nl="De rondreiziger", real=real("Henk Kooijman"),
            alt=[real("S. Keuning"), real("Wever, F."), real("G.H. Linssen")],
            regions={"friesland": 3, "oosten": 6, "limburg": 3, "brabant": 1},
            params=dict(mode="tour", stay=3, sessions=4, per_visit=5, revisit=0, radius=99,
                        prolific=1.5, start_frac=0.7)),
        "student": dict(
            nl="De student", real=student,
            regions={"limburg": 6, "westvl": 8, "oostvl": 8, "antwerpen": 8, "brabant": 8},
            params=dict(mode="parish", stay=40, sessions=99, per_visit=3, revisit=0, radius=0,
                        prolific=0.6, start_frac=0.82)),
        "notabele": dict(
            nl="De notabele", real=real("C. Bakker"),
            regions={"friesland": 1, "limburg": 1, "westvl": 1, "oostvl": 1, "antwerpen": 1, "brabant": 1,
                     "oosten": 2},
            params=dict(mode="resident", every=0.25, sessions=1, per_visit=2, revisit=8, radius=0,
                        prolific=3, start_frac=0.05)),
    }


def main():
    con = sqlite3.connect(DB)
    labels = json.load(open(LABELS)) if os.path.exists(LABELS) else {}
    print("labels:", len(labels))

    emb = {}
    for n, vec in con.execute("select n, vec from embeddings"):
        emb[n] = vec

    rows = con.execute(
        "select n, record, url, subgenre, language, collector, teller, year, sinsag, lat, lon, description, main_text "
        "from stories where (subgenre like '%sage%' or subgenre like '%legende%') and sinsag != '[]' "
        "and description is not null and length(description) > 30").fetchall()

    # centroids for fallback region assignment
    pts = collections.defaultdict(list)
    for r in rows:
        reg = region_of(r[4])
        if reg and r[9]:
            pts[reg].append((r[9], r[10]))
    cent = {k: (st.median(a for a, b in v), st.median(b for a, b in v)) for k, v in pts.items()}

    def km(a, b):
        return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 70)

    by_region = collections.defaultdict(list)
    for r in rows:
        reg = region_of(r[4])
        if not reg and r[9]:
            best = min(cent, key=lambda k: km(cent[k], (r[9], r[10])))
            if km(cent[best], (r[9], r[10])) < 45:
                reg = best
        if not reg:
            continue
        codes = json.loads(r[8])
        t = str(codes[0])
        if labels and t not in labels:
            continue
        if r[0] not in emb:
            continue
        by_region[reg].append(r)

    collectors = collections.Counter()
    langs = collections.Counter()
    for reg, rs in by_region.items():
        for r in rs:
            collectors[r[5] or "onbekend"] += 1
            langs[r[4] or ""] += 1
    col_list = [c for c, _ in collectors.most_common()]
    col_idx = {c: i for i, c in enumerate(col_list)}
    lang_list = [l for l, _ in langs.most_common()]
    lang_idx = {l: i for i, l in enumerate(lang_list)}

    type_counts_all = collections.Counter()
    being_all = collections.Counter()
    region_meta = {}
    for reg, rs in by_region.items():
        bytype = collections.defaultdict(list)
        for r in rs:
            bytype[str(json.loads(r[8])[0])].append(r)
        # keep types with at least 3 regional variants
        keep = {t: v for t, v in bytype.items() if len(v) >= 3}
        variants, texts = [], {}
        for t, vs in sorted(keep.items()):
            type_counts_all[t] += len(vs)
            M = np.stack([np.frombuffer(emb[r[0]], dtype=np.float16).astype(np.float32) for r in vs])
            S = M @ M.T
            np.fill_diagonal(S, -1)
            k = min(6, len(vs) - 1)
            idx = np.argsort(-S, axis=1)[:, :k]
            for i, r in enumerate(vs):
                nb = [[int(vs[j][0]), round(float(S[i, j]), 2)] for j in idx[i]]
                variants.append(dict(
                    n=r[0], t=t, d=clean(r[11]), y=r[7], c=col_idx[r[5] or "onbekend"],
                    r=r[1] or "", l=lang_idx[r[4] or ""], g=tag(r[11]), nb=nb))
                if r[12]:
                    texts[r[0]] = clean(r[12])[:6000]

        # attraction tables: for each attractor, types weighted by how often their variants mention it,
        # times lift over the regional baseline, boosted when the type's label lists the place
        attract = {}
        base = collections.Counter()
        for v in variants:
            for g in set(v["g"]):
                base[g] += 1
        nvar = len(variants)
        for a, tags in ATTRACTORS.items():
            tids = [TAG_ID[x] for x in tags]
            per = collections.Counter()
            tot = collections.Counter()
            for v in variants:
                tot[v["t"]] += 1
                if any(g in v["g"] for g in tids):
                    per[v["t"]] += 1
            p_base = sum(base[g] for g in tids) / max(1, nvar)
            scored = []
            for t, c in per.items():
                lift = (c / tot[t]) / max(1e-6, p_base)
                lab = labels.get(t, {})
                boost = 3.0 if set(lab.get("places", [])) & set(tags + ([a] if a == "boerderij" else [])) else 1.0
                being = 1.6 if lab.get("being") in ATTRACTOR_BEINGS.get(a, []) else 1.0
                if c >= 2 and lift > 1.2:
                    scored.append((t, round(math.sqrt(c) * min(lift, 6) * boost * being, 2)))
            # label-only matches (types the catalogue places here even if summaries rarely say so)
            for t, lab in labels.items():
                if t in tot and set(lab.get("places", [])) & set(tags) and t not in per:
                    scored.append((t, round(2.0 * min(tot[t], 10) / 10 + 1, 2)))
            # thematic fallback: types whose dominant being belongs at this attractor
            have = {t for t, _ in scored}
            for t, lab in labels.items():
                if t in tot and t not in have and lab.get("being") in ATTRACTOR_BEINGS.get(a, []):
                    scored.append((t, round(1.5 + math.sqrt(tot[t]) / 4, 2)))
            scored.sort(key=lambda x: -x[1])
            attract[a] = scored[:30]

        # names: first names and surnames from teller metadata (recombined, so no real person appears)
        not_names = {"Mevrouw", "Meneer", "Mijnheer", "Juffrouw", "Weduwe", "Zuster", "Broeder", "Pastoor", "Pater",
                     "Frater", "Heer", "Vrouw", "Moeder", "Vader", "Meester", "Dokter", "Onbekend", "Mevr", "Familie"}
        firsts, lasts = collections.Counter(), collections.Counter()
        particles = {"van", "de", "der", "den", "ter", "ten", "te", "het", "in", "op", "la", "le", "du", "von"}
        for r in rs:
            tel = r[6] or ""
            for person in re.split(r";|\s+en\s+", tel):
                person = person.strip()
                if "," in person:
                    last, first = [x.strip() for x in person.split(",", 1)]
                    parts = first.split()
                    if parts and len(parts[0]) > 2 and not parts[0].endswith(".") and parts[0][0].isupper() and parts[0] not in not_names:
                        firsts[parts[0]] += 1
                        # only real particles: the field sometimes ends in a stray word ("Tienstra, Jan schrijft")
                        prefix = " ".join(p for p in parts[1:] if p in particles)
                        last = re.sub(r"[\(\[].*?[\)\]]", "", last).split(" - ")[0].strip()
                        if (last and last[0].isupper() and len(last) > 2 and "." not in last
                                and re.fullmatch(r"[A-Za-zÀ-ÿ' ]+", last)):
                            lasts[(prefix + " " + last).strip()] += 1
                else:
                    # Flemish style: "Gerard Van De Vondel", "Elisa Celis-Stalmans"
                    parts = person.split()
                    if (len(parts) >= 2 and len(parts[0]) > 2 and parts[0][0].isupper() and parts[0] not in not_names
                            and not parts[0].endswith(".") and not parts[-1].endswith(".")):
                        last = " ".join(parts[1:]).split("-")[0].strip()
                        if re.fullmatch(r"[A-ZÀ-Þ][A-Za-zÀ-ÿ ]+", last) and len(last) > 2 and " uit " not in f" {last} ":
                            firsts[parts[0]] += 1
                            lasts[last] += 1

        # real collecting stats inside this region
        col_counter = collections.Counter(r[5] for r in rs if r[5])
        kept = [r for r in rs if str(json.loads(r[8])[0]) in keep]
        yrs = sorted(r[7] for r in kept if r[7] and 1800 < r[7] < 2020)
        decades = collections.Counter(y // 10 * 10 for y in yrs)
        being_n = collections.Counter(labels.get(t, {}).get("being", "") for t, vs in keep.items() for _ in vs)
        being_all.update(being_n)
        pts = collections.Counter((round(r[10], 2), round(r[9], 2)) for r in kept
                                  if r[9] and 49.3 < r[9] < 53.8 and 2.3 < r[10] < 7.4)
        region_meta[reg] = dict(
            nl=REGIONS[reg]["nl"], count=len(variants), types=len(keep),
            firsts=[f for f, c in firsts.most_common(160) if c >= 2],
            lasts=[l for l, c in lasts.most_common(220) if c >= 1],
            collectors=col_counter.most_common(8),
            attract=attract,
            years=[yrs[len(yrs) // 10], yrs[len(yrs) * 9 // 10]] if yrs else None,
            decades=sorted(decades.items()),
            langs=collections.Counter(r[4] for r in kept if r[4]).most_common(5),
            top=[[t, len(vs)] for t, vs in sorted(keep.items(), key=lambda kv: -len(kv[1]))[:8]],
            beings=dict(being_n),
            pts=[[x, y, c] for (x, y), c in pts.most_common()],
        )
        json.dump(dict(variants=variants), open(os.path.join(OUT, f"{reg}.json"), "w"),
                  ensure_ascii=False, separators=(",", ":"))
        json.dump(texts, open(os.path.join(OUT, f"{reg}-texts.json"), "w"),
                  ensure_ascii=False, separators=(",", ":"))
        print(reg, len(variants), "variants,", len(keep), "types,", len(texts), "texts")

    # what is characteristic: a region's share of each being against the share in all regions together
    tot_all = sum(being_all.values())
    for reg, m in region_meta.items():
        tot = sum(m["beings"].values())
        lift = {b: (c / tot) / (being_all[b] / tot_all) for b, c in m["beings"].items() if b and c >= 15}
        m["typical"] = [b for b, _ in sorted(lift.items(), key=lambda kv: -kv[1])[:4]]
        m["beings"] = sorted(([b, c] for b, c in m["beings"].items() if b), key=lambda x: -x[1])[:8]

    # the whole archive as dots (every record with a place), for the locator map
    geo = collections.Counter()
    for lat, lon in con.execute("select lat, lon from stories where lat is not null"):
        if 49.3 < lat < 53.8 and 2.3 < lon < 7.4:
            geo[(round(lon * 20) / 20, round(lat * 20) / 20)] += 1

    types = {}
    for t, lab in labels.items():
        if t in type_counts_all:
            types[t] = dict(lab, total=type_counts_all[t])
    meta = dict(
        archetypes=archetypes(),
        regions=region_meta,
        tags=[dict(id=tid, cat=cat, label=lab) for tid, cat, lab, _ in LEX],
        types=types,
        collectors=col_list,
        langs=lang_list,
        geo=[[x, y, c] for (x, y), c in geo.most_common()],
    )
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("types:", len(types))


if __name__ == "__main__":
    main()
