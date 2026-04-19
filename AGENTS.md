# Agent / contributor guide

Front door for agents and new contributors. Short on purpose — redirects, doesn't duplicate.

## Read first, in order

1. [docs/product/principles.md](docs/product/principles.md) — code, testing, process, conventions (the rules).
2. [docs/project/briefing.md](docs/project/briefing.md) — architectural decisions D1–D8 (the why).
3. Tail of [docs/process/worklog.md](docs/process/worklog.md) — what just shipped. The CV0.E1.S3 entry is the canonical example of a story shaped end-to-end.

## What's pending

[docs/project/roadmap/README.md](docs/project/roadmap/README.md) is the source of truth. Next story = first `Planned` row of the current CV. Each story has its own folder with `README.md` + `plan.md` + `test-guide.md`.

## Verification gate (before every commit)

1. `pnpm test` — fast suite (unit + contract + extension).
2. `pnpm run check` — `check:links` + `check:markdown`. Auto-fix most markdown with `pnpm run fix:markdown`.
3. `pnpm test:live` — only when touching an I/O seam (`HttpClient`, `ShellRunner`) or refreshing fixtures. Requires Docker (`pnpm run live:up`) or network.

Every commit leaves tests passing. CI runs the fast gate on push/PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)); live runs separately ([.github/workflows/live.yml](.github/workflows/live.yml)).

No build step — TypeScript runs via pi's jiti loader. `pnpm install` is all that "builds" the package.

## Story workflow

1. **Spec** — draft the story folder's `README.md` + `plan.md` + `test-guide.md`. `plan.md` must have a `Tests` section (layers, events covered, fakes added, live tests, anything deferred). Amend spec churn *into the spec commit* so plan revisions don't leak into history. When starting a new story, read the closest finished story's three files as the working template — imitate the section shape, don't invent one. No separate template file exists; the shipped stories are the template.
2. **Implement** — one commit per numbered plan step, test-first (red → green → refactor), each green on `pnpm test`.
3. **Close** — flip status in the story `README.md`, the Epic `README.md`, and the top-level roadmap table; append a worklog entry (commits + test-count deltas + design decisions + known deviations + carry-forwards); update `CHANGELOG.md`, `README.md`, and `docs/getting-started.md` if user-visible behavior changed.

Canonical example: read the CV0.E1.S3 entry at the tail of [docs/process/worklog.md](docs/process/worklog.md).

## Commit conventions

- Messages in English, focused on **why**. No AI or self-referential language.
- Atomic where practical — one independent change per commit.
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

## I/O seams and fakes

Three DI seams: `HttpClient`, `ShellRunner`, `Logger`. Production wires node impls; tests wire **fakes** (`FakeHttpClient`, `FakeShellRunner`, `FakeLogger`, `FakeExtensionAPI`) with capture arrays. No `vi.mock()`. Every fake has a sibling live test — adding a fake means adding its live gate.

No test reaches the real filesystem outside `os.tmpdir()` or the real `~/.pi/agent/`. Live tests `describe.skipIf(...)` cleanly when Docker/network are absent.

## Conventions

English everywhere. Node ESM (`"type": "module"`). TypeScript via jiti, no compile step for extension code. Vitest as the runner. Small functions, one module one responsibility, no premature abstraction, validate at boundaries, lazy-load heavy deps.

---

See also: [README.md](README.md) (user-facing), [docs/README.md](docs/README.md) (doc index).
