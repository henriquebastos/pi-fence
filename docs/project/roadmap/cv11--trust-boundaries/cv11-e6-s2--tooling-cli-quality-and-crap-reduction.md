# CV11.E6.S2 — Tooling CLI quality and CRAP reduction

**Status:** Ready

**Epic:** [CV11.E6 — Tooling Quality](cv11-e6--tooling-quality.md)
**Depends on:** [CV11.E6.S1 — Atomic tooling artifact writes](cv11-e6-s1--atomic-tooling-artifact-writes.md)
**Date:** 2026-04-29 (spec)

## Summary

Refactor repo tooling scripts so their branchy CLI parsing and command planning live in small pure functions with unit tests. Completion CRAP inspection currently flags tooling hotspots such as `scripts/render-verify.ts parseArgs`, `scripts/live.ts main`, `scripts/render-gallery.ts main`, and `scripts/lint-markdown-links.ts validateLink`.

## Done criterion

1. `render-verify` argument parsing is pure and unit-tested.
2. `live` subcommand parsing/planning is pure and unit-tested.
3. `render-gallery` main planning is split from I/O enough to unit-test normal and error paths.
4. `lint-markdown-links` link validation is split into smaller tested helpers.
5. `test-live` Kroki sandbox management decision logic is unit-tested as a pure function.
6. Broad CRAP inspection shows the targeted tooling functions reduced meaningfully, aiming for CRAP ≤ 25 where practical.
7. `env -u SONAR_HOST_URL -u SONAR_TOKEN pnpm run inspect` passes.
8. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Pure parser/planner extraction for the named scripts.
2. Unit tests under `tests/unit/`.
3. Small command-result unions where they make CLI flow exhaustive.
4. Keeping script user-facing behavior stable.

**Out of scope:**

1. Replacing the scripts with a CLI framework.
2. Changing command names.
3. Requiring Sonar to be available.
4. Fixing unrelated repo-wide Fallow/Sonar findings.

## Plan

1. **RED — render-verify parser.** Add tests for `--help`, `--list`, `--scenario`, `--variant`, `--out`, unknown args, and variant-without-scenario.
2. **GREEN — parser extraction.** Return a result union instead of calling `process.exit()` inside parse logic.
3. **RED/GREEN — live parser.** Test `up`, `down`, `status`, `exec -- cmd`, `build`, unknown subcommands, and empty exec command.
4. **RED/GREEN — render-gallery planning.** Extract enough pure planning to test args/output paths/failure choices.
5. **RED/GREEN — markdown link validation.** Split target parsing, path resolution, fragment validation, and error formatting.
6. **RED/GREEN — test-live decision logic.** Test `shouldManageSingleContainerKroki()` and env/default config behavior without spawning Vitest.
7. **Inspect.** Run broader CRAP and refactor until targeted hotspots are acceptable or documented.

## Tests

1. **Layers touched:** unit/tooling only.
2. **Events / interactions covered:** CLI argument parsing, command planning, link validation, live-test sandbox decision logic.
3. **Fakes added:** local command-runner fakes if needed; no `vi.mock()`.
4. **Live tests:** none.
5. **Deferred:** full repo-wide tooling rewrite.

## Verification

```bash
pnpm vitest run tests/unit/render-verify-cli.test.ts tests/unit/live-cli.test.ts tests/unit/lint-markdown-links.test.ts tests/unit/inspect.test.ts
pnpm run inspect:crap
env -u SONAR_HOST_URL -u SONAR_TOKEN pnpm run inspect
pnpm run feedback
```

## Key files

- `scripts/render-verify.ts`
- `scripts/live.ts`
- `scripts/render-gallery.ts`
- `scripts/lint-markdown-links.ts`
- `scripts/test-live.ts`
- `tests/unit/*cli*.test.ts`
- `tests/unit/lint-markdown-links.test.ts`
