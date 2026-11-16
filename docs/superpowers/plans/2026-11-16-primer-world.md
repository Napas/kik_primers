# Primer World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Lithuanian website where each topic is a 3D "night museum" laid along the topic's time axis (rooms = primer sections, spots = subjects, panels with life strips and plot explainers), plus a flat test page, with the Lithuanian literature topic as the first pack.

**Architecture:** Plain ES modules under `site/lib/`, no build step. Pure modules (text, layout, theme data, storage, progress, quiz, HTML renderers) have no DOM or Three.js imports and are unit-tested with `deno test`; Three.js code lives in `site/lib/scene/` and page wiring in `site/lib/pages/`, both covered by a headless Chrome smoke test. Content is one agent-written `topic.json` per topic, checked by `tools/rules.js`.

**Tech Stack:** Three.js 0.160.0 (vendored), Deno 2.9 (`deno test`, tools), headless Google Chrome with SwiftShader for smoke tests.

**Spec:** `docs/superpowers/specs/2026-11-16-primer-world-design.md`

**Execution order:** 1, 4, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 (Task 2's rules need Task 4's style and motif names).

## Global Constraints

- `site/` is the only deployed folder. Nothing in it may contain: `kik` (any case, substring), word forms of `laida` (whole words, folded), `LRT` (whole word, any case), the show's name (folded, flexible spaces), the qid pattern `\d{9,10}:\d+\.\d+`, `missed` (whole word). No allowlist.
- Never put frames, stills, videos, qids or the user's answers/misses anywhere in the repo.
- Never write into `~/www/kik`. Read only `kik_out/study/<slug>/{primer.md,extras.json,cards.json,people.json,people/}`.
- Test questions only from `primer.md` and `cards.json`.
- No npm, no Node, no build step. Three.js vendored at 0.160.0 with its LICENSE; no runtime CDN or other third-party request from `site/`.
- Lithuanian UI and content, UTF-8 with diacritics.
- Browser storage: key prefix `pw:`; every access in try/catch; pages work without storage.
- Look lives in `site/lib/theme.js` and `site/lib/scene/styles.js` / `site/lib/scene/spots.js`; layout and panel code hold no colours or shapes.
- Photos need author, licence and source; missing any → not imported.
- Commons requests use User-Agent `primer-world/1.0 (static site build)`.
- Writes to `~/www/kik_primers` and Chrome runs need the Claude Code sandbox off (session starts in `~/www/kik`).
- TDD for code; content tasks are gated by `deno task validate`. Never `--no-verify`.
- Before every push: refactoring-specialist → text-simplificator (not on specs/plans) → tests-runner + code-reviewer + architecture-reviewer in parallel, until clean.

## Review Focus

1. **Unknown or missing `?topic=`** (typo, old link, `../`): a short Lithuanian message and a link to the topic list, no exception. → Task 8 test.
2. **Storage blocked** (private mode, `localStorage` throws): every page renders; progress just isn't kept. → Task 5 test, Task 11 smoke with `?nostore=1`.
3. **Hash naming a spot that no longer exists** (`#old-id`): the world opens at the start, no panel, no error. → Task 11 smoke test.
4. **Text with `<`, `&`, quotes and „“** in any pack field: shown as text, never as markup. → Task 6 test.
5. **Sparse spots**: a person with no photo, no `life`, no works; a work with no plot or illustration: panel renders without empty headings. → Task 6 test.

---

### Task 1: Repo bootstrap and text utilities

**Files:**
- Create: `.gitignore`, `deno.json`, `site/lib/text.js`, `site/lib/three/three.module.min.js`, `site/lib/three/LICENSE`, `tests/text_test.js`

**Interfaces:**
- Produces: `fold(s: string): string` (lowercase, NFD, strip combining marks, collapse whitespace); `esc(s: unknown): string` (HTML-escape `& < > " '`; null/undefined → `''`); `isSlug(s: string): boolean` (`/^[a-z0-9]+(-[a-z0-9]+)*$/`).

- [ ] **Step 1: Initial commit on `main` — STOP and ask the user** to approve pushing a first commit containing only `.gitignore` (`.superpowers/`, `.DS_Store`) to `main` (the repo has no commits, so a PR needs a base). After approval: commit, push, then `git switch -c primer-world`.
- [ ] **Step 2: `deno.json`** with tasks `test` = `deno test -A tests/`, `validate` = `deno run -A tools/validate.ts site`, `serve` = `deno run -A jsr:@std/http/file-server site`.
- [ ] **Step 3: Vendor Three.js** from `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js` and `https://cdn.jsdelivr.net/npm/three@0.160.0/LICENSE`. Verify: file starts with the Three.js licence header comment, 670,681 bytes. It is scanned like everything else in `site/` (checked 2026-11-16: no forbidden term); a future version that trips the scan is not vendored.
- [ ] **Step 4: Write the failing tests**

```js
Deno.test("fold strips Lithuanian diacritics and case", () =>
  assertEquals(fold("  Žemaitė  ĄČĘĖĮŠŲŪŽ "), "zemaite aceeisuuz"));
Deno.test("esc escapes markup and quotes", () =>
  assertEquals(esc(`<a href="x">&'„Metai“`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;„Metai“"));
Deno.test("esc of null is empty", () => assertEquals(esc(null), ""));
Deno.test("isSlug", () => { assert(isSlug("lietuviu-literatura")); assert(!isSlug("../x")); assert(!isSlug("A")); });
```
- [ ] **Step 5: Run** `deno task test` → FAIL (module missing). **Step 6: Implement** `site/lib/text.js`. **Step 7: Run** → PASS.
- [ ] **Step 8: Commit** `Bootstrap: Deno tasks, vendored Three.js 0.160.0, text utilities` (also adds `CLAUDE.md`, the spec and this plan).

### Task 2: Pack rules and the validate tool

**Files:**
- Create: `tools/rules.js`, `tools/validate.ts`, `tests/rules_test.js`, `tests/fixtures/mini/topic.json`, `tests/fixtures/mini/primer.md`, `tests/site_test.js`

**Interfaces:**
- Consumes: `fold`, `isSlug` (Task 1); `STYLE_NAMES`, `MOTIFS` (Task 4).
- Produces: `checkPack(pack): string[]` (problems, empty = ok); `checkCoverage(pack, primerMd: string): string[]`; `scanSite(files: {path: string, text: string}[]): string[]`; `boldSpans(md: string): string[]`; `packText(pack): string` (every string value in the pack, folded, joined with `\n`).
- `tools/validate.ts site [--primer <slug>=<path>]...`: runs `checkPack` on every `site/topics/*/topic.json`, `checkCoverage` for each given primer, `scanSite` over every file under `site/` (binary files: names only); prints problems; exit 1 if any.

Pack schema enforced by `checkPack` (spec "Content pack" plus these builder decisions):
- top: `version` (1), `slug` (isSlug, equals folder name — checked by validate.ts), `title`, `intro`, `layout` ∈ `time|map`, `rooms[]`, `spots[]`, `questions[]`, `skipped[]` (`{span, reason}`).
- room: `n` (unique int), `title`, `intro`, `why[]` (`{q, a}`), `span` (`[from, to]` ints, from ≤ to, or `null`), `style` ∈ `STYLE_NAMES`.
- spot: `id` (unique ASCII slug), `room` (an existing `n`), `kind` ∈ `person|work|group|event|place|thing`, `name`, `aliases[]`, `years` (`null`, `[y]` or `[from, to|null]`), `at` (int, inside its room's span; required when the room has a span), optional `aside: true` (the spot sits in this room for a connection, not because it belongs to the room's era, e.g. a singer linked to an interwar poet; its `at` may be a placement year), `text` (non-empty), `links[]` (`{to, label}`, `to` resolves, not self), optional `wikidata` (`/^Q\d+$/`), optional `by` (a person spot id; works only), optional `photo` (`file`, `author`, `license`, `source_url` all non-empty; `license_url` optional; `author` may be `nežinomas` only when `license` is public domain or CC0), person-only optional `life[]` (`{year, label, place?}`, years ascending), `places[]` (`{name, lat, lon}` numbers in range), `motif` ∈ `MOTIFS`; work-only optional `illustration` (`{file, approved: boolean}`), `plot` (`characters[]` `{name, role}`, `relations[]` `{a, b, label}` naming characters, `beats[]` 4–8 of `{text, characters[]}` naming characters, optional `image`, `sources[]` ≥ 1 URL starting `https://`).
- question: `id` (unique slug), `q`, `a`, `room` (existing `n`), optional `spot` (existing id).

- [ ] **Step 1: Fixture** `tests/fixtures/mini/`: a 2-room pack (rooms 1 `[1500,1600]` style `print-shop`, 2 `[1700,1800]` style `brick-church`), 3 spots (a person with photo and life, a work with a valid plot, an event), 2 questions; a `primer.md` with `## 1.` / `## 2.` and bold spans all present in the pack.
- [ ] **Step 2: Failing tests** in `tests/rules_test.js`:

```js
Deno.test("mini pack is valid", () => assertEquals(checkPack(mini()), []));
Deno.test("duplicate spot id", () => assertMatch(checkPack(withDupSpot()).join("\n"), /duplicate spot id/));
Deno.test("at outside room span", () => assertMatch(checkPack(withAt(1650)).join("\n"), /at 1650 outside room 1/));
Deno.test("link to unknown spot", () => assertMatch(checkPack(withLink("nope")).join("\n"), /unknown spot nope/));
Deno.test("unknown style", () => assertMatch(checkPack(withStyle("castle")).join("\n"), /style castle/));
Deno.test("plot with 3 beats", () => assertMatch(checkPack(withBeats(3)).join("\n"), /4–8 beats/));
Deno.test("photo without licence", () => assertMatch(checkPack(withPhoto({license: ""})).join("\n"), /photo/));
Deno.test("coverage finds missing bold span", () =>
  assertEquals(checkCoverage(mini(), "## 1. A\n**Nėra tokio**"), ["not in pack: Nėra tokio"]));
Deno.test("coverage folds case and diacritics", () =>
  assertEquals(checkCoverage(packWithText("Žemaitė"), "**ZEMAITE**"), []));
Deno.test("skipped span passes coverage", () => assertEquals(checkCoverage(withSkipped("X"), "**X**"), []));
Deno.test("scan flags each forbidden term", () => {
  for (const t of ["kik", "Kikas", "laidoje", "LAIDOS", "LRT", "lrt", "missed", "1234567890:12.34"])
    assertNotEquals(scanSite([{ path: "a.html", text: `x ${t} y` }]), [], t);
  assertNotEquals(scanSite([{ path: "kik.png", text: "" }]), []);
});
Deno.test("scan passes ordinary words", () =>
  assertEquals(scanSite([{ path: "a.html", text: "palaidotas perlaidoti leidimai dismissed" }]), []));
```
Also a test that the show's name in three spellings (with diacritics, without, extra spaces) is flagged; the name lives only in `tools/rules.js`.
- [ ] **Step 3: Run** `deno task test` → FAIL. **Step 4: Implement** `tools/rules.js`, then `tools/validate.ts`. `boldSpans` takes `**…**` contents, strips trailing punctuation `.,:;?!`.
- [ ] **Step 5: `tests/site_test.js`**: runs `validate.ts site` as a subprocess and asserts exit 0 (it scans whatever `site/` holds; at this point `site/lib`). **Step 6: Run** → PASS.
- [ ] **Step 7: Commit** `Pack rules, coverage check, site scan and validate tool`.

### Task 3: Time layout

**Files:**
- Create: `site/lib/layout.js`, `tests/layout_test.js`

**Interfaces:**
- Consumes: pack shape (Task 2).
- Produces: `layoutTime(pack, opts?): Layout` where `opts = {perSpot: 2.2, minRoom: 10, gap: 1.6, rows: 3, rowGap: 1.4, laneGap: 7, annexGap: 4, gapLen: 3}` (defaults) and
  `Layout = {xOfYear(y: number): number, rooms: [{n, x0, x1, lane, z0, z1}], spots: [{id, x, z, row}], ticks: [{year, x}], length}`.

Algorithm (decided here):
- Lanes: rooms with spans sorted by `span[0]`, then `n`; each goes into the lowest lane whose last room ends at or before its start (`prev.span[1] <= span[0]`, so rooms sharing a boundary year stay in one lane); lane `k` sits at `z = -k * laneGap`.
- Target length `L_r = max(minRoom, perSpot * spots_r / rows)`.
- Breakpoints = sorted unique span ends; each segment's length = max over rooms covering it of `L_r * segYears / roomYears`; a segment no room covers (a gap between spans) gets a fixed `gapLen` (default 3); `xOfYear` is piecewise linear over segments, clamped at the ends.
- Spots in a room sorted by `at`, then id; each goes into the row whose last x is smallest; `x = max(xOfYear(at), lastXInRow + gap)`. If any spot ends past the room's `x1`, multiply that room's `L_r` by 1.25 and recompute (at most 8 rounds).
- Annex rooms (`span: null`) follow the end in `n` order on lane 0, `annexGap` apart, length `L_r`; their spots sit evenly spaced.
- Ticks every 50 years from the first span start rounded down to 50, up to the last span end.

- [ ] **Step 1: Failing tests**

```js
Deno.test("non-overlapping rooms share lane 0 and keep order", () => { const L = layoutTime(fx2Rooms()); assertEquals(L.rooms.map(r => r.lane), [0, 0]); assert(L.rooms[0].x1 <= L.rooms[1].x0); });
Deno.test("rooms sharing a boundary year stay in one lane", () => assertEquals(layoutTime(fxTouching(1918)).rooms.map(r => r.lane), [0, 0]));
Deno.test("an uncovered gap gets gapLen", () => { const L = layoutTime(fx2Rooms()); assertAlmostEquals(L.xOfYear(1700) - L.xOfYear(1600), 3); });
Deno.test("overlapping spans run in parallel lanes, aligned by year", () => { const L = layoutTime(fxExileSoviet()); assertNotEquals(L.rooms[0].lane, L.rooms[1].lane); assertAlmostEquals(spotX(L, "exile-1960"), spotX(L, "soviet-1960")); assertAlmostEquals(L.rooms[0].x0, L.rooms[1].x0); });
Deno.test("an uncrowded spot stands exactly at its year", () => { const L = layoutTime(fxOneSpot(1743)); assertAlmostEquals(spotX(L, "a"), L.xOfYear(1743)); });
Deno.test("crowded spots never overlap within a row and stay inside the room", () => { const L = layoutTime(fxCrowd(30, 1950)); noOverlap(L, 1.6); allInside(L); });
Deno.test("a sparse century is not longer than a crowded one", () => { const L = layoutTime(fxSparseThenDense()); assert(len(L, 1) < len(L, 2)); });
Deno.test("annex comes after the last room", () => { const L = layoutTime(fxAnnex()); assert(roomOf(L, 3).x0 > roomOf(L, 2).x1); });
Deno.test("ticks every 50 years, none stacked", () => { const t = layoutTime(fx2Rooms()).ticks; assertEquals(t.map(t => t.year), [1500, 1550, 1600, 1650, 1700, 1750, 1800]); for (let i = 1; i < t.length; i++) assert(t[i].x > t[i - 1].x); });
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `Time layout: lanes, piecewise year scale, rows, annexes`.

### Task 4: Theme data, motifs and basemap

**Files:**
- Create: `site/lib/theme.js`, `site/lib/motifs.js`, `site/lib/basemap.js`, `tools/make-basemap.ts`, `tests/theme_test.js`

**Interfaces:**
- Produces (`theme.js`, no Three.js import): `COLORS = {bg: 0x0e1726, floor: 0x141e33, path: 0x26355a, gold: 0xd9b25f, text: '#e9e4d8', panel: '#0b1220'}`; `STYLE_NAMES = ['print-shop','brick-church','log-chapel','barn','farmstead','kaunas-modern','dp-barrack','concrete','glass']`; `LIGHT_BANDS = [{until: 1799, kind: 'candle', color: 0xffb36b, intensity: 0.8}, {until: 1899, kind: 'lantern', color: 0xffc77a, intensity: 1.0}, {until: 1944, kind: 'bulb', color: 0xfff0c8, intensity: 1.2}, {until: 1989, kind: 'fluorescent', color: 0xd8f0ff, intensity: 1.3}, {until: Infinity, kind: 'daylight', color: 0xcfe4ff, intensity: 1.6}]`; `lightFor(year: number) → band`.
- `motifs.js`: `MOTIFS: Record<string, string>` (name → SVG inner markup, 64×64 viewBox, stroke only, `currentColor`) for `forest, seasons, sea, fence, city, church, ship, village, book, pen, mountains, river`; `motifSvg(name, size): string`.
- `basemap.js`: `BASEMAP = {box: {lonMin: -10, lonMax: 45, latMin: 35, latMax: 71}, width: 550, height: 360, path: string}`; `project(lat, lon) → {x, y, inside: boolean}` (equirectangular in the box).
- `tools/make-basemap.ts`: reads `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json` (Natural Earth, public domain), converts TopoJSON arcs for countries intersecting the box to one SVG path, rounds to 1 decimal, writes `site/lib/basemap.js`. Run once; output committed.

- [ ] **Step 1: Failing tests**: `lightFor(1547).kind === 'candle'`, `lightFor(1800).kind === 'lantern'`, `lightFor(1944).kind === 'bulb'`, `lightFor(1945).kind === 'fluorescent'`, `lightFor(1990).kind === 'daylight'`; every `MOTIFS` value parses as SVG content (contains `<path` or `<circle`/`<line`, no `<script`); `project(54.69, 25.28)` (Vilnius) is inside with x in (0, 550); `project(40.71, -74.0)` (New York) has `inside: false`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** theme and motifs (draw simple line art by hand); write and run `make-basemap.ts` (network `cdn.jsdelivr.net`). **Step 4: Run** → PASS. **Step 5: Commit** `Theme data, light bands, motif library, Europe basemap`.

### Task 5: Storage and progress

**Files:**
- Create: `site/lib/storage.js`, `site/lib/progress.js`, `tests/progress_test.js`

**Interfaces:**
- Produces: `makeStore(backend?: Storage|null) → {get(key, fallback), set(key, value)}` (JSON values; key gets prefix `pw:`; any throw → in-memory map for the rest of the page's life); `makeProgress(store) → {openSpot(slug, id), opened(slug): Set<string>, revealWhy(slug, room, i), revealed(slug): Set<string>, answer(slug, qid, right: boolean), lastAnswers(slug): Record<string, boolean>, session(slug, {scope, right, total}), sessions(slug): {scope, right, total, at}[]}`; sessions keep the last 20.

- [ ] **Step 1: Failing tests**: round-trip with a fake Storage; a backend whose `getItem`/`setItem` throw still returns fallbacks and remembers values in memory; keys written start with `pw:`; `sessions` caps at 20 newest; opening the same spot twice counts once.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `Browser storage wrapper and progress model`.

### Task 6: Panel and text-view renderers (pure HTML strings)

**Files:**
- Create: `site/lib/render.js`, `tests/render_test.js`

**Interfaces:**
- Consumes: `esc` (Task 1), `motifSvg` (Task 4), `BASEMAP`, `project` (Task 4).
- Produces: `spotPanel(spot, pack, {opened?: boolean}) → string`; `roomPanel(room, pack, revealed: Set<string>) → string`; `lifeStrip(spot, pack) → string`; `plotExplainer(plot, {step: number}) → string`; `textView(pack) → string`; `worksOf(pack, personId) → spot[]` (works with `by === personId`, by `at`). Every string from the pack goes through `esc`. Elements carry `data-spot="<id>"` for links and spines, `data-step` for plot navigation, `data-reveal="<room>:<i>"` for room questions.

Content of each (builder chooses markup and CSS classes):
- `spotPanel`: name, aliases, years, photo with credit line `Nuotrauka: <author>, <license>` linking `source_url`; approved illustration only; text paragraphs; life strip for people; plot explainer for works with a plot; links list. Sections with no data are omitted entirely.
- `lifeStrip`: events on a horizontal track at `(year - first) / (last - first)`; inline SVG basemap with a dot per inside place and a line "Toliau: <names>" for places outside; works as spines; the motif top right.
- `plotExplainer`: character map (characters as labelled nodes on a circle, relations as labelled lines, the current beat's characters highlighted), the beat text for `step`, "Atgal"/"Toliau" controls, `sources` as small links.
- `textView`: intro, then per room its title, intro, why Q&A (in `<details>`), then each spot's `spotPanel` in layout order.

- [ ] **Step 1: Failing tests**

```js
Deno.test("pack text is escaped everywhere", () => { const h = spotPanel(spotWith({ name: `<b>X</b> & „Y“`, text: "<script>1</script>" }), pack()); assert(!h.includes("<b>X") && !h.includes("<script>")); assert(h.includes("&lt;b&gt;X&lt;/b&gt; &amp; „Y“")); });
Deno.test("bare person has no empty sections", () => { const h = spotPanel(bare("person"), pack()); for (const w of ["Nuotrauka", "Ryšiai", "Kūriniai", "Gyvenimas"]) assert(!h.includes(w), w); });
Deno.test("unapproved illustration is not shown", () => assert(!spotPanel(work({ illustration: { file: "x.png", approved: false } }), pack()).includes("x.png")));
Deno.test("life strip lists places outside the map", () => assertMatch(lifeStrip(person({ places: [{ name: "Niujorkas", lat: 40.7, lon: -74 }] }), pack()), /Toliau: Niujorkas/));
Deno.test("plot step highlights that beat's characters", () => { const h = plotExplainer(plot(), { step: 1 }); assertMatch(h, /data-char="Katrė"[^>]*class="[^"]*on/); });
Deno.test("works shelf links to work spots", () => assertMatch(lifeStrip(donelaitis(), packWithMetai()), /data-spot="metai"/));
Deno.test("text view keeps layout order of rooms", () => assert(textView(pack()).indexOf("Mažoji Lietuva") < textView(pack()).indexOf("Žemaičiai")));
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `site/lib/render.js` and its CSS in `site/lib/site.css` (night-museum colours from `COLORS`, panel as right column ≥ 768 px wide, bottom sheet below). **Step 4: Run** → PASS. **Step 5: Commit** `Panel, life strip, plot explainer and text view renderers`.

### Task 7: Test session builder

**Files:**
- Create: `site/lib/quiz.js`, `tests/quiz_test.js`

**Interfaces:**
- Produces: `buildSession(pack, {room?: number, size = 20, rng = Math.random}) → Item[]`, `Item = {type: 'recall'|'face'|'order'|'era', ...}`: recall `{q, a, qid, spot?}`; face `{spot}` (people with `photo`); order `{spots: id[] (shuffled), answer: id[], by: 'born'|'year'}` (people by birth year `years[0]`; works and events by `years[0]`, never by `at`, which is a placement choice); era `{spot, rooms: n[] (3–4 options incl. the right one), answer: n}`. Spots with `aside: true` or without `years` never appear in order or era items. `pickOrder(spots, {n, minGap = 5, by}, rng) → id[]|null` (null when fewer than `n` spots at least `minGap` years apart).
- Mix per session: 60% recall, 20% face, 20% order/era (alternating); a type with no candidates gives its share to recall; never more items than candidates; no repeats in one session. `room` set → only that room's questions and spots, and no era items.

- [ ] **Step 1: Failing tests**: seeded rng gives the same session twice; mix counts for size 20 are 12/4/4; a pack without photos gives 0 face items and 16 recall; `pickOrder` returns ids whose years are strictly increasing with gaps ≥ 5 and `null` for 3 spots in one year; room scope contains only that room's items; `by: 'born'` uses `years[0]` of people; an `aside` spot never appears in order or era items.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (seeded rng helper `mulberry32(seed)` exported for tests). **Step 4: Run** → PASS. **Step 5: Commit** `Test session builder`.

### Task 8: Topic list, about and test pages; index tool

**Files:**
- Create: `site/index.html`, `site/about.html`, `site/test.html`, `site/lib/pages/common.js`, `site/lib/pages/index.js`, `site/lib/pages/about.js`, `site/lib/pages/test.js`, `tools/build-index.ts`, `tests/pages_test.js`

**Interfaces:**
- Consumes: Tasks 1, 5, 6, 7.
- Produces: `site/topics/index.json` = `{topics: [{slug, title, layout, rooms, spots, questions}]}` written by `tools/build-index.ts site`; `common.js`: `topicFromUrl(url: URL, index) → {slug}|{error: string}` (error unless `isSlug` and listed), `loadIndex()`, `loadPack(slug)`, `markReady(kind, counts)` (sets `document.documentElement.dataset.ready = kind` and `data-*` counts), `showError(msg)` (sets `dataset.error`). Every page wraps its main in try/catch → `showError`.
- Pages: index lists topics with "Keliauti" (world) and "Testas" links and progress (`opened/spots`, last score); about lists photo credits from all packs, the Three.js licence, and "Turinys parengtas padedant dirbtiniam intelektui; jame gali būti klaidų."; test page runs a `buildSession`, one item at a time: recall/face = "Rodyti atsakymą" then "Žinojau"/"Nežinojau"; order = drag (pointer events; also up/down buttons for keyboard and phone); era = buttons; end screen with score and misses linking `world.html?topic=<slug>#<spot>`; results go to progress.

- [ ] **Step 1: Failing tests** (`tests/pages_test.js`, pure parts): `topicFromUrl(new URL("x:/test.html?topic=../etc"), idx)` → error; unknown slug → error; missing param → error; listed slug → `{slug}`. `build-index.ts` on `tests/fixtures/` writes counts `rooms: 2, spots: 3, questions: 2`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** pure parts, then the HTML pages and DOM wiring (import map `"three": "./lib/three/three.module.min.js"` only on world.html). **Step 4: Run** → PASS. **Step 5: Commit** `Topic list, about and test pages; topics index tool`.

### Task 9: World scene skeleton and smoke test

**Files:**
- Create: `site/world.html`, `site/lib/pages/world.js`, `site/lib/scene/world.js`, `site/lib/scene/spots.js`, `site/lib/scene/labels.js`, `site/lib/scene/controls.js`, `tests/smoke_test.js`

**Interfaces:**
- Consumes: `layoutTime` (Task 3), `COLORS` (Task 4), `common.js` (Task 8).
- Produces: `buildWorld(THREE, pack, layout, opts) → {scene, camera, spotMeshes: Map<id, Object3D>, roomGroups: Map<n, Group>, update(dt)}` (rooms as plain walls for now; styles come in Task 10); `makeSpot(THREE, spot, COLORS) → Object3D` per kind (person plinth + frame + photo texture or initials; work book; group banner; event stone with year; place signpost; thing plaque); `makeLabel(THREE, text) → Sprite`; `makeControls(camera, dom, {floorY, onPick(id|null, point)}) → {walkTo(vec3), lookAt(vec3), update(dt), dispose()}`: WASD/arrows, drag to look (pitch clamped ±35°), click/tap picks a spot or floor point, eased moves (≤ 1.5 s), `matchMedia('(prefers-reduced-motion: reduce)')` → jump.
- World page: no WebGL (`!canvas.getContext('webgl2') && !getContext('webgl')`) or `?view=text` → render `textView` instead and `markReady('text', …)`; else `markReady('world', {rooms, spots})` after the first frame.
- `tests/smoke_test.js` (runs only with `PRIMER_CHROME=1`): copies `site/` to a temp dir, adds the mini pack as `topics/mini-test/` and an `index.json` listing it, serves that dir with `Deno.serve` on a free port, runs Chrome with a fresh temp `--user-data-dir` (removed after) and `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=8000 --window-size=W,H --dump-dom <url>` and asserts on `data-ready`/`data-error` in the DOM.

- [ ] **Step 1: Failing smoke tests** (on the temp copy): world → `data-ready="world"`, `data-rooms="2"`, `data-spots="3"`, no `data-error`; `?view=text` → `data-ready="text"`; test page → `data-ready="test"`; index → `data-ready="index"`; `?topic=nope` on world and test → `data-error`; window 390×844 → world still ready.
- [ ] **Step 2: Run** `PRIMER_CHROME=1 deno task test` (unsandboxed) → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `World scene skeleton, controls, text fallback; headless smoke tests`.

### Task 10: Room styles and light by year

**Files:**
- Create: `site/lib/scene/styles.js`, `site/lib/scene/light.js`
- Modify: `site/lib/scene/world.js`

**Interfaces:**
- Consumes: `STYLE_NAMES`, `lightFor`, `COLORS` (Task 4); room geometry from `layoutTime`.
- Produces: `STYLES: Record<name, (THREE, {x0, x1, z0, z1}, COLORS) → Group>` with exactly the `STYLE_NAMES` keys; each builds walls, floor, the signature shape over the back wall, window light and one landmark per the spec table (print-shop: stone vault + printing press; brick-church: brick, stepped gable, warm lancets + pulpit; log-chapel: logs, gable + koplytstulpis, cool moonlight; barn: planks, lantern + smuggler's cart with books; farmstead: whitewash + well sweep; kaunas-modern: rounded corners, tall glass + radio; dp-barrack: boards + suitcases; concrete: panels, fluorescent + typewriter; glass: glass, light timber + bookshelf). Shared part helpers inside the file; textures drawn on canvases (no image files). `addPathLights(THREE, scene, layout) → void`: one light every ~6 m along each lane, colour/intensity from `lightFor(yearAt(x))`, shadows only on spot spotlights.

- [ ] **Step 1: Failing tests**: `styles.js` exports `STYLE_KEYS = Object.keys(STYLES)` and imports nothing from Three.js at module top (builders take `THREE` as an argument), so `tests/theme_test.js` asserts `STYLE_KEYS` equals `STYLE_NAMES`. Smoke test (Task 9 file): a pack using all 9 styles renders `data-ready="world"` with no `data-error`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS; take a 1400×800 screenshot of each style (Chrome `--screenshot`) and look at it. **Step 5: Commit** `Nine room styles and light that follows the year`.

### Task 11: Interaction: panels, arcs, lifespan, navigation, progress

**Files:**
- Modify: `site/lib/pages/world.js`, `site/lib/scene/world.js`
- Create: `site/lib/scene/arcs.js`, `site/lib/pages/overview.js`

**Interfaces:**
- Consumes: `spotPanel`, `roomPanel`, `plotExplainer` (Task 6); `makeProgress` (Task 5); `buildWorld`, `makeControls` (Task 9).
- Produces: `drawLinks(THREE, scene, fromPos, toPositions[]) → Group` (gold tube arcs, removed on deselect); `drawLifespan(THREE, scene, layout, years) → Mesh` (gold bar on the path, lane 0 side); `overview(dom, layout, {onJump(n)})` (2D strip of rooms with position marker and "atidaryta x/y" per room).
- Behaviour: picking a spot walks to it, opens its panel, draws its links and (person) lifespan, records `openSpot`; panel links/spines walk to that spot; entering a room's x-range opens its room panel once per visit (why questions reveal one by one, recorded); hash `#<id>` on load walks to that spot, unknown id → stay at the start; Esc closes the panel; labels show within 12 m or on hover; photo textures load within 30 m.

- [ ] **Step 1: Failing smoke tests**: `world.html?topic=mini-test#<person-id>` → `data-open="<person-id>"` on `<html>` after load; `#no-such` → ready, no `data-open`, no `data-error`; `?nostore=1` (makes `makeStore` use a backend that throws on every call) → world, test and index pages still ready, no `data-error`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `World interaction: panels, link arcs, lifespan, overview, progress`.

### Task 12: Photo import tool

**Files:**
- Create: `tools/import-photos.ts`, `tools/commons.js`, `tests/commons_test.js`

**Interfaces:**
- Produces: `creditsFrom(extmetadata) → {author, license, license_url?}|null` (strips HTML from `Artist`, uses `LicenseShortName`, `LicenseUrl`; no licence → null; no author → `nežinomas` when the licence is public domain or CC0, else null); `--dry-run` prints per photo the credits it would set and which it would drop, writing nothing; CLI `import-photos.ts <kik-topic-dir> site/topics/<slug>`: for each pack spot with `wikidata`, looks up `people/faces.json[Q]` (`file`, `commons`), copies `people/<file>` to `img/<spot-id>.<ext>`, queries `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&titles=File:<commons>` (1 s between requests), sets `spot.photo = {file: "img/<id>.<ext>", author, license, license_url, source_url: descriptionurl}`; no credits → no photo, listed; rewrites `topic.json` with 2-space JSON, key order kept.

- [ ] **Step 1: Failing tests** on recorded `extmetadata` samples (CC BY-SA with HTML author link; public domain without `LicenseUrl`; public domain without `Artist` → `nežinomas`; CC BY-SA without `Artist` → null).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `Photo import with Commons credits`.

### Task 13: Agent guide for topic packs

**Files:**
- Create: `docs/TOPIC.md`

Content (decisions the agent must follow):
- Inputs read-only from `~/www/kik/kik_out/study/<slug>/`; never read `input.md`, `facts/`, `user_data/`.
- Rooms = `## N.` sections, same numbers and titles; `intro` = the section's opening paragraph; `why` = its bold question lines with their answers; `style` from the spec's table; `span` from the section title or the `extras.json` timeline range.
- Spots = every bold subject line and every person in `people.json` (with `wikidata`); works, groups, prizes and events that the primer treats as subjects; `text` = the primer's sentences about it, reworded only to drop show references ("laidoje…", "klausiama…") and quiz scaffolding that makes no sense alone; keep "ne X" clarifications.
- `at`: person = year of debut or main work inside the room's span; a spot that sits in a room only for a connection gets `aside: true` and a placement year; work/event = its year.
- `links` from `extras.json` `concept_map.edges` and primer cross-references; `by` for works with an author spot.
- `questions`: imported by `tools/import-cards.ts` (Task 14), never retyped; ids are new slugs (never `missed:` or qids); `missed` kind cards become ordinary questions; reword fronts only where they read as TV phrasing; `room`/`spot` set from the card's subject.
- `life` 3–7 events from the primer (born, studies, key posts, main works, exile/prison, death) with places; `places` with coordinates rounded to 2 decimals, taken from Wikidata (P625 of the place item) where the place is known there, else from the agent's knowledge, marked `approx: true`; `motif` from the library list.
- `plot` for 15–25 works whose plot or characters the primer or cards mention; 4–8 beats; each plot checked against at least one public page (lt.wikipedia.org or vle.lt), listed in `sources`.
- Run `deno task validate --primer <slug>=<path>` until clean; list deliberate omissions in `skipped` with reasons.

- [ ] **Step 1: Write it.** **Step 2: Commit** `Agent guide for topic packs`.

### Task 14: Literature pack — rooms, spots, questions

**Files:**
- Create: `tools/import-cards.ts`, `tests/import_cards_test.js`, `site/topics/lietuviu-literatura/topic.json`

**Interfaces:**
- Produces: `cardsToQuestions(cards, spots, rooms) → {questions, unmatched: string[]}`: one question per card, `q` = front, `a` = back unchanged, new id `<spot-or-room>-<n>` (never the card id), `room`/`spot` from the card's `subject` matched to a spot name or alias (folded); a card whose subject matches nothing goes to its best room by the primer section the subject appears in and is listed in `unmatched`. CLI `import-cards.ts <kik-topic-dir> site/topics/<slug>` reads the pack's spots/rooms, writes `questions`, prints the count and `unmatched`.

- [ ] **Step 1: Failing tests**: 3 fake cards (fact, why, `missed:<qid>`-style id) → 3 questions, none with a `missed` or digit-colon id, text unchanged; subject matched via an alias; unknown subject listed in `unmatched`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS.
- [ ] **Step 5:** Following `docs/TOPIC.md`, write the pack room by room: room 1 with its spots, validate (`deno task validate`, coverage not yet passed), then room 2, and so on to room 9.
- [ ] **Step 6:** `deno run -A tools/import-cards.ts ~/www/kik/kik_out/study/lietuviu-literatura site/topics/lietuviu-literatura`. Expected: 393 questions. Then reword only fronts that read as TV phrasing, and list every reworded id in the commit message.
- [ ] **Step 7: Validate** `deno task validate --primer lietuviu-literatura=$HOME/www/kik/kik_out/study/lietuviu-literatura/primer.md` → exit 0 (coverage of all 242 distinct bold spans; no forbidden terms).
- [ ] **Step 8: Commit** `Literature pack: rooms, spots, questions` (with the reworded ids).

### Task 15: Literature pack — life strips and plots

**Files:**
- Modify: `site/topics/lietuviu-literatura/topic.json`

- [ ] **Step 1:** Add `life`, `places`, `motif` for every person spot.
- [ ] **Step 2:** Add `plot` (with `sources`) for 15–25 works; WebFetch only lt.wikipedia.org / vle.lt pages for those works.
- [ ] **Step 3: Validate** as in Task 14 → exit 0. **Step 4: Commit** `Literature pack: life strips and plot explainers`.

### Task 16: Photos, index, full check

**Files:**
- Modify: `site/topics/lietuviu-literatura/topic.json`, `site/topics/lietuviu-literatura/img/*`, `site/topics/index.json`

- [ ] **Step 1:** Dry run first: `deno run -A tools/import-photos.ts --dry-run ~/www/kik/kik_out/study/lietuviu-literatura site/topics/lietuviu-literatura` (unsandboxed; network commons.wikimedia.org). If more than 5 of the 73 would drop, STOP and show the user the list. Then the real run. Expected: up to 73 photos; the run lists any without credits.
- [ ] **Step 2:** `deno run -A tools/build-index.ts site`.
- [ ] **Step 3:** `deno task validate --primer …` → exit 0; `PRIMER_CHROME=1 deno task test` → all pass, including the real pack at 1400×800 and 390×844.
- [ ] **Step 4:** Screenshots of rooms 1, 2, 3, 6, 8 and a person panel, a work with a plot, the test page and the text view; look at each; fix what is unreadable or overlapping.
- [ ] **Step 5: Commit** `Literature photos and topics index`.

### Task 17: Image-tool trial (5 works) — user gate

**Files:**
- Create: `site/topics/lietuviu-literatura/img/works/<id>.png` (5), `docs/illustrations.md` (tool, prompt template, terms checked)
- Modify: `topic.json` (`illustration: {file, approved: false}`)

- [ ] **Step 1:** Try Figma's `generate_image` (load its schema with ToolSearch) for "Metai", "Anykščių šilelis", "Altorių šešėly", "Balta drobulė", "Dievų miškas", with one house-style prompt: ink line art and gold on a dark navy ground, no faces, no text. If it is unavailable or its terms don't allow publishing, write that in `docs/illustrations.md` and stop the task.
- [ ] **Step 2: STOP and show the user the 5 images.** Set `approved: true` only for the ones they approve; record the decision on doing the rest.
- [ ] **Step 3: Commit** `Illustration trial: 5 works`.

### Task 18: Study kit publishing rule (separate PR in `~/www/kik`)

**Files:**
- Modify: `~/www/kik/CLAUDE.md` (Domain facts, "LRT content" bullet; Code style, Git bullet)

- [ ] **Step 1:** Branch `publishing-rule` in a worktree of `~/www/kik`. Add to the "LRT content" bullet: "Exception (user, 2026-11-16): primer facts, the primer's questions and card questions and answers (verbatim or reworded) may be published through the primer world site (`~/www/kik_primers`, its `site/` folder), without qids, any mention of the show, LRT or this kit, and without the user's answers or which questions they missed. Frames, stills, videos and the dataset stay private."
- [ ] **Step 2:** Review chain (refactoring-specialist, text-simplificator, then tests-runner + code-reviewer + architecture-reviewer), commit, push, PR (description through text-simplificator), show the URL.

### Task 19: Review and PR for `kik_primers`

- [ ] **Step 1:** `deno task test`, `PRIMER_CHROME=1 deno task test`, `deno task validate --primer …` → all pass; paste counts.
- [ ] **Step 1b:** Update `CLAUDE.md`: drop "design stage", make the layout and commands match what was built.
- [ ] **Step 2:** Review chain as in Global Constraints; fix and re-run until clean.
- [ ] **Step 3:** Push `primer-world`, open the PR against `main` (description through text-simplificator), show the URL.
