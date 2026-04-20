[< S1](README.md)

# Plan: CVx.E1.S1 — VirtualTerminal-backed renderer and extension tests

**Story:** [README.md](README.md)
**Epic:** [CVx.E1 — pi-tui Testing Idiom](../README.md)
**Depends on:** [CV0.E1.S0 — Testing foundation](../../../cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s0-testing-foundation/README.md)
**Date:** 2026-04-19

## Goal

Raise `tests/unit/renderer.test.ts` and the mermaid path in `tests/extension/pi-fence.test.ts` from "asserts on our fake pi-tui" to "asserts on what pi-tui would actually paint." Deliver the reusable machinery (`VirtualTerminal`, `LoggingVirtualTerminal`, `forceCapabilities`) that future render-layer tests will also use. Leave the test pyramid with a named **render layer** between extension and live.

---

## Deliverables

### 1. `tests/utilities/virtual-terminal.ts` — vendored from pi-tui

Copy `packages/tui/test/virtual-terminal.ts` from `~/me/oss/pi-mono` at `upstream/main` verbatim into `tests/utilities/virtual-terminal.ts`. Top of the file gets a comment block:

```ts
// Vendored from pi-mono @ <upstream/main SHA at the time of the copy>.
// Upstream path: packages/tui/test/virtual-terminal.ts.
//
// Re-sync policy: check once per CV. If upstream has changed, diff and
// re-vendor; document any divergence here with a reason.
//
// Why vendored and not imported: pi-tui does not export VirtualTerminal from
// its published entry point (dist/index.d.ts). When it does, switch to an
// import and delete this file.
```

The file keeps its original `implements Terminal` against `@mariozechner/pi-tui`'s published `Terminal` type (already importable from `@mariozechner/pi-tui`). `@xterm/headless` needs to be added as a pi-fence `devDependency`; pi-tui lists it under its own `devDependencies`, not `dependencies`, so a published consumer does *not* receive it transitively. Install with `pnpm add -D @xterm/headless`.

> **Correction (2026-04-20, post-implementation):** the draft of this plan claimed `@xterm/headless` was "already transitive via pi-tui" and suggested confirming with `pnpm list @xterm/headless`. That was wrong — pi-tui declares it under `devDependencies` in its `package.json`, which npm/pnpm do not propagate to consumers. Step 1 of the implementation added it as a direct `devDependency` of pi-fence; see the worklog close entry for CVx.E1.S1 for the full deviation note.

Exported: the `VirtualTerminal` class plus its test-specific methods (`getViewport`, `getScrollBuffer`, `flush`, `flushAndGetViewport`, `clear`, `reset`, `sendInput`, `resize`).

### 2. `tests/utilities/virtual-terminal.ts` — `LoggingVirtualTerminal` subclass

Append to the same file (or a separate `logging-virtual-terminal.ts` if that feels cleaner; plan favors same file to keep the seam shallow):

```ts
export class LoggingVirtualTerminal extends VirtualTerminal {
  private writes: string[] = [];

  override write(data: string): void {
    this.writes.push(data);
    super.write(data);
  }

  getWrites(): string {
    return this.writes.join("");
  }

  clearWrites(): void {
    this.writes = [];
  }
}
```

Shape lifted verbatim from pi-tui's `tui-render.test.ts` test. Staying in-idiom.

### 3. `tests/utilities/force-capabilities.ts`

A thin wrapper so render-layer tests don't sprinkle `setCapabilities(...)` calls directly:

```ts
import { setCapabilities, resetCapabilitiesCache, type TerminalCapabilities } from "@mariozechner/pi-tui";

export const KITTY_FULL_CAPABILITIES: TerminalCapabilities = {
  images: "kitty",
  trueColor: true,
  hyperlinks: true,
};

export function forceCapabilities(caps: TerminalCapabilities = KITTY_FULL_CAPABILITIES): () => void {
  setCapabilities(caps);
  return () => resetCapabilitiesCache();
}
```

Call in `beforeEach`; the returned disposer runs in `afterEach`. Keeps capability leakage between tests from happening.

Self-test: a unit test in `tests/unit/force-capabilities.test.ts` that asserts `setCapabilities` was received with the expected shape and the reset disposer works. Two cases total.

### 4. Rewrite `tests/unit/renderer.test.ts`

Replace all hand-rolled `Box` / `Text` / `Spacer` / `Image` classes with imports from `@mariozechner/pi-tui`. Each existing test case becomes:

```ts
it("composes label, spacer, and image for a rendered block", async () => {
  const reset = forceCapabilities();
  try {
    const terminal = new LoggingVirtualTerminal(120, 40);
    const tui = new TUI(terminal);
    // ... build the tree via createPiFenceMessageRenderer against real pi-tui
    tui.requestRender(true);
    await terminal.flush();

    const viewport = terminal.getViewport();
    assert.ok(viewport.some(line => line.includes("Rendered mermaid via kroki")));

    const writes = terminal.getWrites();
    assert.ok(writes.includes("\x1b_G"),
              "Kitty graphics prefix expected in write stream");
  } finally {
    reset();
  }
});
```

The four existing cases map 1:1 onto this shape. Deleted hand-rolled classes amount to ~60 LOC.

### 5. Extend `tests/extension/pi-fence.test.ts` mermaid happy-path case

The test already runs an `AgentSession` with a canned assistant stream and asserts on `pi.sendMessage`. Add:

1. A `LoggingVirtualTerminal` injected wherever `AgentSession` accepts a `Terminal` (requires reading `~/me/oss/pi-mono/packages/coding-agent/src/` — likely via the `TUI` instance or the `runtime` object; the plan treats "find the seam" as a research sub-step).
2. After the turn resolves, `await terminal.flush()`.
3. Two new assertions: viewport contains the expected label, write log contains `\x1b_G`.

Research sub-step if the seam is not obvious: read `packages/coding-agent/test/` on `upstream/main` for the pattern the coding agent's own tests use.

### 6. Delete the hand-rolled fakes

Once the rewritten tests are green, delete the `Box` / `Text` / `Spacer` / `Image` classes from `tests/unit/renderer.test.ts`. Grep for references under `tests/` to confirm no other file depended on them.

### 7. Documentation

- `README.md` (pi-fence root): no user-facing change — S1 is test infrastructure.
- `CHANGELOG.md`: entry under `[Unreleased]` in a new `Refined (test layer)` block describing what changed and why.
- `docs/product/principles.md` → Testing: add a row for the **Render** layer to the table.
- `docs/process/worklog.md`: close entry after the final commit per the docs-follows-feature rule.
- `docs/project/roadmap/cvx-verifiability/README.md`: flip `CVx.E1.S1` to ✅.

---

## Implementation order

One commit per step. Each green on `pnpm test` before proceeding.

1. Vendor `VirtualTerminal` from upstream into `tests/utilities/virtual-terminal.ts`, including `LoggingVirtualTerminal`. Add a self-test in `tests/unit/virtual-terminal.test.ts` covering `getViewport`, `getWrites`, and `clearWrites`. Two or three cases.
2. Add `tests/utilities/force-capabilities.ts` with its self-test.
3. Rewrite `tests/unit/renderer.test.ts` against real pi-tui primitives. Delete the hand-rolled fakes in the same commit.
4. Research seam for `AgentSession` terminal injection (`git show upstream/main:packages/coding-agent/...`). Land the viewport + write-log assertions in `tests/extension/pi-fence.test.ts`. If the seam turns out to require a small upstream change, carry-forward and land what's achievable with today's API.
5. `principles.md` Testing-table update + `CHANGELOG.md` entry + roadmap flips + worklog entry. Docs-only commit, per the docs-follows-feature rule, split across feature + catch-up commits as needed.

---

## Tests

1. **Layers touched:**
   - **Unit**: new `virtual-terminal.test.ts` (self-test for the vendored class), new `force-capabilities.test.ts`, rewritten `renderer.test.ts`.
   - **Extension**: extended `pi-fence.test.ts` (viewport + write-log assertions).
   - **Render** (new rung, lives under `tests/unit/` for now since it runs at unit-suite speed): the rewritten `renderer.test.ts` *is* the first render-layer test.
   - **Contract, live**: untouched.

2. **Events / interactions covered:**
   - `TUI.requestRender(true)` into a `VirtualTerminal` produces a viewport grid a test can read.
   - `LoggingVirtualTerminal.write()` captures every byte pi-tui emits.
   - `setCapabilities({images: "kitty", ...})` forces the image-protocol emission path deterministically.
   - pi-fence's renderer composes a tree whose paint contains the expected label and a Kitty graphics sequence.
   - `resetCapabilitiesCache()` prevents capability leakage between tests.

3. **Fakes added to `tests/utilities/`:**
   - `virtual-terminal.ts` — `VirtualTerminal` (vendored) + `LoggingVirtualTerminal` (subclass).
   - `force-capabilities.ts` — capability-setting helper with disposer.

4. **Live tests added / updated:** none. Live suite is unaffected.

5. **Deferred:**
   - A `Render` layer callout in `principles.md`'s four-layer table and `tests/README.md`. Merged into step 5 of the implementation order, but if it needs a broader review it can split into a follow-up `CVx.E1.S2` story without blocking S1.
   - Re-sync check against upstream `virtual-terminal.ts`. First re-sync is "at the next CV boundary"; written into the vendored file's header.
   - `pi-coding-agent` test-utility audit — separate future story, not in S1.

---

## Verification

- `pnpm test` green; the rewritten `renderer.test.ts` cases number at least what exists today (four) and assert against both viewport and write log.
- `grep -R "class Box\|class Text\|class Spacer\|class Image" tests/` returns no hits in `tests/unit/renderer.test.ts`.
- `pnpm run check` green.
- Manual: the `Test Guide`'s scripted steps pass.

---

## Key files

- `tests/utilities/virtual-terminal.ts` (new, vendored + subclass)
- `tests/utilities/force-capabilities.ts` (new)
- `tests/unit/virtual-terminal.test.ts` (new, self-test)
- `tests/unit/force-capabilities.test.ts` (new, self-test)
- `tests/unit/renderer.test.ts` (rewrite)
- `tests/extension/pi-fence.test.ts` (extend happy-path case)
- `docs/product/principles.md` (add Render row to Testing table)
- `CHANGELOG.md` (Unreleased → Refined (test layer))
- `docs/process/worklog.md` (close entry)
- `docs/project/roadmap/cvx-verifiability/README.md` and epic README (flip status)

---

## Out of scope — explicitly

- Any change to `extensions/pi-fence/**`. S1 is test-only.
- `CVx.E2` (screenshot harness). Separate Epic.
- `FakeExtensionAPI` audit against pi-coding-agent upstream. Future story.
- Test-runner swap (vitest → node:test). Not worth the churn.
- A broader "render layer" doc page in `docs/`. If the `principles.md` table row needs expansion, that's a `CVx.E1.S2` scope, not S1's.

---

**See also:** [README](README.md) · [Test Guide](test-guide.md) · [CVx.E1](../README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
