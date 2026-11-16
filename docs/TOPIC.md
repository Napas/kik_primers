# Writing a topic pack

How an agent turns one study-kit topic folder into `site/topics/<slug>/topic.json`.
This file is private (it is not under `site/`), so it names the study kit. Nothing
you write into `site/` may.

The schema is enforced by `checkPack` in `tools/rules.js`; this guide matches it
field for field. When the two disagree, the validator wins: report the mismatch.

## 1. Inputs and hard limits

Read only, from `~/www/kik/kik_out/study/<slug>/`:

| File | Use |
|---|---|
| `primer.md` | Source of truth: sections `## N. Title`, bold subject lines, bold "why / how" questions |
| `extras.json` | `overview[]` timelines and maps (years, places), `sections`, `concept_map.nodes/edges` (links) |
| `cards.json` | `cards[]` with `id, kind, subject, front, back, sources, qid` (questions) |
| `people.json` | `people[]` with `wikidata, name, section, known_for` |
| `people/faces.json` | per `wikidata`: `born`, `died`, `commons`, `file` (portrait) |

- Never read `input.md`, `facts/` or `user_data/`. Never write into `~/www/kik`.
- Write only under `site/topics/<slug>/` (and `img/` there).
- Never copy `sources` from a card, a card `id` starting `missed:`, a `qid`, or any
  archive id (`<9-10 digits>:<seconds>`). Never copy a frame, still or video.

## 2. Forbidden on `site/` (the scan fails the build)

Nothing under `site/` (pack text, names, file names, comments) may contain:

- `kik`; the word forms of "laida" as whole words (laida, laidą, laidos,
  laidoje, laidų, laidai, laidas, laidose; "palaidotas" is fine); `LRT`;
  `missed`; the TV show's name in any spelling; an archive id pattern
  (`\d{9,10}:\d+\.\d+`);
- anything about the repo owner: name, answers, attempts, which questions were missed.

There is no allowlist. Reword ordinary uses: "laidos" meaning editions becomes
"leidimai". `deno task validate` scans for all of this.

## 3. Commands

```sh
export DENO_DIR=$TMPDIR/deno        # needed in the sandbox; first run needs jsr.io
deno task validate                  # schema of every pack + site scan
deno task validate --primer <slug>=$HOME/www/kik/kik_out/study/<slug>/primer.md   # adds coverage
deno run -A tools/import-cards.ts ~/www/kik/kik_out/study/<slug> site/topics/<slug>   # questions (Task 14)
deno run -A tools/import-photos.ts ~/www/kik/kik_out/study/<slug> site/topics/<slug> # portraits + credits
deno task test                      # all tests
```

Commons needs network access to `commons.wikimedia.org` and
`upload.wikimedia.org`, with a generic User-Agent. Run `validate --primer` until
it prints nothing.

## 4. Top level

```json
{ "version": 1, "slug": "lietuviu-literatura", "title": "...", "intro": "...",
  "layout": "time", "rooms": [], "spots": [], "questions": [], "skipped": [] }
```

- `version` is `1`. `slug` is an ASCII slug equal to the folder name.
- `title` and `intro`: the primer's `# ` heading and its opening paragraph, reworded
  only to drop show references.
- `layout` is `"time"` (rooms along a year axis) or `"map"`. Literature is `time`.
- `skipped[]`: `{ "span": "<bold text>", "reason": "..." }`, neutral entries only (see section 9).

## 5. Rooms

One room per `## N.` section, same `n` and title.

```json
{ "n": 1, "title": "Raštijos pradžia (XVI–XVII a.)", "intro": "...",
  "why": [{ "q": "Kodėl ... ?", "a": "..." }],
  "span": [1500, 1700], "style": "print-shop" }
```

- `intro`: the section's opening paragraph (the line(s) before the first bold subject).
- `why[]`: every bold question in the section. The question and its answer sit on the same
  line: `**Kodėl ...?** Prūsijos kunigaikštis ...`. `q` is the bold text, `a` is the rest
  of that same paragraph. Do not drop any; coverage requires them.
- `span`: `[from, to]` integers, `from <= to`, or `null` for an annex room with no
  years. Take it from the section title (XVI–XVII a. gives `[1500, 1700]`, "1918–1940"
  gives `[1918, 1940]`) or from the `extras.json` `overview` timeline `start`/`end`
  for that period. Rooms may overlap.
- `style` must be one of the names below. Literature mapping:

| Room | Style | Room | Style |
|---|---|---|---|
| 1 Raštijos pradžia | `print-shop` | 6 Tarpukaris | `kaunas-modern` |
| 2 Mažoji Lietuva | `brick-church` | 7 Karas ir egzodas | `dp-barrack` |
| 3 Žemaičiai (XIX a. pirmoji pusė) | `log-chapel` | 8 Sovietmetis | `concrete` |
| 4 Tautinis atgimimas | `barn` | 9 Po 1990 m. | `glass` |
| 5 XX a. pradžios proza | `farmstead` | | |

All valid `STYLE_NAMES` (`site/lib/theme.js`): `print-shop`, `brick-church`,
`log-chapel`, `barn`, `farmstead`, `kaunas-modern`, `dp-barrack`, `concrete`, `glass`.
A topic needing a new style is a theme change, not a pack change: report it.

Suggested spans for literature (adjust to the section title and timeline; no span may
leave a person's `at` outside it): 1 `[1500,1700]`, 2 `[1700,1830]`, 3 `[1800,1865]`,
4 `[1864,1904]`, 5 `[1900,1918]`, 6 `[1918,1940]`, 7 `[1940,1990]`, 8 `[1944,1990]`,
9 `[1990,2026]`.

## 6. Spots

Spot = one thing a reader can open. Create one for:

- every bold subject line in the primer (`**Martynas Mažvydas**`, `**„Katekizmas“ (1547 m.)**`);
- every person in `people.json` (set `wikidata`);
- works, groups, prizes and events that the primer treats as subjects.

```json
{ "id": "mazvydas", "room": 1, "kind": "person", "name": "Martynas Mažvydas",
  "aliases": ["Martynas Mažvydas Vaitkūnas"], "years": [1510, 1563], "at": 1547,
  "text": "...", "links": [{ "to": "katekizmas", "label": "parašė" }],
  "wikidata": "Q..." }
```

Fields:

- `id`: unique ASCII slug. `room`: an existing room `n`.
- `kind`: `person | work | group | event | place | thing`.
- `name`; `aliases[]`: real names, pen names, other spellings (these count for coverage).
- `years`: `null`, `[y]`, or `[from, to|null]`. Person = life (use `faces.json`
  `born`/`died`, else the primer); work/event = its year(s).
- `at` (integer, inside the room's span; required whenever the room has a span):
  - person: the year of debut or main work that belongs to that room's era (not the
    birth year; many writers were born well before their room's span);
  - work/event: its year;
  - a spot that sits in the room only for a connection (e.g. a singer tied to an
    interwar poet) gets `"aside": true`, and `at` is a placement year inside the span.
- `text` (non-empty): the primer's sentences about this subject, in Lithuanian. Reword
  only to remove show references ("laidoje nuolat klausiama...", "klausiama...") and
  quiz scaffolding that makes no sense alone. Keep the facts, and keep "ne X"
  clarifications (e.g. "ne žemaitis"). Do not invent facts.
- `links[]`: `{ "to": <spot id>, "label": <short Lithuanian label> }`. `to` must exist and
  not be the spot itself. Sources: `extras.json` `concept_map.edges` (`from`/`to`/`label`,
  `nodes[].id` map to your spot ids) and cross-references written in the primer text.
- `wikidata`: `/^Q\d+$/`, optional.
- `by`: works only, the id of the author's person spot.
- `photo`: optional, set by `tools/import-photos.ts`: `file`, `author`, `license`,
  `source_url` all non-empty (`license_url` optional). `author: "nežinomas"` only for
  public-domain or CC0 files. No licence info means no photo (the import drops it).

Person-only optional fields:

- `life[]`: 3–7 events from the primer, years ascending; fewer only where the primer and
  `faces.json` date nothing more:
  `{ "year": 1547, "label": "Išspausdina „Katekizmą“", "place": "Karaliaučius" }`.
  Cover (where the primer says them): born, studies, key posts, main works,
  exile or prison, death. `place` is optional.
- `places[]`: `{ "name", "lat", "lon" }` (numbers, valid ranges), rounded to 2
  decimals. Coordinates: the Wikidata `P625` of the place's item where the place is
  there; otherwise your own knowledge, with `"approx": true`. The `extras.json` `map`
  overviews carry coordinates too; use them where they fit.
- `motif`: one of the library below; pick what suits the person's writing.

Motifs (`MOTIFS` in `site/lib/motifs.js`): `forest`, `seasons`, `sea`, `fence`, `city`,
`church`, `ship`, `village`, `book`, `pen`, `mountains`, `river`.

Work-only optional fields:

- `illustration`: `{ "file", "approved": boolean }`. Do not create one; images are made
  and approved separately. Omit the field.
- `plot`: see section 7.

## 7. Plots (works only)

Write a `plot` for **15-25 works** whose plot or characters the primer or the cards
mention. Prefer works with named characters (the primer names them, e.g. Katrė, Lapinas,
Liudas Vasaris, Antanas Garšva).

```json
"plot": {
  "characters": [{ "name": "Pričkus", "role": "pasakotojas" }],
  "relations":  [{ "a": "Pričkus", "b": "Slunkius", "label": "kaimynai" }],
  "beats": [{ "text": "...", "characters": ["Pričkus"] }],
  "sources": ["https://lt.wikipedia.org/wiki/..."]
}
```

- 4-8 `beats` exactly; each `text` is one short caption. `beats[].characters` and
  `relations` name only characters listed in `characters`.
- `image` per plot or beat: omit.
- The primer names characters but rarely tells plots. Check each plot against at
  least one public page (`lt.wikipedia.org` or `vle.lt`) and list every page you used in
  `sources` (at least one URL starting `https://`). Do not rely on memory for a plot.
- No spoilers beyond what the sources say; no copied sentences (paraphrase).

## 8. Questions

Do not write `questions[]` by hand: run
`deno run -A tools/import-cards.ts <kik topic dir> site/topics/<slug>`. Rules it applies,
and which you check:

- one question per card: `q` from `front`, `a` from `back`; all kinds are used
  (`fact`, `why`, and `missed` alike);
- `id` is a new slug (never a card id starting `missed:`, never a qid);
- `room` and `spot` come from the card's `subject` (match to the spot `name` or alias;
  `room` is that spot's room). A card with no matching spot gets only `room`;
- reword a `q` only where it reads as TV phrasing ("Laidoje klausiama..." becomes a
  plain question); keep facts and answers intact;
- no `sources`, `qid`, `kind` or any trace of origin is copied.

Questions come only from `primer.md` and `cards.json`. Never add held-out items.

## 9. Coverage and `skipped`

Every bold span in `primer.md` (242 distinct ones in literature) must occur, case and
diacritics folded, in some spot's `name`, `aliases` or `text`, a room's `intro` or
`why`, or the pack intro. Spans that deliberately have no place go in `skipped[]`:

```json
{ "span": "Pavyzdinis paryškintas tekstas", "reason": "Žaidėjo patarimas, ne faktas." }
```

`span` must equal the bold span's text exactly (without the `**`). Sentences that frame
the primer for a quiz player are plain text, not bold spans, so they need no `skipped`
entry. Bold spans inside such a paragraph (e.g. `tikrosios pavardės ir slapyvardžiai`)
are real content: cover them in a spot or room text. Give a reason each time; do not
skip a subject to make coverage pass.

A bold span that contains a forbidden term (see `tools/rules.js`) cannot be written
as-is, because the pack may not contain the term. Even masked, such a sentence may
point at the source, so its skip entry stays out of `site/`: it goes in the private
file `coverage/<slug>.json` at the repo root (never deployed), which
`deno task validate --primer` reads next to the pack's `skipped[]`:

```json
{ "skipped": [{ "span": "Kodėl … klausiama apie X", "reason": "Rėmo frazė, ne faktas." }] }
```

The entry masks the span: each forbidden-term match (the term only, not the words
around it) is replaced by the single character `…` (U+2026). The comparison is folded
like coverage. The pack's own `skipped[]` holds only neutral entries.

## 10. Order of work

1. Read `primer.md`, `extras.json`, `people.json`, `faces.json`.
2. Write rooms and spots (people first, then works, groups, events), with links.
3. Run `tools/import-photos.ts`, then `tools/import-cards.ts`.
4. Add `life`, `places`, `motif` to every person; add `plot` to 15-25 works.
5. `deno task validate --primer <slug>=<path>` until clean; `deno task test`.
6. Re-read `site/` for anything in section 2.
