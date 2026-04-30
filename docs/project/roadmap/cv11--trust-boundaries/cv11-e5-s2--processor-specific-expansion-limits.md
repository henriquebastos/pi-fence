# CV11.E5.S2 — Processor-specific expansion limits

**Status:** Ready

**Epic:** [CV11.E5 — Render Resource Limits](cv11-e5--render-resource-limits.md)
**Depends on:** [CV11.E5.S1 — Fence source and output limits](cv11-e5-s1--fence-source-and-output-limits.md)
**Date:** 2026-04-29 (spec)

## Summary

Add focused caps for processors whose work can expand disproportionately or consume CPU/memory before the generic output limit catches it: QR generation, CSV/JSONL table parsing, SVG rasterization, host Mermaid/Graphviz, and bundle-sandbox renderers.

## Done criterion

1. QR processor rejects inputs above its processor-specific safe size before calling `QRCode.toBuffer()`.
2. Table processor has row/column/cell or byte limits sufficient to prevent huge table expansion.
3. SVG rasterization rejects SVG input above a safe cap before `@resvg/resvg-js` renders it.
4. Mermaid/Graphviz host and bundle paths either rely on generic source/output limits with explicit tests or add processor-specific time/size guards.
5. Every limit failure returns visible pi-fence error output.
6. Tests cover each processor-specific guard or document why the generic guard is enough.
7. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Processor-level checks in `qr.ts`, `table.ts`, `svg-to-png.ts`, `mermaid-local.ts`, `graphviz-local.ts`, and `bundle-sandbox.ts` as needed.
2. Unit tests around limit behavior.
3. Shared helper functions only if duplication becomes real.

**Out of scope:**

1. Changing renderer visual layout.
2. Adding external process memory controls beyond existing sandbox/Docker settings.
3. Full streaming parser rewrites for CSV/JSONL unless needed to satisfy limits safely.

## Plan

1. **RED — QR cap.** Add QR unit test proving oversized content returns error without generating a PNG.
2. **GREEN — QR check.** Enforce cap using resolved/default limits or a local constant tied to policy.
3. **RED — table cap.** Add CSV/JSONL tests for too many rows/columns/cells/bytes.
4. **GREEN — table checks.** Enforce before formatting large outputs.
5. **RED — SVG cap.** Add test for `svgToPng()` rejecting oversized SVG.
6. **GREEN — SVG check.** Enforce before lazy-loading/rasterizing.
7. **RED/GREEN — host/sandbox coverage.** Add tests documenting generic limits or adding specific guards for Mermaid/Graphviz/bundle.
8. **REFACTOR.** Consolidate limit error text enough that `/fence` output is understandable.

## Tests

1. **Layers touched:** unit processor tests and maybe contract tests if result shape is affected.
2. **Events / interactions covered:** QR, table, SVG, host process, and sandbox process limit paths.
3. **Fakes added:** none expected.
4. **Live tests:** none required unless process timeout behavior changes.
5. **Deferred:** streaming CSV parser if fixed caps are enough.

## Verification

```bash
pnpm vitest run tests/unit/qr.test.ts tests/unit/table.test.ts tests/unit/kroki.test.ts tests/unit/mermaid-local.test.ts tests/unit/graphviz-local.test.ts tests/unit/bundle-sandbox.test.ts
pnpm run feedback
```

## Key files

- `extensions/pi-fence/qr.ts`
- `extensions/pi-fence/table.ts`
- `extensions/pi-fence/svg-to-png.ts`
- `extensions/pi-fence/mermaid-local.ts`
- `extensions/pi-fence/graphviz-local.ts`
- `extensions/pi-fence/bundle-sandbox.ts`
