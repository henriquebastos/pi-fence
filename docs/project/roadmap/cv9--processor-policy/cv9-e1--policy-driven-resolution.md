# CV9.E1 — Policy-driven Resolution

**CV:** [CV9 — Processor Policy](README.md)
**Last updated:** 2026-04-25 — spec

## Summary

Replace registration-order processor selection with explicit policy:

1. processors declare a placement: `embedded`, `host`, `sandbox`, or `remote`;
2. config declares `processorPrecedence` as both precedence and placement allowlist;
3. tag bindings are object-shaped selector constraints, not escape hatches;
4. tags and processor ids can be blocked explicitly;
5. same-placement conflicts are ambiguous until the user binds a specific processor;
6. sandbox processors are backed by explicit controllers, not inferred from URLs;
7. built-in processor discovery can read standard processor factories without relying on code order.

## Naming convention

Processor ids follow `<family>-<placement>[-variant]`:

| Current role | Target id | Placement |
|--------------|-----------|-----------|
| table formatter | `table-embedded` | `embedded` |
| syntax highlighter | `highlight-embedded` | `embedded` |
| QR renderer | `qr-embedded` | `embedded` |
| color swatches | `color-embedded` | `embedded` |
| Graphviz host binary | `graphviz-host` | `host` |
| Mermaid host binary | `mermaid-host` | `host` |
| bundled command sandbox | `bundle-sandbox` | `sandbox` |
| managed Kroki service | `kroki-sandbox` | `sandbox` |
| unmanaged Kroki endpoint | `kroki-remote` | `remote` |

A processor may represent a language-specific tool, a bundled exec backend, or a service gateway. Tags describe what it can serve; placement describes its trust/control boundary.

A variant suffix is used only when multiple processors in the same family and placement need to coexist, for example `graphviz-sandbox-docker` and `graphviz-sandbox-podman`.

## Done criterion (epic-level)

1. `FenceProcessor` exposes a placement field with the four agreed values.
2. Default config is equivalent to:

   ```json
   {
     "processorPrecedence": ["embedded", "host", "sandbox", "remote"],
     "blocked": { "tags": [], "processors": [] },
     "bindings": {}
   }
   ```

3. The resolver chooses processors by policy, never by registration order across placements.
4. Same-placement multiple-candidate matches return a clear ambiguity result until a processor binding resolves them.
5. Object-only bindings support `{ "processor": "..." }` or `{ "placement": "..." }`, but not both.
6. Blocked tags and blocked processors override precedence, bindings, and fenced metadata.
7. Sandbox semantics are documented and implemented behind a control interface that starts with Docker but does not make Docker a permanent domain assumption.
8. `bundle-sandbox`, `kroki-sandbox`, and `kroki-remote` are distinct processors with distinct trust/control boundaries.
9. Built-in processors can be loaded through standard processor factories without encoding processor precedence in imports, filenames, or factory metadata.
10. Each story follows TDD: red test first, smallest green, refactor, then `pnpm run feedback`; completion uses `pnpm run inspect`.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv9-e1-s1--placement-precedence-tracer-bullet.md) | **Placement precedence tracer bullet** | Done |
| [S2](cv9-e1-s2--object-bindings-and-ambiguity.md) | **Object bindings and ambiguity** | Done |
| [S3](cv9-e1-s3--blocked-tags-and-processors.md) | **Blocked tags and processors** | Ready |
| [S4](cv9-e1-s4--sandbox-control-contract.md) | **Sandbox control contract** | Draft |
| [S5](cv9-e1-s5--bundle-sandbox-processor.md) | **Bundle sandbox processor** | Draft |
| [S6](cv9-e1-s6--kroki-sandbox-processor.md) | **Kroki sandbox processor** | Draft |
| [S7](cv9-e1-s7--processor-factory-discovery.md) | **Processor factory discovery** | Draft |

## Tracer-bullet rule

S1 is deliberately a vertical slice. It must carry one policy setting from config file parsing through resolver selection and extension rendering before broader binding/blocking/factory work starts. Later stories may refactor the shape, but not skip the red → green proof that the policy affects a real rendered block.

S5 and S6 are sandbox tracer bullets. S5 proves an exec sandbox through one multi-tag `bundle-sandbox` processor; S6 proves service sandboxes through `kroki-sandbox` with both single-container and Compose-backed runtimes.
