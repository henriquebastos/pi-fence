[< CVx.E2 — Dev-time Render Screenshots](../README.md)

# S4 — `mermaid-user-agent-trail`: the full user→agent→fence visual ✅ Done

S1–S3 verified pi-fence's renderer **in isolation** — the `pi-fence:output` panel painted standalone, no surrounding chat context. That's the right unit for "does our renderer emit the right bytes?" but not "does what a user sees in pi actually look right?" S4 closes that gap: a scenario that paints the full three-part visual a pi user experiences when they ask for a diagram — their prompt bubble, the assistant's fenced reply, and the pi-fence:output panel below — composed through **pi-coding-agent's own `UserMessageComponent` / `AssistantMessageComponent` / `CustomMessageComponent`**, not a mimic.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

A new scenario `mermaid-user-agent-trail` is registered. `pnpm render:verify --scenario mermaid-user-agent-trail` produces `scripts/out/render-verify/mermaid-user-agent-trail/default/render.png` — a single PNG showing, top to bottom:

1. The **user's prompt bubble** rendered by `UserMessageComponent` ("Show me a mermaid flowchart of A → B → C.").
2. Vertical spacing.
3. The **assistant's reply bubble** rendered by `AssistantMessageComponent`, containing plain text around a fenced `` ```mermaid `` block with the three-node flowchart source.
4. Vertical spacing.
5. The **pi-fence:output custom message** rendered by `CustomMessageComponent` wrapping `createPiFenceMessageRenderer` with the same Kroki-rendered mermaid PNG S1–S3 already use.

All three sections are painted by pi-coding-agent's real components — the ones that ship to every pi user — not by a bespoke mimic. The scenario therefore tests the *composed* render across user / assistant / custom boundaries, catching regressions in how pi stacks bubbles, chooses padding, applies themes, and leaves room for the custom-message child.

The render-image live test iterates the new scenario alongside S1–S3's combos. A golden PNG lives at `tests/fixtures/golden/mermaid-user-agent-trail/default.png`. Pixel-diff budget stays at the S3-calibrated `DIFF_BUDGET = 100`; timing budget remains `RENDER_BUDGET_MS = 5000`.

## Scope

**In scope:**

- New scenario `mermaid-user-agent-trail` in `scripts/verify/scenarios.ts`.
- **Single `default` variant** (120×60). Narrow is deliberately deferred — S4's purpose is to prove the composition-level shape first; width variants on this scenario can follow once the default baseline is stable.
- Composition via pi-coding-agent's public exports (`UserMessageComponent`, `AssistantMessageComponent`, `CustomMessageComponent`) into a pi-tui `Container` root, painted through the existing `paintComponent` harness.
- Theme bootstrap: the pi-coding-agent components default-param to `getMarkdownTheme()` which reads pi's theme singleton. The scenario's `build()` initializes the theme singleton deterministically (or passes an explicit `markdownTheme`), so the same bytes emit across runs. Research sub-step in the plan; one of two concrete paths gets picked during implementation.
- Reuse the existing `tests/fixtures/mermaid-flowchart.png` Kroki fixture for the custom-message image content.
- One new committed golden PNG at `tests/fixtures/golden/mermaid-user-agent-trail/default.png`.
- One new live-suite case. The existing test loop (`expandCombos(listScenarios())`) picks it up without changes.
- Documentation updates: CHANGELOG, the CVx.E2 epic README S-table, the roadmap top-level table, this story README's status flip, a worklog close entry.

**Out of scope:**

- Narrow / wide variants on `mermaid-user-agent-trail`. Future story if one width proves particularly bug-prone.
- Theme variants (dark vs light pi theme flowing through user/assistant bubbles). The plumbing is ready; population is future work.
- A *second* trail scenario exercising a different tag family (e.g. `graphviz-user-agent-trail`). One trail is enough to validate the composition; more land when a concrete regression asks for them.
- Multi-turn transcripts (user → assistant → user → assistant → fence). S4 paints ONE turn. Multi-turn is a bigger shape worth its own story.
- Streaming / partial-render verification. The scenario captures the *final* rendered state only.
- `AgentSession` integration. We static-compose a transcript — we do not spin up a real session, which would be slower and less deterministic.
- Changing how pi-fence composes its own `pi-fence:output` render. S4 observes, it does not modify.
- Visual diffing between this trail and the isolated `mermaid-happy-path` scenario to confirm the pi-fence:output portion matches. Interesting but out of scope; each scenario pixel-diffs against its own golden.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CVx.E2](../README.md) · [CVx.E2.S1](../cvx-e2-s1-headless-image-verifier/README.md) · [CVx.E2.S2](../cvx-e2-s2-multi-scenario-gallery/README.md) · [CVx.E2.S3](../cvx-e2-s3-sentinel-readiness/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
