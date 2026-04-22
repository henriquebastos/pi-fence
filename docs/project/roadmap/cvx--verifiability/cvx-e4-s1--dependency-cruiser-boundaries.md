# CVx.E4.S1 — dependency-cruiser architectural boundaries

**Status:** Done

**Epic:** [CVx.E4 — Quality Analyzers](cvx-e4--quality-analyzers.md)
**Depends on:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Date:** 2026-04-22 (spec)

## Summary

The repo's architecture note now says something precise: production runtime seams live under `extensions/pi-fence/io/`, policy modules live under `extensions/pi-fence/`, tests own fakes under `tests/utilities/`, and tooling-lane reuse is deliberate rather than accidental.

Right now those boundaries are still enforced by human memory and review quality. S1 turns the most valuable ones into executable rules with `dependency-cruiser`.

The first must-have rule is simple and high-signal:

1. production code must not import from `tests/**`

Additional rules are welcome only if they stay equally clear and low-noise.

## Done criterion

1. `dependency-cruiser` is installed and configured for this repo.
2. A contributor can run a single command locally to check the dependency rules.
3. The highest-value architectural rule is enforced: production code must not import from `tests/**`.
4. Any additional enforced rules are explicitly documented and justified by `docs/project/architecture.md`.
5. The rule set permits the currently-intended tooling-lane couplings where they are deliberate.
6. The analyzer is wired into a normal verification path appropriate for its cost:
   - either directly in `pnpm run verify:fast`, or
   - in a sibling command that the repo explicitly names as part of the contributor gate.
7. CI runs the same rule set.
8. Docs explain what the rules are protecting and how to fix a violation.

## Scope

**In scope:**

1. Adding `dependency-cruiser`.
2. Adding a repo config that encodes at least one architectural boundary.
3. Wiring a local command and CI command.
4. Documenting the rules and any deliberate allowlist/exception.
5. Small path or import cleanup only if the analyzer exposes a real mismatch between docs and code.

**Out of scope:**

1. A giant layering matrix just because the tool can express one.
2. Enforcing speculative boundaries not yet described in the architecture note.
3. Broad style linting.
4. SonarQube — that is `CVx.E4.S2`.

## Approach

Start with the rule the repo already knows it wants.

1. **Must-have:** forbid imports from `tests/**` into production runtime code.
2. **Nice-to-have only if still high-signal:** catch cycles or lane violations that are already described in `docs/project/architecture.md`.
3. **Avoid speculative restrictions:** do not freeze module motion that future stories may still need.

The config should read like the architecture note, not like generic tool cargo-cult.

## Plan

### Deliverables

#### 1. dependency-cruiser config

Expected shape:

- one config file in repo root (`.dependency-cruiser.cjs` or equivalent)
- rules named in plain language
- comments tying each rule back to the architecture note where useful

Minimum rule set:

1. disallow `extensions/**` importing from `tests/**`

Candidate second rules, only if they prove clean in practice:

1. disallow cycles inside `extensions/pi-fence/**`
2. disallow extension runtime importing from `scripts/**`

Do **not** add a large rule matrix unless the implementation earns it.

#### 2. Contributor command

Expected shape in `package.json`:

- `pnpm run typecheck:deps` or equivalent
- optionally folded into `pnpm run verify:fast` if runtime cost is small enough

The repo should have one obvious way to run the rule locally.

#### 3. CI integration

Expected shape:

- CI runs the same command the contributor runs
- no separate, stricter hidden rule set in CI

#### 4. Docs

Expected touch points:

- `docs/project/architecture.md` if the final enforced boundaries need a small wording adjustment
- `docs/product/principles.md` or `AGENTS.md` if the contributor gate changes
- worklog + roadmap status at close

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Create the S1 story file and link it from `cvx-e4--quality-analyzers.md`. | `spec CVx.E4.S1` |
| 2 | red/green | Add dependency-cruiser config and the first enforced boundary rule. | `step 1: enforce architectural import boundaries` |
| 3 | gate | Wire the command into the local/CI verification path and document it. | `step 2: make dependency rules part of the contributor gate` |
| 4 | close | Mark S1 done in roadmap/worklog once the rule is green in local and CI paths. | `close CVx.E4.S1` |

## Tests

1. **Layers touched:**
   - repo-tooling / verification only
   - existing test layers should remain behaviorally unchanged
2. **Events / interactions covered:**
   - clean repo passes the dependency rules
   - a representative forbidden import shape is caught by the rule set
   - CI runs the same command
3. **Fakes added:** none
4. **Live tests added / updated:** none expected
5. **Deferred:** broader smell analyzers and SonarQube policy decisions

## Verification

### Gate

Minimum close gate:

```bash
pnpm run verify:fast
```

If dependency-cruiser stays outside `verify:fast`, then the explicit close gate becomes:

```bash
pnpm run verify:fast
pnpm run typecheck:deps
```

Expected:

1. the dependency rule command exits 0 on the repo
2. CI uses the same command
3. the rule catches at least the `extensions/** -> tests/**` violation class

### Automated checks

```bash
pnpm run typecheck:deps
pnpm run verify:fast
```

### Manual test script

1. Confirm the command exists in `package.json`.
2. Run it on the clean repo; expect exit 0.
3. Inspect the config; confirm the main rule is readable and maps to the architecture note.
4. Confirm CI runs the same command.

## Key files

- `package.json`
- `.github/workflows/ci.yml`
- dependency-cruiser config file
- `docs/project/architecture.md`
- `AGENTS.md` / `docs/product/principles.md` if the contributor gate wording changes
- roadmap/worklog files at close

## Out of scope — explicitly

- SonarQube setup
- Generic code-style lint adoption
- Large speculative layering rules that the repo has not yet earned
