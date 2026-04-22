# CVx.E1.S1 — VirtualTerminal-backed renderer and extension tests

**Status:** Done

**Epic:** [CVx.E1 — pi-tui Testing Idiom](cvx-e1--pi-tui-idiom.md)
**Depends on:** [CV0.E1.S0 — Testing foundation](../cv0--it-works/cv0-e1-s0--testing-foundation.md)
**Date:** 2026-04-19

## Summary

The hand-rolled pi-tui fakes in `tests/unit/renderer.test.ts` (~60 lines of `Box` / `Text` / `Spacer` / `Image` shims) gave S1–S3 quick unit coverage but duplicate pi-tui's own `VirtualTerminal` — imperfectly. S1 replaces those fakes with real pi-tui primitives painting into a `VirtualTerminal`, closes a class of "our fake differs from reality" bugs the eight post-S3 render-polish commits walked into, and establishes the **render layer** of the test pyramid as a first-class rung.

## Done criterion

`tests/unit/renderer.test.ts` imports real pi-tui components; no custom `Box` / `Text` / `Spacer` / `Image` classes remain in the test file. Each test case constructs the renderer's tree, paints it via `TUI` into a `VirtualTerminal`, and asserts on the resulting viewport (`getViewport()`) plus at least one write-log invariant (`getWrites()` includes the expected escape sequence family).

`tests/extension/pi-fence.test.ts` gains a viewport assertion for the mermaid happy-path case: after the canned assistant turn, the viewport contains the rendered `"Rendered mermaid via kroki"` label line, and the write log contains a Kitty graphics protocol sequence (`\x1b_G...\x1b\\`) whose base64 payload decodes to our fixture PNG bytes.

`tests/utilities/` gains `virtual-terminal.ts` (or equivalent) and a `LoggingVirtualTerminal` helper. The fast suite (`pnpm test`) stays green. One new dev dependency: `@xterm/headless` (pi-tui lists it under its own `devDependencies`, so published consumers do not receive it transitively — see the worklog close for CVx.E1.S1 for the full deviation note against the plan's original "already transitive" claim).

## Scope

**In scope:**

- Vendor `VirtualTerminal` from pi-tui's `packages/tui/test/virtual-terminal.ts` (`upstream/main`) into `tests/utilities/virtual-terminal.ts`, with a header comment noting the upstream version SHA and the policy for re-syncing.
- Extend it to `LoggingVirtualTerminal` (subclass mirroring pi-tui's own pattern in `tui-render.test.ts`) that records every `write(data)` for byte-stream assertions.
- Rewrite the four cases in `tests/unit/renderer.test.ts` against real pi-tui imports.
- Add a viewport + write-log assertion to the mermaid happy-path case in `tests/extension/pi-fence.test.ts`.
- A new helper `tests/utilities/force-capabilities.ts` wrapping `setCapabilities({images: "kitty", trueColor: true, hyperlinks: true})` for render-layer tests.
- Delete the hand-rolled pi-tui fake classes from the test files once the rewritten tests are green.
- Test-guide entries for how to read a `VirtualTerminal` viewport and how to assert on Kitty graphics sequences.

**Out of scope:**

- Screenshot capture or real-terminal rendering (`CVx.E2`).
- Extraction of shared matchers into `tests/utilities/` beyond the three files named above. Further consolidation can happen once S1's patterns stabilize; that's a possible `CVx.E1.S2`.
- Changes to the renderer's public API (`createPiFenceMessageRenderer`). S1 is test-only.
- Live-suite changes. Live suite stays at its current 4 Kroki + 6 shell-runner cases.
- `FakeExtensionAPI` audit against pi-coding-agent's shipped utilities. Separate, future story.
- Theme-tracking tests at the viewport level. Dark vs light affects the emitted *PNG* from Kroki, not pi-tui's emission shape; a dedicated `/theme` test matrix would go under `CVx.E2` where the rendered image matters more than the bytes.

## Approach

Raise `tests/unit/renderer.test.ts` and the mermaid path in `tests/extension/pi-fence.test.ts` from "asserts on our fake pi-tui" to "asserts on what pi-tui would actually paint." Deliver the reusable machinery (`VirtualTerminal`, `LoggingVirtualTerminal`, `forceCapabilities`) that future render-layer tests will also use. Leave the test pyramid with a named **render layer** between extension and live.

## Plan

### Deliverables

#### 1. `tests/utilities/virtual-terminal.ts` — vendored from pi-tui

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

#### 2. `tests/utilities/virtual-terminal.ts` — `LoggingVirtualTerminal` subclass

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

#### 3. `tests/utilities/force-capabilities.ts`

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

#### 4. Rewrite `tests/unit/renderer.test.ts`

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

#### 5. Extend `tests/extension/pi-fence.test.ts` mermaid happy-path case

The test already runs an `AgentSession` with a canned assistant stream and asserts on `pi.sendMessage`. Add:

1. A `LoggingVirtualTerminal` injected wherever `AgentSession` accepts a `Terminal` (requires reading `~/me/oss/pi-mono/packages/coding-agent/src/` — likely via the `TUI` instance or the `runtime` object; the plan treats "find the seam" as a research sub-step).
2. After the turn resolves, `await terminal.flush()`.
3. Two new assertions: viewport contains the expected label, write log contains `\x1b_G`.

Research sub-step if the seam is not obvious: read `packages/coding-agent/test/` on `upstream/main` for the pattern the coding agent's own tests use.

#### 6. Delete the hand-rolled fakes

Once the rewritten tests are green, delete the `Box` / `Text` / `Spacer` / `Image` classes from `tests/unit/renderer.test.ts`. Grep for references under `tests/` to confirm no other file depended on them.

#### 7. Documentation

- `README.md` (pi-fence root): no user-facing change — S1 is test infrastructure.
- `CHANGELOG.md`: entry under `[Unreleased]` in a new `Refined (test layer)` block describing what changed and why.
- `docs/product/principles.md` → Testing: add a row for the **Render** layer to the table.
- `docs/process/worklog.md`: close entry after the final commit per the docs-follows-feature rule.
- `docs/project/roadmap/cvx--verifiability/README.md`: flip `CVx.E1.S1` to ✅.

### Implementation order

One commit per step. Each green on `pnpm test` before proceeding.

1. Vendor `VirtualTerminal` from upstream into `tests/utilities/virtual-terminal.ts`, including `LoggingVirtualTerminal`. Add a self-test in `tests/unit/virtual-terminal.test.ts` covering `getViewport`, `getWrites`, and `clearWrites`. Two or three cases.
2. Add `tests/utilities/force-capabilities.ts` with its self-test.
3. Rewrite `tests/unit/renderer.test.ts` against real pi-tui primitives. Delete the hand-rolled fakes in the same commit.
4. Research seam for `AgentSession` terminal injection (`git show upstream/main:packages/coding-agent/...`). Land the viewport + write-log assertions in `tests/extension/pi-fence.test.ts`. If the seam turns out to require a small upstream change, carry-forward and land what's achievable with today's API.
5. `principles.md` Testing-table update + `CHANGELOG.md` entry + roadmap flips + worklog entry. Docs-only commit, per the docs-follows-feature rule, split across feature + catch-up commits as needed.

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

## Verification

### Gate

- `pnpm test` green; the rewritten `renderer.test.ts` cases number at least what exists today (four) and assert against both viewport and write log.
- `grep -R "class Box\|class Text\|class Spacer\|class Image" tests/` returns no hits in `tests/unit/renderer.test.ts`.
- `pnpm run check` green.
- Manual: the `Test Guide`'s scripted steps pass.

### Prerequisites

No Docker, no network. `@xterm/headless` ships as a direct `devDependency` of pi-fence (installed in CVx.E1.S1 step 1); `pnpm install` pulls it in. Confirm with:

```bash
pnpm list @xterm/headless
```

> **Correction (2026-04-20, post-implementation):** the original draft of this guide claimed `@xterm/headless` was "already transitive via `@mariozechner/pi-tui`." That was wrong — pi-tui lists it under its own `devDependencies`, not `dependencies`, so a published consumer does not receive it. The story's step 1 added it as a direct `devDependency` of pi-fence. See the worklog close entry for CVx.E1.S1 for the full deviation note.

### Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Specifically:

- `tests/unit/virtual-terminal.test.ts` — vendored `VirtualTerminal` self-test. `getViewport()` reflects `write()` output, `LoggingVirtualTerminal.getWrites()` captures every write, `clearWrites()` resets. Two or three cases.
- `tests/unit/force-capabilities.test.ts` — `forceCapabilities()` sets the expected capability shape; the returned disposer resets the cache. Two cases.
- `tests/unit/renderer.test.ts` — rewritten cases assert on both viewport (`getViewport()` contains the rendered label) and write log (`getWrites()` contains the Kitty graphics protocol prefix `\x1b_G`). At least four cases, matching today's coverage.
- `tests/extension/pi-fence.test.ts` — the mermaid happy-path case additionally asserts the viewport contains the label and the write log contains a Kitty graphics sequence whose base64 payload decodes to the fixture PNG.

For the live suite:

```bash
pnpm test:live
```

Unchanged from CV0.E1.S3 (no new live cases).

### Manual test script

S1 is test-infrastructure work. The "manual" verification is reading assertion output, not installing pi-fence.

#### 1. Fast suite reports the new test files

Run `pnpm test` and confirm the reporter lists:

- `tests/unit/virtual-terminal.test.ts`
- `tests/unit/force-capabilities.test.ts`

…alongside the rewritten `renderer.test.ts` and the extended `pi-fence.test.ts`.

Total test count should increase compared to the pre-S1 baseline (at S3 close: 135; post–render-polish: 154). Record the new total in the closing worklog entry.

#### 2. No hand-rolled pi-tui fakes remain

```bash
grep -RnE "^class (Box|Text|Spacer|Image) " tests/
```

Expect no matches. The only `Box` / `Text` / `Spacer` / `Image` references under `tests/` should be imports from `@mariozechner/pi-tui`.

#### 3. `VirtualTerminal` re-sync header is present

```bash
head -12 tests/utilities/virtual-terminal.ts
```

Expect a comment block naming the upstream path, the SHA of `upstream/main` at the moment of vendoring, and the re-sync policy.

#### 4. Capability leakage is controlled

In `tests/unit/renderer.test.ts`, each `it(...)` that calls `forceCapabilities()` also runs the returned disposer — either in a `try/finally`, an `afterEach` hook, or explicitly at the end. Visually scan the file once during review; the rule is "no orphaned `setCapabilities` left set between tests."

#### 5. Byte-stream assertion catches a regression the old fakes missed

Locally, temporarily break the renderer's image handling (e.g. stop passing `base64` to `new Image(...)`). Run the unit suite. Expect the rewritten `renderer.test.ts` case asserting on the Kitty graphics prefix to *fail* with a clear message (prefix not found in write log). Restore the renderer, confirm green. Remove the local edit.

This sub-step is optional but recommended — it proves the new assertions have teeth, not just that they pass against the current state.

#### 6. The Epic's Render layer is documented

Read `docs/product/principles.md` → Testing. Confirm the table now lists **Render** between Extension and Integration (live), with the correct runner (`pnpm test`) and dependencies (none).

### Rollback

If S1 causes any unforeseen breakage on `main`:

```bash
git revert <sha-of-step-N> <sha-of-step-N+1> ...
```

S1 is test-only; no runtime rollback is needed. If the research sub-step in step 4 of the implementation order exposes an `AgentSession` terminal-injection seam that requires upstream changes, defer that assertion to a carry-forward and rollback affects only that specific commit.

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
- `docs/project/roadmap/cvx--verifiability/README.md` and epic file (flip status)

## Out of scope — explicitly

- Any change to `extensions/pi-fence/**`. S1 is test-only.
- `CVx.E2` (screenshot harness). Separate Epic.
- `FakeExtensionAPI` audit against pi-coding-agent upstream. Future story.
- Test-runner swap (vitest → node:test). Not worth the churn.
- A broader "render layer" doc page in `docs/`. If the `principles.md` table row needs expansion, that's a `CVx.E1.S2` scope, not S1's.
