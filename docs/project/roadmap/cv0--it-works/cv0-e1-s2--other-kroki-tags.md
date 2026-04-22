# CV0.E1.S2 — Other Kroki-supported diagrams

**Status:** Done

**Epic:** [CV0.E1 — Kroki Through The Wire](cv0-e1--kroki-through-the-wire.md)
**Depends on:** [CV0.E1.S1 — Mermaid via Kroki](cv0-e1-s1--mermaid-via-kroki.md)
**Date:** 2026-04-18

## Summary

S1 proved the mermaid path. S2 broadens the tag allowlist so `dot` / `graphviz`, `plantuml` / `puml`, and `d2` flow through the same pipeline without duplicated plumbing.

## Done criterion

A user asks the assistant: *"Draw a graphviz DOT graph of module dependencies."* or *"Make a PlantUML sequence diagram."* or *"Sketch this as a d2 diagram."* The assistant writes the obvious fenced block (```` ```dot ````, ```` ```plantuml ````, ```` ```d2 ````) and a PNG appears below. The rendering label ("Rendered dot via kroki", "Rendered plantuml via kroki") preserves whatever tag the user or LLM actually wrote — not the canonical Kroki endpoint name.

## Scope

**In scope:**

- Add `graphviz`, `dot`, `plantuml`, `puml`, `d2` to the extension's tag allowlist.
- Kroki processor maps colloquial tags (`dot`, `puml`) to the canonical endpoint names Kroki expects (`graphviz`, `plantuml`) at request time.
- Parser, renderer, and extension wiring remain unchanged structurally; they already handle arbitrary tag strings.
- Live integration test gains a `dot` round-trip against real kroki.io.
- Documentation reflects the broadened list.

**Out of scope:**

- Non-Kroki processors (CV0.E2 introduces the first, graphviz-local).
- Registry abstraction (CV0.E2).
- Further tags like `nomnoml`, `wavedrom`, `vega-lite` (deferrable; add when a user actually asks for them).
- `/fence list` command (S3).
- Settings-based tag enable/disable (CV1.E1).

## Approach

`graphviz` / `dot`, `plantuml` / `puml`, and `d2` fenced blocks emitted by the assistant are rendered as PNGs via Kroki, alongside the existing `mermaid` flow. The user's original tag is preserved in every surface (rendering label, logs, error messages) even when Kroki's endpoint uses a different canonical name.

## Plan

### Deliverables

#### 1. Kroki tag aliases

Inline in `extensions/pi-fence/kroki.ts`. A small map from user-facing tag to Kroki's canonical endpoint name:

```ts
const ALIASES: Record<string, string> = {
  dot: "graphviz",
  puml: "plantuml",
};
```

Kroki's `render(tag, source, signal)` resolves the endpoint via `ALIASES[tag] ?? tag` and POSTs to `{endpoint}/{resolvedTag}/png`. The caller's `tag` is never mutated on the way out — everything downstream still sees the user's original tag.

Keeping this inline (not a separate module) matches YAGNI. Extract when a second processor needs its own alias map.

#### 2. Extension tag allowlist

`extensions/pi-fence/index.ts` `SUPPORTED_TAGS` broadens from `["mermaid"]` to:

```ts
["mermaid", "graphviz", "dot", "plantuml", "puml", "d2"]
```

Order matters for readability only. The parser matches on exact string membership.

#### 3. Renderer label preserves the user's tag

No code change needed. `formatLabel` already takes the tag verbatim and the extension passes the parser's original tag, not the alias-resolved one. S2 adds a unit test that locks in this behavior so it doesn't regress.

#### 4. Documentation

- `README.md` — "What works today" list updates (mermaid + graphviz/dot + plantuml/puml + d2).
- `CHANGELOG.md` — `[Unreleased]` section gets S2 entries.
- `docs/getting-started.md` — the "Intended first test" examples gain one non-mermaid example.

### Implementation order

Test-first throughout. Each step leaves `pnpm test` green.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | unit | Aliases in `kroki.ts`; new `tests/unit/kroki.test.ts` cases for alias resolution (dot→graphviz URL, puml→plantuml URL, unknown tag passes through) | `wip(agent): kroki tag aliases (S2 step 1)` |
| 2 | unit + extension | `SUPPORTED_TAGS` broadens; new `tests/extension/pi-fence.test.ts` case covering a `dot` block end-to-end through the real SDK + FakeHttpClient | `wip(agent): accept additional Kroki tags (S2 step 2)` |
| 3 | integration | `tests/integration/kroki.live.test.ts` gains a `dot` round-trip (real graphviz via kroki.io) | `wip(agent): live dot roundtrip (S2 step 3)` |
| 4 | docs | README, CHANGELOG, getting-started | `wip(agent): document S2 broader Kroki support` |
| 5 | close | worklog + Epic/story file status flips | `wip(agent): close CV0.E1.S2` |

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/kroki.test.ts`): three new cases — alias-resolved URL for `dot`, alias-resolved URL for `puml`, identity pass-through for an unaliased tag.
- **Extension** (`tests/extension/pi-fence.test.ts`): new case firing a `dot` block through the full pipeline; asserts `pi-fence:output` was emitted with `details.tag === "dot"` (user's tag preserved) while the HTTP call hit `/graphviz/png` (alias resolved).
- **Integration (live)** (`tests/integration/kroki.live.test.ts`): one added case — real `dot` source against `kroki.io`, asserting PNG magic + size floor.
- **Contract** (`tests/contract/kroki.contract.test.ts`): unchanged. The contract is processor-level, not per-tag.

**Events / interactions covered:**

- Parser with a multi-tag allowlist (already covered in S1's parser tests).
- Kroki processor URL construction with and without alias resolution.
- Extension's `agent_end` hook accepting a non-mermaid tag.
- Real HTTP against Kroki's `/graphviz/png` endpoint.

**Fakes added:**

None. `FakeHttpClient` (already exists from S0) covers every fake-level need.

**Live tests added:**

`tests/integration/kroki.live.test.ts` gains one case: `dot` source rendered against real Kroki.

**Deferred:**

- Other Kroki tags (`nomnoml`, `wavedrom`, `vega-lite`, etc.). Add per-tag as users ask. The plumbing doesn't change — just the allowlist.
- A test that asserts case-insensitivity for tags. The parser is case-sensitive by design (documented in S1); users and LLMs write lowercase. If that bites, it's a separate story.

## Verification

### Gate

1. `pnpm run check` — docs links and markdown pass.
2. `pnpm test` — all unit, contract, and extension tests pass. `dot` block flows through the extension without an HTTP call (FakeHttpClient captures and asserts).
3. Manual test from [Verification](#verification).
4. `pnpm test:live` against real kroki.io — `dot` round-trip renders a real PNG.

### Prerequisites

Same as S1. No Docker needed for the live test — Kroki is an HTTP dependency.

### Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Specifically:

- `tests/unit/kroki.test.ts` — new alias-resolution cases pass alongside S1's.
- `tests/extension/pi-fence.test.ts` — `dot` block end-to-end (details.tag === "dot", HTTP hits /graphviz/png).

For the live suite:

```bash
pnpm test:live
```

Expect: `tests/integration/kroki.live.test.ts` passes. The new `dot` case goes through the real graphviz renderer hosted on kroki.io.

### Manual test script

Once pi-fence is installed into pi (or symlinked under `~/.pi/agent/extensions/`):

#### 1. graphviz / dot

In pi, ask:

> Draw a graphviz DOT graph showing: user → web, web → api, api → db.

Expect:

- Assistant responds with a fenced block whose tag is `dot` or `graphviz` (modern LLMs tend to write `dot`).
- pi-fence emits a custom message below the assistant's text with a PNG rendered by Kroki's graphviz engine.
- The label reads "Rendered dot via kroki" (or "Rendered graphviz via kroki") — whichever tag the assistant actually wrote.

#### 2. plantuml / puml

Ask:

> Make a PlantUML sequence diagram of an OAuth authorization code flow.

Expect:

- Assistant writes a ```` ```plantuml ```` block.
- PNG appears below with actors, arrows, participant boxes.
- Label preserves the tag.

#### 3. d2

Ask:

> Sketch a d2 diagram of a microservices architecture — gateway, three services, one database.

Expect:

- Assistant writes a ```` ```d2 ```` block.
- PNG appears below in d2's signature style.

#### 4. Broken syntax still surfaces a readable error

Ask:

> Write this exact dot block verbatim:
>
> ```dot
> digraph {
>   A -> B
>   // missing closing brace
> ```

Expect:

- pi-fence emits an error-kind custom message, not an image.
- The error text comes from Kroki's parse error output, truncated to 500 chars.
- pi remains responsive.

#### 5. Offline behavior unchanged from S1

Disconnect network. Ask for any diagram.

Expect:

- pi-fence emits an error-kind message with a network-related error.
- pi remains responsive.

### Rollback

Same as S1 — `pi uninstall pi-fence`, `/reload`.

## Key files

**Modified:**

- `extensions/pi-fence/kroki.ts` — alias map + resolution in `render`.
- `extensions/pi-fence/index.ts` — `SUPPORTED_TAGS` broadens.
- `tests/unit/kroki.test.ts` — alias cases.
- `tests/extension/pi-fence.test.ts` — dot case.
- `tests/integration/kroki.live.test.ts` — dot case.
- `README.md`, `CHANGELOG.md`, `docs/getting-started.md` — documentation.
- `docs/process/worklog.md` — Next/Done entries.
- Status flip in the roadmap, Epic, and story files.

**New:**

None. Every added line lands in existing files.

## Out of scope — explicitly

- Registry of processors (CV0.E2 when graphviz-local competes with Kroki for `dot`).
- User-configurable tag enable/disable (CV1.E1).
- Non-Kroki processors (CV0.E2+).
- `/fence list` command (S3).
- Case-insensitive tag matching.
- Meta-parameter handling (`theme=dark`, `width=800`) beyond what S1 already passes through.
- Further Kroki tags (`nomnoml` and friends). Add per-tag when a user asks.
