[< CV0.E1 — Kroki Through The Wire](../README.md)

# S5 — JSON-body Kroki languages render through pi-fence 🛠️ Planned

Kroki hosts a few languages whose source is JSON, not text: Vega, Vega-Lite, Excalidraw, and possibly others discovered during [S4](../cv0-e1-s4-full-kroki-text-coverage/README.md)'s research pass. These require `Content-Type: application/json` on the POST and a JSON body. S5 adds that path without touching the text flow that S1–S4 built.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

A user asks the assistant for a Vega-Lite chart. The assistant writes:

````markdown
```vegalite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": { "values": [ {"a": 1, "b": 4} ] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "a", "type": "ordinal" },
    "y": { "field": "b", "type": "quantitative" }
  }
}
```
````

pi-fence recognises the tag, posts the JSON body to `https://kroki.io/vegalite/png` with `Content-Type: application/json`, and a PNG appears inline. Same for `vega` and `excalidraw`, plus any other JSON-body languages S4's research surfaced.

## Scope

**In scope:**

- Kroki processor gains a per-tag content-type dispatch: JSON tags go out as `application/json`, text tags continue as `text/plain` (current behaviour).
- `SUPPORTED_TAGS` and `KROKI_TAG_ALIASES` grow to include JSON-body tags (`vega`, `vegalite`/`vega-lite`, `excalidraw`, …).
- Live tests per JSON-body language in `tests/integration/kroki.live.test.ts`.
- Documentation updates: `README.md`, `docs/getting-started.md`, `docs/product/kroki-support.md` (the doc S4 introduces).

**Out of scope:**

- JSON schema validation pre-flight. Kroki returns a 4xx with a readable error when the body is malformed; pi-fence surfaces that as an error `pi-fence:output`, same as the text flow.
- Interactive Vega rendering (interactive Vega is HTML+JS; Kroki's `/png` gives a static snapshot).
- Self-hosted Kroki adjustments — CV2.E2.
- Case-insensitive tag matching.
- Converting markdown-prose-that-looks-like-JSON into a JSON body. The assistant's fenced block is the source verbatim; malformed input gets Kroki's error, not pi-fence guesswork.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [S4](../cv0-e1-s4-full-kroki-text-coverage/README.md) · [S2](../cv0-e1-s2-other-kroki-tags/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
