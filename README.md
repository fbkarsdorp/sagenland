# Sagenland

A game about collecting folktales, built on the Nederlandse Volksverhalenbank. You are a collector
with twelve days in a region of a handful of villages. You travel, visit people and listen; what you
write down is what the archive will later know of the region. At the end your notebook is set against
the story world it was taken from. Every tale in the game is a real, recorded variant.

## Play

- **The first evening** (optional, offered on the start page until you have had it once): the evening
  before day 1, an old collector who has worked the region for forty years takes you round the village of
  your lodgings. Three people each show one side of the work, without dice: a born storyteller who tells
  after a little small talk; a believer who will not tell about witches until you have asked about the old
  days first; and a shy one who only remembers once you tell one of tonight's tales yourself, and then
  gives you a name. At night you walk with her to a place nearby where things are seen, and walk back to
  the first morning. What you write down that evening goes into your notebook. It can be skipped at any
  moment. The trail of the lost tale and the appeal in the weekly only open on day 2, so the first day
  is quieter either way.
- **The map** is your own field map: a faded printed sheet that comes into watercolour where you have
  been. Villages have a character (church village, farming village, hamlet, mill village, peat or
  heath village); outside them lie places tales are tied to (a gallows field, a crossroads, an old
  lime tree, a bog, a heath, a wood, a ferry), several with a loner living beside them.
- **Time**: twelve days of morning, afternoon and evening, each in two stretches of about two hours. A
  visit takes one stretch, a journey as many as the distance needs, a storytelling evening the rest of the evening. Old,
  ill tellers may die while you are in the field, and take what you did not write down with them.
- **A visit is a short conversation**: three moves (four in the evening) and a mood that starts at
  how well the other knows you. Small talk, asking about the old days, or telling a tale yourself warm
  things up; asking too soon, or about witches before you are trusted, cools them down, and pushed too
  far the visit ends. During the day many people are out in the fields. Word gets round in a village,
  so people offer what you have not heard there.
- **Finds count most.** A new tale scores by how rare its type is in the whole Verhalenbank (a dozen
  records or fewer: rare, 6; up to sixty: unusual, 3; otherwise 1), plus 4 if only this teller still
  knows it in the region (2 if three or fewer do). A version nobody else tells, and tales of tellers who
  die before you leave, add more; what the other collector had first counts half. Ask for them
  ("Vertelt men hier iets wat ik nergens anders hoor?"): it needs trust, and the answer tells you
  whether this teller has anything of their own. People point you to those who know what nobody else
  does; the landlady knows which village keeps its own tales. The sagenboek's chapters (three tales of
  a kind) add 5 each.
- **Hearsay**: what people say about others is pencilled on the map and listed on the left: a teller
  who knows a lot, a place nobody talks about, a storytelling evening at an inn on a given day.
- **Tellers differ**, as the history of collecting shows: the born storyteller who tells freely and
  believes none of it; the believer who fears being laughed at; the scoffer who laughs at "old wives'
  talk" but knows who knows; the shy one with a great memory who tells little unless you name a tale.
- **Naming a tale** ("Kent u het verhaal van …?") jogs memory: another version, or "no, but I do know…",
  as with Jaarsma and Mrs Kobus. Tales may come back **in fragments**; another visit may complete them.
- **Other ways in**: an appeal in the local weekly brings a few letters (and a complaint); someone met on
  the road tells a tale on the way (Bakker's rower); neighbours gathering at a farm, to be found out.
- **Another collector** works the region from day three. Where they go tomorrow is pencilled on the
  map, so you can get there first; they call on your best tellers and the ill, take over leads you had
  not followed up, and their score runs next to yours.
- **Weather and dark**: each autumn day has its weather. In the rain nobody works outside, so everyone
  can be visited and talks a little more readily, but the roads are slow; in morning mist the way across
  open land takes twice as long. At night the sheet goes dark, with lamplight in the windows and around
  the evening's gathering. At night, and in the mist over the low ground, things are seen at the places
  tales are tied to (lights over the bog, white women on the heath, a figure on the crossroads): tap one
  when close by to learn whom to ask about it.
- **The lost tale**: each season one rare tale is known to a single person only, and is found by following
  a trail: an old teller at the lodgings remembers how it begins and whose it was; that person's grave at a
  church says where they came from; at that place, after dark, you learn which village the family moved to
  and how to recognise the one who still has it (the gold ear irons of the old costume, or a clay pipe, drawn
  in their portrait); asking the wrong person cools the conversation. Worth 10 points on top of its rarity.
- **Who you are** follows the four collector patterns measured in the archive's metadata (travel
  speed, year, and one advantage each).
- **The end**: tales written down against tales told, a Chao1 estimate from your notebook's counts,
  who died with what, who you never asked, and the real collectors of the region.

The story world underneath is the earlier simulation (`src/sim.ts`) run in quiet mode for eight years
before you arrive, so repertoires carry the marks of population size and connectivity: large villages
know more, and tales differ from village to village and change along the roads.

Sources for the collectors' side: A.J. Dekker, '150 jaar Nederlands volksverhaalonderzoek',
*Volkskundig Bulletin* 4 (1978); T. Dekker, 'Zonder verzamelaars geen sprookjes', *Volkskundig Bulletin*
24 (1998); T. Meder & E. Venbrux, 'Authenticity as an analytic concept in folkloristics', *Etnofoor* 17
(2005). The PDFs are kept locally in `literature/` (not in the repo).

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # static site in dist/ (relative paths; drop it in any folder)

## Data

`public/data/` is generated from `data/spooky.sqlite` (not in the repo):

    uv venv .venv && uv pip install --python .venv/bin/python numpy
    .venv/bin/python scripts/collectors.py   # collector profiles -> scripts/collectors_profile.json
    .venv/bin/python scripts/build_data.py   # -> public/data/{meta,<region>,<region>-texts}.json

- **Regions** come from the dialect label (`language`), with a lat/lon fallback.
- **Motif tags** (beings, places, motifs) are regex matches on the Standard Dutch summaries. They
  drive which tales a building attracts and the "what changed" sentences.
- **Mutation** follows the bge-m3 embeddings: each variant stores its 6 nearest same-type variants
  in the region. A story on the move becomes one of them, weighted towards variants that mention
  what the destination village has (a mill, a church…).
- **Type titles** (`scripts/type_labels.json`) were written from samples of each SINSAG type,
  because the catalogue headings are not in the data.
- **Collectors**: four archetypes measured from the metadata (`scripts/collectors.py`): the
  persistent one (A.A. Jaarsma), the touring fieldworker (H. Kooijman), the thesis student
  (Flemish/Limburg student collections), and the local notable (C. Bakker). Measured: visits per
  teller, stories per visit, share from top tellers, years, places.
- **Region profiles** (years, dialects, typical beings by lift against all regions, most-told types,
  recording places) and a dot grid of every place in the archive feed the index maps. Flemish records
  rarely carry coordinates, so those regions show as hatched areas only. The outline of the Low
  Countries in `src/geo.ts` is a hand-drawn schematic, not data.
- **Narrator names** recombine first names and surnames from the teller field, so no real person
  appears.

## Balancing

    npx tsx scripts/fieldtest.ts oosten volhouder 3 [-v]   # a season with a simple bot
    npx tsx scripts/landstats.ts oosten 3                   # how different the villages' repertoires are
    npx tsx scripts/simtest.ts friesland volhouder 7        # the underlying simulation over 25 years
    npx tsx scripts/divtest.ts friesland                     # its diversity under population and connectivity
    npx tsx scripts/prologtest.ts                            # the first evening, in every region, collector and season

The previous village-builder version is archived locally in `backup/` (not in the repo).

## Code

- `src/field.ts` the season in the field: days, travel, visits, trust, hearsay, deaths, the notebook
- `src/land.ts` the region: villages with a character, roads, places tales are tied to
- `src/sim.ts` the story world (telling, memory, travel, mutation, sightings), run out of sight
- `src/world.ts` tiles, buildings, road pathfinding
- `src/sheet.ts` the field map: printed and watercolour sheets, the mask of what you have seen,
  names, pencil and the red trail; `src/contour.ts` smooths the tile grid into soft shapes
- `src/scene.ts` Phaser: the sheet, the journey along the smoothed road (trail and colour drawn in as you
  go, dust, a dog in every village you pass), mills, smoke, birds, cattle, the light of the day, the camera
- `src/atmosphere.ts` the night layer, apparitions, ink splashes, and the weather scene (rain, leaves, mist)
- `src/portrait.ts` the faces
- `src/rider.ts` the collector drawn frame by frame (bicycle, on foot, car with tape recorder, doctor's gig), the old
  collector of the first evening, and the animals
- `src/ui.ts`, `src/end.ts` HTML layer (where you are, hearsay, visits, notebook, diary, end)
- `src/locator.ts`, `src/geo.ts`, `src/region.ts` index map and region profile on the start screen
- `src/sound.ts` synthesized sound (Web Audio, no assets)

## Admin mode

Add `?admin` to the address for a panel to look at any moment of a season: set the day, the hour and the
weather, show every apparition, reveal the map, put the collector anywhere, step through the lost tale, or
jump to the end screen. A season can be replayed by its seed: `?admin&region=friesland&arch=volhouder&seed=4242&go`
starts it straight away (region and collector must go together, as in the archive). The admin changes are for
looking only: skipping days does not let the region's year move on.

Seasons: `&season=lente|zomer|winter` (autumn is the default) plays the same twelve days at another time of
year: the land's colours, bare trees and snow in winter, blossom in spring, gold fields and heather in summer;
the weather (snow in winter, mostly dry summers), the length of the light, how many people are out on the land
(most at harvest, hardly anyone in winter) and how readily they tell (best in the long winter evenings). The
admin panel switches between them.

## Music

Music only in the dark: `public/music/lucht.mp3`, a loop from N.91music's free atmospheric assets on itch.io
(credit requested, given in the colophon), played round without a seam all night. The admin panel can switch to
`public/music/nacht.mp3` (made with Suno, Pro plan; the source is `music/Night.mp3`), which
fades in as the evening comes, also on the road as dusk falls, plays through, rests for half a minute and begins
again while it is night, and fades away with the morning. By day there is only the land: birds, the mill, the bell.

## Feast days

By the player's own calendar (or `?feest=halloween|sinterklaas|kerst`, also in the admin panel):
- **30 Oct – 1 Nov, All Hallows' Eve**: carved pumpkins by many a door, lit after dark; bats at dusk; what is seen
  at night shows itself longer and comes back sooner.
- **4–6 Dec, Sinterklaas**: at night the saint now and then rides his white horse over the roofs, sparks behind.
- **24–26 Dec, Christmas**: snow in the air, a star over every church, and after dark, far away, the midwinter
  horn of Twente and the Achterhoek.
The intro and the second morning mention the feast in one line.

Evening and night: the evening (19.00) brings dusk and the lamplight; the night (21.00) brings what is seen in the
dark and the night music. "Wacht tot de nacht" stays up for it. In winter the whole evening is night.
