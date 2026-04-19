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

1. **Spec** — draft the story folder's `README.md` + `plan.md` + `test-guide.md`. `plan.md` must have a `Tests` section (layers, events covered, fakes added, live tests, anything deferred). Amend spec churn *into the spec commit* so plan revisions don't leak into history.
2. **Implement** — one commit per numbered plan step, test-first (red → green → refactor), each green on `pnpm test`.
3. **Close** — flip status in the story `README.md`, the Epic `README.md`, and the top-level roadmap table; append a worklog entry (commits + test-count deltas + design decisions + known deviations + carry-forwards); update `CHANGELOG.md`, `README.md`, and `docs/getting-started.md` if user-visible behavior changed.

Canonical example: read the CV0.E1.S3 entry at the tail of [docs/process/worklog.md](docs/process/worklog.md).

## Commit conventions

- Messages in English, focused on **why**. No AI or self-referential language.
- Atomic where practical — one independent change per commit.
- Prefixes used in this repo: `spec <CODE>`, `step N: <why>`, `close <CODE>`, `wip(agent): <why>`.
- Before the first commit on a new clone, confirm `git config user.name` / `user.email` match the intended identity.

## I/O seams and fakes

Three DI seams: `HttpClient`, `ShellRunner`, `Logger`. Production wires node impls; tests wire **fakes** (`FakeHttpClient`, `FakeShellRunner`, `FakeLogger`, `FakeExtensionAPI`) with capture arrays. No `vi.mock()`. Every fake has a sibling live test — adding a fake means adding its live gate.

No test reaches the real filesystem outside `os.tmpdir()` or the real `~/.pi/agent/`. Live tests `describe.skipIf(...)` cleanly when Docker/network are absent.

## Conventions

English everywhere. Node ESM (`"type": "module"`). TypeScript via jiti, no compile step for extension code. Vitest as the runner. Small functions, one module one responsibility, no premature abstraction, validate at boundaries, lazy-load heavy deps.

---

See also: [README.md](README.md) (user-facing), [docs/README.md](docs/README.md) (doc index).
