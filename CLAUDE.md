# Primer world

A static website: each topic is a 3D world to walk through (its sections are
rooms along the topic's axis, its subjects are spots), plus a flat test page.
For adults who play quizzes or want to learn the topic. Design:
`docs/superpowers/specs/2026-11-16-primer-world-design.md`.

Status: design stage. Nothing below `site/` or `tools/` exists yet; the
structure is the planned one. Plan: `docs/superpowers/plans/2026-11-16-primer-world.md`.

## Public vs private

- `site/` is the public site and the only thing that gets deployed. The repo
  itself is private.
- Nothing under `site/` may mention: the TV show the source material came
  from, its broadcaster, the private study kit (`kik`), or the repo owner
  (name, answers, attempts, which questions they missed). The test suite scans
  `site/` for these; keep the list in `tools/` current.
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

## Layout (planned)

```
site/index.html, world.html, test.html, about.html
site/topics/index.json
site/topics/<slug>/topic.json, img/     one content pack per topic
site/lib/                               vendored pinned Three.js + our ES modules
tools/                                  Deno: import-photos, validate
tests/                                  deno test
docs/TOPIC.md                           how an agent writes a topic.json
```

## Rules

- TDD. `deno test` must pass before any commit; never `--no-verify`.
- Plain ES modules, no build step, no npm. Node isn't installed; Deno is
  (`/opt/homebrew/bin/deno`).
- Three.js is vendored at a pinned version with its licence; no runtime CDN.
- Lithuanian UI and content. Lithuanian text in UTF-8 with diacritics.
- Look and feel live in one theme module and one model factory per spot kind:
  change the look there, not in layout or content code.
- Browser storage: neutral key prefix, every access in try/catch, the page
  works without it.
- Photos need author, licence and source (Commons); `about.html` lists them.
- Commons requests use a generic User-Agent, never personal details.

## Commands (planned)

```sh
deno task test                                            # all tests, incl. pack validation and the site scan
PRIMER_CHROME=1 deno task test                            # + headless Chrome smoke tests (unsandboxed)
deno run -A tools/import-photos.ts ~/www/kik/kik_out/study/<slug> site/topics/<slug>
deno task validate --primer <slug>=$HOME/www/kik/kik_out/study/<slug>/primer.md
deno task serve                                           # serve site/ locally
```

## Sandbox

`~/www/kik_primers` is outside the Claude Code sandbox's default write list
when the session starts in `~/www/kik`: run writes unsandboxed or start the
session here. Commons needs `commons.wikimedia.org` and
`upload.wikimedia.org`.
