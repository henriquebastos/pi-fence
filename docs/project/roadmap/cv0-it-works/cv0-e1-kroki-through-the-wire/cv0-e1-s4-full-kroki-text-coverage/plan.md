[< S4](README.md)

# Plan: CV0.E1.S4 — Full Kroki coverage for text-based languages

**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)
**Depends on:** [S2 — Other Kroki-supported diagrams](../cv0-e1-s2-other-kroki-tags/README.md)
**Date:** 2026-04-18 (spec)

## Goal

Every text-based language on Kroki's public endpoint renders through pi-fence with a verified live test. Languages the public endpoint does not serve are named explicitly as unsupported.

---

## Deliverables

### 1. Research: canonical list of text-based Kroki languages

First work item. Can be done incrementally — commit as findings arrive.

Sources:

- [Kroki documentation](https://kroki.io) — the authoritative list of supported diagram types, with each language's expected input format.
- A small probe script (throwaway; does not need to ship) that POSTs a minimal canonical source per language to `https://kroki.io/<lang>/png` and records HTTP status + response-body-type (image vs text). The script exists for *this story's investigation* only; do not commit it.

Output of the research, committed in `tests/fixtures/kroki/canonical-sources.ts` (or similar): a TypeScript constant listing each supported text-based tag, its canonical source for live testing, and known aliases.

Example shape (not a commitment on which tags end up here; research fills them in):

```ts
export const KROKI_TEXT_LANGUAGES = [
  { tag: "mermaid", source: "flowchart LR\n  A --> B", aliases: [] },
  { tag: "graphviz", source: "digraph { A -> B }", aliases: ["dot"] },
  { tag: "plantuml", source: "@startuml\n  A -> B\n@enduml", aliases: ["puml"] },
  { tag: "d2", source: "A -> B", aliases: [] },
  // ... populated by research
];
```

Languages whose public-endpoint response is not `image/png` (JSON-body languages — Vega, Excalidraw, and any discovered during research) are explicitly excluded and noted in S5's plan.

### 2. Expanded `SUPPORTED_TAGS` and `KROKI_TAG_ALIASES`

`extensions/pi-fence/index.ts`'s `SUPPORTED_TAGS` becomes the flat list of every tag (canonical + aliases) discovered in step 1.

`extensions/pi-fence/kroki.ts`'s `KROKI_TAG_ALIASES` grows to cover every alias → canonical pair. Aliases stay one-way: `{alias → canonical}`.

### 3. Live tests per language

`tests/integration/kroki.live.test.ts` gains one `it()` per canonical language (not per alias — one test per endpoint is enough; aliases are covered by unit tests). Each live test:

- Uses the canonical source from `canonical-sources.ts`.
- Asserts PNG magic at the head of the response.
- Asserts a size floor calibrated per language (Kroki sometimes returns 300-byte error PNGs for bad input; the floor catches that).

Live-suite runtime grows; accept the cost. Rough estimate: 20 languages × ~1s = ~20s additional. Well under CI's patience.

### 4. Unit tests for new aliases

`tests/unit/kroki.test.ts` gains one case per new `alias → canonical` pair, matching the pattern S2 established (assert the resolved URL).

### 5. Documentation

- `README.md` "Supported tags" list updates to the full enumeration.
- `docs/getting-started.md` "First test" example prompts stay small (no need to list every language); the "Supported tags today" line reflects the full list.
- `CHANGELOG.md` `[Unreleased]` entry.
- A new doc `docs/product/kroki-support.md` (or similar) tabulating every researched language with: supported-on-public-endpoint? aliases, known quirks. This is the reference users consult when they want to know what pi-fence can render.

### 6. Unsupported-languages note

Languages Kroki documents but the public endpoint refuses (plus-tier, deprecated) get a dedicated section in `docs/product/kroki-support.md` with a pointer to CV2.E2 (self-hosted Kroki).

---

## Implementation order

Test-first per language. Research can be batched; testing proceeds language-by-language so a failing one doesn't block the others.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | research | Probe Kroki's public endpoint; populate `canonical-sources.ts` with tags that return an actual PNG. Commit with a summary of findings | `wip(agent): kroki coverage research` |
| 2 | unit | Alias cases for every new alias in `kroki.test.ts` | `wip(agent): unit tests for new kroki aliases (S4)` |
| 3 | extension | Broaden `SUPPORTED_TAGS` in `index.ts`; existing extension test still passes without changes | `wip(agent): accept every researched Kroki text language (S4)` |
| 4 | integration | Add live tests per language, batched into groups for reviewable commits (e.g., 5 tags per commit). Skip languages whose research showed no public-endpoint support | `wip(agent): live kroki round-trip for <language group> (S4)` |
| 5 | docs | `docs/product/kroki-support.md`, README, getting-started, CHANGELOG | `wip(agent): document full Kroki text coverage (S4)` |
| 6 | close | Status flips + worklog | `wip(agent): close CV0.E1.S4` |

---

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/kroki.test.ts`): one case per new `alias → canonical` pair.
- **Integration (live)** (`tests/integration/kroki.live.test.ts`): one case per canonical language on the public endpoint. Skipped when network is unavailable.
- **Extension** (`tests/extension/pi-fence.test.ts`): unchanged. The extension test is pattern-verification, not per-tag. Adding every tag would be vanity coverage.
- **Contract**: unchanged. Processor-level.

**Events / interactions covered:**

- Parser with the expanded allowlist (mechanical; already proven by S1/S2 tests).
- Kroki processor alias resolution (expanded table; unit tests).
- Real HTTP to each `/{lang}/png` endpoint.

**Fakes added:**

None.

**Live tests added:**

One per text-based language on Kroki's public endpoint. Count depends on research; likely 15–20.

**Deferred:**

- JSON-body languages (S5).
- Self-hosted Kroki paths (CV2.E2).
- Byte-stable fixture comparison. We use PNG magic + size floor; fixtures would churn with Kroki version drift.

---

## Verification

1. `pnpm run check` — docs links and markdown pass.
2. `pnpm test` — fast suite green (unit + extension + contract); the expanded allowlist doesn't introduce new assertion failures.
3. `pnpm test:live` with network available — every newly-added live case passes against real `kroki.io`.
4. `docs/product/kroki-support.md` is readable and accurate.
5. A user reading `README.md` can name every supported language without running pi-fence.

---

## Key files

**Modified:**

- `extensions/pi-fence/kroki.ts` — expanded `KROKI_TAG_ALIASES`.
- `extensions/pi-fence/index.ts` — expanded `SUPPORTED_TAGS`.
- `tests/unit/kroki.test.ts` — alias assertions.
- `tests/integration/kroki.live.test.ts` — per-language live cases.
- `README.md`, `docs/getting-started.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, status flips in roadmap/Epic/story READMEs.

**New:**

- `tests/fixtures/kroki/canonical-sources.ts` — per-language canonical source + alias table.
- `docs/product/kroki-support.md` — reference document.

---

## Out of scope — explicitly

- JSON-body languages (Vega, Vega-Lite, Excalidraw). Covered by [S5](../cv0-e1-s5-kroki-json-body-languages/README.md).
- Self-hosted Kroki (CV2.E2).
- `/fence list` integration — S3 lands first; S4 benefits from it automatically.
- Case-insensitive tag matching.
- Language-specific render parameters.

---

**See also:** [Test Guide](test-guide.md) · [Story README](README.md) · [S2 plan](../cv0-e1-s2-other-kroki-tags/plan.md) · [S5](../cv0-e1-s5-kroki-json-body-languages/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
