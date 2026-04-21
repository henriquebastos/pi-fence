[< CV0 — It Works](../README.md)

# CV0.E2 — Graphviz Local

**Roadmap:** [CV0.E2](../../README.md)
**Last updated:** 2026-04-20

The second processor. CV0.E1 shipped with a single Kroki processor whose logic sits inline in the extension entry; every `graphviz`/`dot` block leaves the machine on the way to `kroki.io`. CV0.E2 proves the registry pattern by adding a processor that shells out to the local `dot` binary, wins the `graphviz`/`dot` tag when the binary is available, and lets Kroki handle every other tag — and `graphviz` itself on machines that don't have `dot` installed — unchanged.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv0-e2-s1-local-graphviz/README.md) | **I use local graphviz when I want privacy and offline** | ✅ Done |
| [S2](cv0-e2-s2-tag-binding/README.md) | **I bind a tag to a specific processor in settings** | ✅ Done |

`S1` delivers capability-based resolution: register `graphviz-local` before `kroki`, probe each processor's `available()` once at session start, and let the first available processor that claims the tag render it. That's the whole rule — no user-facing config, no per-tag override. A user who has `dot` installed stops hitting `kroki.io` for DOT blocks; a user who does not is unchanged.

`S2` adds the explicit override. A user who has both `dot` installed *and* a preference for Kroki (or vice versa) binds the tag to the processor they want. `S2` is the first story that reads `~/.pi/agent/pi-fence.config.json`; `S1` stays config-less.

---

## Deliverable vision

I have `graphviz` installed on my laptop. I ask the assistant for a ```` ```dot ```` diagram. pi-fence renders it inline — the same PNG I saw before CV0.E2 — but the diagram source never leaves my machine. `/fence list` shows two processors:

```text
Processors

  graphviz-local [registered] — graphviz (dot)
  kroki          [registered] — mermaid, graphviz (dot), plantuml (puml), …
```

I `apt remove graphviz`, `/reload` pi, and the same block renders again — now via Kroki. `/fence list` shows:

```text
Processors

  graphviz-local [unavailable] — graphviz (dot)
      dot binary not found on PATH. Install via: apt install graphviz
  kroki          [registered]  — mermaid, graphviz (dot), plantuml (puml), …
```

Nothing about my pi session changed. pi-fence adapted to what's installed.

**Done criterion (CV0.E2):** two processors collaborate end-to-end.

1. With `graphviz` installed locally, a ```` ```dot ```` or ```` ```graphviz ```` block renders with zero HTTP traffic to `kroki.io`. Verified by extension-test assertions on a `FakeHttpClient`'s captured calls.
2. Without `graphviz`, the same block renders via Kroki exactly as it did in CV0.E1. No user-visible regression.
3. Every other tag (mermaid, plantuml, blockdiag family, …) continues through Kroki unchanged.
4. `/fence list` shows both processors and their availability so the user can see which one serves their most recent render.
5. A user who prefers a specific processor for a tag can express that in settings (`S2`).

---

## Architecture

Same parser, same hook, same renderer. New: a **resolution step** between "parsed a block" and "render it".

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
│ parse fenced blocks  │
└─────────┬────────────┘
          │
          ▼  for each block (tag, source)
┌──────────────────────────────────────────────┐
│ resolve(tag) → FenceProcessor | null         │
│   iterate registered processors in order;    │
│   return the first one whose tags/aliases    │
│   cover `tag` AND whose available() was ok   │
└─────────┬────────────────────────────────────┘
          │
          ▼
┌───────────────────────────┐       ┌──────────────────┐
│ graphviz-local.render()   │  or   │ kroki.render()   │
│   dot -Tpng, source on    │       │   POST kroki.io  │
│   stdin                   │       │                  │
└─────────┬─────────────────┘       └────────┬─────────┘
          │                                   │
          └──────────────────┬────────────────┘
                             ▼
                   pi-fence:output custom message
```

`available()` is probed once per session at wire time, not per render. A user who installs `dot` mid-session needs a `/reload` to see pi-fence pick it up — acceptable in CV0; a future `/fence doctor --refresh` story revisits.

### Registration order = default precedence

Processors are pushed in the order they should be preferred: graphviz-local first, Kroki second. Without an explicit per-tag binding (`S2`), the first available match wins. Registration order is the one piece of precedence this Epic commits to; everything else is user-owned via settings in `S2`.

---

## Scope boundaries

### In scope for this Epic

- `FenceProcessor.available()` as a required method on the interface.
- A graphviz-local processor that shells out via `ShellRunner` to `dot -Tpng`, reading source on stdin.
- Per-tag capability-based resolution (`S1`).
- Explicit per-tag processor bindings in settings (`S2`).
- `/fence list` surfacing availability + install hints for unavailable processors.

### Deferred

- Local mermaid via `mmdc` — [CV2.E1](../../README.md#cv2e1--mermaid-local).
- Theme tracking for graphviz-local. Kroki has `?theme=dark`; graphviz's equivalent is `-G bgcolor=…` plus node/edge recolouring, a bigger shape. Graphviz-local renders DOT's default colour scheme; theme-aware DOT is a later story.
- `/fence doctor` and real endpoint-health probing.
- Mid-session availability refresh.
- Cache of rendered PNGs.

### Consciously accepted limitations

1. **Capability check runs once per session.** A contributor who installs `dot` mid-session sees no effect until `/reload`.
2. **graphviz-local renders in the DOT default colour scheme regardless of pi's theme.** Matches what Kroki does on light pi themes today (no `?theme=dark`); not better, not worse.
3. **No cache.** Same as CV0.E1.

---

## Repository layout after this Epic

```text
pi-fence/
├── extensions/
│   └── pi-fence/
│       ├── index.ts             ← adds resolve(tag) + graphviz-local registration
│       ├── parser.ts            (unchanged)
│       ├── processor.ts         ← FenceProcessor gains available()
│       ├── kroki.ts             ← gains a trivial available()
│       ├── graphviz-local.ts    ← new
│       ├── list.ts              ← status widens to registered | unavailable
│       └── renderer.ts          ← list line grows a reason line when unavailable
└── tests/
    ├── unit/
    │   ├── graphviz-local.test.ts
    │   └── resolve.test.ts            (or inline in index.test.ts — decide on encounter)
    ├── contract/
    │   └── graphviz-local.contract.test.ts
    └── integration/
        └── graphviz-local.live.test.ts
```

Small addition. ~250 LOC of feature code across `graphviz-local.ts` + resolution + list widening, plus tests.

---

**See also:** [Story S1](cv0-e2-s1-local-graphviz/README.md) · [Briefing](../../../briefing.md) · [Principles](../../../../product/principles.md)
