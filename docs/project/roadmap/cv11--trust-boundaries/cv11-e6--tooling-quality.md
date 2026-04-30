# CV11.E6 — Tooling Quality

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-29 — planned

## Summary

Hold repo tooling to the same maintainability standard as the extension runtime. CLI scripts should have small pure parsers/planners, tested behavior, and atomic writes for generated repo artifacts.

The completion CRAP pass currently surfaces high-complexity, low-coverage tooling functions. This epic turns that signal into focused refactors without weakening the runtime lane.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e6-s1--atomic-tooling-artifact-writes.md) | **Atomic tooling artifact writes** | Ready |
| [S2](cv11-e6-s2--tooling-cli-quality-and-crap-reduction.md) | **Tooling CLI quality and CRAP reduction** | Ready |

## Done criterion (epic-level)

1. Fixture, manifest, golden, gallery, and verifier artifact writes use atomic sibling-temp writes and rename where practical.
2. CLI argument parsing and command planning for tooling scripts are pure and unit-tested.
3. `render-verify`, `live`, `render-gallery`, `lint-markdown-links`, and `test-live` reduce branchy orchestration in `main()`-style functions.
4. Broader CRAP inspection shows tooling hotspots reduced meaningfully, with target functions at or below 25 CRAP where practical.
5. `pnpm run inspect` with Sonar env unset passes.
6. `pnpm run feedback` passes.
