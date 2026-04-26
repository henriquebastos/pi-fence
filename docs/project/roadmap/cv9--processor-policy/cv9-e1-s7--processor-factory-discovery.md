# CV9.E1.S7 — Processor factory discovery

**Status:** Draft

**Epic:** [CV9.E1 — Policy-driven Resolution](cv9-e1--policy-driven-resolution.md)
**Date:** 2026-04-25 (spec)

## Summary

Move built-in processors behind a standard factory export so `index.ts` no longer imports each processor and calls every concrete factory explicitly. Discovery must not encode precedence in filenames, import order, or numeric `order` fields; CV9 policy owns selection.

Target shape:

```typescript
interface ProcessorFactoryContext {
  http: HttpClient;
  shell: ShellRunner;
  logger: Logger;
  themeState: ThemeState;
  config: PiFenceConfig;
  sandboxes: ReadonlyMap<string, SandboxController>;
}

interface ProcessorFactoryRegistration {
  readonly id: string;
  create(context: ProcessorFactoryContext): FenceProcessor | Promise<FenceProcessor>;
}
```

Each module under `extensions/pi-fence/processors/` exports exactly one standard factory registration.

## Done criterion

1. Built-in processor modules live under `extensions/pi-fence/processors/` or thin wrapper modules there export their factories.
2. Each built-in processor factory exposes a standard `processorFactory` export.
3. The built-in loader reads/collects all built-in factories and creates processors through the standard context.
4. `index.ts` no longer imports concrete processor factories such as host, embedded, sandbox, or remote factory functions directly.
5. No factory has an `order`, `priority`, or placement-precedence field.
6. Tests prove changing factory collection order does not change cross-placement selection.
7. Same-placement conflicts remain ambiguous unless an object binding selects one processor.
8. Third-party event-bus registration still works and enters the same policy resolver as built-ins.
9. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Processor factory interface and loader.
2. Moving or wrapping existing built-in processors under a processors folder.
3. Dependency injection context for HTTP, shell, logger, theme/config, and sandbox controllers.
4. Tests for loader validation, duplicate factory ids, invalid factory exports, and order-independent resolution.
5. Dependency-cruiser updates if paths change.

**Out of scope:**

1. Third-party filesystem discovery outside pi-fence's package.
2. Processor installation/package manager workflow.
3. Changing third-party event-bus registration semantics.
4. Using factory discovery to decide precedence.

## Plan

This story stays Draft until S1-S6 land. Once ready, implement with TDD:

| Step | TDD phase | Layer | What | Commit |
|------|-----------|-------|------|--------|
| 1 | red | Unit | Add tests for processor factory validation: missing export, duplicate id, create failure, and successful factory creation. | `step 1: processor factory contract` |
| 2 | green/refactor | Unit | Add factory types and a pure collector/validator that accepts module-like records. | same |
| 3 | red | Unit | Add tests proving processor creation order does not affect resolver outcome across placements and same-placement conflicts stay ambiguous. | `step 2: order-independent built-ins` |
| 4 | green/refactor | Unit | Add built-in factory registrations for current processors and route default processor creation through the loader. | same |
| 5 | red | Extension | Add extension test proving the default factory set still renders representative `sql`, `dot`, and `mermaid` blocks under policy config. | `step 3: factory loader tracer bullet` |
| 6 | green/refactor | Extension | Remove explicit concrete factory calls from `index.ts`; keep only the built-in loader. | same |
| 7 | red | Architecture | Add/update dependency-cruiser expectations so processor implementations stay independent after moving paths. | `step 4: processor folder boundaries` |
| 8 | green/refactor | Architecture | Update import paths and architecture rules. | same |
| 9 | verify | All fast | Run `pnpm run feedback`, then `pnpm run inspect`. | same |

## Tests

1. **Layers touched:**
   - **Unit** — factory validation/collection, duplicate detection, order-independent resolver proof.
   - **Extension** — default built-in factory set still wires through the real extension.
   - **Architecture** — dependency-cruiser rules for processor independence after path changes.
2. **Events / interactions covered:**
   - All built-in factories create processors from the shared context.
   - Invalid factory modules are rejected with a diagnostic instead of crashing activation.
   - Factory collection order has no semantic effect across placements.
   - Third-party event-bus registrations still append/register into the same policy pipeline.
3. **Fakes added:** none expected; module-like records can be inline test objects.
4. **Live tests:** none required unless moving processor modules accidentally changes I/O seams; run `pnpm test:live` if processor path changes touch live processors materially.
5. **Deferred:** external package discovery.

## Verification

```bash
pnpm run feedback
pnpm run inspect
```

## Open questions before marking Ready

1. Does pi's TypeScript loader support runtime directory scanning plus dynamic import of `.ts` processor modules in installed extensions?
2. If not, should we keep a generated/static manifest while still ensuring manifest order does not imply processor precedence?
3. Should factory validation reject unknown exports strictly, or tolerate extra exports for test helpers and constants?
