# CVx.E4.S2 — SonarQube experiment

**Status:** Ready

**Epic:** [CVx.E4 — Quality Analyzers](cvx-e4--quality-analyzers.md)
**Depends on:** [CVx.E4.S1 — dependency-cruiser architectural boundaries](cvx-e4-s1--dependency-cruiser-boundaries.md)
**Date:** 2026-04-22 (spec)

## Summary

`dependency-cruiser` is the enforcement tool for architecture-specific rules. SonarQube is a different kind of tool: broader, more opinionated, and potentially useful for complexity, duplication, and smell discovery — but also much more likely to produce generic noise.

S2 treats SonarQube as an experiment, not as a gate. The point is to make it easy to run, inspect the findings, and decide whether any part of its output deserves to influence future workflow.

## Done criterion

1. SonarQube can be run against this repo in a documented, reproducible way.
2. The experiment is non-blocking:
   - it does not fail `pnpm run verify:fast`
   - it does not become required for every local commit
3. The repo documents how to start or connect to SonarQube for the experiment.
4. The repo documents how to run the scan and where to inspect the findings.
5. The story closes with an explicit judgment in the worklog covering:
   - what findings were useful
   - what findings were noisy
   - whether any subset should influence future policy
6. If CI integration is added, it is clearly marked non-blocking.

## Scope

**In scope:**

1. Reproducible SonarQube experiment setup.
2. A local command or documented invocation for scanning the repo.
3. Optional non-blocking CI job if it materially improves reproducibility.
4. Documentation of findings and recommendations.

**Out of scope:**

1. Making SonarQube part of the fast gate.
2. Adopting all default rules as policy.
3. Rewriting the repo to satisfy generic smell counts.
4. Replacing architecture-specific rules from `dependency-cruiser`.

## Approach

Bias toward cheap learning.

1. Make the experiment easy to reproduce.
2. Keep it non-blocking.
3. Record the findings in repo terms, not in SonarQube marketing terms.
4. Use the story close to decide whether the experiment should continue, narrow, or stop.

## Plan

### Deliverables

#### 1. Experiment entrypoint

Expected shape:

- documented local setup for SonarQube (container, hosted instance, or equivalent)
- repo config such as `sonar-project.properties` if needed
- one documented command to run the scan

#### 2. Optional CI experiment

If CI wiring is worth it, expected shape:

- separate non-blocking workflow or non-required job
- explicit naming that signals experimentation rather than policy

This is optional. Local reproducibility matters more than CI cosmetics.

#### 3. Findings summary

At close, capture:

1. high-signal findings worth future attention
2. low-signal or noisy findings to ignore
3. recommendation: keep experimenting, narrow the scope, or stop

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Create the S2 story file and link it from `cvx-e4--quality-analyzers.md`. | `spec CVx.E4.S2` |
| 2 | setup | Add the minimal repo config/scripts/docs needed to run a SonarQube scan. | `step 1: make SonarQube experimentation reproducible` |
| 3 | evaluate | Run the scan, inspect findings, and document the signal/noise assessment. | `step 2: evaluate SonarQube signal on pi-fence` |
| 4 | close | Mark S2 done with an explicit recommendation in worklog/roadmap docs. | `close CVx.E4.S2` |

## Tests

1. **Layers touched:**
   - repo-tooling / verification only
2. **Events / interactions covered:**
   - SonarQube scan command runs successfully in the documented setup
   - any optional CI job is non-blocking
   - findings are captured in prose at close
3. **Fakes added:** none
4. **Live tests added / updated:** none expected
5. **Deferred:** any decision to enforce a SonarQube-derived subset belongs to a later story, if earned

## Verification

### Gate

This story is intentionally **not** part of the fast gate.

Minimum close verification:

```bash
pnpm run verify:fast
# plus the documented SonarQube scan command
```

Expected:

1. normal repo gates stay green
2. SonarQube scan runs successfully in the documented setup
3. findings are recorded before close

### Manual test script

1. Follow the story's documented SonarQube setup.
2. Run the documented scan command.
3. Open the resulting analysis/report.
4. Confirm the worklog close entry records the judgment about usefulness vs noise.

## Key files

- `package.json`
- SonarQube config file(s), if any
- optional CI workflow, if added
- `docs/getting-started.md` or dedicated docs note if setup needs explanation
- roadmap/worklog files at close

## Out of scope — explicitly

- blocking CI enforcement
- broad cleanup churn driven by SonarQube defaults
- replacing dependency-cruiser or typecheck/test gates
