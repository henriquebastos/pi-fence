# CV0.E1 — Kroki Through The Wire

**Roadmap:** [CV0.E1](../README.md)
**Last updated:** 2026-04-22

The thinnest possible path through the system. Hook → parse → Kroki → inline image. No registry, no config, no tool yet — those come in later Epics once this path proves end-to-end.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S0](cv0-e1-s0--testing-foundation.md) | **Testing foundation: I can run unit, contract, extension, and live tests from a clean clone** | ✅ Done |
| [S1](cv0-e1-s1--mermaid-via-kroki.md) | **I see my mermaid diagram rendered as a PNG when the assistant answers** | ✅ Done |
| [S2](cv0-e1-s2--other-kroki-tags.md) | **I see other Kroki-supported diagrams (graphviz, plantuml, d2) through the same path** | ✅ Done |
| [S3](cv0-e1-s3--fence-list.md) | **I can see which processors are registered and their status** (`/fence list`) | ✅ Done |
| [S4](cv0-e1-s4--full-kroki-text-coverage.md) | **Every text-based language the public Kroki endpoint supports renders through pi-fence** | ✅ Done |
| [S5](cv0-e1-s5--kroki-json-body-languages.md) | **JSON-body Kroki languages (Vega, Vega-Lite, Excalidraw) render through pi-fence** | ✅ Done |

`S0` lands before `S1`. It defines the test architecture, utilities, Docker image for live dependencies, and the mandatory `Tests` section structure in every future story plan. `S1` is then implemented test-first against the infrastructure `S0` provides.

`S3` closes the first user-visible feature set with a read-only `/fence list` command. `S4` and `S5` expand the Kroki coverage to match the Epic's name ("Kroki Through The Wire") with evidence: every language Kroki hosts on the public endpoint should render through pi-fence, subject to verified support. `S5` is split out because JSON-body languages (Vega, Excalidraw) need a different `Content-Type` and body shape than the text-based flow S1/S2/S4 use; the kroki processor gains a small dispatch there.

## Deliverable vision

I open pi in a directory and ask: *"Draw a mermaid diagram of an OAuth 2.0 authorization code flow."*

The assistant responds with a mermaid fenced block as it normally would. Immediately below the assistant's text, pi-fence shows a rendered PNG of the diagram, inline in the terminal. Nothing I did after `pi install npm:pi-fence` made this happen — it just works.

Then I ask: *"Same thing as a graphviz DOT graph."* — and the same mechanism handles it. And plantuml. And d2. Because Kroki speaks 30+ languages, S2 is mostly about proving the parser doesn't choke on tags other than `mermaid`.

**Done criterion (CV0.E1):** pi-fence installed with zero configuration renders every diagram language the public Kroki endpoint supports — including JSON-body languages like Vega-Lite and Excalidraw — from the assistant's output as inline PNGs. `/fence list` shows `kroki` as the active processor and enumerates the supported tags. Each supported language has at least one live test asserting it renders end-to-end; languages Kroki's public endpoint does not serve are documented as unsupported with a pointer to self-hosted Kroki (CV2.E2).

## Architecture

Narrow slice. One hook, one processor, one renderer.

```text
assistant writes markdown
        │
        ▼
┌────────────────────┐
│ pi.on("agent_end") │
└─────────┬──────────┘
          │
          ▼
┌──────────────────────┐
│ parse fenced blocks  │   (tag, body)
└─────────┬────────────┘
          │
          ▼  for each supported tag
┌──────────────────────┐
│ kroki processor      │   POST {endpoint}/{tag}/png
│  - fetch PNG bytes   │   body: source
│  - return image      │
└─────────┬────────────┘
          │
          ▼
┌────────────────────────────┐
│ pi.sendMessage(            │
│   customType: pi-fence:out,│
│   content: [image, text],  │
│ )                          │
└─────────┬──────────────────┘
          │
          ▼
┌──────────────────────────────┐
│ registerMessageRenderer      │
│ draws inline PNG in terminal │
└──────────────────────────────┘
```

### Supported tags in this Epic

Hardcoded whitelist. Anything Kroki supports that a user is likely to type:

`mermaid`, `graphviz`, `dot`, `plantuml`, `puml`, `d2`, `nomnoml`, `wavedrom`, `bpmn`, `vega`, `vegalite`, `vega-lite`, `structurizr`, `erd`, `pikchr`, `svgbob`, `excalidraw`.

Normalized via a small alias map (`dot` → `graphviz`, `puml` → `plantuml`, `vegalite`/`vega-lite` → `vega`) before the HTTP request.

### Endpoint

Hardcoded to `https://kroki.io` in CV0. Configuration comes in [CV1 — Take Control](../cv1--take-control/README.md).

### Hook choice

Only `agent_end`, not `input` and not `message_update`. Rationale:

- `input` (user blocks) is additional surface area for zero extra win in the happy path. Add in a later Story if demand appears.
- `message_update` (streaming) risks flicker as the assistant types a partial block. Render once, on turn end.

### Render output shape

`content` array with two items:

1. `{ type: "image", data: <base64>, mimeType: "image/png" }` — inline image for the terminal.
2. `{ type: "text", text: "Rendered <tag> via kroki" }` — fallback when inline images aren't supported.

`details` carries the source, tag, and byte count for the message renderer to use on expand.

## Scope boundaries

### In scope for this Epic

- Node fetch against `https://kroki.io/{tag}/png`
- Fenced-block parser that handles nested fences correctly
- Mapping of alias tags
- Custom message type `pi-fence:output` and its renderer
- `/fence list` showing the single hardcoded processor

### Deferred

- Any concept of a `FenceProcessor` interface — the Kroki logic is inline, not a plugin yet. (Abstraction arrives in CV0.E2 when a second processor appears.)
- User settings (endpoint, enable/disable, per-tag processor binding) — [CV1 — Take Control](../cv1--take-control/README.md)
- Error feedback surface — [CV1 — Take Control](../cv1--take-control/README.md)
- Local renderers (graphviz binary, mmdc) — [CV0.E2](cv0-e2--graphviz-local.md) and [CV2 — Work Offline](../cv2--work-offline/README.md)
- Docker Kroki — [CV2 — Work Offline](../cv2--work-offline/README.md)
- Cache, render limits, deduplication — decide with real usage

### Consciously accepted limitations

1. **Hardcoded Kroki endpoint.** No user can point elsewhere until CV1.
2. **Every render hits the network.** No cache. Small diagrams are small round-trips; acceptable for MVP.
3. **Assistant only.** User-typed blocks are not rendered.
4. **No parse validation.** A bad mermaid goes to Kroki; Kroki's error comes back. Good enough — the error is visible.
5. **No privacy warning yet.** CV1 adds it along with config.

## Repository layout after this Epic

```text
pi-fence/
├── extensions/
│   └── pi-fence/
│       ├── index.ts         ← entry: hooks, commands, message renderer
│       ├── parser.ts        ← fenced-block extraction
│       ├── kroki.ts         ← hardcoded HTTP call + tag alias map
│       └── renderer.ts      ← custom message renderer
└── tests/
    └── parser.test.ts       ← unit tests for the parser (the only unit-testable piece)
```

Small. ~300 LOC. The shape grows in CV0.E2 when extracting the `FenceProcessor` interface earns its place.
