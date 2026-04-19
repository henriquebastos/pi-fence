[< S1](README.md)

# Plan: CV0.E1.S1 — Mermaid via Kroki

**Roadmap:** [CV0.E1.S1](README.md) — I see my mermaid diagram rendered as a PNG when the assistant answers
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)
**Depends on:** [CV0.E1.S0 — Testing foundation](../cv0-e1-s0-testing-foundation/README.md)
**Date:** 2026-04-18

## Goal

When the assistant writes a fenced mermaid block, a PNG rendered from that block appears inline in the terminal, via a single HTTP call to `https://kroki.io`. The implementation is test-first against the infrastructure S0 provides.

---

## Deliverables

### 1. `extensions/pi-fence/parser.ts` — Fenced block extraction

Pure function. Takes a markdown string, returns the fenced blocks whose opening tag matches a given allowlist.

```ts
type FencedBlock = { tag: string; source: string };
export function extractFencedBlocks(markdown: string, tags: string[]): FencedBlock[];
```

Requirements:

- Recognize both ```` ``` ```` and `~~~` fences.
- Respect fence length (a fence of 4 backticks only closes on 4+ backticks).
- Return empty array when no matches.
- Do not attempt to handle nested fences inside the matched block — treat the body as opaque.
- Preserve source order across multiple blocks.

Why a module of its own: the parser is pure logic, trivially unit-testable without any fake or real I/O.

### 2. `extensions/pi-fence/kroki.ts` — HTTP call using `HttpClient`

Takes an injected `HttpClient` (from `tests/utilities/http-client.ts` in tests; `NodeHttpClient` in production). Does not import `fetch` directly — all HTTP goes through the injected client.

```ts
import type { HttpClient } from "../../tests/utilities/http-client.ts";

export interface KrokiRenderer {
  render(
    tag: string,
    source: string,
    signal?: AbortSignal,
  ): Promise<{ ok: true; png: Buffer } | { ok: false; error: string }>;
}

export function createKrokiRenderer(
  http: HttpClient,
  endpoint = "https://kroki.io",
): KrokiRenderer;
```

Behavior:

- `POST {endpoint}/{tag}/png` with `Content-Type: text/plain`, body = source.
- 15-second timeout via `AbortSignal.timeout(15000)`; merged with the caller's `signal` if provided.
- On non-2xx, return `{ ok: false, error: <truncated response text, max 500 chars> }`.
- On HTTP client error (thrown by the impl), return `{ ok: false, error: err.message }`.

No tag aliasing in this Story — we pass `mermaid` only. Aliasing arrives in S2.

**Note on path of `HttpClient`:** `tests/utilities/http-client.ts` is S0's location. It's a peculiarity that a production module imports from under `tests/`. S2 (or a refactor story) will promote the three I/O-seam interfaces to `extensions/pi-fence/io/` and have the utility fakes import from there. For S1 we keep the S0 location to avoid a pre-emptive refactor.

### 3. `extensions/pi-fence/renderer.ts` — Custom message renderer

Registers a renderer for `customType: "pi-fence:output"`.

Responsibilities:

- Display the image inline using pi's existing image content handling.
- Show a small label (e.g., `Rendered mermaid via kroki`).
- On expand (`ctrl+o`), also show the original fenced source (syntax-highlighted).

Reuses patterns from `pi-mermaid` and `pi-graphviz` — nothing invented.

### 4. `extensions/pi-fence/index.ts` — Hooks and dispatch

Replaces the current stub. Wires the pieces together, pulling production `NodeHttpClient` and `NodeLogger`. Registers:

- `pi.on("agent_end", …)` that:
  1. Extracts the assistant text from `event.messages`.
  2. Calls `extractFencedBlocks(text, ["mermaid"])`.
  3. For each block (up to a cap of 5), calls `kroki.render(tag, source, ctx.signal)`.
  4. On success: `pi.sendMessage({ customType: "pi-fence:output", content: [image, textFallback], details: { tag, source, bytes }, display: true })`.
  5. On error: `pi.sendMessage({ customType: "pi-fence:output", content: [error text], details: { tag, source, error }, display: true })`.
  6. If more than 5 blocks are present, emits a single notify-level warning and processes only the first five.
- `pi.registerMessageRenderer("pi-fence:output", renderer)` from `renderer.ts`.

The module exports a `createExtension(deps: { http, logger })` helper for tests. `index.ts`'s default export wires production deps and calls it.

### 5. Fixture for kroki: recorded PNG

`tests/fixtures/kroki/mermaid-simple.png` — captured once from a real Kroki call for the simplest mermaid (`flowchart LR\n A --> B\n`). Used by the unit test of `kroki.ts` via `FakeHttpClient`. Refreshable via `pnpm refresh-fixtures` (the script grows its first real implementation here).

---

## Implementation order

Test-first at every step. Each step ends with tests green.

| Step | Layer | Test file | Production file | Commit prefix |
|------|-------|-----------|-----------------|---------------|
| 1 | unit | `tests/unit/parser.test.ts` — all cases from Deliverables §1 | — | `wip(agent): parser unit tests (red)` |
| 2 | unit | — | `extensions/pi-fence/parser.ts` | `wip(agent): parser impl (green)` |
| 3 | unit | `tests/unit/kroki.test.ts` — fake HttpClient, assert request shape, verify PNG pass-through on 200, error on 500, timeout path | — | `wip(agent): kroki unit tests with FakeHttpClient (red)` |
| 4 | unit | — | `extensions/pi-fence/kroki.ts` + fixture PNG | `wip(agent): kroki impl with DI (green)` |
| 5 | unit | `tests/unit/renderer.test.ts` — pure rendering math (width, collapsed/expanded) | — | `wip(agent): renderer unit tests (red)` |
| 6 | unit | — | `extensions/pi-fence/renderer.ts` | `wip(agent): renderer impl (green)` |
| 7 | contract | `tests/contract/fence-processor.ts` — the first contract helper; Kroki renderer runs against it | — | `wip(agent): FenceProcessor contract with kroki conformance` |
| 8 | extension | `tests/extension/pi-fence.test.ts` — pi SDK session + fake streamFn emits a mermaid block, extension emits a `pi-fence:output` with image content | — | `wip(agent): extension test for agent_end interception (red)` |
| 9 | extension | — | `extensions/pi-fence/index.ts` (replacing the stub) | `wip(agent): extension wiring (green)` |
| 10 | integration | `tests/integration/kroki.live.test.ts` — `NodeHttpClient` against real `kroki.io`, fixture-byte comparison | — | `wip(agent): live kroki integration test` |
| 11 | docs | `README.md` + `CHANGELOG.md` updates | — | `wip(agent): document S1 install and try it` |
| 12 | close | worklog close; Epic's S1 row flips to ✅ | — | `wip(agent): close CV0.E1.S1` |

Each commit leaves `pnpm test` green. `pnpm test:live` stays green when the container isn't running (integration suite skips cleanly) and green when the container IS running (integration suite passes).

---

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/`): `parser.test.ts`, `kroki.test.ts`, `renderer.test.ts`.
- **Contract** (`tests/contract/`): `fence-processor.ts` helper (first contract of the project) plus a conformance assertion for the Kroki renderer. Future processors (`graphviz-local` in CV0.E2, `mermaid-local` in CV2.E1) import the same helper.
- **Extension** (`tests/extension/`): `pi-fence.test.ts` replaces the S0 exemplar. Full pi SDK session with `streamFn` override emitting a canned assistant message containing a ```` ```mermaid ```` block. Asserts a `pi-fence:output` custom message with image content is emitted during the turn.
- **Integration (live)** (`tests/integration/`): `kroki.live.test.ts` replaces the S0 exemplar. Hits real `kroki.io` via `NodeHttpClient`; asserts the returned PNG matches the committed fixture within tolerance (fixture bytes for deterministic output, or magic-number check for PNG signature if kroki introduces non-determinism).

**Events / interactions covered:**

- `agent_end` event handling in the extension context.
- `pi.sendMessage` emission with `customType: "pi-fence:output"` and multi-content (image + text fallback).
- `pi.registerMessageRenderer` registration and invocation.
- `HttpClient.request` shape for POSTs with text bodies.
- `AbortSignal` propagation — the extension's `ctx.signal` cancels the in-flight Kroki request.
- Multi-block behavior: 2 blocks → 2 messages; 6 blocks → 5 messages + 1 warning.

**Fakes added to `tests/utilities/`:**

None new. S0 ships `FakeHttpClient`, `FakeLogger`, `FakeExtensionAPI`. S1 uses them.

**Live tests added:**

- `tests/integration/kroki.live.test.ts` — real Kroki HTTP call.
- The S0 exemplar `tests/integration/example.live.test.ts` is deleted once the real integration test is in place.

**Deferred to future stories:**

- `DockerExecShellRunner`-based live tests — no local binary in S1. First use lands with CV0.E2 (graphviz-local).
- Load testing, throttling, caching behavior — not in this CV.
- Tests of the `/fence list` command — CV0.E1.S3.
- Tests of config-driven behavior — CV1.E1.
- Tests of error-feedback follow-up messages — CV1.E2.

**Exemplars to delete (they are placeholders S0 shipped):**

- `tests/unit/example.test.ts` — replaced by `tests/unit/parser.test.ts`.
- `tests/extension/example.test.ts` — replaced by `tests/extension/pi-fence.test.ts`.
- `tests/integration/example.live.test.ts` — replaced by `tests/integration/kroki.live.test.ts`.

---

## Verification

1. `pnpm run check` — docs links and markdown pass.
2. `pnpm test` — all unit, contract, and extension tests pass. No Docker required.
3. Run the manual test from [test-guide.md](test-guide.md) end to end.
4. `pnpm test:live` with network available — integration test passes against real Kroki.
5. `pnpm test:live` offline — integration test skips cleanly (no network → `skipIf`).

Failure-mode manual checks (from test-guide):

1. Broken mermaid → error message surfaces as a `pi-fence:output`, not a silent failure.
2. Network disconnected → clear, short error in the output message; pi session remains responsive.
3. Six blocks in one assistant turn → five rendered, one warning notified.

---

## Key files

**New:**

- `extensions/pi-fence/parser.ts`
- `extensions/pi-fence/kroki.ts`
- `extensions/pi-fence/renderer.ts`
- `tests/unit/parser.test.ts`
- `tests/unit/kroki.test.ts`
- `tests/unit/renderer.test.ts`
- `tests/contract/fence-processor.ts`
- `tests/extension/pi-fence.test.ts`
- `tests/integration/kroki.live.test.ts`
- `tests/fixtures/kroki/mermaid-simple.png`

**Rewritten:**

- `extensions/pi-fence/index.ts` (stub → full wiring)
- `README.md` (early-scaffolding blurb → install-and-try)
- `CHANGELOG.md` (new Added entries)

**Deleted (exemplars from S0):**

- `tests/unit/example.test.ts`
- `tests/extension/example.test.ts`
- `tests/integration/example.live.test.ts`

Reference implementations to read before starting (not to copy blindly):

- [`pi-mermaid/index.ts`](https://github.com/Gurpartap/pi-mermaid/blob/main/index.ts) — hooks on `agent_end`, custom message structure.
- [`@walterra/pi-graphviz/extensions/graphviz-chart/index.ts`](https://github.com/walterra/agent-tools/blob/main/packages/pi-graphviz/extensions/graphviz-chart/index.ts) — inline image content item shape.

---

## Out of scope — explicitly

- Non-mermaid tags (S2).
- `/fence list` command (S3).
- Any `FenceProcessor` abstraction as a registered-and-swappable thing (CV0.E2). The contract helper in S1 exists to type-check the kroki renderer; the registry arrives with the second processor.
- Settings, config, endpoint override (CV1.E1).
- Error feedback follow-up to the LLM (CV1.E2).
- Cache of rendered images.
- User-input blocks (only assistant).
- Streaming / partial rendering.

---

**See also:** [Test Guide](test-guide.md) · [Epic spec](../README.md) · [S0](../cv0-e1-s0-testing-foundation/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
