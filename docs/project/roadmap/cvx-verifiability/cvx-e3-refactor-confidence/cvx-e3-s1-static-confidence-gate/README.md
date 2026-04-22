[< CVx.E3 — Refactor Confidence](../README.md)

# S1 — Static confidence gate for refactoring ✅ Done

pi-fence's fast gate currently proves a lot: runtime tests pass, docs links resolve, markdown structure stays sane. But it does **not** yet prove that the repository is statically type-safe at the moment a contributor starts a cleanup pass. That is exactly the kind of blind spot that turns a "safe refactor" into a confidence game.

S1 closes that gap first. Before we move seams, split modules, or do naming/API polish, the repo gets an explicit static gate and the current type drift goes to zero.

This story is the foundation for the composability work that follows in CVx.E3. It does **not** introduce the boundary-injected architecture yet; it earns the right to do that safely in S2–S4.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

A contributor preparing a cleanup pass can run one fast confidence command and trust the result.

1. `package.json` exposes `pnpm run typecheck`, implemented as `tsc --noEmit`.
2. `package.json` exposes `pnpm run verify:fast`, running the documented fast gate in one command: `pnpm test`, `pnpm run check`, and `pnpm run typecheck`.
3. `pnpm run typecheck` is green on the repository as it exists at the end of the story.
4. The repo's verification docs name static type checking as part of the normal fast gate.
5. CI runs the same static check so type drift cannot re-enter through a green test-only path.
6. No user-visible behavior changes. This is confidence work, not feature work.

## Scope

**In scope:**

- `package.json` scripts for `typecheck` and `verify:fast`.
- Whatever TypeScript fixes are required to make `tsc --noEmit` green across production code, tests, and verifier scripts.
- Small type-shape cleanups that make later runtime-seam injection easier to reason about, **provided they stop at typing/verification and do not move architectural boundaries yet**.
- Verification docs updates (`AGENTS.md`, `docs/getting-started.md`, and any nearby repo docs that define the fast gate).
- CI workflow update so the same static check runs on push/PR.
- Small, behavior-preserving tests only when a compile fix changes code shape enough to deserve a runtime assertion.

**Out of scope:**

- Moving runtime seams out of `tests/utilities/` — that is `CVx.E3.S3`.
- Splitting `extensions/pi-fence/index.ts` into the composition root plus focused modules — that is `CVx.E3.S4`.
- Introducing new runtime seams or adapter layers just because the compiler complained. S1 fixes the gate; S2–S4 decide the architecture.
- Whole-repo coverage ratcheted to 100%.
- New user-facing commands, processors, or rendering changes.
- Generic code-style lint adoption. If linting is added later in `CVx.E3`, it should enforce architectural boundaries and DI/composability rules rather than cosmetic preferences.
- Evaluating or adopting the later code-quality analyzer candidates named in `CVx.E3` (`typescript-eslint`, `dependency-cruiser`, `knip`, `semgrep` / `ast-grep`). Those belong after the architecture is explicit enough to encode with signal rather than noise.
- Opportunistic refactors unrelated to making the static gate trustworthy.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [CVx.E3](../README.md) · [CVx](../../README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
