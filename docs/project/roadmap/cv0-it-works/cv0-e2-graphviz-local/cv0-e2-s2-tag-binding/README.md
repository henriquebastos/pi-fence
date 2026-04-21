[< CV0.E2 — Graphviz Local](../README.md)

# S2 — I bind a tag to a specific processor in settings ✅ Done

CV0.E2.S1 shipped capability-based resolution: graphviz-local wins `graphviz`/`dot` when `dot` is on PATH, Kroki handles everything else. That rule is the right default for most users. S2 adds the user-level override: the user who has both `dot` installed *and* a preference for Kroki (or vice versa) expresses it in a settings file and pi-fence honours it.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

Two config files pi-fence reads at wire time:

1. **Global** — `~/.pi/agent/pi-fence.config.json`.
2. **Project** — `<cwd>/.pi/pi-fence.config.json`.

Project overrides global, global overrides code defaults (D6 in the briefing). Missing or unreadable files degrade silently — defaults win; pi-fence logs a warn but does not block.

Config shape (S2 ships exactly one key):

```json
{
  "bindings": {
    "graphviz": "kroki",
    "dot": "kroki"
  }
}
```

With this file in place:

1. A ```` ```dot ```` block is served by Kroki even on a machine where `dot` is installed. `FakeHttpClient` captures the HTTP request; `FakeShellRunner.calls.filter((c) => c.args.includes("-Tpng"))` is empty.
2. A ```` ```graphviz ```` block is served by Kroki on the same terms.
3. A ```` ```mermaid ```` block still goes through Kroki — untouched.
4. Removing the file (or deleting the `bindings` key) restores the default capability-based resolution: graphviz-local wins for the user with `dot` installed.
5. `/fence list` shows the effective bindings underneath the processor rows — the user can verify what the config resolved to.

Bindings are **preferences, not hard requirements**. When the bound processor is unavailable (a user binds `graphviz: "graphviz-local"` on a machine without `dot`), pi-fence falls back to capability-based resolution and logs a warn. Strict mode ("use only this processor, fail if unavailable") is not in S2's scope.

## Scope

**In scope:**

- A small config module `extensions/pi-fence/config.ts` that reads two optional files (global + project), merges them with project precedence, and returns a typed `{ bindings }` object. Missing files, malformed JSON, and extra keys are tolerated: pi-fence logs the problem and continues with the resolvable portion of the config (or pure defaults).
- A minimal JSON schema for the `bindings` object (string keys map to string values); validation is hand-rolled in `config.ts` because the surface is one level deep. Full TypeBox validation can arrive when the config surface actually grows.
- `resolveProcessor(processors, availability, tag, bindings?)` widens: when `bindings[tag]` names a processor id that is registered AND available, it wins. Otherwise fall through to the existing capability-based rule. Null if neither produces a match.
- Wire-time config load in `createPiFenceExtension`. The loaded bindings are captured in the closure (same shape as the availability map) and passed to every `resolveProcessor` call + the `/fence list` details.
- `/fence list` gains a "Bindings" sub-section underneath the processor listings showing `<tag> → <processor>` pairs for every binding that resolved to a registered processor. Bindings that point to an unknown processor id, or to an unavailable processor, are listed separately as "Ignored bindings" with the reason.
- Unit tests for `config.ts` + `resolveProcessor`'s bindings branch.
- Extension-layer tests: project overrides global; binding respected when processor is available; binding to unavailable processor falls back to capability; binding to unknown processor id is ignored.
- Live test not required — S2 is pure-function + JSON-file I/O; the existing `@zenobius/pi-extension-config` library's absence means no live HTTP/docker dependency. The fast suite's `temp-dir.ts` utility covers the filesystem seam.
- README + getting-started + CHANGELOG updates.

**Out of scope:**

- Env-var overrides (`PI_FENCE_*`). The briefing's D6 names them; S2's minimum viable slice ships file-based bindings only. Env overrides come with a later story.
- Per-block meta overrides (```` ```mermaid processor=kroki ````) — named in D6 but separate surface.
- Endpoint configuration (global `kroki.endpoint`, per-processor timeouts, etc.) — CV1.E1.
- Processor enable/disable flags (`{ "enabled": { "graphviz-local": false } }`) — CV1.E1 territory. S2's surface is bindings only.
- Strict-mode bindings (respect unavailable processor, don't fall back). Follow-up when a real privacy-conscious user expresses the need.
- Adopting `@zenobius/pi-extension-config`. Decision captured in the plan's deferred-decisions note: the library brings two transitive deps for a tiny S2 surface; a ~50-LOC inline loader fits S2 better. Revisit when CV1.E1's broader config surface lands.
- TypeBox or Standard Schema validation — hand-rolled shape checks in `config.ts` are enough for one key deep.
- Config file migrations / versioning — no schema change history to migrate; premature.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [S1](../cv0-e2-s1-local-graphviz/README.md) · [Briefing D6](../../../../briefing.md) · [Principles — Testing](../../../../../product/principles.md#testing)
