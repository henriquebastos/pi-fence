[< S1](README.md)

# Test Guide: CVx.E3.S1 — Static confidence gate for refactoring

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CVx.E3 — Refactor Confidence](../README.md)

---

## Prerequisites

None beyond the normal contributor setup.

```bash
pnpm install
```

No Docker requirement. No network requirement beyond dependency installation.

---

## Automated tests

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

---

## Manual test script

### 1. `package.json` exposes the new scripts

```bash
node -e 'const p=require("./package.json"); console.log(p.scripts.typecheck); console.log(p.scripts["verify:fast"])'
```

Expect output equivalent to:

```text
tsc --noEmit
pnpm test && pnpm run check && pnpm run typecheck
```

Exact quoting may vary; command intent should not.

### 2. The standalone static gate is green

```bash
pnpm run typecheck
```

Expect exit 0.

This is the core new guarantee of the story: a contributor can ask "does the repo compile cleanly right now?" and get a direct answer.

### 3. The umbrella fast gate is green

```bash
pnpm run verify:fast
```

Expect exit 0.

The command should run, in effect:

1. `pnpm test`
2. `pnpm run check`
3. `pnpm run typecheck`

### 4. Docs say the same thing the scripts do

Open these files and confirm the fast gate wording is aligned:

- `AGENTS.md`
- `docs/getting-started.md`
- `docs/product/principles.md` (if updated by the implementation)

Expect the normal fast gate to include static type checking, with `pnpm run verify:fast` presented as the convenience command rather than a second, contradictory workflow.

### 5. CI includes the static gate

Open:

- `.github/workflows/ci.yml`

Expect either:

1. a dedicated `pnpm run typecheck` step, or
2. a `pnpm run verify:fast` step that clearly includes type checking.

Preference is separate steps for readability, but either shape is acceptable if the workflow truly enforces the same static gate.

### 6. Deliberate-break teeth check

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

### 7. No user-visible behavior moved accidentally

Skim the implementation diff and confirm it stays in the story boundary:

- scripts
- compile fixes
- docs
- CI

It should **not** also move `HttpClient` / `ShellRunner` / `Logger`, split `index.ts`, or rename broad swaths of production code for aesthetics. Those belong to later CVx.E3 stories.

---

## Rollback

S1 is internal-only. If it regresses unexpectedly, revert the story commits and the previous repo behavior returns immediately.

```bash
git revert <sha>
```

No runtime data migration, fixture refresh, or user-facing rollback steps are required.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [CVx.E3](../README.md)
