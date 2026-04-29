# CV9.E1.S7 — Processor factory discovery

**Status:** Done

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-29 (done)

## Summary

Move built-in processors behind standard factory registrations so `index.ts` stops importing concrete processor constructors and stops encoding the default processor set as hand-written construction order.

S7 keeps CV9's policy boundary intact: discovery answers "which built-in processors exist?" while the resolver answers "which processor wins?". No factory may carry precedence, priority, or order metadata.

Runtime directory scanning is out of scope for this story. The ready design uses a static, repo-owned built-in manifest that imports standard `processorFactory` exports from `extensions/pi-fence/processors/`. The manifest order is an implementation detail and must not affect cross-placement selection or same-placement ambiguity.

## Done criterion

1. Built-in processor registrations live behind thin modules under `extensions/pi-fence/processors/`.
2. Each built-in processor module exports one standard `processorFactory` registration.
3. A shared factory context provides HTTP, shell, logger, theme state, config, and sandbox controllers to every factory.
4. A pure loader validates module-like records, rejects missing/invalid exports, rejects duplicate ids, creates processors, and reports factory creation failures without crashing activation.
5. The built-in manifest collects the standard registrations and creates processors through the shared loader.
6. `index.ts` no longer imports concrete processor constructors such as `createGraphvizLocalProcessor`, `createKrokiProcessor`, or `createBundleSandboxProcessor`.
7. No factory registration exposes `order`, `priority`, or placement-precedence metadata.
8. Tests prove reversing or otherwise changing factory collection order does not change cross-placement resolver selection.
9. Tests prove same-placement conflicts remain ambiguous unless an object binding selects one processor.
10. Third-party event-bus registration still works and enters the same policy resolver as built-ins.
11. User-facing behavior from S1-S6 is preserved: embedded/host/sandbox/remote defaults, sandbox/remote fallback, Kroki sandbox auto-start policy, `/fence list`, and `/fence doctor`.
12. `pnpm run feedback` and `pnpm run inspect` pass or record environment-only skips/blockers.

## Scope

**In scope:**

1. Processor factory types and loader.
2. Thin built-in processor modules under `extensions/pi-fence/processors/`.
3. Static built-in manifest that imports those modules without assigning precedence.
4. Sandbox controller construction moved behind a reusable context builder so factories can consume controllers instead of `index.ts` constructing concrete processors.
5. Unit tests for validation, duplicates, create failure diagnostics, successful creation, order-independent resolver behavior, and same-placement ambiguity.
6. Extension tests for the default built-in factory set and third-party registration compatibility.
7. Dependency-cruiser updates only if the new paths require them.

**Out of scope:**

1. Runtime filesystem scanning or dynamic import of installed `.ts` files.
2. External package discovery or processor installation workflow.
3. Generated manifests.
4. Changing third-party event-bus registration semantics.
5. Changing resolver precedence, binding, blocking, or availability semantics.
6. Moving processor implementation files beyond the thin wrapper modules unless needed by architecture checks.

## Plan

1. **Factory contract and loader.** Add a deep, pure factory module that defines the context/registration shape, validates module-like records, rejects duplicate ids and precedence metadata, creates processors, and returns diagnostics instead of throwing.
2. **Built-in factory wrappers.** Add thin `processorFactory` modules for embedded, host, sandbox, and remote processors. Keep current implementation files as the behavior owners; wrappers only adapt context to existing constructors.
3. **Sandbox context.** Build sandbox controllers once from config and pass them through the factory context, preserving existing single-container, Compose, and bundle sandbox behavior.
4. **Composition root simplification.** Replace `index.ts`'s explicit concrete processor construction with the built-in loader. `index.ts` may still compose runtime dependencies and handlers, but not concrete processor factories.
5. **Policy preservation tests.** Prove factory order does not affect cross-placement selection, same-placement conflicts stay ambiguous, and third-party registrations still join the same resolver path.
6. **Inspection and docs.** Run `pnpm run feedback`, then `pnpm run inspect`; update docs/worklog/CHANGELOG only for user-visible behavior or close bookkeeping.

## Tests

1. **Layers touched:**
   - **Unit** — factory validation/collection, duplicate detection, create failure diagnostics, sandbox-aware built-in factories, order-independent resolver proof.
   - **Extension** — default factory-created processors still power representative `/fence list`, render, fallback, and third-party registration flows.
   - **Architecture** — dependency-cruiser remains green after the new wrapper folder.
2. **Events / interactions covered:**
   - Every built-in factory creates a processor from the shared context.
   - Invalid module records are rejected with clear diagnostics.
   - Duplicate factory ids are rejected before processor creation.
   - Factory creation failures are logged/skipped rather than crashing activation.
   - Cross-placement selection is stable under factory collection reorder.
   - Same-placement ambiguity between sandbox processors is not hidden by collection order.
   - Third-party event-bus registrations still pass through `validateProcessor`, `registerProcessor`, availability probing, and the policy resolver.
3. **Fakes added:** none expected; use inline module-like records plus existing fake HTTP, shell, logger, and extension API utilities.
4. **Live tests:** none required because S7 changes composition, not I/O seams. Run `pnpm test:live` only if implementation materially changes processor I/O behavior.
5. **Deferred:** runtime scanning, generated manifests, external package discovery, and package-manager integration.

## Verification

```bash
pnpm run feedback
pnpm run inspect
```

## Ready decisions

1. **Static manifest, not runtime scanning.** pi-fence currently runs TypeScript through pi's loader, but S7 does not need installed-extension directory scanning to remove constructor order from `index.ts`. A static manifest is explicit, testable, and package-safe.
2. **Factory order is not policy.** The manifest can list factories in any order; resolver tests prove placement policy and ambiguity rules own selection.
3. **Thin wrappers preserve test surface.** Existing processor implementation modules remain importable for unit, contract, and live tests. Wrapper modules only standardize construction.
4. **Extra exports are tolerated outside processor modules.** The loader validates the required `processorFactory` export and rejects precedence metadata on the registration; non-processor support modules are kept outside `extensions/pi-fence/processors/`.
5. **Activation is resilient.** A bad factory record or create failure yields diagnostics and skips that factory instead of taking down the extension.
