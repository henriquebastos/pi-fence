# CVx.E5.S1 — Coverage and CRAP feedback

**Status:** In progress

**Epic:** [CVx.E5 — Coverage Feedback](cvx-e5--coverage-feedback.md)
**Date:** 2026-04-22 (spec)

## Summary

The repo needs two different feedback shapes.

1. The normal fast gate should surface **coverage for shipped extension code** so contributors see production-lane coverage every time they run `pnpm test` / `pnpm run verify:fast`.
2. The repo should also expose a **non-blocking CRAP report** across the whole fast-test codebase so we can inspect complex under-covered hotspots in runtime, scripts, and non-live test code.

This story chooses the coverage provider, wires extension-focused coverage into the fast suite, adds a `crap-score` command for the broader report, and documents the resulting workflow.

## Done criterion

1. The repo chooses one Vitest coverage provider explicitly and documents why.
2. `pnpm test` runs the existing fast suite **with coverage limited to `extensions/**`** and exits green on the current tree.
3. `pnpm run verify:fast` stays the umbrella fast gate and now includes a focused extension-only CRAP summary on stdout by reusing the coverage output from `pnpm test`.
4. `pnpm run crap:ext` produces the focused extension-only CRAP summary as a standalone command.
5. `pnpm run crap` generates a broader CRAP report over the full fast-test codebase (`extensions/**`, `scripts/**`, and non-live `tests/**`) using `crap-score`.
6. Generated artifacts for coverage and CRAP reports are ignored by git.
7. Contributor-facing docs (`AGENTS.md`, `README.md`, `docs/getting-started.md`) describe the new command surface accurately.

## Scope

**In scope:**

1. Picking `istanbul` vs `v8` for this repo's coverage provider.
2. `package.json` script wiring for fast-suite coverage and CRAP reporting.
3. Any minimal Vitest config needed to support those scripts.
4. Adding the required dev dependencies.
5. Ignoring generated coverage / CRAP output.
6. Updating contributor-facing docs to match the new workflow.

**Out of scope:**

1. Coverage thresholds as a failing gate.
2. CRAP thresholds as a failing gate.
3. Live-suite coverage.
4. Refactoring production code to improve today's CRAP findings.
5. Rewriting older roadmap / worklog history that mentions the previous `pnpm test` output shape.

## Plan

### Provider choice

Choose the provider that is the most trustworthy input to `crap-score`, not the one that merely has the smallest runtime overhead.

Expected decision unless implementation disproves it:

1. **Use `istanbul`.**
2. Rationale:
   1. `crap-score` consumes Istanbul JSON directly.
   2. We already observed correct function-to-coverage matching from Istanbul in this repo.
   3. This repo's fast suite is small enough that the runtime overhead is acceptable.

### Command shape

Expected command surface:

1. `pnpm test`
   - fast suite
   - coverage enabled
   - coverage summary scoped to `extensions/**`
2. `pnpm run crap:ext`
   - focused CRAP summary for `extensions/**`
   - uses the same coverage shape as `pnpm test`
   - prints to stdout instead of writing report artifacts
3. `pnpm run verify:fast`
   - unchanged umbrella command from the contributor perspective
   - runs `pnpm test`
   - reuses `coverage/coverage-final.json` for the focused CRAP pass instead of rerunning the suite
4. `pnpm run crap`
   - runs a broader coverage pass over the full fast-test codebase
   - feeds the resulting `coverage-final.json` to `crap-score`
   - writes local report artifacts for inspection

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add `CVx.E5` + this story and reopen roadmap status. | `spec CVx.E5.S1` |
| 2 | tooling | Wire extension-focused coverage into `pnpm test`; add the chosen coverage provider dependency. | `step 1: surface extension coverage in the fast suite` |
| 3 | tooling | Add focused extension-only CRAP reporting and fold that focused report into `verify:fast` without rerunning tests. | `step 2: add focused CRAP feedback to the fast gate` |
| 4 | tooling | Add the broader non-live coverage + `crap-score` report path and ignore generated artifacts. | `step 3: add broader non-blocking CRAP feedback` |
| 5 | docs | Update contributor-facing docs for the new commands and provider choice. | `step 4: document coverage and CRAP workflow` |
| 6 | close | Re-run the gate and the new report commands, then close the story. | `close CVx.E5.S1` |

## Tests

1. **Layers touched:**
   - repo-tooling only
2. **Events / interactions covered:**
   - `pnpm test` runs the fast suite with extension-focused coverage
   - `pnpm run crap:ext` prints a focused extension-only CRAP summary to stdout
   - `pnpm run verify:fast` stays green and includes the focused CRAP pass
   - `pnpm run crap` writes a broader CRAP report from the non-live coverage input
3. **Fakes added:** none
4. **Live tests added / updated:** none
5. **Deferred:** numeric coverage / CRAP thresholds remain deliberately non-blocking until the repo chooses policy explicitly

## Verification

### Gate

```bash
pnpm test
pnpm run crap:ext
pnpm run verify:fast
pnpm run crap
```

### Expected

1. `pnpm test` passes and prints coverage for `extensions/**` only.
2. `pnpm run crap:ext` prints the focused extension-only summary and exits green.
3. `pnpm run verify:fast` passes as the main fast gate and includes the focused CRAP pass.
4. `pnpm run crap` writes the broader report and exits green.
5. No generated coverage / CRAP outputs appear as tracked files.

## Key files

- `package.json`
- `vitest.config.ts` if coverage config lands there
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `docs/getting-started.md`

## Out of scope — explicitly

- Failing the fast gate on coverage percentage
- Failing the fast gate on CRAP score
- Adding live coverage to `pnpm test:live`
- Refactoring existing hotspots in the same story
