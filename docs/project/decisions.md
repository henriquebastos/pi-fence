[< Docs](../README.md)

# Decisions

Incremental decisions made during construction. Chronological — oldest first, newest appended at the bottom. For foundational decisions made before code (D1–D8), see the [Briefing](briefing.md).

Each entry follows the shape: **context → rule → why → consequences**.

---

## Entries

### 2026-04-18 — Drop processor priority; tag conflicts resolved by explicit user binding

**Context.** The briefing's original D3, D5, and D6 referenced a numeric `priority` field on every processor, with the registry sorting by it to resolve cases where more than one processor claimed the same tag. The model showed up in several docs (principles.md, roadmap/README.md, CV0.E1 epic spec, CV0.E2.S2 story title) before any code was written.

**Rule.** Processors do not carry priority. When more than one processor is registered for a tag, resolution is:

1. If the user bound that tag to a specific named processor in settings, that processor is used.
2. Otherwise, the first registered *and available* processor for the tag wins.

**Why.** Priority-as-number suggests fine-grained ordering that nobody actually needs and that would have to be specified by every processor author. What users really want to say is “for `mermaid`, use `mermaid-local`” — a binding, not a number. Moving the concern out of the core and into user config makes the core smaller (no priority field on the interface, no sort in the resolver), makes the user’s intent explicit (named binding, not a tuning knob), and improves the command UX (`/fence set mermaid mermaid-local` reads better than `/fence priority mermaid-local 10`).

**Consequences.**

- `FenceProcessor` has one less field. Resolution is a lookup, not a sort.
- CV0.E2.S2 was renamed from *“I configure processor priority in settings”* to *“I bind a tag to a specific processor in settings”*.
- The `Control` Community Value definition was tightened from *“what is processed, how, at what priority”* to *“what is processed and how”*.
- D3, D5, D6, D7 in the briefing were reworded: Kroki “fallback path” is now “overriding per tag”; third-party registration notes “first registered and available wins”; `passthrough` rationale no longer mentions “lower-priority processors”.
- No code impact yet — S1 has a single hardcoded processor. The simplification lands before CV0.E2 introduces a second processor.

### 2026-04-18 — Drop the `render_fence` tool; interception-only with in-turn error follow-up

**Context.** The briefing's original D2 described hybrid activation: interception by default plus an optional `render_fence` tool the LLM could call for parse feedback or explicit parameters. The rationale for the tool leaned on two benefits: (1) the LLM could pre-validate a diagram before emitting it, and (2) the LLM could pass parameters like theme or size cleanly.

**Rule.** Activation is interception-only. No `render_fence` tool is exposed. When a processor returns an error, pi-fence does two things:

1. Surfaces a readable error panel in place of the would-be image, so the user never sees garbled output — only either a rendered diagram or a clear error.
2. Injects the error as a follow-up message via `pi.sendMessage(..., { deliverAs: "followUp" })`, so the LLM sees the failure **in the same turn it wrote the broken block** and can correct immediately, without waiting for the next user prompt.

Parameters are carried by the fenced info string (```` ```mermaid theme=dark width=800 ````), not by a tool argument.

**Why.** The tool's only unique benefit was pre-validation. In practice, modern LLMs get common diagram syntax right on the first try; the few cases where they don't are handled equally well by the follow-up loop, which costs at most one extra LLM turn to correct. Against that marginal benefit, the tool adds permanent cost: a description in every system prompt, a second rendering code path, and ambiguity for the LLM about "should I write a block or call a tool?" Removing it simplifies the briefing, the code, and the LLM-facing surface all at once.

**Consequences.**

- D2 in the briefing was rewritten to describe interception + follow-up error injection, with no tool.
- CV1.E2 was renamed from *Hybrid Mode* to *Error Feedback Loop*. Its stories are now: S1 “I see readable errors in place of broken diagrams”, S2 “The LLM receives render errors as follow-ups and corrects in the same turn”.
- CV0.E1 epic spec deferred-list entry and CV0.E1.S1 out-of-scope list updated: “Tool `render_fence`” became “Error feedback surface / follow-up injection”.
- No code impact on S1. The follow-up injection lands when CV1.E2 is implemented. Until then, S1 can surface errors as text content in the custom message and the LLM simply won't see them until the next user prompt — acceptable for the first happy-path release.
