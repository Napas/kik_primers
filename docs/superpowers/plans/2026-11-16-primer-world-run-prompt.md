Run the plan `docs/superpowers/plans/2026-11-16-primer-world.md` with superpowers:subagent-driven-development. Read the plan, its spec (`docs/superpowers/specs/2026-11-16-primer-world-design.md`) and `CLAUDE.md` first. Start the session in `~/www/kik_primers`.

## Waves (run the tasks inside a wave as parallel agents)

| Wave | Tasks | Needs |
|---|---|---|
| 0 | 1 | none; includes STOP 1 (below) |
| 1 | 4 | 1 |
| 2 | 2, 3, 5, 6, 7, 12, 13, 18 | 1 and 4 (18 is in `~/www/kik` and needs nothing) |
| 3 | 8, and 14 alongside it | 8: 5, 6, 7. 14: 2, 13 |
| 4 | 9, and 15 and 17 alongside it | 9: 3, 4, 8. 15: 14. 17: 14 |
| 5 | 10 | 9 |
| 6 | 11 | 9, 10 (both edit `site/lib/scene/world.js`, so never at the same time) |
| 7 | 16 | 8, 11, 12, 15 |
| 8 | 19 | everything |

- **One worktree per parallel implementer.** Give each its own git worktree (`isolation: "worktree"`, or `git worktree add` on a branch cut from `primer-world`). When a task passes its review, merge it into `primer-world` and run `deno task test` there before the next wave starts. Tasks in the same wave touch different files; if a merge conflicts anyway, stop and resolve it by hand.
- **Within a wave**, start the next task's implementer as soon as its dependencies are merged. Don't wait for the whole wave.
- **Content tasks (14, 15)** are long. Task 14 goes room by room. Have it report progress after each room, and record each room in the ledger so a resume knows where it stopped.

## Stops: ask the user, never decide for them

1. **Task 1, Step 1:** the first push to `main` (only `.gitignore`).
2. **Task 16, Step 1:** if the dry run would drop more than 5 of the 73 photos, show the list.
3. **Task 17, Step 2:** show the 5 images. Only the ones the user approves get `approved: true`.
4. **Anything irreversible or outside the plan:** deploying, pushing to `main`, deleting files that aren't yours.

## Rules every agent gets in its brief

- **Forbidden on `site/`.** Nothing under `site/` may contain `kik`, word forms of "laida", "LRT", the TV show's name, archive ids (`<9–10 digits>:<seconds>`), "missed", or anything about the user. Never copy a real archive id into any file, tests and docs included. Use made-up ids such as `1234567890:12.34`.
- **`~/www/kik` is read-only**, apart from Task 18's branch. Read only `kik_out/study/<slug>/{primer.md,extras.json,cards.json,people.json,people/}`. Never read `input.md`, `facts/` or `user_data/`.
- **TDD for code.** Write the test, watch it fail, then implement. Content tasks pass only when `deno task validate --primer …` passes. Never use `--no-verify`.
- **Tooling.** Node isn't installed; Deno 2.9 is. No npm and no build step.
- **Sandbox.**
  - Headless Chrome (`PRIMER_CHROME=1` tests, screenshots) runs with the sandbox off.
  - Commons (`commons.wikimedia.org`, `upload.wikimedia.org`) and `cdn.jsdelivr.net` need network access.
  - Writes to `~/www/kik` need the sandbox off.
  - `open` is blocked: give the user the command to run instead.
- **Reports.** Use the plan's names and signatures exactly. Report test output as numbers, e.g. "14 passed", never just "pass".

## Reviews and PRs

- **Per task:** the skill's spec-compliance and code-quality reviewers.
- **Before every push**, the user's mandatory chain:
  1. `refactoring-specialist`.
  2. `text-simplificator` on code comments. Never on specs or plans.
  3. `tests-runner`, `code-reviewer` and `architecture-reviewer` in parallel.

  Fix and re-run until all are clean.
- **Task 18** is its own PR in `~/www/kik` (branch `publishing-rule`, made in a worktree).
- **Task 19** is the PR from `primer-world` to `main` in `kik_primers`.
- **PR descriptions** go through `text-simplificator` first. They need no approval. Show each PR URL to the user.
- **Commit with the change**, in the same PR: the spec, the plan, this prompt and any `.claude/agent-memory/` files.

## Finish

Report in this order:
1. Both PR URLs.
2. Test counts: `deno task test` and `PRIMER_CHROME=1 deno task test`.
3. Photos imported and dropped.
4. Plots written, with their sources.
5. Image-trial outcome.
6. Every ruling recorded in the ledger.
7. Deferred minor findings.
