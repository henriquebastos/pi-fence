[< CV0.E1 — Kroki Through The Wire](../README.md)

# S2 — I see other Kroki-supported diagrams through the same path 🛠️

S1 proved the mermaid path. S2 broadens the tag allowlist so `dot` / `graphviz`, `plantuml` / `puml`, and `d2` flow through the same pipeline without duplicated plumbing.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

A user asks the assistant: *"Draw a graphviz DOT graph of module dependencies."* or *"Make a PlantUML sequence diagram."* or *"Sketch this as a d2 diagram."* The assistant writes the obvious fenced block (```` ```dot ````, ```` ```plantuml ````, ```` ```d2 ````) and a PNG appears below. The rendering label ("Rendered dot via kroki", "Rendered plantuml via kroki") preserves whatever tag the user or LLM actually wrote — not the canonical Kroki endpoint name.

## Scope

**In scope:**

- Add `graphviz`, `dot`, `plantuml`, `puml`, `d2` to the extension's tag allowlist.
- Kroki processor maps colloquial tags (`dot`, `puml`) to the canonical endpoint names Kroki expects (`graphviz`, `plantuml`) at request time.
- Parser, renderer, and extension wiring remain unchanged structurally; they already handle arbitrary tag strings.
- Live integration test gains a `dot` round-trip against real kroki.io.
- Documentation reflects the broadened list.

**Out of scope:**

- Non-Kroki processors (CV0.E2 introduces the first, graphviz-local).
- Registry abstraction (CV0.E2).
- Further tags like `nomnoml`, `wavedrom`, `vega-lite` (deferrable; add when a user actually asks for them).
- `/fence list` command (S3).
- Settings-based tag enable/disable (CV1.E1).

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [S1](../cv0-e1-s1-mermaid-via-kroki/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
