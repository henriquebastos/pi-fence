[< Docs](../../README.md)

# Roadmap — pi-fence

> Where the project is headed. Iterative, customer-value-first. Each CV delivers value on its own; each Epic closes with a done criterion; each Story ends with a verifiable "it works".

**Last updated:** 2026-04-18 (initial draft).

---

## Community Value types

| Type | Definition |
|------|-----------|
| **Legibility** | What I read in the terminal is more intelligible than raw source |
| **Extensibility** | Others can add processors without touching the core |
| **Control** | The user decides what is processed and how |
| **Portability** | Works online, offline, self-hosted — no backend lock-in |
| **Verifiability** | The project's correctness is provable by automation (cross-cutting — see [briefing](../briefing.md#community-value)) |

---

## CV0 — It Works `legibility` ← CURRENT FOCUS

> The extension renders diagrams inline. Happy-path only: mermaid via Kroki public endpoint, interception on the assistant's turn. Everything else deferred.

### [CV0.E1 — Kroki Through The Wire](cv0-it-works/cv0-e1-kroki-through-the-wire/README.md)

> **Goal:** the thinnest possible path from "LLM writes ```mermaid" to "I see a PNG inline". One hardcoded processor, one hook, one custom message renderer.
> **Done criterion:** I ask the assistant for an OAuth flow diagram; the assistant answers with a mermaid fenced block; I see the rendered PNG in my Ghostty terminal immediately below the text.

| Code | Story | Status |
|------|-------|--------|
| [CV0.E1.S0](cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s0-testing-foundation/README.md) | **Testing foundation: I can run unit, contract, extension, and live tests from a clean clone** | ✅ Done |
| [CV0.E1.S1](cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s1-mermaid-via-kroki/README.md) | **I see my mermaid diagram rendered as a PNG when the assistant answers** | ✅ Done |
| [CV0.E1.S2](cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s2-other-kroki-tags/README.md) | **I see other Kroki-supported diagrams (graphviz, plantuml, d2) through the same path** | ✅ Done |
| [CV0.E1.S3](cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s3-fence-list/README.md) | **I can see which processors are registered and their status** (`/fence list`) | ✅ Done |
| [CV0.E1.S4](cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s4-full-kroki-text-coverage/README.md) | **Every text-based language the public Kroki endpoint supports renders through pi-fence** | Planned |
| [CV0.E1.S5](cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s5-kroki-json-body-languages/README.md) | **JSON-body Kroki languages (Vega, Vega-Lite, Excalidraw) render through pi-fence** | Planned |

### CV0.E2 — Graphviz Local

> **Goal:** prove the registry pattern by plugging a second processor that competes with Kroki for the same tag (`dot`/`graphviz`).
> **Done criterion:** with `graphviz` installed locally, a ```dot block renders without hitting Kroki; without it, Kroki handles the same block.

| Code | Story | Status |
|------|-------|--------|
| `CV0.E2.S1` | **I use local graphviz when I want privacy and offline** | Planned |
| `CV0.E2.S2` | **I bind a tag to a specific processor in settings** | Planned |

---

## CV1 — Take Control `control`

> The user owns the registry. Explicit configuration, diagnosis, and the hybrid tool mode.

### CV1.E1 — Explicit Configuration

| Code | Story | Status |
|------|-------|--------|
| `CV1.E1.S1` | **I enable/disable processors in settings with persistence** | Planned |
| `CV1.E1.S2` | **I configure the Kroki endpoint (public, local Docker, self-hosted)** | Planned |
| `CV1.E1.S3` | **I run `/fence doctor` and see what's available and what's missing** | Planned |

### CV1.E2 — Error Feedback Loop

| Code | Story | Status |
|------|-------|--------|
| `CV1.E2.S1` | **I see readable errors in place of broken diagrams** | Planned |
| `CV1.E2.S2` | **The LLM receives render errors as follow-ups and corrects in the same turn** | Planned |

---

## CV2 — Work Offline `portability`

> Offline-capable setup. Local renderers for the most-used languages, plus a one-command Docker Kroki.

### CV2.E1 — Mermaid Local

| Code | Story | Status |
|------|-------|--------|
| `CV2.E1.S1` | **I use mmdc locally to render mermaid without network** | Planned |

### CV2.E2 — Kroki via Docker

| Code | Story | Status |
|------|-------|--------|
| `CV2.E2.S1` | **I start/stop Kroki in Docker through pi-fence commands** | Planned |
| `CV2.E2.S2` | **Kroki auto-starts when the session starts (opt-in)** | Planned |

---

## CV3 — Beyond Diagrams `legibility`

> The platform proves itself on non-diagram use cases.

### CV3.E1 — Text Processors

| Code | Story | Status |
|------|-------|--------|
| `CV3.E1.S1` | **I render CSV/JSONL blocks as formatted tables** | Planned |
| `CV3.E1.S2` | **I apply custom syntax highlighting for SQL, regex, jq** | Planned |

### CV3.E2 — Utility Processors

| Code | Story | Status |
|------|-------|--------|
| `CV3.E2.S1` | **`qr` blocks render as QR code images** | Planned |
| `CV3.E2.S2` | **`color` / `palette` blocks show color swatches** | Planned |

---

## CV4 — Platform `extensibility`

> Third parties write their own processors as first-class citizens.

### CV4.E1 — Third-party Processors

| Code | Story | Status |
|------|-------|--------|
| `CV4.E1.S1` | **Another extension can register a processor via the event bus** | Planned |
| `CV4.E1.S2` | **There is a documented "write your own processor" guide with a minimal example** | Planned |

### CV4.E2 — Observability

| Code | Story | Status |
|------|-------|--------|
| `CV4.E2.S1` | **I can see the processor-resolution trace for a given tag** (`/fence trace`) | Planned |
| `CV4.E2.S2` | **I can see usage metrics — renders, errors, cache hits** | Planned |

---

## [CVx — Verifiability](cvx-verifiability/README.md) `verifiability`

> Cross-cutting lane, not a linear stage. Explicit testing-infrastructure stories whose primary delivery is "prove the thing works" — parallel gates, test harnesses, visual verification — earned progression credit per the [briefing](../briefing.md#community-value). Feature CVs (CV0–CV4) still earn Verifiability tacitly through the tests they ship; this lane captures the *explicit* investments.

### [CVx.E1 — pi-tui Testing Idiom](cvx-verifiability/cvx-e1-pi-tui-idiom/README.md)

| Code | Story | Status |
|------|-------|--------|
| [CVx.E1.S1](cvx-verifiability/cvx-e1-pi-tui-idiom/cvx-e1-s1-virtual-terminal-tests/README.md) | **Extension and renderer tests assert on real pi-tui output via `VirtualTerminal`** | ✅ Done |

### [CVx.E2 — Dev-time Render Screenshots](cvx-verifiability/cvx-e2-dev-time-screenshots/README.md)

| Code | Story | Status |
|------|-------|--------|
| [CVx.E2.S1](cvx-verifiability/cvx-e2-dev-time-screenshots/cvx-e2-s1-headless-image-verifier/README.md) | **`pnpm render:verify` produces a diffable PNG of one named pi-fence scenario, headlessly; a pixel-diff test gates regressions** | 🛠️ Planned |
| `CVx.E2.S2` | **Multi-scenario × theme × width gallery per run** | Planned |
| `CVx.E2.S3` | **Sentinel-based readiness; edit-verify loops complete in under five seconds per scenario** | Planned |

---

## Radar

Ideas that haven't earned an Epic yet. Surface them when there's pressure.

| Idea | Description |
|------|-------------|
| **Latex / math** | Render `latex` or `math` blocks as PNG or Unicode. Likely Kroki-first, via `tikz`. |
| **Music notation** | `abc` or `lilypond` blocks as score images. |
| **GeoJSON** | Static map preview of `geojson` / `wkt` blocks. |
| **SVG direct** | Treat `svg` fenced blocks as renderable directly, no translation. |
| **Cache policy** | LRU limits, TTL, invalidate on source change — decide with real usage data. |
| **Streaming render** | Render partial blocks as the assistant streams, if latency becomes a complaint. |
| **Prompt guidance** | Inject a hint into the system prompt about available processors so the LLM uses them idiomatically. |
| **Screenshot export** | A command to export rendered blocks as standalone image files. |
| **Linting processor** | A processor that doesn't render but validates syntax and injects errors into the LLM context. |

---

**See also:** [Briefing](../briefing.md) (architectural decisions) · [Principles](../../product/principles.md) (how we build) · [Worklog](../../process/worklog.md) (what was done, what's next)
