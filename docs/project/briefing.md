[< Docs](../README.md)

# Briefing — pi-fence

> Foundational architectural decisions. Made before writing code; revisited only when evidence accumulates against them. Incremental decisions during construction go in [decisions.md](decisions.md).

**Last updated:** 2026-04-18 (initial draft).

---

## Problem

The pi coding agent renders markdown from the assistant as text in the terminal. Fenced code blocks in text-based visual languages — mermaid, graphviz, plantuml, d2, vega-lite, and many others — display as raw source. The user copies the source into an external tool to see what the LLM meant.

There are community extensions that solve this per-language (`pi-mermaid`, `@walterra/pi-graphviz`). They share architecture: hook the assistant's turn, find fenced blocks, render, inject a custom message with the output. They diverge in details (cache, limits, UI), ship independently, overlap in concerns, and don't compose: installing four of them yields four independent parsers, four renderers, four config surfaces.

What's missing is the **infrastructure layer**: a single extension that provides the hook, parser, registry, rendering pipeline, config, and plugin surface, with language-specific renderers as pluggable processors — built-in or third-party.

## Community Value

Each delivery generates concrete value in one or more of these dimensions.

| Type | Definition |
|------|-----------|
| **Legibility** | What I read in the terminal is more intelligible than raw source |
| **Extensibility** | Other extensions or users can add new processors without touching the core |
| **Control** | The user decides what is processed and how |
| **Portability** | Works online, offline, self-hosted — no lock-in to a single backend |

## Hierarchy

Same shape as [Alisson Vale's mirror-mind](https://github.com/alissonvale/mirror-mind):

| Level | Name | What it is |
|-------|------|-----------|
| **CV** | Community Value | A stage of delivery with clear user value |
| **E** | Epic | A cohesive block of work with done criteria |
| **S** | Story | An atomic delivery from the user's perspective |

---

## Decisions

### D1 — One extension with a processor registry, not N independent extensions

Each language (mermaid, graphviz, plantuml, d2…) shares the same plumbing: detect fenced blocks, resolve what to do, render, emit a custom message. A single extension owns that plumbing. Language-specific code is a **processor** implementing a small interface and registered against a **registry**.

**Why:**

- Eliminates duplication (one parser, one cache, one message renderer).
- Uniform UX (same header, same expansion behavior, same commands).
- Install one package to get ten languages instead of ten packages.
- Third parties extend via the registry instead of forking.

**Trade-off accepted:** one package can grow large. Mitigated by D4 (lazy loading).

### D2 — Interception-only, with errors fed back as follow-up messages

Activation is interception. The extension hooks `agent_end` (and optionally `input`), finds fenced blocks, and runs them through the registry. No `render_fence` tool is exposed to the LLM.

**Error feedback.** When a processor returns an error (parse failure, renderer crash, Kroki 4xx), the extension:

1. Emits a readable error message in place of the image, so the user sees *what went wrong* rather than a broken output.
2. Injects the error as a follow-up message delivered to the agent via `pi.sendMessage(..., { deliverAs: "followUp" })`. The LLM sees the error **in the same turn** it wrote the broken block and can correct immediately, without waiting for the next user prompt.

**Parameters.** The LLM passes theme, size, layout and similar options via the fenced info string: ```` ```mermaid theme=dark width=800 ````. The processor reads `meta` from the fence, not from a tool argument.

**Why interception-only beats hybrid:**

- Matches existing LLM behavior. Any model trained on GitHub-flavored Markdown already emits ```` ```mermaid ```` blocks unprompted. No prompt engineering needed.
- One mental model. The LLM doesn’t have to choose between “inline block” and “tool call” for the same act. Users never wonder why a diagram appeared via two different mechanisms.
- Smaller surface. No tool description to ship in the system prompt, no tool-call-vs-content ambiguity in the session tree, no renderer-in-two-places code path.
- Error feedback still works. The follow-up message path gives the LLM the same signal a tool result would, delivered in-turn.

**Trade-off accepted.** The LLM cannot pre-validate a diagram before emitting it. A broken block reaches the user first (as an error panel, not garbled output), then the LLM corrects on the follow-up. Worst case: one or two self-correction turns per bad block. Observed rate of bad blocks from current models on common diagram types is low enough that this is acceptable.

### D3 — Kroki as the default engine

[Kroki](https://kroki.io) is an HTTP service that converts 30+ text diagram languages into PNG/SVG (mermaid, graphviz, plantuml, d2, bpmn, wavedrom, vega-lite, nomnoml, structurizr, excalidraw, tikz, …). Self-hostable via Docker.

**Why default:**

- One processor covers most diagram languages out of the box.
- Zero local dependencies — works on first install.
- Self-hostable when privacy matters.

**Privacy caveat:** the public endpoint sends diagram source to `kroki.io`. Surface a warning on first use per session. Make the endpoint trivially configurable (public → Docker → self-hosted).

**Overriding Kroki per tag:** when a user prefers a local processor for a specific language (say, `dot` handled by a local Graphviz binary instead of a Kroki round-trip), they bind the tag to that processor explicitly in settings. Kroki remains the fallback for every other tag.

### D4 — Lazy-loaded processors with capability detection

Processors are registered but their dependencies load only when the processor is activated. Each processor exposes an `available()` check that returns `{ok: true}` or `{ok: false, reason, installHint, autoFixCommand?}`.

**Why:**

- A user who only uses Kroki never pays the cost of loading mermaid's 40 MB npm package or checking for a Graphviz binary.
- Missing dependencies yield actionable install hints instead of silent failure.
- `/fence doctor` can diagnose the whole registry without forcing loads.

### D5 — Plugin surface via the pi event bus

Third-party extensions register their own processors through `pi.events`. They don't import `pi-fence` directly; they emit a register event with a processor object. pi-fence listens and adds it to the registry.

**Why:**

- No hard coupling between extensions.
- Third parties version independently.
- Two extensions can register processors for the same tag. Resolution is explicit in user settings: the user binds a tag to a named processor. Without a binding, the first registered and available processor for that tag wins.

**Trade-off:** event-bus contracts are weaker than typed APIs. Mitigated by a published TypeScript interface that third-party authors can import as a peer type (not a runtime dependency).

### D6 — The user owns the registry via settings

Configuration lives under a single `"pi-fence"` key in pi's own settings files: `~/.pi/agent/settings.json` (global) and `.pi/settings.json` (project). Project overrides global. The user edits these files directly — the same files they already curate for pi itself.

- Enable/disable any processor.
- Bind a tag to a specific named processor when more than one is registered for it.
- Configure endpoint, timeout, credentials per processor.
- Override with meta info string on individual fences (`​`​`​`​mermaid processor=kroki`) for ad-hoc control.

**Why `settings.json`.** Pi does not ship a general-purpose “extension-scoped config” API — its `SettingsManager` has typed getters for pi's known fields only. Extensions that want hand-edited user config either read `settings.json` directly or invent their own file. We pick `settings.json` because the user already curates it, and because pi-fence config naturally composes with the rest of pi's config (global vs project override rules, packages declared alongside, etc.). We read and merge the two files ourselves; the `"pi-fence"` namespace keeps our keys from colliding with pi-core or other extensions.

**Defaults in code, file-as-override.** The extension works out of the box with no settings file and no `"pi-fence"` block. All defaults live in code; the file only needs the keys the user wants to change. Missing file, missing keys, malformed values all fall back gracefully, with a single warning on bad values rather than a crash. The user never has to create a file for pi-fence to function.

### D7 — `FenceProcessor` as the core abstraction

The unit of extensibility is a `FenceProcessor`, not a `Renderer`. A processor receives a `FenceInput` (tag, meta, source, origin) and returns a `FenceOutput` that is one of:

- `image` (PNG bytes)
- `text` (plain or ANSI)
- `component` (pi-tui component, collapsed/expanded variants)
- `passthrough` (processor chose not to act)
- `error` (structured, with parse issues)

**Why:**

- Anchoring on "render" would assume image output; CSV-as-table and SQL-highlight need text output.
- `passthrough` lets a processor inspect the input and decline, letting the next registered processor for the tag handle it.
- `error` with structured parse issues feeds the tool-mode feedback loop and the interception-mode warnings uniformly.

### D8 — English as the internal language

All code, config keys, commit messages, docs, commands, and comments in English. User-facing content — the diagrams rendered, the assistant's prose around them — stays in whatever language the user is working in.

**Why:** open-source ecosystem, third-party processors, and long-term maintainability all favor one internal language. English is the pi ecosystem's lingua franca.

---

## What's explicitly not decided yet

These are in scope but deferred until there's implementation pressure or evidence to decide well:

- **Message-info-string syntax.** `key=value` pairs vs JSON vs a Pandoc-style attribute block. Resolve when a processor actually needs the meta.
- **Caching policy.** LRU limit, TTL, cache-by-source-hash vs cache-by-processor-plus-source. Resolve when performance data exists.
- **Streaming.** Whether to render partial blocks as the assistant streams, or only on `agent_end`. Current intent: only on `agent_end` (simpler, avoids flicker). Revisit if latency becomes a complaint.
- **Versioning discipline.** Pre-1.0 with breaking changes allowed, or commit to stable interfaces from day one. Resolve near first published release.
- **Persistence of renders.** Whether custom messages with rendered output survive compaction and session switches. Defer to when that becomes user-visible.

---

**See also:** [Roadmap](roadmap/README.md) (what we're building in what order) · [Principles](../product/principles.md) (how we build) · [Decisions](decisions.md) (incremental decisions as they're made)
