[< S1](README.md)

# Test Guide: CVx.E1.S1 — VirtualTerminal-backed renderer and extension tests

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CVx.E1 — pi-tui Testing Idiom](../README.md)

---

## Prerequisites

No Docker, no network. `@xterm/headless` ships as a direct `devDependency` of pi-fence (installed in CVx.E1.S1 step 1); `pnpm install` pulls it in. Confirm with:

```bash
pnpm list @xterm/headless
```

> **Correction (2026-04-20, post-implementation):** the original draft of this guide claimed `@xterm/headless` was "already transitive via `@mariozechner/pi-tui`." That was wrong — pi-tui lists it under its own `devDependencies`, not `dependencies`, so a published consumer does not receive it. The story's step 1 added it as a direct `devDependency` of pi-fence. See the worklog close entry for CVx.E1.S1 for the full deviation note.

---

## Automated tests

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

---

## Manual test script

S1 is test-infrastructure work. The "manual" verification is reading assertion output, not installing pi-fence.

### 1. Fast suite reports the new test files

Run `pnpm test` and confirm the reporter lists:

- `tests/unit/virtual-terminal.test.ts`
- `tests/unit/force-capabilities.test.ts`

…alongside the rewritten `renderer.test.ts` and the extended `pi-fence.test.ts`.

Total test count should increase compared to the pre-S1 baseline (at S3 close: 135; post–render-polish: 154). Record the new total in the closing worklog entry.

### 2. No hand-rolled pi-tui fakes remain

```bash
grep -RnE "^class (Box|Text|Spacer|Image) " tests/
```

Expect no matches. The only `Box` / `Text` / `Spacer` / `Image` references under `tests/` should be imports from `@mariozechner/pi-tui`.

### 3. `VirtualTerminal` re-sync header is present

```bash
head -12 tests/utilities/virtual-terminal.ts
```

Expect a comment block naming the upstream path, the SHA of `upstream/main` at the moment of vendoring, and the re-sync policy.

### 4. Capability leakage is controlled

In `tests/unit/renderer.test.ts`, each `it(...)` that calls `forceCapabilities()` also runs the returned disposer — either in a `try/finally`, an `afterEach` hook, or explicitly at the end. Visually scan the file once during review; the rule is "no orphaned `setCapabilities` left set between tests."

### 5. Byte-stream assertion catches a regression the old fakes missed

Locally, temporarily break the renderer's image handling (e.g. stop passing `base64` to `new Image(...)`). Run the unit suite. Expect the rewritten `renderer.test.ts` case asserting on the Kitty graphics prefix to *fail* with a clear message (prefix not found in write log). Restore the renderer, confirm green. Remove the local edit.

This sub-step is optional but recommended — it proves the new assertions have teeth, not just that they pass against the current state.

### 6. The Epic's Render layer is documented

Read `docs/product/principles.md` → Testing. Confirm the table now lists **Render** between Extension and Integration (live), with the correct runner (`pnpm test`) and dependencies (none).

---

## Rollback

If S1 causes any unforeseen breakage on `main`:

```bash
git revert <sha-of-step-N> <sha-of-step-N+1> ...
```

S1 is test-only; no runtime rollback is needed. If the research sub-step in step 4 of the implementation order exposes an `AgentSession` terminal-injection seam that requires upstream changes, defer that assertion to a carry-forward and rollback affects only that specific commit.

---

**See also:** [README](README.md) · [Plan](plan.md) · [CVx.E1](../README.md)
