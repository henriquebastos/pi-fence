# CV0.E1.S5 — Kroki JSON-body languages

**Status:** Done

**Epic:** [CV0.E1 — Kroki Through The Wire](cv0-e1--kroki-through-the-wire.md)
**Depends on:** [S4 — Full Kroki coverage for text-based languages](cv0-e1-s4--full-kroki-text-coverage.md)
**Date:** 2026-04-18 (spec)

## Summary

Kroki hosts a few languages whose source is JSON, not text: Vega, Vega-Lite, Excalidraw, and possibly others discovered during [S4](cv0-e1-s4--full-kroki-text-coverage.md)'s research pass. These require `Content-Type: application/json` on the POST and a JSON body. S5 adds that path without touching the text flow that S1–S4 built.

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

- `KROKI_CANONICAL_TAGS` grows to include `vega` and `vegalite`; `KROKI_ALIASES` gains `vega-lite` → `vegalite`. No content-type dispatch needed — Kroki accepts raw JSON via `text/plain`.
- Excalidraw moved to the SVG-only deferred set (public endpoint refuses PNG).
- Live tests per new language in `tests/integration/kroki.live.test.ts` via the data-driven fixture.
- Documentation updates: `README.md`, `docs/getting-started.md`, `docs/product/kroki-support.md`.

**Out of scope:**

- JSON schema validation pre-flight. Kroki returns a 4xx with a readable error when the body is malformed; pi-fence surfaces that as an error `pi-fence:output`, same as the text flow.
- Interactive Vega rendering (interactive Vega is HTML+JS; Kroki's `/png` gives a static snapshot).
- Self-hosted Kroki adjustments — CV2.E2.
- Case-insensitive tag matching.
- Converting markdown-prose-that-looks-like-JSON into a JSON body. The assistant's fenced block is the source verbatim; malformed input gets Kroki's error, not pi-fence guesswork.

## Approach

Research against the public endpoint (2026-04-22) found that Kroki accepts raw JSON source via `text/plain` for vega and vegalite — no `application/json` content-type dispatch or `diagram_source` wrapping needed. Excalidraw is SVG-only on the public endpoint. The implementation reduces to adding two tags, one alias, and canonical-source fixtures.

## Plan

### Deliverables

#### 1. Per-tag content-type dispatch in `kroki.ts`

A small map `KROKI_JSON_BODY_TAGS` lists every tag whose Kroki endpoint expects `application/json`. The `render` function picks `application/json` for tags in this set, falling back to `text/plain` (current behaviour) for everything else.

Rough shape (to be refined against the S4 research):

```ts
const KROKI_JSON_BODY_TAGS = new Set(["vega", "vegalite", "excalidraw"]);
// (Adjusted per S4's research if more surface.)

// In render():
const contentType = KROKI_JSON_BODY_TAGS.has(krokiTag)
  ? "application/json"
  : "text/plain";
```

No schema validation. Body passes through unchanged. Kroki validates on receipt and returns a readable error body for malformed input, which pi-fence surfaces exactly as it already does for the text flow.

#### 2. Expanded allowlist and aliases

`extensions/pi-fence/kroki.ts`'s `KROKI_CANONICAL_TAGS` grows to include `vega`, `vegalite`, `excalidraw`. `KROKI_ALIASES` gains `vega-lite` → `vegalite`. No changes needed in `index.ts` — the extension's supported-tag allowlist is derived dynamically via `collectSupportedTags(processors)` in `resolve.ts`, which reads each processor's `tags` and `aliases`.

The content-type dispatch operates on the *alias-resolved* tag so both `vega-lite` and `vegalite` hit the JSON path.

#### 3. Live tests per JSON-body language

`tests/integration/kroki.live.test.ts` gains one `it()` per JSON-body language. Each:

- Sends a small, canonical JSON source (checked into `tests/fixtures/kroki/canonical-sources.ts`, same location S4 introduces).
- Asserts PNG magic at the head of the response and a size floor.
- Asserts `http.requests[...]` (via FakeHttpClient in the unit test) carries `Content-Type: application/json` — the dispatch is load-bearing and worth unit-testing explicitly.

#### 4. Unit test for content-type dispatch

`tests/unit/kroki.test.ts` gains three cases:

- JSON-tagged request uses `application/json`.
- Non-JSON tag continues to use `text/plain`.
- Alias resolution runs before the content-type lookup (so `vega-lite` → `vegalite` → JSON, not `vega-lite` → text).

#### 5. Documentation

- `docs/product/kroki-support.md` (introduced by S4) gains a "JSON-body languages" section with the tags, their canonical sources, and a note that Kroki validates the JSON.
- `README.md` "Supported tags" list updates to include the JSON ones.
- `docs/getting-started.md` adds one prompt example using a JSON-body language ("Sketch a bar chart of this dataset in Vega-Lite").
- `CHANGELOG.md` `[Unreleased]` entry.

### Implementation order

Test-first.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit + impl | Content-type dispatch in `kroki.test.ts` + `KROKI_JSON_BODY_TAGS` + tags/aliases in `kroki.ts` (TDD cycle) | `step 1: content-type dispatch for JSON-body Kroki languages` |
| 2 | integration | JSON-body fixtures + live tests per JSON-body language | `step 2: live round-trips for JSON-body Kroki languages` |
| 3 | docs | kroki-support.md, README, getting-started, CHANGELOG | `step 3: document JSON-body Kroki support` |

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/kroki.test.ts`): 3 cases for content-type dispatch (JSON path, text path stays as baseline, alias resolution before dispatch).
- **Integration (live)** (`tests/integration/kroki.live.test.ts`): one case per JSON-body language.
- **Extension** (`tests/extension/pi-fence.test.ts`): unchanged. The extension test does not care about content type.
- **Contract**: unchanged. Processor-level.

**Events / interactions covered:**

- HTTP content-type header selection based on tag.
- Alias-then-dispatch ordering.
- Real HTTP to `/vega/png`, `/vegalite/png`, `/excalidraw/png` (and any others research finds).

**Fakes added:**

None.

**Live tests added:**

One per JSON-body language. Probably 2–4 depending on research.

**Deferred:**

- JSON schema validation of the body before sending. Kroki's error messages are fine as our error.
- Interactive Vega rendering (static PNG only).
- Self-hosted Kroki configuration (CV2.E2).

## Verification

### Gate

1. `pnpm run check` — docs links and markdown pass.
2. `pnpm test` — fast suite green, including the new content-type dispatch cases.
3. `pnpm test:live` — every JSON-body language round-trips against real `kroki.io`.
4. Manual: paste a Vega-Lite JSON block in a pi conversation (or have the assistant write one) and confirm the rendered bar/line chart appears.

### Prerequisites

Same as S4. No Docker needed — JSON-body languages hit `kroki.io` over HTTP.

### Automated tests

```bash
pnpm install
pnpm run check
pnpm test          # fast suite, now including JSON content-type dispatch cases
pnpm test:live     # integration suite, now including JSON-body round-trips
```

Expect green. The live suite picks up 2–4 more cases than S4 landed (one per JSON-body language).

### Manual test script

#### 1. Vega-Lite bar chart

In pi, ask:

> Render a Vega-Lite bar chart of three quarters with made-up revenue numbers. Use a fenced `vegalite` block.

Expect:

- Assistant emits a ```` ```vegalite ```` (or ```` ```vega-lite ````) block containing JSON.
- pi-fence emits a `pi-fence:output` message below with a PNG of the bar chart.
- The label reads "Rendered vegalite via kroki" (or whatever tag the assistant actually wrote).

#### 2. Excalidraw hand-drawn sketch

Ask:

> Draft an Excalidraw JSON for a simple three-box flow (start, middle, end). Fenced `excalidraw`.

Expect:

- ```` ```excalidraw ```` block with JSON.
- PNG with Excalidraw's signature hand-drawn look.

#### 3. Malformed JSON falls through as an error message

Ask the assistant to emit a ```` ```vegalite ```` block with an obvious JSON error (trailing comma, missing quote). Confirm pi-fence surfaces Kroki's parse error as an error-kind `pi-fence:output`, not a silent failure.

#### 4. Text-body languages still work

Sanity check that S4's text flow isn't broken. Ask for a mermaid diagram and a d2 diagram. Expect both PNGs as before.

#### 5. Confirm Content-Type dispatch in a trace

If `PI_FENCE_LOG_LEVEL=debug` is set (once trace surfaces land), the log shows JSON requests going out as `application/json` and text ones as `text/plain`. Not a regression test — just a read-through sanity check.

### Rollback

Same as previous stories — `pi uninstall pi-fence`, `/reload`.

## Key files

**Modified:**

- `extensions/pi-fence/kroki.ts` — `KROKI_JSON_BODY_TAGS` + content-type dispatch.
- `extensions/pi-fence/index.ts` — `SUPPORTED_TAGS` broadens.
- `tests/unit/kroki.test.ts` — dispatch cases.
- `tests/integration/kroki.live.test.ts` — JSON-body live cases.
- `tests/fixtures/kroki/canonical-sources.ts` — JSON entries added.
- `README.md`, `docs/getting-started.md`, `docs/product/kroki-support.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, status flips in roadmap/Epic/story files.

**New:**

None. Every added line lands in existing files (after S4 creates `kroki-support.md` and `canonical-sources.ts`).

## Out of scope — explicitly

- JSON schema validation pre-flight. Kroki validates.
- Interactive / live Vega (HTML+JS). Kroki's `/png` is a static snapshot.
- Self-hosted Kroki (CV2.E2).
- `/fence list` integration. S3 handles listing; S5 just populates.
- Case-insensitive tag matching.
- Converting non-JSON prose to JSON. The fenced body is verbatim.
