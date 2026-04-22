[< S1](README.md)

# Plan: CVx.E3.S1 — Static confidence gate for refactoring

**Story:** [README.md](README.md)
**Epic:** [CVx.E3 — Refactor Confidence](../README.md)
**Depends on:** existing CV0/CVx fast suite and docs checks
**Date:** 2026-04-21 (spec)

## Goal

Make the repository's fast gate trustworthy for cleanup work.

At the start of this story, a contributor can see `pnpm test` green and still have unresolved static type drift. At the end, the repo has an explicit type-check command, a single fast verification command, green static typing, and docs/CI that treat static typing as part of the normal refactor-safety surface.

This is deliberately the precondition for the DI/composability work in `CVx.E3.S2`–`S4`, not a substitute for it.

---

## Deliverables

### 1. Explicit fast-gate scripts in `package.json`

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

### 2. `tsc --noEmit` goes green on the current repository

Fix the current compile drift rather than hiding it.

Known categories already surfaced by an exploratory `tsc --noEmit` pass and therefore expected to be addressed inside this story:

1. **Renderer typing drift** — theme/component signatures around `createPiFenceMessageRenderer` and `createPiFenceListRenderer` are close to upstream pi types, but not exact enough for the compiler.
2. **Extension-test stream typing drift** — the canned `AssistantMessageEventStream` helper in `tests/extension/pi-fence.test.ts` is runtime-correct but typed too narrowly/loosely in a few places.
3. **HTTP body typing drift** — the fetch body passed through `NodeHttpClient` is runtime-valid but not expressed in a way TypeScript accepts cleanly.
4. **Any adjacent compile-only fallout** discovered while fixing the above.

The story is allowed to change code shape where needed, but every such change is expected to be behavior-preserving and backed by the existing runtime suite. If a fix meaningfully restructures a branch, add a targeted test in the nearest existing test file rather than relying on compile success alone.

### 3. Verification docs updated to name the real fast gate

Update the repository docs that define the verification ritual so they all say the same thing.

Minimum set:

- `AGENTS.md`
- `docs/getting-started.md`
- `docs/product/principles.md` (if the Testing section still enumerates the fast gate without static checking)

Target wording: the normal pre-commit fast gate is the trio `pnpm test`, `pnpm run check`, `pnpm run typecheck`, with `pnpm run verify:fast` as the umbrella convenience command.

### 4. CI enforces the same check

The fast CI workflow should run the same static gate contributors are expected to trust locally. Exact shape decided on encounter:

1. Either invoke `pnpm run verify:fast` directly.
2. Or keep separate workflow steps while adding `pnpm run typecheck` alongside the existing fast checks.

Preference: separate steps in CI for clearer failure attribution, but the command surface seen by contributors stays `verify:fast`.

### 5. No opportunistic architecture work

This story intentionally stops at the safety boundary.

It does **not** move `HttpClient` / `ShellRunner` / `Logger`, split `index.ts`, or rename modules for elegance. Those are the next stories, and S1 is more valuable if it lands narrowly and first.

It also does **not** smuggle in new runtime seams or adapter layers merely because a compile fix touched a type. The architectural question for the later stories is not just "can this be injected?" but "should this be a runtime seam at all?" S2 writes that rule down; S3 and S4 apply it.

---

## Implementation order

Atomic green commits only.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | compiler + scripts | Add `typecheck` / `verify:fast` and fix the current `tsc --noEmit` failures in one green commit. Include any tiny targeted tests required by behavior-preserving code-shape changes. | `step 1: make the fast gate prove static health` |
| 2 | docs + CI | Update the repo's verification docs and fast CI workflow to include static checking. | `step 2: document and enforce the refactor-safe gate` |
| 3 | close | Status flips across roadmap / CVx / CVx.E3 / story README, plus worklog close entry once implementation commits exist. | `close CVx.E3.S1` |

**Why step 1 is one commit, not two.** Adding `typecheck` without fixing the current errors would knowingly land a red gate, which violates the repository rule that every commit leaves tests passing. The script and the fixes belong together.

---

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

---

## Verification

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

---

## Key files

**Modified:**

- `package.json` — add `typecheck` and `verify:fast`.
- `AGENTS.md` — verification gate updated.
- `docs/getting-started.md` — contributor commands updated.
- `docs/product/principles.md` — Testing section updated if needed.
- `.github/workflows/ci.yml` — static type check added to the fast workflow.
- Whatever production/test/script files require compile fixes.
- Roadmap / CVx / CVx.E3 / story READMEs at close.
- `docs/process/worklog.md` at close.

**New:**

- None required.

---

## Out of scope — explicitly

- Promoting `HttpClient`, `ShellRunner`, or `Logger` to `extensions/pi-fence/io/`.
- Splitting `extensions/pi-fence/index.ts` into the composition root plus focused modules.
- Introducing new runtime seams or adapter layers outside the narrow needs of making the static gate truthful.
- Generic code-style lint adoption. A later `CVx.E3` story may add targeted architectural lint rules instead (for example: no production imports from `tests/**`, no ambient env/filesystem reads in inner modules, concrete adapters wired only at the composition root, and guards against accidental coupling/dead imports).
- Evaluating or adopting the future analyzer candidates named in the Epic README (`typescript-eslint`, `dependency-cruiser`, `knip`, `semgrep` / `ast-grep`). Those are intentionally deferred until the architecture is explicit enough to make their rules high-signal.
- Renaming modules purely for aesthetics.
- Coverage tooling adoption as a mandatory global gate.
- User-facing behavior changes.

---

**See also:** [Test Guide](test-guide.md) · [Story README](README.md) · [CVx.E3 README](../README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
