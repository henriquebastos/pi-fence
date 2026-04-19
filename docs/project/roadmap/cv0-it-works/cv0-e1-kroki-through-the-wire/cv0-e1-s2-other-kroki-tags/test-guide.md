[< S2](README.md)

# Test Guide: CV0.E1.S2 — Other Kroki-supported diagrams

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)

---

## Prerequisites

Same as S1. No Docker needed for the live test — Kroki is an HTTP dependency.

---

## Automated tests

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

---

## Manual test script

Once pi-fence is installed into pi (or symlinked under `~/.pi/agent/extensions/`):

### 1. graphviz / dot

In pi, ask:

> Draw a graphviz DOT graph showing: user → web, web → api, api → db.

Expect:

- Assistant responds with a fenced block whose tag is `dot` or `graphviz` (modern LLMs tend to write `dot`).
- pi-fence emits a custom message below the assistant's text with a PNG rendered by Kroki's graphviz engine.
- The label reads "Rendered dot via kroki" (or "Rendered graphviz via kroki") — whichever tag the assistant actually wrote.

### 2. plantuml / puml

Ask:

> Make a PlantUML sequence diagram of an OAuth authorization code flow.

Expect:

- Assistant writes a ```` ```plantuml ```` block.
- PNG appears below with actors, arrows, participant boxes.
- Label preserves the tag.

### 3. d2

Ask:

> Sketch a d2 diagram of a microservices architecture — gateway, three services, one database.

Expect:

- Assistant writes a ```` ```d2 ```` block.
- PNG appears below in d2's signature style.

### 4. Broken syntax still surfaces a readable error

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

### 5. Offline behavior unchanged from S1

Disconnect network. Ask for any diagram.

Expect:

- pi-fence emits an error-kind message with a network-related error.
- pi remains responsive.

---

## Rollback

Same as S1 — `pi uninstall pi-fence`, `/reload`.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [S1 test guide](../cv0-e1-s1-mermaid-via-kroki/test-guide.md)
