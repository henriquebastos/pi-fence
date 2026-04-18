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
