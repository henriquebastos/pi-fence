[< CV0.E2 — Graphviz Local](../README.md)

# S1 — I use local graphviz when I want privacy and offline

CV0.E1 shipped with every `dot` block leaving the machine on the way to `kroki.io`. S1 adds a second processor — a graphviz-local renderer that shells out to the local `dot` binary — and lets it take over the `graphviz`/`dot` tag when the binary is installed. Nothing else changes: Kroki still handles every other tag, and a machine without `dot` sees exactly the CV0.E1 behaviour.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

On a machine with `graphviz` installed:

1. The assistant writes a ```` ```dot ```` or ```` ```graphviz ```` fenced block.
2. pi-fence parses it, `resolve(tag)` returns the graphviz-local processor, and `dot -Tpng` runs locally with the block's source on stdin.
3. No HTTP request to `kroki.io` leaves the host during that turn for that tag. Asserted in the extension test by confirming the `FakeHttpClient` captures zero calls on the local-available branch.
4. A PNG appears inline, same shape as any other rendered block.
5. `/fence list` shows `graphviz-local [registered] — graphviz (dot)` alongside the unchanged Kroki row.

On a machine without `graphviz`:

1. `graphviz-local.available()` returns `{ ok: false, reason, installHint }`.
2. `resolve("graphviz")` falls through to Kroki. The block renders exactly as it did in CV0.E1.
3. `/fence list` shows `graphviz-local [unavailable]` with the reason + install hint on a second indented line, and `kroki [registered]` underneath.

A ```` ```mermaid ```` block — or any tag Kroki handles that graphviz-local does not claim — is untouched by S1: Kroki renders it both before and after the story lands.

## Scope

**In scope:**

- `FenceProcessor.available()` as a required method on the interface. Kroki gains a trivial `{ ok: true }` implementation. The contract helper asserts every processor implements it with the right shape.
- `extensions/pi-fence/graphviz-local.ts` — new module. Depends on `ShellRunner` (already lives in `tests/utilities/` per S0's layout; the seam does not move for S1). Factory signature mirrors `createKrokiRenderer(http, …)`: `createGraphvizLocalRenderer(shell, logger)`.
- Resolution logic in `index.ts`: probe each processor's availability once at wire time, memoise; `resolve(tag)` iterates processors in registration order and returns the first available match. No resolution-level mutation of processor state.
- Registration order: `graphviz-local` first, `kroki` second.
- `/fence list` status widening from `"registered"` to `"registered" | "unavailable"`; the line formatter gains a second indented line carrying the reason + install hint when status is `"unavailable"`.
- One live integration test exercising `DockerExecShellRunner` against the `pi-fence-live-deps` container (which already ships `graphviz`).

**Out of scope:**

- User-facing per-tag processor binding — that's `CV0.E2.S2` (folder lands when S2 is specced).
- Theme tracking for graphviz-local. Kroki's `?theme=dark` path stays Kroki-only; graphviz-local renders DOT's default colour scheme regardless of pi's theme.
- SVG output from `dot`. PNG-only, same constraint as Kroki's PNG-only surface today.
- `/fence doctor` and real endpoint-health probing.
- Mid-session re-probe of `available()`. One-shot at wire time is enough for CV0.
- Cache of rendered PNGs.
- Moving `ShellRunner` out of `tests/utilities/` into `extensions/pi-fence/io/`. Planned in the S0 plan as "a later story"; S1 does not claim that story.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CV0.E1.S3 — `/fence list`](../../cv0-e1-kroki-through-the-wire/cv0-e1-s3-fence-list/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
