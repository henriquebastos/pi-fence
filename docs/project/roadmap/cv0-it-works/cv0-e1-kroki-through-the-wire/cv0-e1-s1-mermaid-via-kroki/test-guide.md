[< S1](README.md)

# Test Guide: CV0.E1.S1 — Mermaid via Kroki

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)

---

## Prerequisites

- pi coding agent installed and working.
- Terminal with inline image support. Primary target: **Ghostty**. Also known to work: Kitty, iTerm2, WezTerm.
- Network access to `https://kroki.io`.
- This repo cloned at a known path (referred to as `$REPO` below).

---

## Automated tests

Run from the repo root.

```bash
pnpm install
pnpm run check   # docs link check
pnpm test        # unit tests
```

Expect: parser tests pass. No smoke test in this Story.

---

## Manual test script

### 1. Install the extension locally

Option A — pi install from a local path:

```bash
pi install "$REPO"
```

Option B — symlink into the global extensions directory:

```bash
ln -s "$REPO/extensions/pi-fence" ~/.pi/agent/extensions/pi-fence
```

### 2. Reload pi

Inside a pi session: `/reload`. Or restart pi.

### 3. Happy path

Start pi in any directory. Ask:

> Draw me a simple mermaid flowchart of A going to B going to C.

Expect:

- The assistant answers with a ```` ```mermaid ```` fenced block (natural LLM behavior).
- Immediately below the assistant's text, a PNG appears showing three nodes and arrows.
- A small label near the image indicates `Rendered mermaid via kroki`.

### 4. Expand to see the source

Press `ctrl+o` on the pi-fence output message.

Expect: the original mermaid source is shown below the image, syntax-highlighted.

### 5. Broken mermaid

Ask:

> Show me this exact mermaid block, verbatim:
>
> ```mermaid
> flowchart
>   A -->>> B
> ```

Expect:

- A pi-fence output message appears with an error from Kroki.
- The error text is readable (not a raw stack trace).
- The source is still visible when expanded.

### 6. Offline

Disconnect network. Ask for any mermaid diagram.

Expect:

- A pi-fence output message with a network-related error.
- pi remains responsive. The error doesn't crash the session.

### 7. Multiple blocks

Ask:

> Show me two mermaid diagrams — one for login flow and one for logout flow.

Expect: two separate pi-fence output messages, each with its own PNG, in order.

### 8. Block limit

Ask for six diagrams in one answer (contrived, but forces the limit):

> Give me six tiny mermaid flowcharts, each with two nodes.

Expect:

- Five rendered PNGs.
- A single notify-level warning indicating additional blocks were skipped.

### 9. Non-mermaid tag is ignored

Ask:

> Show me a `dot` graph of A → B.

Expect:

- Assistant produces a ```` ```dot ```` block.
- **No** pi-fence output message. The block is still visible as raw source (S2 adds support).

---

## Rollback

If pi-fence causes problems, disable it:

```bash
pi uninstall pi-fence
# or if symlinked:
rm ~/.pi/agent/extensions/pi-fence
```

Then `/reload` inside pi.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [Epic](../README.md)
