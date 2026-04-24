# Agent / contributor guide

Front door for agents and new contributors. Short on purpose — redirects, doesn't duplicate.

## Communication

1. **Answer concisely.** Be brief, direct, and specific.
2. **Prefer dense phrasing over filler.** Remove unnecessary hedging, throat-clearing, and extra words when clarity survives.
3. **Keep technical content exact.** Do not paraphrase identifiers, paths, commands, flags, APIs, or code blocks.
4. **Prefer concrete examples over abstract explanation.** Show the change, not just the idea.
5. **Use short Before/After snippets when they clarify intent faster than prose.**
6. **Do not sacrifice clarity for brevity.** Compress aggressively, but keep the result readable.

## Read first, in order

1. [docs/product/principles.md](docs/product/principles.md) — code, testing, process, conventions (the rules).
2. [docs/project/briefing.md](docs/project/briefing.md) — architectural decisions D1–D8 (the why).
3. Tail of [docs/process/worklog.md](docs/process/worklog.md) — what just shipped. The CV0.E1.S3 entry is the canonical example of a story shaped end-to-end.

## What's pending

[docs/project/roadmap/README.md](docs/project/roadmap/README.md) is the source of truth for CV order and done/not-done state. Each CV `README.md` is the source of truth for Epic order. Each Epic file is the source of truth for Story order. Next story = the first not-done Story in the first not-done Epic of the current CV; when a Story file exists, prefer one whose top metadata block says `**Status:** Ready`. Each CV has its own folder under `docs/project/roadmap/` with `README.md`; Epics and Stories are single markdown files inside that CV folder, named with their code prefix and slug.

When the next workflow step is obvious, do it. Do not stop at chat prose if the task clearly calls for a repo artifact such as a story spec, roadmap update, worklog entry, or similar bookkeeping needed to continue. Be conservative with ambiguous design choices and destructive actions, not with routine workflow continuation.

## Testing levels

Four levels, each with a clear trigger. No level requires human review.

| Level | Command | When | Needs Docker/network |
|-------|---------|------|---------------------|
| TDD loop | `pnpm run feedback` | Every commit | No |
| Completion | `pnpm run inspect` | TDD session feels done | No |
| Live I/O | `pnpm test:live` | New/changed processor or I/O seam | Yes |
| Acceptance | `pnpm test:live` + `pnpm run render:verify` | Before closing an epic | Yes |

### TDD loop — `pnpm run feedback` (before every commit)

Use TDD explicitly: red → green → refactor. `pnpm run feedback` is the one-command fast gate after every meaningful change.

1. `pnpm test` — fast suite (unit + contract + extension) with coverage focused on `extensions/**` and minimum thresholds of statements `90`, lines `90`, functions `90`, branches `75`.
2. `pnpm run inspect:crap:ext` — focused CRAP summary for `extensions/**`, reusing the coverage output from `pnpm test` and printing to stdout.
3. `pnpm run lint:markdown` — markdown docs checks (`lint:markdown:links` + `lint:markdown:body`). `pnpm run lint` is the umbrella convenience name for this docs-only lane.
4. `pnpm run lint:types` — `tsc --noEmit` across production code, tests, and repo scripts.
5. `pnpm run lint:deps` — dependency-cruiser architectural boundary check (`extensions/**` must not import from `tests/**`).

`pnpm run feedback` is the umbrella command for steps 1–5. Every commit leaves the fast gate passing. CI runs the same checks on push/PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)); live runs separately ([.github/workflows/live.yml](.github/workflows/live.yml)).

### Completion — `pnpm run inspect` (when the TDD session feels done)

1. `pnpm run inspect` — broader completion pass. Always runs `inspect:crap`; runs `inspect:sonar` too when `SONAR_HOST_URL` and `SONAR_TOKEN` are set, otherwise prints a clear skip.
2. Quality targets: keep focused extension CRAP at or below `25`; try to drive Sonar to `0` open issues when configured.
3. Refactor from what the analyzers surface, then rerun `pnpm run feedback`.

### Live I/O — `pnpm test:live` (when adding or changing a processor)

Run `pnpm test:live` when adding or changing a processor, touching an I/O seam (`HttpClient`, `ShellRunner`), or refreshing fixtures. Requires Docker (`pnpm run live:up`) or network. After live confirms real I/O, run `pnpm refresh-fixtures` to update committed fixtures so the fast suite replays grounded responses.

### Acceptance gate (before closing an epic)

Before closing an epic, verify user-visible output programmatically — no acceptance criterion depends on human review:

1. `pnpm test:live` — full live suite including render-image pixel-diff against goldens.
2. `pnpm run render:verify` — headless UI screenshots of every scenario.

No build step — TypeScript runs via pi's jiti loader. `pnpm install` is all that "builds" the package.

## Story workflow

1. **Spec** — draft the story file. Every story file starts with a visible metadata block carrying `**Status:** Draft|Ready|In progress|Done` so a reader can see whether the spec is still forming, ready to execute, actively being implemented, or closed. Every story file must also contain, at minimum: `Summary`, `Done criterion`, `Scope`, `Plan`, `Tests`, and `Verification`. The `Tests` section is mandatory and names layers touched, events covered, fakes added, live tests, and anything deferred. Amend spec churn *into the spec commit* so plan revisions don't leak into history. When starting a new story, read the closest finished story file as the working template — imitate the section shape, don't invent one. Parent docs link downward; they do not copy story-level detail.
2. **Implement** — one commit per numbered plan step, test-first (red → green → refactor). Use `pnpm test:watch` for the red/green loop when helpful, then `pnpm run feedback` for the fast refactor loop. When the TDD session feels done, run `pnpm run inspect` and refactor from what it surfaces. When adding or changing a processor, run `pnpm test:live` and refresh fixtures. When implementation starts, flip the story file metadata to `**Status:** In progress`. A story is not considered done until its implementation exists in committed history. Do not start the next story with uncommitted carry-over from the previous one.
3. **Close** — close only from a clean working tree after the story's implementation commits already exist. When this story closes an epic, run the acceptance gate first (`pnpm test:live` + `pnpm run render:verify`). Flip the story file metadata to `**Status:** Done`, update status in the epic file, the CV `README.md`, and the top-level roadmap `README.md`, append a worklog entry (commits + test-count deltas + design decisions + known deviations + carry-forwards), and update `CHANGELOG.md`, `README.md`, and `docs/getting-started.md` if user-visible behavior changed.

Canonical example: read the CV0.E1.S3 entry at the tail of [docs/process/worklog.md](docs/process/worklog.md).

## Commit conventions

- Messages in English, focused on **why**. No AI or self-referential language.
- Atomic where practical — one independent change per commit.
- Never begin implementation of a new story on a dirty worktree. Finish or discard the current story's uncommitted work first.
- Prefixes used in this repo: `spec <CODE>`, `step N: <why>`, `close <CODE>`, `wip(agent): <why>`.
- Before the first commit on a new clone, confirm `git config user.name` / `user.email` match the intended identity.

## Working with commit SHAs

SHAs are hex — unstructured, error-prone to retype. Never type a SHA from memory or visual recall.

1. When a SHA appears in prose (worklog, CHANGELOG, commit message body, chat explanations), copy it from tool output or a pipeline; never retype it.
2. When operating on commits in the shell, prefer pipelines that carry SHAs by reference: `git log --format='%H' A..B | while read sha; do git show --stat $sha; done`. Avoid literal SHA lists in `for` loops.
3. If a `git` command fails with `fatal: ambiguous argument` or `unknown revision`, stop. Do not re-guess. Re-read the source (`git log --oneline …`) and copy again.
4. Before any prose that lists SHAs is saved or committed, verify each one with `git log --oneline <sha1> <sha2> …`. Wrong SHAs in the worklog are worse than no SHAs — they corrode trust in the record.

## Worklog and CHANGELOG ordering

The worklog and CHANGELOG record history; they must not predict it. Both are edited *after* the commits they describe exist, and the docs commit follows its feature commit *immediately* — not at some later natural breakpoint.

1. Commit the feature (code, rules, spec, whatever produces stable SHAs). Do not touch `docs/process/worklog.md` or `CHANGELOG.md` in that commit.
2. The **next** commit is the docs catch-up for the feature commit you just made. Copy the SHA from `git log --oneline` and write the worklog entry (and CHANGELOG entry if user-visible). One feature commit → one docs commit, in that order, back-to-back. Never defer the docs commit to a "future session" or a "future natural catch-up point" — that's how prose drifts from history.
3. This docs commit's message starts with `docs:` (or `close <CODE>` for a story close that also flips roadmap statuses). It touches only documentation.
4. Never write a SHA into the worklog before the commit it refers to exists. If a draft needs to reference a not-yet-existing commit, use a verbal placeholder (e.g. "the spec commit for S3") and replace it with the SHA in the docs commit that follows.
5. Batching is allowed **only retroactively**, to catch up on past feature commits that never got their docs commit — see `042acb8` as the canonical example. Going forward, the default is one-feature-one-docs, adjacent.

Exception: a `worklog: placeholder for <story>` entry with no SHAs is fine as a scaffold inside a feature commit; it just cannot claim commits that do not exist yet.

## Reading pi's source

When investigating pi-tui / pi-coding-agent / pi-ai behavior (interfaces, tests, internals), read the source in `~/me/oss/pi-mono/packages/<pkg>/src/` and the tests in `~/me/oss/pi-mono/packages/<pkg>/test/` — **not** the compiled `node_modules/@mariozechner/<pkg>/dist/` files in this repo.

1. `~/me/oss/pi-mono` is the real source of truth: TypeScript, full test suite, history, work-in-progress.
2. Always read from the `main` branch (`upstream/main` in the fork setup) unless the user explicitly names another ref. The checked-out branch may be a work-in-progress refactor and is not representative of what pi-fence's installed pi-tui reflects.
3. Prefer `git show upstream/main:packages/<pkg>/src/<file>.ts` over relying on the working tree: it reads the ref directly, never depends on what's checked out, never risks polluting the user's workspace. `cat-file -p upstream/main:<path>` and `git grep <pattern> upstream/main -- packages/<pkg>/` are the same idea for broader searches.
4. Fetch before reading: `cd ~/me/oss/pi-mono && git fetch --all` to ensure `upstream/main` is current. Note the SHA of `upstream/main` in prose when relevant so the reader can reproduce the read later.
5. `node_modules/` only has emitted `.d.ts` + `.js` and the published README. No tests, no source comments, often stale relative to upstream. Use it only to confirm the installed version ships a particular export.
6. When citing pi internals in prose (worklog, plan, chat), reference files at `~/me/oss/pi-mono/packages/<pkg>/...` by path so the reader can open the real source.

## I/O seams and fakes

Three DI seams: `HttpClient`, `ShellRunner`, `Logger`. Production wires node impls; tests wire **fakes** (`FakeHttpClient`, `FakeShellRunner`, `FakeLogger`, `FakeExtensionAPI`) with capture arrays. No `vi.mock()`. Every fake has a sibling live test — adding a fake means adding its live gate.

No test reaches the real filesystem outside `os.tmpdir()` or the real `~/.pi/agent/`. Live tests `describe.skipIf(...)` cleanly when Docker/network are absent.

## Conventions

English everywhere. Node ESM (`"type": "module"`). TypeScript via jiti, no compile step for extension code. Vitest as the runner. Small functions, one module one responsibility, no premature abstraction, validate at boundaries, lazy-load heavy deps.

---

See also: [README.md](README.md) (user-facing), [docs/README.md](docs/README.md) (doc index).
