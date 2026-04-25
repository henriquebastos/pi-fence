# CV6.E2 — Staleness Detection

**Roadmap:** [CV6](README.md)
**Last updated:** 2026-04-25 — spec

Committed fixtures ground the fast suite in real output, but they can go stale silently: Kroki upgrades a backend, `dot` changes its PNG encoder, `mmdc` bumps Chromium. Today nothing detects that drift — a contributor must remember to run `pnpm refresh-fixtures` and eyeball the diff. This epic adds an automated staleness check.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv6-e2-s1--fixture-staleness-check.md) | **Fixture staleness check command** | Draft |

## Done criterion (epic-level)

1. `pnpm run fixtures:check` re-renders every manifest entry against the live source, compares SHA-256 against the committed value, and reports per-fixture pass/stale/skip.
2. The command exits non-zero when any fixture is stale.
3. The command runs in the CI live workflow alongside `pnpm test:live`.
