[< CVx — Verifiability](../README.md)

# CVx.E1 — pi-tui Testing Idiom

**Roadmap:** [CVx](../../README.md)
**Last updated:** 2026-04-19

Realign pi-fence's existing tests with pi-tui's testing idiom: real pi-tui components painting into `VirtualTerminal`, byte-stream assertions on what pi-tui emits, viewport assertions on what a terminal would show. Remove the hand-rolled pi-tui fakes under `tests/unit/renderer.test.ts` that duplicate — imperfectly — what pi-tui's own `VirtualTerminal` does faithfully.

pi-fence already depends on pi; depending on pi-tui's testing utilities is in-idiom, not a boundary crossing.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cvx-e1-s1-virtual-terminal-tests/README.md) | **Extension and renderer tests assert on real pi-tui output via `VirtualTerminal`** | 🛠️ Planned |

Possible future stories (not yet specced, add when pressure appears):

- `S2` — shared test kit (`withEnv`, `forceCapabilities`, byte-stream matchers) extracted into `tests/utilities/` once S1's patterns stabilize.
- `S3` — pi-coding-agent test utilities audit: replace any of `tests/utilities/fake-extension-api.ts` that duplicates upstream-shipped utilities.

---

## Deliverable vision

`tests/unit/renderer.test.ts` imports `Box`, `Text`, `Spacer`, `Image` from `@mariozechner/pi-tui` and `VirtualTerminal` from pi-tui's test surface (see plan for the exact import path). A test case constructs the same tree `createPiFenceMessageRenderer` produces, paints it via `TUI` into a `VirtualTerminal`, and asserts on both the logged byte stream and the resulting viewport grid. No hand-rolled `Box` / `Text` / `Spacer` / `Image` classes in the test file.

`tests/extension/pi-fence.test.ts` — the `agent_end` path test — gains a `VirtualTerminal` wired into the `AgentSession`'s TUI seam (or whatever pi-coding-agent exposes for this). After the canned assistant turn finishes, the test asserts the viewport contains the rendered label, the Kitty graphics protocol sequence is present in the write log, and the PNG base64 payload in that sequence decodes to our fixture bytes.

**Done criterion (Epic-level):** see [CVx.E1 done criterion in the CV README](../README.md#done-criterion-lane-level).

## Architecture

One new test-layer conceptually; one updated test file practically.

```text
tests/unit/renderer.test.ts
  before:  fake Box / Text / Spacer / Image classes
           assertions against captured child arrays
  after:   real pi-tui primitives
           TUI.requestRender into VirtualTerminal
           assertions against VirtualTerminal.getViewport()
                           and LoggingVirtualTerminal.getWrites()

tests/extension/pi-fence.test.ts
  before:  asserts pi.sendMessage was called with a pi-fence:output message
  after:   same assertion PLUS viewport assertion (rendered label visible)
                           PLUS byte-stream assertion (Kitty graphics present)
```

### Where `VirtualTerminal` comes from

pi-tui ships `VirtualTerminal` under `packages/tui/test/virtual-terminal.ts` on `upstream/main`. It is not in pi-tui's published entry point (`dist/index.d.ts`). S1's plan picks *one* of three paths:

1. Ask upstream to export `VirtualTerminal` from pi-tui's public API.
2. Copy `virtual-terminal.ts` into `tests/utilities/` and track upstream.
3. Reimplement the minimal `Terminal` subset we need as a `CapturingTerminal` against `@xterm/headless` directly (already a transitive dep via pi-tui).

Default in the plan: option 2 — copy, note upstream version at the top of the file, revisit if upstream exports.

## Out of scope — explicitly

- Dev-time screenshot harness (`CVx.E2`). Separate Epic. S1 produces no PNGs.
- `pi-coding-agent` test-utilities audit (future story). S1 keeps `FakeExtensionAPI` as-is.
- Test runner change (`vitest` → `node:test`). Not worth the churn; vitest can assert in the same flat, descriptive style pi-tui uses.
- Golden-image / screenshot-diff regression. That's `CVx.E2` territory and beyond.

---

**See also:** [Plan (via S1)](cvx-e1-s1-virtual-terminal-tests/plan.md) · [pi-tui test/ on upstream/main](https://github.com/badlogic/pi-mono/tree/main/packages/tui/test) · [Principles — Testing](../../../../product/principles.md#testing)
