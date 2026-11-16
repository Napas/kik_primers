# Primer world

A static website: each topic is a 3D world to walk through (its sections are
rooms along the topic's axis, its subjects are spots), plus a flat test page.
For adults who play quizzes or want to learn the topic. Design:
`docs/superpowers/specs/2026-11-16-primer-world-design.md`.

Plan: `docs/superpowers/plans/2026-11-16-primer-world.md`.

## Public vs private

- `site/` is the public site and the only thing that gets deployed. The repo
  itself is private.
- Nothing under `site/` may mention: the TV show the source material came
  from, its broadcaster, the private study kit (`kik`), or the repo owner
  (name, answers, attempts, which questions they missed). The test suite scans
  `site/` (paths and text) for the show's name, the broadcaster, `kik`, word
  forms of "laida", archive ids and "missed"; keep that list (`FORBIDDEN` in
  `tools/rules.js`) current. The owner's identity is not in the scan list:
  check it in review.
- Never put frames, stills, videos or archive ids (qids, `<digits>:<time>`)
  anywhere in this repo.
- Deploying needs the owner's go-ahead each time. Hosting is not chosen yet.

## Source material

Topic content comes from the private study kit at `~/www/kik`, read-only:
`kik_out/study/<slug>/` holds `primer.md` (source of truth), `extras.json`
(years, connections), `cards.json` (questions), `people.json` and
`people/faces.json` with portraits. Pass that folder as an argument; never
write into `~/www/kik`, never copy its `user_data/`, `input.md` or
`facts/`.

Test questions come only from `primer.md` and `cards.json`.

## Layout

```
site/index.html, world.html, test.html, about.html
site/topics/index.json                  built by tools/build-index.ts
site/topics/<slug>/topic.json, img/     one content pack per topic
site/lib/                               our ES modules: layout, render, quiz, progress, storage, theme, text, motifs, basemap, site.css
site/lib/scene/                         Three.js world: world, lanes, styles, spots, light, controls, rays, labels, declutter, arcs, nearby
site/lib/pages/                         page wiring: index, overview, selection, world, test, about, common
site/lib/three/                         vendored pinned Three.js + licence
coverage/<slug>.json                    private skip entries for masked primer spans (not deployed)
tools/                                  Deno: validate, rules, import-photos, commons, import-cards, build-index, make-basemap, chrome, shoot
tests/                                  deno test (+ fixtures, fake canvas)
docs/TOPIC.md                           how an agent writes a topic.json
docs/illustrations.md                   illustration house style and decisions
```

## Rules

- TDD. `deno test` must pass before any commit; never `--no-verify`.
- Plain ES modules, no build step, no npm. Node isn't installed; Deno is
  (`/opt/homebrew/bin/deno`).
- Three.js is vendored at a pinned version with its licence; no runtime CDN.
- Lithuanian UI and content. Lithuanian text in UTF-8 with diacritics.
- Look and feel live in four files: `site/lib/theme.js` (colours, sizes,
  light), `site/lib/site.css` (pages), `site/lib/scene/styles.js` (rooms,
  path, ground) and `site/lib/scene/spots.js` (one model per spot kind). Change the
  look there, not in layout or content code.
- Browser storage: neutral key prefix, every access in try/catch, the page
  works without it.
- Photos need author, licence and source (Commons); `about.html` lists them.
- Commons requests use a generic User-Agent, never personal details.
- Pack file paths (`photo.file`, `illustration.file`) are relative to the topic folder.
- A primer bold span containing a forbidden term is covered by a skip entry with
  each forbidden match replaced by "…" (U+2026), kept in the private
  `coverage/<slug>.json`, never in the pack; see `docs/TOPIC.md` section 9.
- Question order is neutral (sorted), so no card's origin shows.
- Illustrations: approved images only. House style and decisions are in
  `docs/illustrations.md`. A neutral reviewing agent may approve new ones
  (owner, 2026-11-16).

## Commands

```sh
DENO_DIR=$TMPDIR/deno deno task test                      # all tests, incl. pack validation and the site scan
PRIMER_CHROME=1 deno task test                            # + headless Chrome smoke tests (sandbox off)
deno run -A tools/import-cards.ts ~/www/kik/kik_out/study/<slug> site/topics/<slug>
deno run -A tools/import-photos.ts [--dry-run] ~/www/kik/kik_out/study/<slug> site/topics/<slug>
deno run -A tools/build-index.ts site                     # rebuild site/topics/index.json
deno task validate --primer <slug>=$HOME/www/kik/kik_out/study/<slug>/primer.md
deno task serve                                           # serve site/ locally
deno run -A tools/shoot.ts http://localhost:8000 <slug> <out-dir>   # screenshot the start view and one spot per room
```

- In the Claude Code sandbox, tests need `DENO_DIR=$TMPDIR/deno`; the first run
  also needs network to `jsr.io`.
- Re-running `import-cards.ts` overwrites hand-reworded question fronts: re-apply them.

## Sandbox

The session starts in `~/www/kik_primers`, so repo writes work sandboxed.

- Git commits inside `.superpowers/worktrees/` need the sandbox off.
- Headless Chrome and writes to `~/www/kik` need the sandbox off.
- Commons needs `commons.wikimedia.org` and `upload.wikimedia.org`.
