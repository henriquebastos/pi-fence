# CV5.E1 — SVG→PNG Rasterization

**Roadmap:** [CV5](README.md)
**Last updated:** 2026-04-24 — S1 Done

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv5-e1-s1--kroki-svg-to-png.md) | **Rasterize SVG-only Kroki languages via resvg** | ✅ Done |

## Done criterion (epic-level)

1. Every SVG-only Kroki language on the public endpoint renders inline as PNG.
2. The rasterizer is lazy-loaded — startup cost is zero when no SVG-only tag is rendered.
3. Live tests verify each new tag against the real public endpoint.
