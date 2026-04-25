# CV7.E2.S1 — Register bpmn, excalidraw, and diagramsnet tags

**Status:** Draft

**Epic:** [CV7.E2 — Blocked Backend Tags](cv7-e2--blocked-backend-tags.md)
**Date:** 2026-04-25 (spec)

## Summary

Add `bpmn`, `excalidraw`, and `diagramsnet` to the Kroki processor's tag set. All three companion backends serve SVG only (same category as the CV5 tags: `d2`, `svgbob`, etc.), so they go through the existing SVG→PNG rasterization path via `@resvg/resvg-js`.

These tags only work when the Kroki endpoint has the companion services running — the public `kroki.io` does not. The tags are registered unconditionally in `KROKI_CANONICAL_TAGS` (same as all other Kroki tags), but the user sees a render error if the endpoint can't reach the backend. This matches the existing behavior: a misconfigured or offline endpoint already yields a clear error panel.

**Spike needed:** confirm the output format (SVG vs. PNG vs. mixed) and minimal source syntax for each backend before implementation. Canonical sources for bpmn (BPMN 2.0 XML), excalidraw (JSON), and diagramsnet (XML) need authoring.

## Done criterion

1. `bpmn`, `excalidraw`, and `diagramsnet` are in `KROKI_CANONICAL_TAGS` and `KROKI_SVG_ONLY_TAGS`.
2. Each tag has a canonical source in `tests/fixtures/kroki/canonical-sources.ts`.
3. Unit tests cover the three tags through `FakeHttpClient` → SVG→PNG path.
4. Contract tests include at least one companion tag.
5. Live tests verify all three tags against the compose stack (skip cleanly when stack is not running).
6. Live-derived fixtures are refreshed to include the new tags (requires compose stack).
7. `kroki-support.md` updated: tags move from "Backend unavailable" to a new "Companion-only" section.
8. `README.md`, `getting-started.md`, and `CHANGELOG.md` updated.
9. `/fence list` shows the tags. `/fence doctor` reports availability based on the endpoint.
10. `pnpm run feedback` stays green.

## Scope

**In scope:**

1. Adding three tags to `KROKI_SVG_ONLY_TAGS` and `KROKI_CANONICAL_TAGS`.
2. Canonical sources (minimal valid input per backend).
3. Unit, contract, and live test coverage.
4. Refreshing fixtures (requires compose stack from E1).
5. Documentation updates.

**Out of scope:**

1. Compose stack management — that's E1.
2. Availability probing per-tag (checking whether a specific companion is reachable). The Kroki gateway returns a clear HTTP error when a companion is down; pi-fence surfaces that as an error panel. No per-tag health check needed.
3. Aliases for these tags.

## Plan

### Design

**Output format hypothesis:** All three backends are JavaScript-based companion services (bpmn-js, Excalidraw, diagrams.net) that render to SVG. Kroki's gateway proxies the SVG response. Requesting `/bpmn/png` on the public endpoint yields `400: Unsupported output format: png` — same as the CV5 SVG-only tags. The SVG→PNG rasterization path handles this transparently.

**Spike:** Before implementation, verify with the compose stack:

```bash
# Start stack
docker compose -f docker/kroki-compose.yml up -d

# Probe each backend
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8000/bpmn/svg -d '<bpmn source>'
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8000/bpmn/png -d '<bpmn source>'
# Repeat for excalidraw, diagramsnet
```

If any backend serves PNG directly, it goes in the PNG-direct set instead of `KROKI_SVG_ONLY_TAGS`. The plan assumes SVG-only based on the ecosystem pattern.

**Canonical sources (draft — refine during spike):**

```typescript
// bpmn — minimal BPMN 2.0 XML with one start event and one task
{
  tag: "bpmn",
  source: `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ...>
  <process id="p1" isExecutable="false">
    <startEvent id="start"/>
    <task id="task1" name="Do something"/>
    <sequenceFlow sourceRef="start" targetRef="task1"/>
  </process>
</definitions>`,
}

// excalidraw — minimal JSON with one rectangle
{
  tag: "excalidraw",
  source: JSON.stringify({
    type: "excalidraw",
    elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 50 }],
  }),
}

// diagramsnet — minimal mxGraph XML
{
  tag: "diagramsnet",
  source: `<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="10" y="10" width="80" height="40" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`,
}
```

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spike | Start compose stack, probe output formats, author canonical sources. | (not committed — spike notes in story file or chat) |
| 2 | core + test | Add tags to `KROKI_SVG_ONLY_TAGS`, canonical sources, unit + contract tests. | `step 1: register bpmn, excalidraw, diagramsnet tags` |
| 3 | live + fixtures | Live tests against compose stack, refresh fixtures. | `step 2: live tests and fixtures for companion tags` |
| 4 | docs | Update `kroki-support.md`, `README.md`, `getting-started.md`, `CHANGELOG.md`. | `step 3: document companion backend support` |
| 5 | close | Close story + epic + CV. | `close CV7.E2.S1` |

## Tests

1. **Layers touched:**
   - **Unit** — three new tags through `FakeHttpClient` → SVG→PNG path; verify PNG magic bytes.
   - **Contract** — one companion tag (e.g. `bpmn`) through the contract helper.
   - **Live** — data-driven loop extended with three new tags, `skipIf` compose stack not running.
2. **Events / interactions covered:**
   - Kroki processor routes companion tags to `/svg` endpoint.
   - SVG→PNG rasterization produces valid PNG.
   - Error path: companion backend down → Kroki returns HTTP error → pi-fence surfaces error panel.
3. **Fakes added:** none new — reuses `FakeHttpClient` with SVG responses (same as CV5 SVG-only tags).
4. **Live tests added:** three new cases in the data-driven loop.
5. **Deferred:** per-tag availability probing, fixture staleness for companion tags (covered by CV6.E2 generically).

## Verification

```bash
docker compose -f docker/kroki-compose.yml up -d   # start full stack
pnpm test                                           # unit + contract
pnpm test:live                                      # live against compose stack
pnpm refresh-fixtures                               # capture companion fixtures
pnpm run feedback                                   # full fast gate
```

## Key files

- `extensions/pi-fence/kroki.ts` (`KROKI_SVG_ONLY_TAGS`, `KROKI_CANONICAL_TAGS`)
- `tests/fixtures/kroki/canonical-sources.ts`
- `tests/unit/kroki.test.ts`
- `tests/contract/kroki.contract.test.ts`
- `tests/integration/kroki.live.test.ts`
- `docs/product/kroki-support.md`
- `docs/getting-started.md`
- `README.md`
- `CHANGELOG.md`
