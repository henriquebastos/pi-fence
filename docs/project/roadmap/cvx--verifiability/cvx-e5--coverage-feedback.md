# CVx.E5 — Coverage Feedback

**Roadmap:** [CVx](../README.md)
**Last updated:** 2026-04-22 — S1 In progress

`CVx.E4` proved that selective analyzers belong in this repo when their signal is specific and actionable. The next gap is coverage feedback.

Today the fast gate tells us whether tests, docs, types, and dependency boundaries are green, but it does not surface line/branch/function coverage at the moment contributors already look for feedback. Separately, the repo has no lightweight CRAP-score report even though complex under-covered functions are exactly the kind of hotspots we want to notice before they turn into accidental refactor risk.

This Epic adds two complementary feedback surfaces:

1. extension-focused coverage in the normal fast test path
2. focused extension-only CRAP feedback inside the normal fast gate
3. broader non-live CRAP reporting across runtime, tooling, and non-live test code

The intent is feedback, not a new style crusade and not a blanket "100% or bust" ratchet.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cvx-e5-s1--coverage-and-crap-feedback.md) | **Fast-gate coverage focuses on `extensions/**`, while CRAP feedback spans the full fast-test codebase** | In progress |

## Deliverable vision

A contributor runs the normal local fast checks and immediately sees whether coverage moved in the production lane they are changing.

1. `pnpm test` still runs the fast suite only, but now also reports coverage for `extensions/**`.
2. `pnpm run verify:fast` automatically includes a focused extension-only CRAP summary on stdout by reusing the coverage output from `pnpm test`.
3. `pnpm run crap` generates a broader non-live CRAP report across `extensions/**`, `scripts/**`, and the non-live `tests/**` lanes, so risky complex under-covered functions are easy to inspect without blocking commits.
4. The provider choice is explicit and documented rather than accidental.

## Architectural stance

1. Keep the fast gate focused on the production lane. Coverage feedback in `pnpm test` should answer "how covered is the shipped extension code I just touched?" rather than dilute that answer with scripts and test harness helpers.
2. Add one matching focused CRAP surface to the fast gate: shipped extension code only, reusing the same coverage file instead of rerunning tests.
3. Keep the broader CRAP report wider than the fast-gate summary. The repo's tooling and harness code still benefit from complexity+coverage feedback even when they are not part of the production-focused summary.
4. Prefer the coverage provider that gives `crap-score` reliable function mapping in this repo over the provider that is merely fashionable or marginally faster.
5. Treat CRAP as feedback, not a blocking threshold, until the repo explicitly decides otherwise in a later story.

## Out of scope — explicitly (epic-level)

- Whole-repo coverage thresholds as a commit gate.
- Adding live-suite coverage to the default fast loop.
- Replacing SonarQube or dependency-cruiser.
- Broad refactors triggered only by today's first CRAP report.

## Done criterion (epic-level)

The Epic is done when the following are true together:

1. `pnpm test` produces extension-focused coverage feedback as part of the normal fast suite.
2. `pnpm run verify:fast` adds a focused extension-only CRAP summary without adding a second contradictory test command.
3. `pnpm run crap` produces a reproducible broader CRAP report over the repo's non-live codebase.
4. The chosen coverage provider and command surface are documented in contributor-facing docs.
5. Generated coverage / CRAP artifacts are clearly treated as local build outputs, not source-controlled files.
