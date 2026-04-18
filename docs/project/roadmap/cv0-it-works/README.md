[< Roadmap](../README.md)

# CV0 — It Works

> The extension renders diagrams inline. Happy path only. Everything the user needs to say "oh, this is useful" the first time they install it.

**Type:** `legibility`
**Status:** in progress

## Deliverable vision

After installing `pi-fence` and reloading, the user asks the assistant for a diagram. The assistant writes a fenced mermaid block as it normally would. The terminal shows a rendered PNG immediately below. No configuration, no commands, no documentation required for it to work on first try.

By the end of CV0, this happy path extends to graphviz, plantuml, d2, and any other language Kroki supports out of the box. The user can also plug in a local graphviz binary if they want to skip the network round-trip.

## Epics

| Code | Epic | Status |
|------|------|--------|
| [CV0.E1](cv0-e1-kroki-through-the-wire/README.md) | **Kroki Through The Wire** | In progress |
| `CV0.E2` | **Graphviz Local** | Planned |

---

**See also:** [Roadmap](../README.md) · [Briefing](../../briefing.md) · [Worklog](../../../process/worklog.md)
