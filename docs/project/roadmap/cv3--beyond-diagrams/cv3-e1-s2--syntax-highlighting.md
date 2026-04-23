# CV3.E1.S2 — SQL/regex/jq syntax highlighting processor

**Status:** Draft

**Epic:** [CV3.E1 — Text Processors](cv3-e1--text-processors.md)
**Date:** 2026-04-23 (spec)

## Summary

A new `highlight` processor applies ANSI syntax highlighting to `sql`, `regex`, and `jq` fenced blocks. When the assistant emits code in these languages, pi-fence intercepts and re-renders with colored keywords, strings, numbers, and comments — more legible than the raw monospaced text pi shows by default.

## Done criterion

A `sql`, `regex`, or `jq` fenced block in an assistant turn renders as ANSI-highlighted text. `/fence list` shows `highlight [registered]` with tags `sql`, `regex`, `jq`. Highlighting uses ANSI escape codes; no external dependency.

## Scope

**In scope:**

- New `highlight.ts` processor implementing `FenceProcessor`.
- `id: "highlight"`, `tags: ["sql", "regex", "jq"]`, `aliases: {}`.
- `available()`: always `{ ok: true }` — pure logic, no external deps.
- `render()`: tokenize source per tag, apply ANSI colors, return `{ ok: true; text: string }`.
- SQL highlighting: keywords (SELECT, FROM, WHERE, etc.), strings (single-quoted), numbers, comments (`--` line, `/* */` block).
- regex highlighting: character classes `[…]`, groups `(…)`, quantifiers `*+?{}`, anchors `^$`, alternation `|`, escapes `\x`.
- jq highlighting: builtins (`select`, `map`, `empty`, `length`, etc.), operators (`.`, `|`, `,`), strings, numbers, `//` (alt operator).
- Registration in `index.ts` after table, before kroki.
- Contract test, unit tests, extension test.

**Out of scope:**

- Full SQL dialect coverage (vendor keywords, PL/pgSQL). Covers ANSI SQL keywords.
- Configurable color scheme. Future.
- Additional languages beyond SQL/regex/jq. Future (each new language is a small addition).

## Plan

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | `highlight.ts`: processor factory, tokenizers for SQL/regex/jq, ANSI formatting |
| 2 | contract | Contract test (text-output) |
| 3 | extension | Full pipeline: sql/regex/jq block → highlighted text in sent message |

## Tests

- **Unit (step 1):** Per-language highlighting: SQL keywords colored, strings colored, comments colored. regex groups/quantifiers colored. jq builtins/operators colored. Abort path. Empty input → error.
- **Contract (step 2):** `runFenceProcessorContract` with `outputKind: "text"`.
- **Extension (step 3):** sql block → highlight processor → sent message with ANSI text content.
- **Fakes:** none — pure logic.
- **Live:** none — no external dependencies.

## Key files

**New:** `extensions/pi-fence/highlight.ts`, `tests/contract/highlight.contract.test.ts`, `tests/unit/highlight.test.ts`.

**Modified:** `extensions/pi-fence/index.ts` (registration), `tests/extension/pi-fence.test.ts`.

## Design notes

**Hand-written tokenizers, not a library.** Shiki (~10 MB) or similar would be overkill for three languages. Simple keyword-match + state-machine tokenizers produce good-enough ANSI output with zero dependencies. Each tokenizer is a pure function `(source: string) => string` that returns ANSI-colored text. Adding a new language later means adding one tokenizer function and a tag entry.

**ANSI color scheme.** Uses standard 16-color ANSI codes (bold, dim, colors 31–36) so the output adapts to any terminal theme. No 256-color or truecolor to keep compatibility broad.
