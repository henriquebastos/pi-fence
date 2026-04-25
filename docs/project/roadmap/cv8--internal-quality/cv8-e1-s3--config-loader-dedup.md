# CV8.E1.S3 — Config loader deduplication

**Status:** Ready

**Epic:** [CV8.E1 — Duplication Removal](cv8-e1--resolution-trace-unification.md)
**Date:** 2026-04-25 (spec)

## Summary

`io/config-loader.ts` has two near-identical read paths: `readConfigFile` and `readConfigFileWithStatus` share >90% of their logic (open file, handle ENOENT, parse JSON, validate). `loadPiFenceConfig` duplicates path computation from `loadPiFenceConfigWithStatus` — and has zero production callers (only tests call it). Delete `loadPiFenceConfig` and `readConfigFile` entirely. Rename `loadPiFenceConfigWithStatus` to `loadPiFenceConfig` — it's the only load function now, the suffix distinguishes it from nothing. Tests use a local alias to avoid noisy `.config` destructuring at every call site.

## Done criterion

1. `readConfigFile` is deleted. `readConfigFileWithStatus` is the sole read path.
2. Old `loadPiFenceConfig` is deleted. `loadPiFenceConfigWithStatus` is renamed to `loadPiFenceConfig`.
3. `index.ts` imports the renamed function.
4. Tests use a test-local `loadConfig` alias that destructures `.config`.
5. `pnpm run feedback` passes.

## Design decisions

**Delete, don't delegate.** `loadPiFenceConfig` (without status) has zero production callers — only tests. Wrapping the status variant adds a function that nobody in production calls. Delete it entirely.

**Rename `WithStatus` → bare name.** After deletion, `loadPiFenceConfigWithStatus` is the only load function. The `WithStatus` suffix distinguishes it from nothing. Rename to `loadPiFenceConfig` — cleaner API, the return type already communicates that status is included.

## Scope

**In scope:**

- Delete `readConfigFile`.
- Delete old `loadPiFenceConfig`.
- Rename `loadPiFenceConfigWithStatus` to `loadPiFenceConfig`.
- Update import in `index.ts`.
- Add test-local `loadConfig` alias in `config.test.ts`. Migrate ~20 call sites.
- Rename `loadPiFenceConfigWithStatus` test describe blocks to match.

**Out of scope:**

- Changing config validation or merge logic.
- Changing the return type (`ConfigLoadResult`).

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | impl | Delete `readConfigFile` and old `loadPiFenceConfig` from `config-loader.ts`. Rename `loadPiFenceConfigWithStatus` to `loadPiFenceConfig`. Update export. |
| 2 | impl | Update `index.ts` import to use the renamed function. |
| 3 | test | Add test-local `loadConfig` alias in `config.test.ts`. Migrate ~20 call sites. Rename `WithStatus` describe blocks. |
| 4 | refactor | Remove stale imports. `pnpm run feedback`. |

## Tests

- **Unit:** All existing `tests/unit/config.test.ts` tests pass unchanged — same assertions, same behavior, different function name at the call site.
- **Extension:** Extension tests wire config through `index.ts` which uses the renamed function — unaffected.
- **Fakes:** None new.
- **Live:** None affected.
- **Deleted:** None. Tests are migrated, not removed.

## Verification

`pnpm run feedback` — all five gates pass.

## Key files

**Modified:** `extensions/pi-fence/io/config-loader.ts` (delete two functions, rename one), `extensions/pi-fence/index.ts` (update import), `tests/unit/config.test.ts` (add alias, migrate calls, rename describes).
