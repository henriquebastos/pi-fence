[< S5](README.md)

# Plan: CV0.E1.S5 — Kroki JSON-body languages

**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)
**Depends on:** [S4 — Full Kroki coverage for text-based languages](../cv0-e1-s4-full-kroki-text-coverage/README.md)
**Date:** 2026-04-18 (spec)

## Goal

pi-fence renders Kroki's JSON-body languages (Vega, Vega-Lite, Excalidraw, others if S4 surfaces them) with the same intercept-and-display flow as the text-based languages. One small code change in `kroki.ts` to dispatch on content type; everything else flows through unchanged.

---

## Deliverables

### 1. Per-tag content-type dispatch in `kroki.ts`

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

### 2. Expanded allowlist and aliases

`extensions/pi-fence/index.ts`'s `SUPPORTED_TAGS` grows to include `vega`, `vegalite`, `excalidraw`, and whatever aliases come from S4's research (most likely `vega-lite` → `vegalite`).

`extensions/pi-fence/kroki.ts`'s `KROKI_TAG_ALIASES` gets the same aliases. The content-type dispatch operates on the *alias-resolved* tag so both `vega-lite` and `vegalite` hit the JSON path.

### 3. Live tests per JSON-body language

`tests/integration/kroki.live.test.ts` gains one `it()` per JSON-body language. Each:

- Sends a small, canonical JSON source (checked into `tests/fixtures/kroki/canonical-sources.ts`, same location S4 introduces).
- Asserts PNG magic at the head of the response and a size floor.
- Asserts `http.requests[...]` (via FakeHttpClient in the unit test) carries `Content-Type: application/json` — the dispatch is load-bearing and worth unit-testing explicitly.

### 4. Unit test for content-type dispatch

`tests/unit/kroki.test.ts` gains three cases:

- JSON-tagged request uses `application/json`.
- Non-JSON tag continues to use `text/plain`.
- Alias resolution runs before the content-type lookup (so `vega-lite` → `vegalite` → JSON, not `vega-lite` → text).

### 5. Documentation

- `docs/product/kroki-support.md` (introduced by S4) gains a "JSON-body languages" section with the tags, their canonical sources, and a note that Kroki validates the JSON.
- `README.md` "Supported tags" list updates to include the JSON ones.
- `docs/getting-started.md` adds one prompt example using a JSON-body language ("Sketch a bar chart of this dataset in Vega-Lite").
- `CHANGELOG.md` `[Unreleased]` entry.

---

## Implementation order

Test-first.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit | Content-type dispatch cases in `kroki.test.ts` — fail until impl | `wip(agent): unit tests for JSON-body content-type dispatch (S5)` |
| 2 | impl | `KROKI_JSON_BODY_TAGS` + dispatch in `kroki.ts` | `wip(agent): Content-Type dispatch for JSON-body languages (S5)` |
| 3 | extension | `SUPPORTED_TAGS` broadens to include JSON tags; existing extension test unaffected | `wip(agent): accept JSON-body Kroki tags in extension (S5)` |
| 4 | integration | Live tests per JSON-body language | `wip(agent): live Kroki JSON-body round-trips (S5)` |
| 5 | docs | kroki-support.md, README, getting-started, CHANGELOG | `wip(agent): document JSON-body Kroki support (S5)` |
| 6 | close | Status flips + worklog | `wip(agent): close CV0.E1.S5` |

---

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

---

## Verification

1. `pnpm run check` — docs links and markdown pass.
2. `pnpm test` — fast suite green, including the new content-type dispatch cases.
3. `pnpm test:live` — every JSON-body language round-trips against real `kroki.io`.
4. Manual: paste a Vega-Lite JSON block in a pi conversation (or have the assistant write one) and confirm the rendered bar/line chart appears.

---

## Key files

**Modified:**

- `extensions/pi-fence/kroki.ts` — `KROKI_JSON_BODY_TAGS` + content-type dispatch.
- `extensions/pi-fence/index.ts` — `SUPPORTED_TAGS` broadens.
- `tests/unit/kroki.test.ts` — dispatch cases.
- `tests/integration/kroki.live.test.ts` — JSON-body live cases.
- `tests/fixtures/kroki/canonical-sources.ts` — JSON entries added.
- `README.md`, `docs/getting-started.md`, `docs/product/kroki-support.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, status flips in roadmap/Epic/story READMEs.

**New:**

None. Every added line lands in existing files (after S4 creates `kroki-support.md` and `canonical-sources.ts`).

---

## Out of scope — explicitly

- JSON schema validation pre-flight. Kroki validates.
- Interactive / live Vega (HTML+JS). Kroki's `/png` is a static snapshot.
- Self-hosted Kroki (CV2.E2).
- `/fence list` integration. S3 handles listing; S5 just populates.
- Case-insensitive tag matching.
- Converting non-JSON prose to JSON. The fenced body is verbatim.

---

**See also:** [Test Guide](test-guide.md) · [Story README](README.md) · [S4 plan](../cv0-e1-s4-full-kroki-text-coverage/plan.md) · [Principles — Testing](../../../../../product/principles.md#testing)
