[< CVx.E1 — pi-tui Testing Idiom](../README.md)

# S1 — Extension and renderer tests assert on real pi-tui output via `VirtualTerminal` ✅ Done

The hand-rolled pi-tui fakes in `tests/unit/renderer.test.ts` (~60 lines of `Box` / `Text` / `Spacer` / `Image` shims) gave S1–S3 quick unit coverage but duplicate pi-tui's own `VirtualTerminal` — imperfectly. S1 replaces those fakes with real pi-tui primitives painting into a `VirtualTerminal`, closes a class of "our fake differs from reality" bugs the eight post-S3 render-polish commits walked into, and establishes the **render layer** of the test pyramid as a first-class rung.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

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

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CVx.E1](../README.md) · [CV0.E1.S0 — Testing foundation](../../../cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s0-testing-foundation/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
