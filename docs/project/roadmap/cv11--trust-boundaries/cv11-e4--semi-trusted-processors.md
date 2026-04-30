# CV11.E4 — Semi-trusted Processors

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-29 — planned

## Summary

Treat third-party processors as semi-trusted plugin objects. They can register through pi's event bus and run code in-process, but pi-fence validates their declared shape and normalizes their runtime results before those values enter resolver, list, render, or follow-up paths.

This epic does not sandbox third-party extension code. It prevents malformed registration data or malformed `available()` / `render()` results from corrupting pi-fence state.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e4-s1--processor-registration-shape-validation.md) | **Processor registration shape validation** | Done |
| [S2](cv11-e4-s2--third-party-processor-result-normalization.md) | **Third-party processor result normalization** | Ready |

## Done criterion (epic-level)

1. Processor ids, tags, placements, aliases, and factory metadata are validated at registration.
2. Alias maps are own objects with safe string keys, safe string targets, and targets that exist in canonical tags.
3. Registration preserves null-prototype maps or equivalent prototype-pollution safety.
4. `available()` throws or malformed results become unavailable diagnostics.
5. `render()` throws or malformed results become controlled pi-fence error output.
6. `/fence list`, `/fence doctor`, and `agent_end` remain stable when a third-party processor misbehaves.
7. `docs/guides/write-a-processor.md` documents the semi-trusted boundary and valid shapes.
8. `pnpm run feedback` passes.
