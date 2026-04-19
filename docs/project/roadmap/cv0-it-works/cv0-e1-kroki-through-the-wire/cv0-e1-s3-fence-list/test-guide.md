[< S3](README.md)

# Test Guide: CV0.E1.S3 — `/fence list`

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)

---

## Prerequisites

No Docker, no network. `/fence list` is an offline read command.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Specifically:

- `tests/unit/list.test.ts` — `listProcessors()` returns the Kroki row; `formatProcessorLines()` produces the canonical/alias layout; empty input yields the fallback line.
- `tests/unit/renderer.test.ts` — the list renderer composes the expected lines.
- `tests/unit/fence-command.test.ts` — the `/fence` command handler dispatches on `list`, emits a `pi-fence:list` custom message, and replies with a warning on unknown subcommands.
- `tests/extension/pi-fence.test.ts` — the `/fence list` path reaches the transcript through a real pi `AgentSession`.

For the live suite:

```bash
pnpm test:live
```

Unchanged from S2 (no new live cases).

---

## Manual test script

Once pi-fence is installed into pi (or symlinked under `~/.pi/agent/extensions/`):

### 1. `/fence list` prints the processor listing

In pi, type:

```text
/fence list
```

Expect:

- A custom message appears below the prompt (not an assistant turn).
- Header line reads `Processors`.
- One line per registered processor, today just:

  ```text
  kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2
  ```

- No network request was made. The output is identical if the machine is offline.
- No follow-up assistant turn triggers.

### 2. `/fence` with no subcommand shows help

Type:

```text
/fence
```

Expect:

- A one-line `ctx.ui.notify` warning lists the available subcommands. In S3 the only subcommand is `list`.
- No custom message, no assistant turn.

### 3. `/fence bogus` is a no-op with a warning

Type:

```text
/fence bogus
```

Expect:

- Same warning as step 2, referencing the unknown subcommand.
- Session state is unchanged.

### 4. Rendering a diagram after `/fence list` still works

Still in the same session, ask the assistant:

> Draw a mermaid diagram of two nodes connected by an arrow.

Expect:

- The S1/S2 rendering path remains green. PNG appears below the assistant's text.
- `/fence list` output from step 1 is still visible in the transcript above.

### 5. Expansion behaviour

Pressing `ctrl+o` on the `pi-fence:list` message is a no-op in S3: collapsed and expanded render identically. There is no hidden detail today. A future story (e.g. `/fence doctor` output) may add expanded detail; S3 stays minimal.

---

## Rollback

Same as S1/S2: `pi uninstall pi-fence`, `/reload`. `/fence list` becomes unknown again.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [S2 test guide](../cv0-e1-s2-other-kroki-tags/test-guide.md)
