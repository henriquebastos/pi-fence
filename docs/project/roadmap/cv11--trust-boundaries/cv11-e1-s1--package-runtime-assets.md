# CV11.E1.S1 — Package runtime assets resolve from npm installs

**Status:** Ready

**Epic:** [CV11.E1 — Installed Runtime Trust](cv11-e1--installed-runtime-trust.md)
**Date:** 2026-04-29 (spec)

## Summary

Make installed pi-fence packages self-contained for every runtime asset the extension exposes. A source checkout has `docker/kroki/compose.yaml` and `gondolin/bundle/*`; an npm install currently publishes only `extensions/` plus top-level docs/license files. Any installed workflow that needs a Compose file or local Gondolin bundle asset must resolve it from the installed package, not from the user's project cwd.

## Done criterion

1. `npm pack --dry-run --json` includes all runtime assets required by exposed installed workflows.
2. `docker/kroki/compose.yaml` is present in the package when Compose-backed Kroki is available from an npm install.
3. Gondolin bundle assets are either present in the package or every installed command/config path that needs them reports a clear unavailable reason.
4. Runtime code resolves package assets from `import.meta.url` / package-relative paths, never from a user project-relative `docker/...` path.
5. Unit tests prove package contents and Compose command path behavior.
6. `pnpm run feedback` passes.

## Scope

**In scope:**

1. `package.json` `files` updates.
2. A package/runtime asset resolver for the Kroki Compose file.
3. Tests around `npm pack --dry-run --json` or direct `package.json.files` plus controller command arguments.
4. Docs/comments clarifying source-checkout-only assets if any are intentionally not shipped.

**Out of scope:**

1. Changing Kroki endpoint validation — S2.
2. Changing Docker port binding — S3.
3. Publishing a Gondolin image.
4. Refactoring sandbox controller state machines beyond asset-path injection.

## Plan

1. **RED — package contents.** Add/update `tests/unit/package-scripts.test.ts` so it fails when runtime assets required by installed workflows are absent from the npm package.
2. **GREEN — publish assets.** Update `package.json.files` to include required runtime assets, or disable/report unavailable installed workflows for assets not shipped.
3. **RED — Compose path.** Add a unit test in `tests/unit/sandbox.test.ts` proving `createKrokiDockerComposeSandboxController()` invokes Docker Compose with a package-resolved absolute compose file path.
4. **GREEN — asset resolver.** Add a small resolver, likely in `extensions/pi-fence/sandbox.ts` or `sandbox-context.ts`, and inject/use it for Compose controllers.
5. **REFACTOR.** Keep path resolution at the adapter/composition boundary. Do not introduce `process.cwd()` into pure modules.

## Tests

1. **Layers touched:** unit/tooling and sandbox controller unit tests.
2. **Events / interactions covered:** npm package file inclusion and Docker Compose command construction.
3. **Fakes added:** none expected; existing `FakeShellRunner` can capture Docker commands.
4. **Live tests:** none required for this story; live Compose behavior remains covered by existing live lanes when run later.
5. **Deferred:** actual npm publish verification; `npm pack --dry-run --json` is the local proof.

## Verification

```bash
pnpm vitest run tests/unit/package-scripts.test.ts tests/unit/sandbox.test.ts
pnpm exec npm pack --dry-run --json
pnpm run feedback
```

## Key files

- `package.json`
- `extensions/pi-fence/sandbox.ts`
- `extensions/pi-fence/sandbox-context.ts`
- `tests/unit/package-scripts.test.ts`
- `tests/unit/sandbox.test.ts`
