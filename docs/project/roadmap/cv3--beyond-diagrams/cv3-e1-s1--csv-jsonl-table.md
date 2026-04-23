# CV3.E1.S1 — CSV/JSONL → formatted table processor

**Status:** Draft

**Epic:** [CV3.E1 — Text Processors](cv3-e1--text-processors.md)
**Date:** 2026-04-23 (spec)

## Summary

A new `table` processor renders `csv` and `jsonl` fenced blocks as aligned Unicode tables in the terminal. This is the first non-image processor — it extends `FenceResult` with a `text` output variant and updates the pipeline (message builder, agent-end handler, contract helper) to handle both image and text results.

## Done criterion

A `csv` or `jsonl` fenced block in an assistant turn renders as a formatted text table. `/fence list` shows `table [registered]` with tags `csv`, `jsonl`. The `FenceResult` type supports both `{ ok: true; png: Buffer }` and `{ ok: true; text: string }` — existing image processors are unaffected.

## Scope

**In scope:**

- Extend `FenceResult` with `{ ok: true; text: string }`.
- Update `buildPiFenceOutputMessage` to emit `{ type: "text" }` content for text results.
- Update `agent-end.ts` logging to handle text results (no `result.png.length`).
- Update contract helper to support text-output processors via an `outputKind` option.
- New `table.ts` processor implementing `FenceProcessor`:
  - `id: "table"`, `tags: ["csv", "jsonl"]`, `aliases: {}`.
  - `available()`: always `{ ok: true }` — pure logic, no external deps.
  - `render()`: parse input, format as Unicode box-drawing table, return `{ ok: true; text: string }`.
- CSV parsing: comma-separated, quoted fields (RFC 4180 subset), first row as headers.
- JSONL parsing: one JSON object per line, keys from first object as headers, missing keys → empty cell, non-primitive values → JSON-stringified.
- Table formatting: Unicode box-drawing borders (`─│┌┐└┘├┤┬┴┼`), column-aligned, cell values truncated at 40 chars.
- Registration in `index.ts` after mermaid-local, before kroki.
- Contract test, unit tests, extension test.

**Out of scope:**

- ANSI styling (bold headers, colored borders). Future.
- Number alignment (right-align numeric columns). Future.
- TSV or other delimiters. Future.
- Configurable max column width. Future.
- Large-file streaming or row limits. Future (the 5-block-per-turn cap already bounds volume).

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | type + pipeline | Extend `FenceResult` with text variant; update message builder, agent-end handler, contract helper |
| 2 | unit + impl | `table.ts`: processor factory, CSV/JSONL parsing, table formatting |
| 3 | contract | Contract test with text-output assertions |
| 4 | extension | Full pipeline: csv/jsonl block → table text in sent message |

## Tests

- **Unit (step 1):** message builder emits text content for `{ ok: true; text }` results. Agent-end handler logs text result size.
- **Unit (step 2):** CSV parsing — headers, quoted fields, empty cells, malformed input → error. JSONL parsing — flat objects, missing keys, nested values, invalid JSON → error. Table formatting — column alignment, truncation, box-drawing borders, empty input → error.
- **Contract (step 3):** `runFenceProcessorContract` with `outputKind: "text"` — asserts `typeof result.text === "string"` instead of `Buffer.isBuffer(result.png)`.
- **Extension (step 4):** csv block → table processor → sent message with `{ type: "text" }` content.
- **Fakes:** no new fakes — table processor is pure logic (no HTTP, no shell).
- **Live:** none — no external dependencies.

## Key files

**New:** `extensions/pi-fence/table.ts`, `tests/contract/table.contract.test.ts`, `tests/unit/table.test.ts`.

**Modified:** `extensions/pi-fence/processor.ts` (FenceResult), `extensions/pi-fence/messages.ts` (message builder), `extensions/pi-fence/agent-end.ts` (logging), `tests/contract/fence-processor.ts` (outputKind), `extensions/pi-fence/index.ts` (registration), `tests/extension/pi-fence.test.ts`.

## Design notes

**FenceResult extension — field presence, not discriminant.** The ok branch gains a second variant via the `text` field. Callers narrow with `'png' in result` vs `'text' in result`. This avoids a breaking `kind` discriminant on existing processors. When D7's `component` and `passthrough` variants arrive (CV4), a discriminant refactor is warranted — but not before there's implementation pressure.

**Table processor is always available.** Unlike graphviz-local (needs `dot`) or mermaid-local (needs `mmdc`), the table processor is pure TypeScript with no external dependencies. `available()` returns `{ ok: true }` unconditionally.

**Registration order.** `graphviz-local`, `mermaid-local`, `table`, `kroki`. Table goes before kroki because kroki doesn't handle `csv`/`jsonl` — but the order only matters for tag collision, which doesn't apply here. Placing it before kroki is consistent with "local-first" ordering.
