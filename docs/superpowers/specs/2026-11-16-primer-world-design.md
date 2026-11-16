# Primer world: a 3D walk through a topic, plus a test page

Date: 2026-11-16. Status: approved by the user, 2026-11-16.

## Intent

A public website that replaces the flat study primer with a 3D world you walk
through. Each topic (Lithuanian literature first; foreign pop and rock, and
countries later) becomes one place: its sections are rooms laid out along the
topic's own axis (time, or the map), and its subjects are spots in those
rooms. Walking up to a spot opens what you need to know about it. A separate
flat test page checks what stuck.

Who it is for: adults who play quizzes or just want to learn the topic. The
user is the primary user. Anki stays the drilling tool: the site gives the
background, not the repetition.

Why 3D at all: research supports 3D only as a space to remember things by
(memory palace), not as decoration (see Research basis). So every 3D choice
here must place information somewhere meaningful: a person stands at their
lifetime, contemporaries stand side by side, a country sits where it is.

## Goals

- Everything important in a topic's primer is in the world: no primer subject
  is lost (checked by a test).
- Order, eras and contemporaries are visible by walking, not only read.
- Each room makes you try its "why / how" questions before reading.
- A test page per topic: recall, "Kas tai?" from photos, order and era.
- Adding a topic is a content job (one JSON file and its photos), not engine
  code; at most it adds room styles to the theme library.
- Works on desktop and phone, in current browsers; static files only.

## Non-goals

- No scheduling or spaced repetition (Anki does it).
- No accounts, server, analytics or sync. Progress lives in the browser.
- No VR headset mode.
- No automatic grading of typed answers: the learner marks their own answer.
- No new research beyond what the primer already holds (user, 2026-11-16).
- The map layout (countries) is defined here but built when that topic comes.

## Anti-goals (failure even if it works)

- Decoration that pulls attention from content (cutscenes, effects, ambient
  clutter).
- Any reference, on the deployed site, to the TV show it was made for, its
  broadcaster, the private study kit, or the user (name, answers, misses).
- A topic that needs new engine code to be added.
- Motion that makes people sick, or a world you can't use on a phone.

## Research basis

Checked in the session of 2026-11-16 (abstracts and summaries, not full texts).

| Finding | Evidence | Design consequence |
|---|---|---|
| Testing beats rereading | Practice-testing meta-analysis, g ≈ 0.70 ([Adesope et al. 2017](https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/)) | Room questions to try first; a test page |
| Method of loci works | 13 RCTs, g = 0.65 ([Twomey & Kroneisen 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC12514325/)); virtual palaces work, a headset beat desktop by 8.8% recall ([Krokos et al. 2018](https://www.umiacs.umd.edu/about-us/news/people-recall-information-better-through-virtual-reality-says-new-umd-study)) | Fixed spots in distinct rooms along a path |
| Immersion can cost learning | Headset VR: more presence, less learning, d = 0.80 ([Makransky et al. 2019](https://imotions.com/blog/adding-immersive-virtual-reality-to-a-science-lab-simulation-causes-more-presence-but-less-learning)) | Desktop/phone 3D only; calm camera |
| Irrelevant detail hurts | Seductive details g = −0.33 ([Sundararajan & Adesope 2020](https://news.wsu.edu/2020/03/19/seductive-details-inhibit-learning/)); simpler game visuals as good or better ([Clark et al. 2016](https://www.sri.com/publication/education-learning-pubs/digital-learning-pubs/digital-games-design-and-learning-a-systematic-review-and-meta-analysis-brief/)) | Stylised, low-detail look; nothing that doesn't carry content |
| Game elements help a little | Gamification g = 0.49 on learning, k = 19, underpowered ([Sailer & Homner 2020](https://link.springer.com/article/10.1007/s10648-019-09498-w)) | Progress marks are a small extra, not the method |

Earlier work in the private study kit (its stage 7 spec) chose pre-questions,
elaboration ("why / how it connects") and a concept map drawn from memory,
citing Dunlosky et al. 2013. The world keeps the first two; the concept map
becomes connection arcs between spots (below).

## Publishing boundary

Changes the study kit's rule "don't publish the dataset" (user, 2026-11-16):

- May go public: primer facts, the primer's "why / how" questions, card
  questions and answers (show questions verbatim or reworded), Commons
  photos with their credits.
- Never public: frames, stills, videos, qids or any archive id, any mention
  of the show, its broadcaster or the study kit, the user's identity, answers,
  attempts or which questions they missed. Cards made from the user's misses
  become ordinary questions with no trace of that origin.
- Test questions come only from the primer and `cards.json` (which cite only
  study or attempted questions), never from held-out pre/post questions, so
  the user's post-tests stay clean.
- The study kit's `CLAUDE.md` gets this rule in its own small PR.
- Deploying is out of scope here and needs the user's go-ahead each time.

## Approaches considered

1. **Memory palace walk + timeline fly-over test (A + B as two 3D views).**
   Dropped by the user: two 3D worlds for one topic.
2. **Timeline fly-over only.** A line gives weaker places than rooms, and it
   doesn't fit a geographic topic.
3. **3D quiz set.** Decoration only, and it would look like the show. Dropped.
4. **One world laid on the topic's axis + a flat test page (chosen, user
   2026-11-16).** The palace path *is* the timeline (or the map), so walking
   shows order and overlap; the test is plain 2D, where it is fastest to use.

## Repos and data flow

```
~/www/kik (private study kit)            ~/www/kik_primers (private; site/ deploys)
kik_out/study/<slug>/                     site/topics/<slug>/topic.json   (agent-written)
  primer.md, extras.json, cards.json  ->  site/topics/<slug>/img/<id>.<ext> (+ credits)
  people.json, people/faces.json, *.jpg   tools/  (Deno: import photos, validate)
```

- The study kit is read, never written. Its folder is passed as an argument;
  nothing under `site/` names it.
- `site/` is the whole public site and the only thing deployed. Everything
  else in the repo (docs, tools, tests, CLAUDE.md) stays private.

## Content pack: `site/topics/<slug>/topic.json`

Written by an agent following `docs/TOPIC.md` from the study kit's topic
folder: the primer is the source of truth; `extras.json` gives years and
connections; `cards.json` gives questions; `people.json` and `faces.json`
give photos and dates. The agent rewrites show references ("laidoje nuolat
klausiama…") into neutral text, keeps the facts, and may reword questions.

Shape (field names are the builder's to refine; the content is fixed):

- `version`, `slug`, `title`, `intro` (the primer's opening), `layout`:
  `"time"` or `"map"`.
- `rooms[]`: `n` (primer section number), `title`, `intro`, `why[]` (`q`,
  `a`: the section's bold "why / how" questions), and for `time` a `span`
  `[from, to]` in years or `null` (an annex, e.g. Pop's "who's from where");
  for `map` a `region` centre and zoom; `style` (a room style from the
  theme library).
- `spots[]`: `id` (ASCII slug), `room`, `kind` (`person`, `work`, `group`,
  `event`, `place`, `thing`), `name`, `aliases[]` (real names, pen names,
  other spellings), `years` (`[from, to]`, `[year]` or `null`: life for a
  person, publication or event year otherwise), `at` (for `time`: the year
  the spot stands at; for a person the year of their debut or main work in
  that room's era, picked by the agent per `docs/TOPIC.md`, since most
  writers were born well before their room's span: 87 of 116 literature
  people by over 5 years), for `map`
  `lat`/`lon`, `text` (short Lithuanian paragraphs, from the primer),
  `links[]` (spot ids it connects to, with a short label), `photo` (optional:
  `file`, `author`, `license`, `license_url`, `source_url`); for people
  `life[]` (`year`, `label`, `place`), `places[]` (`name`, `lat`, `lon`),
  `motif`; for works optional `illustration` (`file`, `approved`) and `plot`
  (`characters[]` with `name` and `role`, `beats[]` with `text`,
  `characters[]` and optional `image`, `sources[]` as URLs).
- `questions[]`: `id`, `q`, `a`, `room`, `spot` (optional): recall items from
  `cards.json` (fact, why and the former missed cards alike) and the room
  questions.

Validation (`tools/validate`, run by the tests):

- Schema; unique ids; links and rooms resolve; a `time` spot's `at` falls
  inside its room's span.
- **Coverage:** every bold span in the topic's `primer.md` occurs (case and
  diacritics folded) in the pack's text, names or aliases, or in an explicit
  `skipped` list with a reason. Needs `--primer <path>`.
- **No references:** `site/` as a whole (pack, HTML, JS, file names, storage
  keys, comments) contains none of: `kik`, the word forms of `laida`
  (whole words, case and diacritics folded: laida, laidą, laidos, laidoje,
  laidų, laidai, laidas, laidose…; "palaidotas" passes), `LRT`, the show's
  name in any case or without diacritics, a qid pattern
  (`\d{9,10}:\d+\.\d+`), `missed`. No allowlist: the agent rewords ordinary
  uses ("laidos" meaning editions → "leidimai").
- Every photo has author, licence and source; a photo without them is dropped
  at import (author "nežinomas" is allowed for public-domain and CC0 files).

Photos: `tools/import-photos` copies the study kit's portraits for the
topic's people into `site/topics/<slug>/img/` and fetches author and licence
from Commons (`commons.wikimedia.org` API, image metadata), with a generic
User-Agent.

## The world (`site/world.html?topic=<slug>`)

**Layout `time` (built now).** A walkable path runs forward in time along one
axis. Each room is a walled area with its title at the entrance and its own
floor colour. Year markers stand along each lane's back walls.

- Scale is piecewise: each room's length grows with its spot count, and
  inside a room years map linearly onto its span. So the sparse XVI century
  doesn't leave a long empty walk and the crowded Soviet section has room.
- Rooms whose spans overlap run as parallel lanes side by side (literature's
  exile and Soviet-era sections, 1944–1990), so the split is visible.
- A spot stands at its `at` year (a person: debut or main work in the room's
  era); selecting a person draws their lifespan on the year markers, which
  may reach into earlier rooms. Spots too close together
  spread across the room's width, never overlapping: two rows, staggered so
  no spot stands right behind another, the back row on a low riser and the
  front row's exhibits a size smaller. Walking
  to a spot stops in the aisle in front of the front row, never between
  spots (user feedback, 2026-11-16: three rows hid each other).
- Rooms with `span: null` are annexes after the end of the path.

**Look: "night museum" with a distinct room per section (user, 2026-11-16).**
Dark surroundings, spotlit exhibits, gold accents (mockup B,
`docs/mockups/visual-rooms.html`). Each room is built in its own
style, echoing its era or place, so the rooms are easy to tell apart and the
look itself says something about the section (inference: loci work best when
distinct; per the seductive-details finding, a style must carry meaning, not
just decorate). A room's style is a small set of parts: walls, floor, a
signature shape over the back wall (gable, vault, roofline), window light
and its colour, and one landmark prop. Styles live in the theme layer as a
library; a room names its style in `topic.json` (`rooms[].style`). A new
topic reuses styles where they fit; one that needs a new style adds it to the
library (theme code), never to layout or panel code.

Literature rooms (my proposal; the builder may adjust shapes):

| Room | Style | Landmark |
|---|---|---|
| 1 Raštijos pradžia | Vaulted stone hall of an early print shop | Printing press |
| 2 Mažoji Lietuva | Red-brick Lutheran hall, stepped gable, warm lancet windows | Pulpit |
| 3 Žemaičiai | Log chapel, cool moonlight | Roadside shrine pillar (koplytstulpis) |
| 4 Tautinis atgimimas | Farm barn at night, lantern light | Book smuggler's cart with hidden books |
| 5 XX a. pradžios proza | Village farmstead room, whitewashed walls | Well sweep (svirtis) |
| 6 Tarpukaris | Interwar Kaunas modernism, rounded corners, tall glass | Radio set |
| 7 Karas ir egzodas | Wooden displaced-persons barrack | Pile of suitcases |
| 8 Sovietmetis | Grey concrete panels, cold fluorescent light | Typewriter |
| 9 Po 1990 | Glass and light timber, daylight blue | Bookshop shelf |

**Light follows time (user, 2026-11-16).** On a `time` layout the light along
the path changes with the year, on top of the room styles: candles (to the
1700s) → oil lanterns (1800s) → bare bulbs (early 1900s) → fluorescent tubes
(Soviet years) → daylight (after 1990). Overlapping rooms share their years'
light. The year bands and light settings are theme data. On a `map` layout
room styles follow region instead; there is no light-by-year layer.

**Layout `map` (later).** Rooms are regions on a stylised flat map, spots at
their coordinates; entering a room zooms in. Defined now so the schema holds;
built with the countries topic.

**Spots.** One simple model per kind, each a museum exhibit with its name on
a brass plaque: a plinth with a framed portrait (person; a dark panel with
the name and years engraved when there is no photo), a book on a reading stand (work), a
banner (group), a stone stele with its year (event), a signpost (place), a
vitrine (thing). A soft pool of light lies under each; there are no visible
light beams. The path lamps stand on the visitor's side of the path, shining
onto the rooms. The chosen spot gets a warm spotlight while the room's base
light dims. Floating name labels show on approach or hover, at most a few
at once: a label hides when it would overlap a more important one (hovered,
room titles, then nearest first), the page's own panels, the screen
edge, or stands behind a wall. While a spot is chosen, only room titles and a
hovered name show, and its arcs go to its four nearest links (the panel lists
them all). A link to a spot (`#id`) opens it in place, without the walk from
the entrance. With the panel open, the view centres on the
part of the screen it leaves free.

**Opening a spot.** A flat side panel (HTML over the canvas): name, aliases,
years, photo with credit, text, and its links. Selecting a spot draws arcs to
the spots it links to; clicking a link walks there. This stands in for the
primer page's concept map.

**Visual summaries in the panel (user, 2026-11-16: "a mix").** Pictures here
must carry facts (seductive-details finding); they are drawn from the pack,
not decoration.

- **Life strip (every person).** A mini timeline of life events (born,
  studied, main works, exile or prison, died, each with its year and place),
  a small map of their places, and a shelf of their works as book spines
  (a spine with its own spot opens it). Coloured by the room's style, plus one
  line-art motif per person picked from a small library (forest, four
  seasons, sea, camp fence, city, church, ship, village…), so each person
  looks like their writing. Data: `life[]`, `places[]`, `motif`.
- **Work illustration (many works).** One image per work spot in the house
  style (ink and gold on the night-museum dark), e.g. "Metai" as a ring of
  seasons. Generated by an image tool chosen in a first trial on 5 works
  (none is verified in this setup; Figma's image generator is untried); the
  tool's terms must allow publishing. The user approves every image before it
  ships; an unapproved image stays out (`illustration.approved`). The site
  works without any.
- **Plot explainer (works whose plot or characters matter, ~15–25).** A 2D
  step-through in the panel: a character map (who is who, how they relate),
  then the story in 4–8 beats, one caption at a time with the characters in
  it highlighted, optionally one illustration per beat (same approval rule).
  2D because it is far cheaper than a 3D scene per work and reads better on
  a phone. Data: `plot.characters[]`, `plot.beats[]`, `plot.sources[]`.
  Exception to "no new research": the primer names characters but rarely
  tells plots, so each explainer's plot is checked against at least one
  public source (Wikipedia, VLE), listed in `plot.sources`.

**Entering a room.** The panel shows the room intro and its "why / how"
questions, each answered in your head first and then revealed.

**Moving.** Desktop: WASD/arrows and drag to look, or click a spot or the
floor to walk there. Phone: tap to walk, drag to look. A 2D room list (and a
small overview map of the path) jumps to any room. Camera at a slightly
raised walking height; eased moves, no head bob; with "reduce motion" set,
moves jump instead of glide.

**Without WebGL**, and as a text view for anyone: the same content as a plain
page (rooms, spots, panels in order), drawn by JavaScript from `topic.json`.
Search engines are not a goal; a static pre-rendered version can come later.

## The test page (`site/test.html?topic=<slug>[&room=<n>]`)

Flat 2D, one question at a time, mixed within the chosen scope (a room or the
whole topic):

- **Recall:** think (or type), reveal, mark right or wrong yourself.
- **Kas tai?:** a photo, name the person, reveal, mark.
- **Order:** drag 4–5 spots into time order by `at` (or by birth year for
  people, said in the prompt), items at least a few years apart so the order
  is fair; or **era:** put a spot into its room.

A session ends with a score and the misses; each miss links to its spot in
the world (`world.html?topic=<slug>#<spot-id>`).

## Progress (browser storage)

Per topic: spots opened, room questions revealed, test results (last result
per question, scores per session). Shown in the room list ("12/25 opened")
and on the topic list. Storage keys use a neutral prefix (no `kik`); every
read and write is wrapped so a blocked or empty storage still renders.

## Site structure

```
site/
  index.html            topic list (from topics/index.json), progress per topic
  world.html            the 3D world for ?topic=
  test.html             the test page for ?topic=
  about.html            what this is, photo credits, licences, "content prepared with AI help"
  topics/index.json     slug, title, layout, counts
  topics/<slug>/topic.json, img/
  lib/                  vendored, pinned Three.js (with its licence); our modules
```

Lithuanian UI and content. Static files: any host serves it.

## Tech (builder's calls, stated)

- Three.js, vendored at a pinned version (no CDN at runtime: no third-party
  requests for visitors). Plain ES modules, no build step.
- Deno for tools and tests (`deno test`): Node isn't installed; Deno is.
- Look and feel isolated: colours, fonts and materials in one theme module
  (with an optional per-topic `theme`), and spot models in one factory per
  kind, so the look can change later without touching layout or content.

## Testing

- `deno test`: layout maths (piecewise scale, lanes, spreading), order-question
  picking, storage wrapper, validation rules, text folding.
- Validation of every pack in `site/topics/`, including the no-references scan
  of `site/`, runs in the test suite.
- A headless Chrome smoke test loads the world, the text view and the test
  page. Headless Chrome renders WebGL here through SwiftShader
  (`--use-angle=swiftshader --enable-unsafe-swiftshader`; mockups checked
  2026-11-16).

## First version

- The engine with the `time` layout, room styles, light by year, the test
  page, the topic list, the text view, the about page.
- Life strips and plot explainers (templates and the literature data).
- The Lithuanian literature pack (9 rooms; the primer's subjects; 73 photos).
- The image-tool trial on 5 works; the rest of the illustrations follow if
  the trial is good enough for the user.
- Pop and countries packs, and the `map` layout, come later.

## Known gaps (accepted)

- Facts carry no per-fact public sources (most cite the archive, which can't
  be shown). The about page says the content was prepared with AI help and
  may contain mistakes.
- Some portraits are stamps or likenesses; five literature identities rest on
  name and dates only (agent caveats, 2026-11-16).

## Left to the builder

Exact geometry, colours, fonts, model shapes, scale constants, camera speed,
field names, the overview map's look, and how the test picks its mix.
