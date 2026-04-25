# CV8.E3.S1 — Sonar zero issues

**Status:** Done

**Epic:** [CV8.E3 — Sonar Quality Gate](cv8-e3--sonar-zero.md)
**Date:** 2026-04-25 (spec)

## Summary

SonarQube reports 38 open issues after CV8. Fix them one finding at a time, keeping behavior stable and using focused TDD characterization tests before risky refactors.

## Done criterion

1. `pnpm run inspect:sonar` reports quality gate `OK` and `Issues: 0` for `pi-fence`.
2. `pnpm run feedback` passes.
3. `pnpm run inspect` passes.
4. No user-visible behavior changes except clearer internal structure.

## Scope

**In scope:**

- Existing Sonar findings in `extensions/pi-fence/**`, `tests/contract/**`, and `scripts/refresh-fixtures.ts`.
- Characterization tests for behavior that a refactor could break.
- Mechanical rule fixes only when existing tests already pin behavior tightly enough.

**Out of scope:**

- New processors, fixtures, or live I/O behavior.
- Relaxing Sonar rules or excluding production code to make issues disappear.
- CV6 Mermaid-local fixture work.

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | inventory | Refresh/read the Sonar report and choose the next open finding. |
| 2 | red | For the chosen finding, add or identify a focused behavior test. If behavior is already pinned and the issue is purely mechanical, use the Sonar finding itself as the red signal. |
| 3 | green | Apply the smallest safe code/test change for that single finding or tightly coupled duplicate cluster. |
| 4 | refactor | Run the focused test, then refresh Sonar to verify the finding count moves down. Repeat steps 1–4 until zero. |
| 5 | verify | Run `pnpm run feedback`, then `pnpm run inspect`. |

## Tests

- **Unit:** Add/adjust focused tests in the owning module when refactoring parser, formatter, highlighter, metrics, doctor, config, or fixture-refresh behavior.
- **Contract:** Add explicit contract-file smoke tests where Sonar cannot detect helper-generated tests.
- **Tooling:** Keep Sonar report generation as the static-analysis red/green gate for style-only findings.
- **Fakes:** None new.
- **Live:** None affected; no processor I/O seam changes are planned.
- **Deferred:** CV6 live-derived fixture work remains separate.

## Verification

1. Focused test commands ran during each finding/cluster.
2. `pnpm run inspect:sonar` passed with quality gate `OK`, `Issues: 0`, coverage `90.3`, and new coverage `90.9`.
3. `pnpm run feedback` passed with 589 fast-suite tests.
4. `pnpm run inspect` passed.
5. `pnpm test:live` passed: 36 passed, 11 skipped.
6. `pnpm run render:verify` passed: 5 scenario/variant renders.

## Current Sonar inventory

From `scripts/out/sonar/latest/summary.md` at story start:

- 38 issues total: 4 blocker, 6 critical, 28 minor.
- Top runtime files: `color.ts`, `highlight.ts`, `metrics.ts`, `table.ts`, `config.ts`, `doctor.ts`.
- Rules: `typescript:S2187`, `typescript:S3776`, `typescript:S7778`, `typescript:S7773`, `typescript:S6353`, `typescript:S7735`, `typescript:S4325`, `typescript:S6551`, `typescript:S7781`.
