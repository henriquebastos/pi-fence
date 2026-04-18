[< CV0.E1 — Kroki Through The Wire](../README.md)

# S1 — I see my mermaid diagram rendered as a PNG when the assistant answers 🛠️

The first user-visible moment. The assistant writes a mermaid fenced block; I see a PNG below it.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

I run pi in a directory. I ask: *"Draw a simple mermaid flowchart of A → B → C."*
The assistant replies with a ```` ```mermaid ```` fenced block. Immediately below the assistant's message, my terminal shows a PNG of the diagram.

Nothing I configured made this happen. Everything needed came in the default install.
