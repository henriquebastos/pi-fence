# CVx.E3.S1 — Static confidence gate for refactoring

**Status:** Done

**Epic:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Depends on:** existing CV0/CVx fast suite and docs checks
**Date:** 2026-04-21 (spec)

## Summary

pi-fence's fast gate currently proves a lot: runtime tests pass, docs links resolve, markdown structure stays sane. But it does **not** yet prove that the repository is statically type-safe at the moment a contributor starts a cleanup pass. That is exactly the kind of blind spot that turns a "safe refactor" into a confidence game.

S1 closes that gap first. Before we move seams, split modules, or do naming/API polish, the repo gets an explicit static gate and the current type drift goes to zero.

This story is the foundation for the composability work that follows in CVx.E3. It does **not** introduce the boundary-injected architecture yet; it earns the right to do that safely in S2–S4.

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

## Approach

Make the repository's fast gate trustworthy for cleanup work.

At the start of this story, a contributor can see `pnpm test` green and still have unresolved static type drift. At the end, the repo has an explicit type-check command, a single fast verification command, green static typing, and docs/CI that treat static typing as part of the normal refactor-safety surface.

This is deliberately the precondition for the DI/composability work in `CVx.E3.S2`–`S4`, not a substitute for it.

## Plan

### Deliverables

#### 1. Explicit fast-gate scripts in `package.json`

Add two scripts:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "verify:fast": "pnpm test && pnpm run check && pnpm run typecheck"
  }
}
```

`verify:fast` does not replace the individual commands; it packages them into the contributor-facing answer to "is the repo safe to refactor right now?"

#### 2. `tsc --noEmit` goes green on the current repository

Fix the current compile drift rather than hiding it.

Known categories already surfaced by an exploratory `tsc --noEmit` pass and therefore expected to be addressed inside this story:

1. **Renderer typing drift** — theme/component signatures around `createPiFenceMessageRenderer` and `createPiFenceListRenderer` are close to upstream pi types, but not exact enough for the compiler.
2. **Extension-test stream typing drift** — the canned `AssistantMessageEventStream` helper in `tests/extension/pi-fence.test.ts` is runtime-correct but typed too narrowly/loosely in a few places.
3. **HTTP body typing drift** — the fetch body passed through `NodeHttpClient` is runtime-valid but not expressed in a way TypeScript accepts cleanly.
4. **Any adjacent compile-only fallout** discovered while fixing the above.

The story is allowed to change code shape where needed, but every such change is expected to be behavior-preserving and backed by the existing runtime suite. If a fix meaningfully restructures a branch, add a targeted test in the nearest existing test file rather than relying on compile success alone.

#### 3. Verification docs updated to name the real fast gate

Update the repository docs that define the verification ritual so they all say the same thing.

Minimum set:

- `AGENTS.md`
- `docs/getting-started.md`
- `docs/product/principles.md` (if the Testing section still enumerates the fast gate without static checking)

Target wording: the normal pre-commit fast gate is the trio `pnpm test`, `pnpm run check`, `pnpm run typecheck`, with `pnpm run verify:fast` as the umbrella convenience command.

#### 4. CI enforces the same check

The fast CI workflow should run the same static gate contributors are expected to trust locally. Exact shape decided on encounter:

1. Either invoke `pnpm run verify:fast` directly.
2. Or keep separate workflow steps while adding `pnpm run typecheck` alongside the existing fast checks.

Preference: separate steps in CI for clearer failure attribution, but the command surface seen by contributors stays `verify:fast`.

#### 5. No opportunistic architecture work

This story intentionally stops at the safety boundary.

It does **not** move `HttpClient` / `ShellRunner` / `Logger`, split `index.ts`, or rename modules for elegance. Those are the next stories, and S1 is more valuable if it lands narrowly and first.

It also does **not** smuggle in new runtime seams or adapter layers merely because a compile fix touched a type. The architectural question for the later stories is not just "can this be injected?" but "should this be a runtime seam at all?" S2 writes that rule down; S3 and S4 apply it.

### Implementation order

Atomic green commits only.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | compiler + scripts | Add `typecheck` / `verify:fast` and fix the current `tsc --noEmit` failures in one green commit. Include any tiny targeted tests required by behavior-preserving code-shape changes. | `step 1: make the fast gate prove static health` |
| 2 | docs + CI | Update the repo's verification docs and fast CI workflow to include static checking. | `step 2: document and enforce the refactor-safe gate` |
| 3 | close | Status flips across roadmap / CVx / CVx.E3 / story file, plus worklog close entry once implementation commits exist. | `close CVx.E3.S1` |

**Why step 1 is one commit, not two.** Adding `typecheck` without fixing the current errors would knowingly land a red gate, which violates the repository rule that every commit leaves tests passing. The script and the fixes belong together.

## Tests

1. **Layers touched:**
   - **Unit / Contract / Extension / Render:** existing fast-suite tests rerun as regression protection when compile fixes touch code shape.
   - **Static typing:** new explicit `pnpm run typecheck` gate.
   - **Integration / Render Image (live):** unchanged unless a compile fix touches live-only harness code, in which case rerun the affected live gate before close.

2. **Events / interactions covered:**
   - Production modules, tests, and verifier scripts all compile under `tsc --noEmit`.
   - Existing runtime behavior stays green under `pnpm test`.
   - Documentation and CI now describe/enforce the same fast gate contributors run locally.

3. **Fakes added:**
   - None expected.

4. **Live tests added / updated:**
   - None expected.

5. **Deferred:**
   - Architecture map + hotspot inventory (`CVx.E3.S2`), including the vocabulary of pure modules, adapters, runtime seams, and composition root.
   - Runtime seams moved under production code and injected at the edge (`CVx.E3.S3`).
   - Whole-repo coverage reporting / thresholds. This Epic's coverage posture remains: touched cleanup code fully covered, hotspot expectations documented explicitly when we reach them.

## Verification

### Gate

Minimum close gate:

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run check
pnpm run verify:fast
```

Expected:

1. `pnpm run typecheck` exits 0.
2. `pnpm run verify:fast` exits 0 and is the shortest reliable answer to "is the repo safe to refactor right now?"
3. CI's fast workflow includes the same static check.

`pnpm test:live` is unchanged by default. Run it only if the type fixes touch live-only code paths or shared harness modules used by live tests.

### Prerequisites

None beyond the normal contributor setup.

```bash
pnpm install
```

No Docker requirement. No network requirement beyond dependency installation.

### Automated tests

```bash
pnpm run typecheck
pnpm test
pnpm run check
pnpm run verify:fast
```

Expect all green.

- `pnpm run typecheck` is the new load-bearing assertion for this story.
- `pnpm run verify:fast` should succeed and should be functionally equivalent to running the other three commands in sequence.

`pnpm test:live` is unchanged and not part of S1's default close gate unless the implementation ends up touching live-only harness code.

### Manual test script

#### 1. `package.json` exposes the new scripts

```bash
node -e 'const p=require("./package.json"); console.log(p.scripts.typecheck); console.log(p.scripts["verify:fast"])'
```

Expect output equivalent to:

```text
tsc --noEmit
pnpm test && pnpm run check && pnpm run typecheck
```

Exact quoting may vary; command intent should not.

#### 2. The standalone static gate is green

```bash
pnpm run typecheck
```

Expect exit 0.

This is the core new guarantee of the story: a contributor can ask "does the repo compile cleanly right now?" and get a direct answer.

#### 3. The umbrella fast gate is green

```bash
pnpm run verify:fast
```

Expect exit 0.

The command should run, in effect:

1. `pnpm test`
2. `pnpm run check`
3. `pnpm run typecheck`

#### 4. Docs say the same thing the scripts do

Open these files and confirm the fast gate wording is aligned:

- `AGENTS.md`
- `docs/getting-started.md`
- `docs/product/principles.md` (if updated by the implementation)

Expect the normal fast gate to include static type checking, with `pnpm run verify:fast` presented as the convenience command rather than a second, contradictory workflow.

#### 5. CI includes the static gate

Open:

- `.github/workflows/ci.yml`

Expect either:

1. a dedicated `pnpm run typecheck` step, or
2. a `pnpm run verify:fast` step that clearly includes type checking.

Preference is separate steps for readability, but either shape is acceptable if the workflow truly enforces the same static gate.

#### 6. Deliberate-break teeth check

Temporarily introduce an obvious type error in a scratch branch, for example:

- assign a number where a string is required in a small test helper, or
- reference a missing property on a typed object.

Then run:

```bash
pnpm run typecheck
```

Expect failure.

Revert the scratch change and confirm `pnpm run typecheck` returns to green.

This proves the new gate has teeth and is not a no-op wrapper.

#### 7. No user-visible behavior moved accidentally

Skim the implementation diff and confirm it stays in the story boundary:

- scripts
- compile fixes
- docs
- CI

It should **not** also move `HttpClient` / `ShellRunner` / `Logger`, split `index.ts`, or rename broad swaths of production code for aesthetics. Those belong to later CVx.E3 stories.

### Rollback

S1 is internal-only. If it regresses unexpectedly, revert the story commits and the previous repo behavior returns immediately.

```bash
git revert <sha>
```

No runtime data migration, fixture refresh, or user-facing rollback steps are required.

## Key files

**Modified:**

- `package.json` — add `typecheck` and `verify:fast`.
- `AGENTS.md` — verification gate updated.
- `docs/getting-started.md` — contributor commands updated.
- `docs/product/principles.md` — Testing section updated if needed.
- `.github/workflows/ci.yml` — static type check added to the fast workflow.
- Whatever production/test/script files require compile fixes.
- Roadmap / CVx / CVx.E3 / story files at close.
- `docs/process/worklog.md` at close.

**New:**

- None required.

## Out of scope — explicitly

- Promoting `HttpClient`, `ShellRunner`, or `Logger` to `extensions/pi-fence/io/`.
- Splitting `extensions/pi-fence/index.ts` into the composition root plus focused modules.
- Introducing new runtime seams or adapter layers outside the narrow needs of making the static gate truthful.
- Generic code-style lint adoption. A later `CVx.E3` story may add targeted architectural lint rules instead (for example: no production imports from `tests/**`, no ambient env/filesystem reads in inner modules, concrete adapters wired only at the composition root, and guards against accidental coupling/dead imports).
- Evaluating or adopting the future analyzer candidates named in the epic file (`typescript-eslint`, `dependency-cruiser`, `knip`, `semgrep` / `ast-grep`). Those are intentionally deferred until the architecture is explicit enough to make their rules high-signal.
- Renaming modules purely for aesthetics.
- Coverage tooling adoption as a mandatory global gate.
- User-facing behavior changes.
