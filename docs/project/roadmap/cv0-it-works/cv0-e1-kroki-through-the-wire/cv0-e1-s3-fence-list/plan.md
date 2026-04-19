[< S3](README.md)

# Plan: CV0.E1.S3 — `/fence list`

**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)
**Depends on:** [CV0.E1.S2 — Other Kroki diagrams](../cv0-e1-s2-other-kroki-tags/README.md)
**Date:** 2026-04-19

## Goal

A user who types `/fence list` sees a table of every processor pi-fence has wired into the session, its status, and the tags it accepts (canonical with aliases in parentheses). The command is the first user-facing read surface pi-fence ships, and the last story of CV0.E1 before CV0.E2 introduces a second processor alongside Kroki.

---

## Deliverables

### 1. Processor metadata on `FenceProcessor`

`extensions/pi-fence/processor.ts` gains two optional fields:

```ts
export interface FenceProcessor {
  readonly id: string;
  /** Canonical tag names this processor handles. */
  readonly tags: readonly string[];
  /** Map from alias → canonical tag. Canonical tags appear as values of this map and as entries in `tags`. */
  readonly aliases: Readonly<Record<string, string>>;
  render(tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
```

`tags` and `aliases` are declared `readonly` so the list/format path cannot mutate a processor's configuration. Empty `aliases` (the common case once CV0.E2 lands) is `{}`, not `undefined`, so downstream formatting has no null branch.

The contract helper (`tests/contract/fence-processor.ts`) gets two new assertions: `tags` is a non-empty array of strings, `aliases` is an object whose values all appear in `tags`.

### 2. Kroki processor publishes its tag metadata

`extensions/pi-fence/kroki.ts`:

- Lifts `KROKI_TAG_ALIASES` from file-private to an exported `const` (`KROKI_ALIASES`). Same shape, same values.
- Adds `const KROKI_CANONICAL_TAGS = ["mermaid", "graphviz", "plantuml", "d2"] as const`.
- `createKrokiRenderer` returns an object that satisfies the new `FenceProcessor` shape — `tags: KROKI_CANONICAL_TAGS`, `aliases: KROKI_ALIASES`.

The extension's `SUPPORTED_TAGS` in `index.ts` is no longer the source of truth. It becomes a derived value at wiring time: canonical tags from every registered processor, plus their alias keys. The derivation happens once in `createPiFenceExtension`.

### 3. `listProcessors()` function

New module `extensions/pi-fence/list.ts`. Exports:

```ts
export interface ProcessorListing {
  id: string;
  status: "registered";
  tags: readonly string[];                        // canonical tags
  aliases: Readonly<Record<string, string>>;      // alias → canonical
}

export function listProcessors(
  processors: readonly FenceProcessor[],
): ProcessorListing[];
```

One reason for the separate module: the formatter and the data builder stay disjoint. `list.ts` has zero pi-tui, zero pi-SDK dependencies — it is a pure function on `FenceProcessor[]`.

`status` is the string literal `"registered"` today. A future story widens the union (e.g. `"registered" | "unreachable"`) when `/fence doctor` adds real probes.

### 4. Line formatter

Same file `list.ts`. Pure function:

```ts
export function formatProcessorLines(listings: readonly ProcessorListing[]): string[];
```

Returns an array of strings, one line per processor. Shape per line:

```text
<id> [<status>] — <tags>
```

Example for today's single-processor case:

```text
kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2
```

Empty listing returns a single `(no processors registered)` line — defensive; pi-fence always has Kroki today.

Tag rendering: canonical tags joined by a comma and a space, with each alias that maps to a canonical tag shown in parentheses after it. A canonical tag with multiple aliases renders them comma-separated inside the parentheses: `graphviz (dot, gv)`. Irrelevant today but the formatter is written without assuming a one-to-one alias relationship.

No column alignment. The shape is readable prose, not a table. If a future story introduces enough processors that visual alignment earns its keep, revisit then; today a one-line-per-processor shape keeps the formatter trivial and the test surface small.

### 5. Custom message renderer `pi-fence:list`

`extensions/pi-fence/renderer.ts` gains a second factory: `createPiFenceListRenderer`. Renders a `Box` containing a header line (`Processors`), a spacer, and the lines returned by `formatProcessorLines` as `Text` children. Shares the box styling convention with `pi-fence:output`.

Keeping both renderers in `renderer.ts` follows the pattern pi's own `message-renderer.ts` example uses: one file, multiple factory exports, each invoked from the extension wiring.

### 6. `/fence list` command registration

In `createPiFenceExtension`:

```ts
pi.registerCommand("fence list", {
  description: "List fence processors registered with pi-fence",
  handler: async (_args, _ctx) => {
    const listings = listProcessors([processor]);
    const lines = formatProcessorLines(listings);
    pi.sendMessage({
      customType: "pi-fence:list",
      content: [{ type: "text", text: lines.join("\n") }],
      details: { listings },
      display: true,
    });
  },
});
```

Slash-command name open question: pi's convention accepts a single identifier, not a space-separated pair. Writing `"fence list"` is invalid. Two options:

1. Register `/fence-list` (hyphenated).
2. Register `/fence` and parse the first word of `args` (`list` → listing; other words reserved for future subcommands).

Option 2 reads more naturally (`/fence list` matches the roadmap text and the briefing) and gives `/fence doctor`, `/fence trace` a home without needing a second command. S3 registers `/fence` and dispatches on `args.trim().split(/\s+/)[0]`. Unknown subcommands are a `ctx.ui.notify(..., "warning")` with a one-line help string. Only `list` is wired in S3; the help string enumerates just `list` and mentions "more coming".

### 7. Extension wiring

`extensions/pi-fence/index.ts`:

- Derives `SUPPORTED_TAGS` from the active processor(s) as described in Deliverable 2.
- Registers the list renderer via `pi.registerMessageRenderer("pi-fence:list", ...)`.
- Registers `/fence` with the dispatcher described in Deliverable 6.

### 8. Documentation

- `README.md` — "What does not work yet" drops `/fence list`. "What works today" gains a short line: `/fence list` prints the registered processors and their tags.
- `CHANGELOG.md` — `[Unreleased]` section gets the S3 line.
- `docs/getting-started.md` — the "Intended first test" section gains step "Type `/fence list` to see the Kroki processor and its tag list."

---

## Implementation order

Test-first. Each step leaves `pnpm test` green.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | contract | Extend `FenceProcessor` with `tags` + `aliases`; update `tests/contract/fence-processor.ts` to assert the new fields; Kroki renderer declares its metadata so the contract test stays green | `wip(agent): fence processor exposes tag metadata (S3 step 1)` |
| 2 | unit | New `tests/unit/list.test.ts` covering `listProcessors()` and `formatProcessorLines()` — including the kroki-only listing, an empty listing, and a fictional two-processor listing with multiple aliases | `wip(agent): listProcessors + formatProcessorLines (S3 step 2)` |
| 3 | unit | Extend `tests/unit/renderer.test.ts` with `createPiFenceListRenderer` cases: header line, body lines match formatter output, expanded and collapsed render the same content in S3 (no hidden detail) | `wip(agent): pi-fence:list message renderer (S3 step 3)` |
| 4 | unit (FakeExtensionAPI) | New `tests/unit/fence-command.test.ts` — drives `createPiFenceExtension` against a `FakeExtensionAPI`, asserts `/fence` is registered, invokes the recorded handler with `args === "list"`, asserts a `pi-fence:list` message reached `sentMessages`. First real consumer of `FakeExtensionAPI` beyond its own self-test | `wip(agent): /fence list command handler (S3 step 4)` |
| 5 | extension | Extend `tests/extension/pi-fence.test.ts` — new `runExtensionWithCommand` helper (or inline block) exercises a real `AgentSession` with the extension loaded, dispatches `/fence list`, asserts the custom message shape appears in captured messages | `wip(agent): /fence list through real pi session (S3 step 5)` |
| 6 | docs | README, CHANGELOG, getting-started | `wip(agent): document /fence list` |
| 7 | close | worklog + Epic/story README status flips | `wip(agent): close CV0.E1.S3` |

Step 5 is where some real-SDK friction may surface (how pi dispatches slash commands in `AgentSession`, what event or call path fires the handler). If `createAgentSession` does not expose a clean way to dispatch a command without a TUI, step 5's test may have to fall back to invoking `pi._extensionRunner.getRegisteredCommands()` internals — or we ship S3 with only step 4's coverage at the handler layer and call that sufficient. Decide on encounter, do not block the story.

---

## Tests

**Test layers touched:**

- **Contract** (`tests/contract/fence-processor.ts`, `tests/contract/kroki.contract.test.ts`): new assertions for `tags` and `aliases` fields.
- **Unit** (`tests/unit/list.test.ts`, `tests/unit/renderer.test.ts`, `tests/unit/fence-command.test.ts`): listing builder, line formatter, renderer factory, command handler.
- **Extension** (`tests/extension/pi-fence.test.ts`): command dispatched through a real pi `AgentSession`, custom message reaches the transcript.
- **Integration (live)**: no new live tests. `/fence list` is offline; exercising it against real Kroki gives no additional signal.

**Events / interactions covered:**

- Processor metadata contract (shape of `tags`, `aliases`).
- Listing a single processor (Kroki) with its real alias map.
- Listing an empty processor array (defensive row).
- Listing a hypothetical two-processor case with overlapping tags — asserts formatter does not crash and the rows are stable (uses fake processors constructed in the test, no second real processor today).
- Command registration under the name `/fence`, dispatching on the first token of `args`.
- `unknown subcommand` path firing `ctx.ui.notify`.
- Custom message renderer output for the list type.

**Fakes added:**

- `tests/unit/fence-command.test.ts` uses `FakeExtensionAPI` to drive the handler directly. Small helper `makeFakeProcessor(id, tags, aliases)` inside the test file only — not promoted to utilities until a second consumer appears.

**Live tests added:**

None.

**Deferred:**

- Health probes / `/fence doctor`. Separate story, not yet placed on the roadmap.
- Filter arguments (`/fence list --source=extension`, etc.). No current consumer.
- `/fence trace` / log viewer. Separate story.
- A structured-output render path (JSON for programmatic readers). CV3 or beyond, when a tool actually consumes pi-fence output.

---

## Verification

1. `pnpm run check` — docs links and markdown pass; new S3 directory reachable from the Epic README.
2. `pnpm test` — all layers green. Minimum 7 new tests (step 2's three cases, step 3's two cases, step 4's two cases; more likely 10–12 once the formatter edge cases are fully locked).
3. `pnpm test:live` — unchanged from S2. No live cases added.
4. Manual test from [test-guide.md](test-guide.md).

---

## Key files

**Modified:**

- `extensions/pi-fence/processor.ts` — `FenceProcessor` gains `tags` and `aliases`.
- `extensions/pi-fence/kroki.ts` — exports `KROKI_ALIASES`; `createKrokiRenderer` returns the new shape.
- `extensions/pi-fence/index.ts` — `SUPPORTED_TAGS` derived from the processor; registers `/fence` command and `pi-fence:list` renderer.
- `extensions/pi-fence/renderer.ts` — adds `createPiFenceListRenderer`.
- `tests/contract/fence-processor.ts` — tag/alias assertions.
- `tests/contract/kroki.contract.test.ts` — picks up the new contract automatically; may need a small edit if the factory call site shifts.
- `tests/unit/renderer.test.ts` — list renderer cases.
- `tests/extension/pi-fence.test.ts` — `/fence list` dispatch case.
- `README.md`, `CHANGELOG.md`, `docs/getting-started.md` — doc updates.
- `docs/process/worklog.md` — Next/Done entries.
- Status flips in the roadmap, Epic, and story READMEs.

**New:**

- `extensions/pi-fence/list.ts` — `listProcessors`, `formatProcessorLines`, `ProcessorListing` type.
- `tests/unit/list.test.ts`.
- `tests/unit/fence-command.test.ts`.

---

## Out of scope — explicitly

- `/fence doctor` and any health probing.
- Network calls during `/fence list`.
- Second processor, registry abstraction (CV0.E2).
- Per-tag enable/disable flags (CV1.E1).
- Any write operation from `/fence`.
- Case-insensitive tag matching (still deferred from S2).
- Argument auto-completion for `/fence <subcommand>`. `getArgumentCompletions` could offer `list` as the only completion; if the implementation is one line and the test is cheap, ship it with step 4; otherwise defer.

---

**See also:** [Test Guide](test-guide.md) · [S3 README](README.md) · [S2 plan](../cv0-e1-s2-other-kroki-tags/plan.md) · [Principles — Testing](../../../../../product/principles.md#testing)
