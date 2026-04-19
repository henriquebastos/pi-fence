[< CV0.E1 — Kroki Through The Wire](../README.md)

# S3 — I can see which processors are registered and their status (`/fence list`) ✅

S1 and S2 proved the render path. S3 closes CV0.E1 with the first user-visible *control* surface: a read-only slash command that answers "what is pi-fence doing on my behalf?"

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

The user types `/fence list` in pi. A custom message appears below the prompt containing one line per registered processor:

```text
Processors

  kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2
```

Each line:

- Names a processor pi-fence has wired up on this session. Today there is exactly one (`kroki`).
- Shows its **status** in brackets. Today's only value is `registered` — the processor is available in the extension. Real health probing (is the endpoint reachable?) is deferred to a separate `/fence doctor` story not yet placed on the roadmap.
- Lists the **tags** the processor accepts after an em-dash. Canonical tags appear bare; aliases appear in parentheses next to the canonical tag they resolve to, e.g. `graphviz (dot)`.

The command is a read operation only: it emits a custom message, does not modify session state, does not hit the network, and does not alter any registered processor.

A line-per-processor shape is explicitly chosen over a column-aligned table. `/fence list` stays legible with one row today and with a handful of rows once CV0.E2 adds a second processor; beyond that, tables earn their place and the formatter can be revisited.

## Scope

**In scope:**

- A `listProcessors()` function in a new small module. Returns a structured list of registered processors with id, status, canonical tags, and alias map.
- A pure `formatProcessorLines()` helper that turns listings into an array of strings (one per processor, plus an optional header). No column alignment; just readable per-processor lines.
- Registration of `/fence list` via `pi.registerCommand`. The handler calls `listProcessors()`, formats the lines, and hands a `pi-fence:list` custom message to `pi.sendMessage`.
- A `pi-fence:list` custom message renderer. Shares the pi-tui `Box`/`Text` composition style already used by `pi-fence:output`.
- Exposure of the Kroki processor's supported tags and alias map through the processor surface so the list can be built without hardcoding a duplicate copy in `index.ts`.
- Unit tests for `listProcessors()` shape, the line formatter, and the command handler (via `FakeExtensionAPI`).
- An extension-layer test firing a real pi `AgentSession` that dispatches the `/fence list` command and asserts the custom message reaches the transcript.
- README, CHANGELOG, and getting-started updates showing `/fence list` as available.

**Out of scope:**

- Health probes against the processor's endpoint. `/fence doctor` is a separate story not yet placed on the roadmap; S3 intentionally keeps the command synchronous and offline.
- Arguments to `/fence list` (filters, formats). One shape ships; iterate when a real user expresses a need.
- Configuring tag → processor bindings (CV1.E1) — the list today is inherent to the extension, not user-editable.
- The registry abstraction that appears when CV0.E2 introduces a second processor. S3 paves the road (exports a structured list) without laying the registry itself.
- `/fence trace` or any write operations. S3 is read-only.
- Styling flourishes beyond what the existing `pi-fence:output` renderer already establishes.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [S1](../cv0-e1-s1-mermaid-via-kroki/README.md) · [S2](../cv0-e1-s2-other-kroki-tags/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
