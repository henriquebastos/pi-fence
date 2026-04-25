# CV6.E2.S1 — Fixture staleness check command

**Status:** Draft

**Epic:** [CV6.E2 — Staleness Detection](cv6-e2--staleness-detection.md)
**Date:** 2026-04-25 (spec)

## Summary

Add a `pnpm run fixtures:check` command that re-renders every entry in the fixture manifest against its live source, compares the SHA-256 of the fresh output to the committed value, and reports drift. Exits non-zero when any fixture is stale. Wire it into the CI live workflow so staleness is caught on every live run.

Two implementation approaches are viable:

1. **Separate script** (`scripts/check-fixtures.ts`) — clean separation from the write path.
2. **`--check` flag on `refresh-fixtures.ts`** — single entry point, two modes (refresh vs. check).

Option 2 is preferred: the render logic already lives in `refresh-fixtures.ts`; duplicating it would create a maintenance burden. `--check` skips the write step and compares instead.

## Done criterion

1. `pnpm run fixtures:check` re-renders every manifest entry against its live source (Kroki endpoint, Docker graphviz, Docker mmdc).
2. For each entry, the command compares the SHA-256 of the fresh render to the manifest's committed `sha256`.
3. Per-fixture output: `PASS`, `STALE` (sha256 mismatch), or `SKIP` (prerequisite absent).
4. Exit code 0 when all rendered fixtures pass. Exit code 1 when any fixture is stale. Exit code 0 when all fixtures skip (prerequisites absent).
5. `fixtures:check` is added to `.github/workflows/live.yml` alongside `pnpm test:live`.
6. SVG-only Kroki tags compare the final rasterized PNG, not the intermediate SVG (rasterization is part of the render path).
7. The command reuses `refreshKroki`, `refreshGraphviz`, and `refreshMermaidLocal` internals without writing files.
8. `pnpm run feedback` stays green (the check command is live-only).

## Scope

**In scope:**

1. Adding `--check` mode to `scripts/refresh-fixtures.ts`.
2. Adding a `fixtures:check` script entry in `package.json`.
3. Wiring into `.github/workflows/live.yml`.

**Out of scope:**

1. Automatic fixture refresh on staleness — the check reports, the human (or a follow-up CI step) decides whether to refresh and commit.
2. Tolerance thresholds (e.g., allowing small byte-count differences) — SHA-256 is exact. If backends produce non-deterministic output, that surfaces as permanent staleness and is addressed per-fixture, not by loosening the check.

## Plan

### Design

**`--check` mode in `refresh-fixtures.ts`:**

The existing `refreshKroki()`, `refreshGraphviz()`, and (after E1) `refreshMermaidLocal()` each return `FixtureEntry[]` with freshly computed `sha256`. In check mode, instead of writing files and updating the manifest, the script:

1. Loads the existing manifest.
2. Runs each refresh function in memory (or to a temp dir).
3. For each entry the refresh produced, finds the matching manifest entry by `processor + tag`.
4. Compares `sha256`. Match → `PASS`. Mismatch → `STALE` (prints old vs. new hash).
5. Manifest entries not covered by the refresh (prerequisites absent) → `SKIP`.

```text
$ pnpm run fixtures:check
[fixtures:check] kroki/mermaid        PASS
[fixtures:check] kroki/graphviz       PASS
[fixtures:check] kroki/d2             STALE  (committed: abc... fresh: def...)
[fixtures:check] graphviz/graphviz    PASS
[fixtures:check] mermaid-local/mermaid SKIP (container not running)

1 stale fixture(s) — run `pnpm refresh-fixtures` to update.
```

**CI integration:**

```yaml
# .github/workflows/live.yml
- name: Check fixture staleness
  run: pnpm run fixtures:check
```

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | tooling | Add `--check` mode to `refresh-fixtures.ts`, add `fixtures:check` script. | `step 1: fixture staleness check command` |
| 2 | ci | Wire into `.github/workflows/live.yml`. | `step 2: staleness check in CI live workflow` |
| 3 | close | Verify, close story + epic + CV. | `close CV6.E2.S1` |

## Tests

1. **Layers touched:**
   - **Unit** — the check logic is deterministic given a manifest and fresh entries; a unit test can exercise it with synthetic data (two manifests, one matching, one drifted).
2. **Events / interactions covered:**
   - All-pass scenario: fresh sha256 matches every committed entry.
   - Stale scenario: one or more sha256 mismatches → exit 1.
   - All-skip scenario: no prerequisites → exit 0.
   - Mixed: some pass, some stale, some skip → exit 1.
3. **Fakes added:** none — the comparison logic is pure; tests supply synthetic manifests.
4. **Live tests added:** none — `fixtures:check` is itself a live command; its correctness is verified by the unit test on the comparison logic + manual confirmation during CI integration.
5. **Deferred:** tolerance thresholds for non-deterministic backends; automatic refresh-on-stale.

## Verification

```bash
pnpm live:up
pnpm run fixtures:check        # expect all PASS on a fresh refresh
# Manually corrupt one fixture sha in manifest → rerun → expect STALE
pnpm run feedback
```

## Key files

- `scripts/refresh-fixtures.ts` (extended with `--check` mode)
- `package.json` (`fixtures:check` script)
- `.github/workflows/live.yml`
