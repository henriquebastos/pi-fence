# CVx.E4.S4 — Fallow staged inspect signal

**Status:** Ready

**Epic:** [CVx.E4 — Quality Analyzers](cvx-e4--quality-analyzers.md)
**Depends on:** [CVx.E4.S3 — Sonar report pipeline cleanup](cvx-e4-s3--sonar-report-pipeline-cleanup.md)
**Date:** 2026-04-29 (spec)

## Summary

Fallow is a deterministic TypeScript/JavaScript codebase analyzer for dead code, duplication, complexity, and change-set audits. A quick repo trial showed useful signal, but also enough current repo-wide findings that it should not enter the fast gate as-is.

This story adopts Fallow as a **staged inspect signal**:

1. no `pnpm test` or `pnpm run feedback` integration;
2. a changed-file audit joins the slower completion inspection flow once configured;
3. repo-wide findings remain advisory cleanup input until intentionally fixed, excluded, or baselined.

## Evidence from the initial spike

Commands run before this story:

```bash
pnpm dlx fallow --version
pnpm dlx fallow --no-cache --summary
pnpm dlx fallow audit --no-cache --changed-since HEAD --summary
```

Observed output on the current clean tree:

1. `fallow 2.56.0` installed and ran through `pnpm dlx`.
2. Repo-wide combined analysis found:
   - 54 dead-code issues
   - 169 duplication clone groups / 11.8% duplication
   - 22 functions above the default health thresholds
   - health score around `A` / `88`
3. Changed-file audit against `HEAD` passed with zero changed files.
4. Findings that look immediately useful or require repo-specific modeling:
   - `extensions/pi-fence/index.ts` default export is a pi extension entry point.
   - `@xterm/addon-image` and `@xterm/xterm` are loaded by path in the render verifier.
   - `FakeExtensionAPI` class members intentionally mirror the pi SDK surface even when one test run does not call every member.
   - `tests/extension/pi-fence.test.ts` contains repeated scenario setup that may deserve later cleanup.
   - script-level complexity findings overlap with existing CRAP/Sonar completion-signal territory.

## Done criterion

1. `fallow` is added as a dev dependency and the chosen version is visible in lockfile history.
2. A narrow Fallow config exists when needed to model intentional repo facts, such as:
   1. pi extension entry points;
   2. path-loaded verifier dependencies;
   3. SDK-shaped fake class members;
   4. generated or tool-output paths, if Fallow sees any.
3. `pnpm run inspect:fallow` runs a changed-file Fallow audit and is green on a clean tree.
4. `pnpm run inspect:fallow:repo` (or an equivalently named script) produces the repo-wide advisory summary without being part of the fast gate.
5. `pnpm run inspect` includes the changed-file Fallow audit after the CRAP inspection path, while keeping the optional Sonar step optional.
6. `pnpm run feedback` is unchanged: tests, focused extension CRAP, markdown lint, type lint, and dependency-cruiser only.
7. Existing repo-wide findings are classified at close as one of:
   1. fixed now;
   2. intentionally excluded with a narrow reason;
   3. baselined for staged adoption;
   4. deferred cleanup candidate.
8. The close worklog records the final signal/noise judgment and whether any Fallow result should become stricter policy later.

## Scope

**In scope:**

1. Adding the `fallow` dev dependency.
2. Adding package scripts for changed-file audit and repo-wide advisory summary.
3. Updating `scripts/inspect.ts` if needed so `pnpm run inspect` invokes the changed-file audit.
4. Adding `.fallowrc.json` / equivalent config or per-analysis baselines only when they reduce known false positives or enable staged adoption.
5. Documenting the command surface in contributor-facing docs touched by the inspect workflow.
6. Recording the signal/noise assessment at close.

**Out of scope:**

1. Adding Fallow to `pnpm test`.
2. Adding Fallow to `pnpm run feedback`.
3. Requiring repo-wide `fallow` to pass with zero findings in this story.
4. Broadly refactoring existing dead-code, duplication, or health findings.
5. Replacing dependency-cruiser, CRAP, TypeScript, markdown lint, or Sonar.
6. Adopting Fallow MCP/runtime integrations.

## Approach

Adopt the smallest high-signal slice first.

1. Use `fallow audit` as the completion-pass gate because it is scoped to changed files and fits review/inspection better than behavior testing.
2. Keep repo-wide `fallow` output available as inspection input, not as a default failure condition.
3. Prefer narrow config exceptions over broad ignores.
4. Prefer fixing obvious true positives over immediately baselining them.
5. Use baselines only if the repo cannot cheaply resolve current findings but still wants to block new issues.
6. Stop if the changed-file audit produces noisy failures on ordinary story diffs; keep it standalone and record why instead of forcing a bad default gate.

## Plan

### Deliverables

#### 1. Command surface

Expected scripts:

```json
{
  "inspect:fallow": "fallow audit --format compact",
  "inspect:fallow:repo": "fallow --summary"
}
```

Equivalent flags are fine if implementation finds a better shape, but the split must remain:

1. changed-file audit for the default inspect flow;
2. repo-wide advisory report for deliberate cleanup sessions.

#### 2. Intentional repo modeling

Start with the findings from the spike and classify them before adding config. Candidate modeling points:

1. `extensions/pi-fence/index.ts` default export as a pi extension entry point.
2. `@xterm/addon-image` / `@xterm/xterm` as path-loaded verifier dependencies.
3. `FakeExtensionAPI` methods as interface-shaped test fake surface.
4. Processor factory wrappers and other plugin-style exports if Fallow cannot infer their dynamic use.

Every exception must be narrow and have a reason in config-adjacent prose or worklog close notes.

#### 3. Inspect integration

`pnpm run inspect` should still read like a completion-pass analyzer stack:

1. always run broad non-live CRAP inspection;
2. run changed-file Fallow audit;
3. run Sonar only when `SONAR_HOST_URL` and `SONAR_TOKEN` are set.

If Fallow audit fails on changed files, `pnpm run inspect` fails and the findings become normal inspection beans.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add this story and reopen the CVx.E4 roadmap status. | `spec CVx.E4.S4` |
| 2 | tooling | Add `fallow` and standalone `inspect:fallow*` scripts. | `step 1: add Fallow inspection commands` |
| 3 | tooling | Add narrow config / baselines only for intentional current findings. | `step 2: model intentional Fallow findings` |
| 4 | tooling | Fold the changed-file audit into `pnpm run inspect`; keep `feedback` unchanged. | `step 3: stage Fallow in the inspect flow` |
| 5 | close | Verify, classify remaining findings, and record the adoption judgment. | `close CVx.E4.S4` |

## Tests

1. **Layers touched:**
   - repo-tooling / verification only
2. **Events / interactions covered:**
   - `pnpm run inspect:fallow` runs Fallow changed-file audit and exits green on a clean tree
   - `pnpm run inspect:fallow:repo` exposes repo-wide dead-code / duplication / health findings for advisory use
   - `pnpm run inspect` invokes the Fallow changed-file audit
   - `pnpm run feedback` does not invoke Fallow
   - config exceptions, if any, suppress only documented intentional findings
3. **Fakes added:** none
4. **Live tests added / updated:** none
5. **Deferred:** repo-wide cleanup of existing Fallow findings unless a true positive is cheap and clearly in scope

## Verification

### Gate

```bash
pnpm run inspect:fallow
pnpm run inspect
pnpm run feedback
```

### Advisory report

```bash
pnpm run inspect:fallow:repo
```

The advisory report may still exit non-zero while staged adoption is in progress. If so, the close worklog must record the remaining counts and classification.

### Expected

1. changed-file Fallow audit passes on the story's final diff;
2. completion inspect flow includes Fallow and stays green;
3. fast feedback gate stays unchanged and green;
4. repo-wide Fallow output is reproducible for future cleanup sessions;
5. no broad ignore hides real production issues.

## Key files

- `package.json`
- `pnpm-lock.yaml`
- `.fallowrc.json` or Fallow baseline files, if needed
- `scripts/inspect.ts`
- `docs/product/principles.md`
- `docs/process/implementation-loop.md`
- `AGENTS.md`
- `README.md` / `docs/getting-started.md` only if user-facing command docs change
- roadmap/worklog files at close

## Out of scope — explicitly

- turning Fallow into a behavior test
- blocking every commit on Fallow
- fixing all existing Fallow findings before adoption
- broad duplicate-test rewrites in `tests/extension/pi-fence.test.ts`
- using Fallow as a replacement for the current CRAP or Sonar signals
