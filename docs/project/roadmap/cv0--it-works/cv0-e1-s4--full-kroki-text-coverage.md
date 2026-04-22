# CV0.E1.S4 — Full Kroki coverage for text-based languages

**Status:** Done

**Epic:** [CV0.E1 — Kroki Through The Wire](cv0-e1--kroki-through-the-wire.md)
**Depends on:** [S2 — Other Kroki-supported diagrams](cv0-e1-s2--other-kroki-tags.md)
**Date:** 2026-04-18 (spec)

## Summary

S1–S2 added four languages one story at a time. S4 makes the coverage honest: every text-based language the public Kroki endpoint supports — and that pi-fence's current text-body flow fits — renders with a verified live test.

## Done criterion

For every text-based language on Kroki's public endpoint (as enumerated by a research step that is part of this story's work), pi-fence:

1. Accepts the tag in its allowlist (aliases included where colloquial names diverge from Kroki's canonical endpoint names).
2. Has at least one live integration test asserting the language renders end-to-end against real `kroki.io` — PNG magic + a size floor calibrated per language.
3. Surfaces the user's original tag in the rendering label and details payload (alias resolution is invisible outside the URL).

Languages that Kroki hosts but the public endpoint does not serve (plus-tier, discontinued, opt-in) are documented as unsupported with a pointer to self-hosted Kroki (CV2.E2).

## Scope

**In scope:**

- Research pass to enumerate the actual text-based languages on Kroki's public endpoint today.
- Expanded `SUPPORTED_TAGS` and `KROKI_TAG_ALIASES` in `extensions/pi-fence/kroki.ts` and `extensions/pi-fence/index.ts`.
- One live test per verified language in `tests/integration/kroki.live.test.ts`. Accept slower live suite.
- Updated README and `docs/getting-started.md` with the full list plus documented exceptions.
- Unit test sweep for the new aliases (URL shape).

**Out of scope:**

- JSON-body languages (Vega, Vega-Lite, Excalidraw) — see [S5](cv0-e1-s5--kroki-json-body-languages.md).
- Self-hosted Kroki setup — CV2.E2.
- `/fence list` command — that's [S3](cv0-e1--kroki-through-the-wire.md).
- Language-specific parameter tuning (size, theme, layout) beyond what pi-fence already passes as an info-string meta.
- Case-insensitive tag matching.

## Approach

Every text-based language on Kroki's public endpoint renders through pi-fence with a verified live test. Languages the public endpoint does not serve are named explicitly as unsupported.

## Plan

### Deliverables

#### 1. Research: canonical list of text-based Kroki languages

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

#### 2. Expanded `SUPPORTED_TAGS` and `KROKI_TAG_ALIASES`

`extensions/pi-fence/index.ts`'s `SUPPORTED_TAGS` becomes the flat list of every tag (canonical + aliases) discovered in step 1.

`extensions/pi-fence/kroki.ts`'s `KROKI_TAG_ALIASES` grows to cover every alias → canonical pair. Aliases stay one-way: `{alias → canonical}`.

#### 3. Live tests per language

`tests/integration/kroki.live.test.ts` gains one `it()` per canonical language (not per alias — one test per endpoint is enough; aliases are covered by unit tests). Each live test:

- Uses the canonical source from `canonical-sources.ts`.
- Asserts PNG magic at the head of the response.
- Asserts a size floor calibrated per language (Kroki sometimes returns 300-byte error PNGs for bad input; the floor catches that).

Live-suite runtime grows; accept the cost. Rough estimate: 20 languages × ~1s = ~20s additional. Well under CI's patience.

#### 4. Unit tests for new aliases

`tests/unit/kroki.test.ts` gains one case per new `alias → canonical` pair, matching the pattern S2 established (assert the resolved URL).

#### 5. Documentation

- `README.md` "Supported tags" list updates to the full enumeration.
- `docs/getting-started.md` "First test" example prompts stay small (no need to list every language); the "Supported tags today" line reflects the full list.
- `CHANGELOG.md` `[Unreleased]` entry.
- A new doc `docs/product/kroki-support.md` (or similar) tabulating every researched language with: supported-on-public-endpoint? aliases, known quirks. This is the reference users consult when they want to know what pi-fence can render.

#### 6. Unsupported-languages note

Languages Kroki documents but the public endpoint refuses (plus-tier, deprecated) get a dedicated section in `docs/product/kroki-support.md` with a pointer to CV2.E2 (self-hosted Kroki).

### Implementation order

Test-first per language. Research can be batched; testing proceeds language-by-language so a failing one doesn't block the others.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | research | Probe Kroki's public endpoint; populate `canonical-sources.ts` with tags that return an actual PNG. Commit with a summary of findings | `wip(agent): kroki coverage research` |
| 2 | unit | Alias cases for every new alias in `kroki.test.ts` | `wip(agent): unit tests for new kroki aliases (S4)` |
| 3 | extension | Broaden `SUPPORTED_TAGS` in `index.ts`; existing extension test still passes without changes | `wip(agent): accept every researched Kroki text language (S4)` |
| 4 | integration | Add live tests per language, batched into groups for reviewable commits (e.g., 5 tags per commit). Skip languages whose research showed no public-endpoint support | `wip(agent): live kroki round-trip for <language group> (S4)` |
| 5 | docs | `docs/product/kroki-support.md`, README, getting-started, CHANGELOG | `wip(agent): document full Kroki text coverage (S4)` |
| 6 | close | Status flips + worklog | `wip(agent): close CV0.E1.S4` |

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

## Verification

### Gate

1. `pnpm run check` — docs links and markdown pass.
2. `pnpm test` — fast suite green (unit + extension + contract); the expanded allowlist doesn't introduce new assertion failures.
3. `pnpm test:live` with network available — every newly-added live case passes against real `kroki.io`.
4. `docs/product/kroki-support.md` is readable and accurate.
5. A user reading `README.md` can name every supported language without running pi-fence.

### Prerequisites

Same as S2. No Docker needed for live tests — Kroki is an HTTP dependency.

### Automated tests

```bash
pnpm install
pnpm run check
pnpm test          # fast suite — unit alias assertions + unchanged extension test
pnpm test:live     # integration suite — one case per researched language
```

Expect the live suite to take noticeably longer than S2's (~20s for ~20 languages versus S2's ~3s for 4). That's the honest cost of verifying real rendering.

### Manual test script

Once pi-fence is installed into pi and S4 has landed:

#### 1. Open `docs/product/kroki-support.md`

Skim the supported-languages table. Confirm the list matches what the live-test suite verifies — no language listed that doesn't have a test, no test that isn't listed.

#### 2. For each unfamiliar language, ask the assistant to emit one

Pick three languages you haven't personally seen rendered: e.g., `bpmn`, `wavedrom`, `nomnoml`. Ask the assistant:

> Give me a tiny example of a `<language>` diagram. Use a fenced code block with `<language>` as the tag.

The assistant writes a ```` ```<language> ```` block. pi-fence posts to Kroki. A PNG appears inline.

Expect:

- Every supported language emits a PNG.
- The rendering label reflects whatever tag the assistant wrote.
- If the assistant writes an alias (e.g., `dot` for graphviz), the label preserves it while the underlying endpoint is the canonical name.

#### 3. Try one known-unsupported language

The `kroki-support.md` document names languages Kroki hosts but the public endpoint does not serve. Ask the assistant for one of those:

Expect:

- pi-fence emits an error-kind `pi-fence:output` message. The error surfaces Kroki's response (commonly 404 or a plus-tier notice).
- pi remains responsive.
- The user can read `kroki-support.md` to learn why it isn't supported and what to do next (wait for CV2.E2 self-hosted Kroki).

#### 4. Malformed input per language

Pick two languages. For each, ask the assistant to emit a deliberately broken source (e.g., unclosed brace in DOT, unknown mermaid keyword). Confirm pi-fence surfaces the error, truncated to 500 chars, without crashing the session.

#### 5. Offline behavior unchanged

Same as S1/S2. Disconnect network, ask for any diagram. Expect a network-error custom message; pi stays responsive.

### Rollback

Same as previous stories — `pi uninstall pi-fence`, `/reload`.

## Key files

**Modified:**

- `extensions/pi-fence/kroki.ts` — expanded `KROKI_TAG_ALIASES`.
- `extensions/pi-fence/index.ts` — expanded `SUPPORTED_TAGS`.
- `tests/unit/kroki.test.ts` — alias assertions.
- `tests/integration/kroki.live.test.ts` — per-language live cases.
- `README.md`, `docs/getting-started.md`, `CHANGELOG.md`.
- `docs/process/worklog.md`, status flips in roadmap/Epic/story files.

**New:**

- `tests/fixtures/kroki/canonical-sources.ts` — per-language canonical source + alias table.
- `docs/product/kroki-support.md` — reference document.

## Out of scope — explicitly

- JSON-body languages (Vega, Vega-Lite, Excalidraw). Covered by [S5](cv0-e1-s5--kroki-json-body-languages.md).
- Self-hosted Kroki (CV2.E2).
- `/fence list` integration — S3 lands first; S4 benefits from it automatically.
- Case-insensitive tag matching.
- Language-specific render parameters.
