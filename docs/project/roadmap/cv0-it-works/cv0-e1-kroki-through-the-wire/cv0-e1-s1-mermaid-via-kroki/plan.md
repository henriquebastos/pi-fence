[< S1](README.md)

# Plan: CV0.E1.S1 — Mermaid via Kroki

**Roadmap:** [CV0.E1.S1](README.md) — I see my mermaid diagram rendered as a PNG when the assistant answers
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)
**Date:** 2026-04-18

## Goal

When the assistant writes a fenced mermaid block, a PNG rendered from that block appears inline in the terminal, via a single HTTP call to `https://kroki.io`.

---

## Deliverables

### 1. `extensions/pi-fence/parser.ts` — Fenced block extraction

Pure function. Takes a markdown string, returns the fenced blocks whose opening tag is `mermaid`.

```ts
type FencedBlock = { tag: string; source: string };
export function extractFencedBlocks(markdown: string, tags: string[]): FencedBlock[];
```

Requirements:

- Recognize both ```` ``` ```` and `~~~` fences.
- Respect fence length (a fence of 4 backticks only closes on 4+ backticks).
- Return empty array when no matches.
- Do not attempt to handle nested fences inside the matched block — treat the body as opaque.

Why a module of its own: the parser is the only unit-testable piece in this Story. Keeping it pure allows `parser.test.ts` without spinning up the extension.

### 2. `extensions/pi-fence/kroki.ts` — HTTP call

One function. No class, no caching, no configuration.

```ts
export async function renderViaKroki(
  tag: string,
  source: string,
  signal?: AbortSignal,
): Promise<{ ok: true; png: Buffer } | { ok: false; error: string }>;
```

Behavior:

- `POST https://kroki.io/{tag}/png` with `Content-Type: text/plain`, body = source.
- 15-second timeout via `AbortSignal.timeout(15000)`. Merge with the caller's `signal` if provided.
- On non-2xx, return `{ ok: false, error: <truncated response text, max 500 chars> }`.
- On fetch failure, return `{ ok: false, error: err.message }`.

No tag aliasing in this Story — we pass `mermaid` only. Aliasing arrives in S2 when graphviz/plantuml join.

### 3. `extensions/pi-fence/renderer.ts` — Custom message renderer

Registers a renderer for `customType: "pi-fence:output"`.

Responsibilities:

- Display the image inline using pi's existing image content handling.
- Show a small label (e.g., `Rendered mermaid via kroki`).
- On expand (ctrl+o), also show the original fenced source (syntax-highlighted).

Reuses patterns from `pi-mermaid` and `pi-graphviz` — nothing invented.

### 4. `extensions/pi-fence/index.ts` — Hooks and dispatch

Replaces the current stub. Registers:

- `pi.on("agent_end", …)` that:
  1. Extracts the assistant text from `event.messages`.
  2. Calls `extractFencedBlocks(text, ["mermaid"])`.
  3. For each block, calls `renderViaKroki(tag, source, ctx.signal)`.
  4. On success: `pi.sendMessage({ customType: "pi-fence:output", content: [image, textFallback], details: { tag, source, bytes }, display: true })`.
  5. On error: `pi.sendMessage({ customType: "pi-fence:output", content: [error text], details: { tag, source, error }, display: true })`.
- `pi.registerMessageRenderer("pi-fence:output", renderer)` from `renderer.ts`.

Limit: max 5 rendered blocks per `agent_end` event (hardcoded). More than that and subsequent blocks are skipped with a single notify warning.

### 5. `tests/parser.test.ts` — Unit tests for the parser

Using vitest. Cases:

- Single mermaid block, trivial body → one result.
- Multiple blocks (two mermaid, one unrelated tag) → two results, correct order.
- Block with `~~~` fences → recognized.
- Longer fence (4 backticks) closes only on 4+ → body containing ```` ``` ```` preserved.
- No blocks → empty array.
- Tag list filter — asking for `["mermaid"]` skips `dot` blocks.

No tests for the Kroki HTTP call in this Story (no mock infrastructure in place yet). A smoke test covering the full path with live Kroki lands in S3 or CV0.E2.

### 6. Test dependency setup

Add vitest as a dev dependency. `pnpm test` runs `vitest run`. `pnpm run test:watch` runs `vitest`.

### 7. README + CHANGELOG updates

- `README.md` swaps "early scaffolding" for a minimal install-and-try-it blurb, linking to getting-started.
- `CHANGELOG.md` gets an "Added" entry under `[Unreleased]`.

---

## Implementation order

| Step | What | Commit |
|------|------|--------|
| 1 | Add vitest dev dependency; write `parser.ts` + `parser.test.ts`; make it pass | Commit 1 |
| 2 | Write `kroki.ts` with the HTTP call | Commit 2 |
| 3 | Write `renderer.ts` for the custom message | Commit 3 |
| 4 | Wire it all in `index.ts`; replace the stub | Commit 4 |
| 5 | Run the manual test from [test-guide.md](test-guide.md); fix anything that breaks | Commit 5 (if fixes needed) |
| 6 | Update README + CHANGELOG | Commit 6 |

Each commit leaves tests passing.

---

## Verification

1. `pnpm run check` — docs links pass.
2. `pnpm test` — parser tests pass.
3. Install the extension locally: `pi install /absolute/path/to/pi-fence` (or symlink into `~/.pi/agent/extensions/pi-fence/`); `/reload`.
4. In pi, ask: *"Draw a mermaid flowchart of A → B → C."*
5. Assistant responds with a ```` ```mermaid ```` block.
6. Below the assistant text, a PNG appears showing the three nodes and arrows.
7. Terminal tested: Ghostty (primary target).

Failure-mode checks:
8. Ask for an intentionally broken diagram: *"Write this exact mermaid with a syntax error: ```mermaid\nflowchart\n  A -->>> B\n``` "*. Expect the error message to surface as a pi-fence output message, not a silent failure.
9. Disconnect network, ask for a diagram. Expect a clear error about network failure.

---

## Key files

- `/Users/henrique/me/oss/pi-fence/extensions/pi-fence/index.ts` (rewrite)
- `/Users/henrique/me/oss/pi-fence/extensions/pi-fence/parser.ts` (new)
- `/Users/henrique/me/oss/pi-fence/extensions/pi-fence/kroki.ts` (new)
- `/Users/henrique/me/oss/pi-fence/extensions/pi-fence/renderer.ts` (new)
- `/Users/henrique/me/oss/pi-fence/tests/parser.test.ts` (new)
- `/Users/henrique/me/oss/pi-fence/package.json` (add vitest, add test scripts)
- `/Users/henrique/me/oss/pi-fence/README.md` (update status)
- `/Users/henrique/me/oss/pi-fence/CHANGELOG.md` (add entry)

Reference implementations to read before starting (not to copy blindly):

- [`pi-mermaid/index.ts`](https://github.com/Gurpartap/pi-mermaid/blob/main/index.ts) — how it hooks `agent_end` and structures custom messages.
- [`@walterra/pi-graphviz/extensions/graphviz-chart/index.ts`](https://github.com/walterra/agent-tools/blob/main/packages/pi-graphviz/extensions/graphviz-chart/index.ts) — how it returns an inline image content item.

---

## Out of scope — explicitly

- Non-mermaid tags (S2).
- `/fence list` command (S3).
- Any `FenceProcessor` abstraction (CV0.E2).
- Settings, config, endpoint override (CV1.E1).
- Error feedback surface / follow-up injection (CV1.E2).
- Cache of rendered images.
- User-input blocks (only assistant).
- Streaming/partial rendering.

---

**See also:** [Test Guide](test-guide.md) · [Epic spec](../README.md) · [Principles](../../../../../product/principles.md)
