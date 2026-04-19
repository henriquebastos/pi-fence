[< S5](README.md)

# Test Guide: CV0.E1.S5 — Kroki JSON-body languages

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)

---

## Prerequisites

Same as S4. No Docker needed — JSON-body languages hit `kroki.io` over HTTP.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test          # fast suite, now including JSON content-type dispatch cases
pnpm test:live     # integration suite, now including JSON-body round-trips
```

Expect green. The live suite picks up 2–4 more cases than S4 landed (one per JSON-body language).

---

## Manual test script

### 1. Vega-Lite bar chart

In pi, ask:

> Render a Vega-Lite bar chart of three quarters with made-up revenue numbers. Use a fenced `vegalite` block.

Expect:

- Assistant emits a ```` ```vegalite ```` (or ```` ```vega-lite ````) block containing JSON.
- pi-fence emits a `pi-fence:output` message below with a PNG of the bar chart.
- The label reads "Rendered vegalite via kroki" (or whatever tag the assistant actually wrote).

### 2. Excalidraw hand-drawn sketch

Ask:

> Draft an Excalidraw JSON for a simple three-box flow (start, middle, end). Fenced `excalidraw`.

Expect:

- ```` ```excalidraw ```` block with JSON.
- PNG with Excalidraw's signature hand-drawn look.

### 3. Malformed JSON falls through as an error message

Ask the assistant to emit a ```` ```vegalite ```` block with an obvious JSON error (trailing comma, missing quote). Confirm pi-fence surfaces Kroki's parse error as an error-kind `pi-fence:output`, not a silent failure.

### 4. Text-body languages still work

Sanity check that S4's text flow isn't broken. Ask for a mermaid diagram and a d2 diagram. Expect both PNGs as before.

### 5. Confirm Content-Type dispatch in a trace

If `PI_FENCE_LOG_LEVEL=debug` is set (once trace surfaces land), the log shows JSON requests going out as `application/json` and text ones as `text/plain`. Not a regression test — just a read-through sanity check.

---

## Rollback

Same as previous stories — `pi uninstall pi-fence`, `/reload`.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [S4 test guide](../cv0-e1-s4-full-kroki-text-coverage/test-guide.md)
