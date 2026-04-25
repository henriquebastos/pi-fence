# CV5.E1.S1 — Rasterize SVG-only Kroki languages via resvg

**Status:** Ready

**Epic:** [CV5.E1 — SVG→PNG Rasterization](cv5-e1--svg-rasterization.md)
**Date:** 2026-04-24 (spec)

## Summary

9 Kroki languages return SVG only on the public endpoint — requesting PNG yields `400: Unsupported output format: png`. pi-fence's rendering pipeline requires PNG (Kitty graphics protocol). This story extends the Kroki processor to request SVG for those tags and rasterize locally via `@resvg/resvg-js`, a zero-dep Rust-based SVG→PNG library (~3.5 MB native binary, lazy-loaded).

**Tags unlocked:** `d2`, `bytefield`, `dbml`, `nomnoml`, `pikchr`, `svgbob`, `wavedrom`.

**Excluded:** `bpmn` and `excalidraw` — Kroki's public endpoint lacks backend wiring (ECONNREFUSED), same category as `diagramsnet`. Not an SVG-only problem.

**Spike result:** all 9 tags confirmed working — Kroki returns valid SVG, resvg rasterizes to valid PNG with correct magic bytes.

## Done criterion

1. The Kroki processor serves all 7 SVG-only tags via the SVG→PNG path.
2. `@resvg/resvg-js` is a production dependency, lazy-loaded on first SVG-only render.
3. Tags appear in `/fence list` and `KROKI_CANONICAL_TAGS`.
4. Canonical sources exist in `tests/fixtures/kroki/canonical-sources.ts` for all 7 tags.
5. Unit tests cover the SVG→PNG path through `FakeHttpClient` (fake SVG in, real PNG out via resvg).
6. Contract tests cover one SVG-only tag.
7. Live tests verify all 7 tags against `https://kroki.io` (data-driven, same as existing tags).
8. Live-derived fixtures are refreshed to include the new tags.
9. `pnpm run feedback` is green.
10. Docs updated: `kroki-support.md`, `getting-started.md`, `README.md`, `CHANGELOG.md`.

## Scope

**In scope:**

1. Adding `@resvg/resvg-js` as a production dependency.
2. An `svg-to-png.ts` module wrapping resvg with lazy-load.
3. Extending the Kroki processor to request SVG and rasterize for SVG-only tags.
4. Adding the 9 tags to `KROKI_CANONICAL_TAGS` with canonical fixture sources.
5. Unit, contract, and live test coverage.
6. Refreshing live-derived fixtures.
7. Updating user-facing docs.

**Out of scope:**

1. Self-hosted Kroki configuration for these tags (already works via `kroki.endpoint`).
2. `diagramsnet` — backend unavailable on public endpoint, not an SVG-only problem.
3. Configurable rasterization dimensions beyond a sensible default.
4. SVG output mode for pi-fence (pipeline is PNG-only today).

## Plan

### Design

**SVG-only tag set:**

```typescript
const KROKI_SVG_ONLY_TAGS = new Set([
  "d2", "bpmn", "bytefield", "dbml",
  "nomnoml", "pikchr", "svgbob", "wavedrom",
  "excalidraw",
]);
```

**Render path change in `kroki.ts`:**

```text
if KROKI_SVG_ONLY_TAGS.has(tag):
  POST /{tag}/svg → SVG bytes
  svgToPng(svgBytes) → PNG bytes
  return { ok: true, png }
else:
  POST /{tag}/png → PNG bytes (existing path)
```

**`svg-to-png.ts` module:**

```typescript
export async function svgToPng(svg: string | Buffer): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 800 } });
  return Buffer.from(resvg.render().asPng());
}
```

Lazy import means `@resvg/resvg-js` is never loaded when only PNG-direct tags are rendered.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add CV5, epic, story. | `spec CV5.E1.S1` |
| 2 | core | Add `@resvg/resvg-js`, `svg-to-png.ts`, extend Kroki processor with SVG path, add 9 tags + canonical sources, unit + contract tests. | `step 1: SVG→PNG rasterization for 9 Kroki languages` |
| 3 | live + fixtures | Add live test coverage, refresh fixtures. | `step 2: live tests and fixtures for SVG-only tags` |
| 4 | docs | Update user-facing docs. | `step 3: document SVG-only language support` |
| 5 | close | Close story + epic + CV. | `close CV5.E1.S1` |

## Tests

1. **Layers touched:**
   - **Unit** — SVG→PNG path through FakeHttpClient returning canned SVG; verify PNG output has correct magic bytes.
   - **Contract** — one SVG-only tag (e.g. `d2`) through the contract helper.
   - **Live** — data-driven loop over all 9 new tags against `https://kroki.io`.
2. **Events / interactions covered:**
   - Kroki processor routes SVG-only tags to `/svg` endpoint.
   - `svgToPng` converts SVG to valid PNG.
   - Error path: malformed SVG returns `{ ok: false, error }`.
   - Existing PNG-direct tags are unaffected.
3. **Fakes added:** none new — reuses FakeHttpClient with SVG responses.
4. **Live tests added:** 9 new cases in the data-driven loop (one per tag + aliases).
5. **Deferred:** configurable rasterization dimensions, SVG passthrough mode.

## Verification

```bash
pnpm test
pnpm run feedback
pnpm test:live
pnpm refresh-fixtures
```

## Key files

- `extensions/pi-fence/svg-to-png.ts` (new)
- `extensions/pi-fence/kroki.ts`
- `tests/fixtures/kroki/canonical-sources.ts`
- `tests/unit/kroki.test.ts`
- `tests/contract/kroki.contract.test.ts`
- `tests/integration/kroki.live.test.ts`
- `docs/product/kroki-support.md`
- `docs/getting-started.md`
- `README.md`
- `CHANGELOG.md`
