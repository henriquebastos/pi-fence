# CVx.E4.S3 — Sonar report pipeline cleanup

**Status:** In progress

**Epic:** [CVx.E4 — Quality Analyzers](cvx-e4--quality-analyzers.md)
**Depends on:** [CVx.E4.S2 — SonarQube experiment](cvx-e4-s2--sonarqube-experiment.md)
**Date:** 2026-04-22 (spec)

## Summary

`CVx.E4.S2` proved that `pnpm run sonar` works and produces useful report artifacts. It also exposed an immediate maintainability problem: the new `scripts/sonar-report.ts` is too dense, too loosely typed, and too noisy under Sonar to serve as a clean long-term reporting tool.

This story refactors the Sonar report pipeline itself. The goal is not new behavior. The goal is to keep the same reporting flow while making the implementation easier to read, easier to trust, and less noisy under the very analyzer it consumes.

## Done criterion

1. `pnpm run sonar` still performs:
   1. scan
   2. CE wait
   3. API fetch
   4. report bundle write
2. The report bundle shape is unchanged:
   - `report-task.json`
   - `ce-task.json`
   - `quality-gate.json`
   - `measures.json`
   - `issues.json`
   - `summary.json`
   - `summary.md`
3. `scripts/sonar-report.ts` becomes a thin entrypoint/orchestrator.
4. Sonar API payload typing is explicit enough that the current repeated `unknown` casts disappear or shrink materially.
5. Markdown rendering is separated from data fetching and summary derivation.
6. Sonar noise from the reporting implementation drops materially relative to the current state.
7. `pnpm run verify:fast` and `pnpm run sonar` are green.

## Scope

**In scope:**

1. Refactoring the Sonar reporting pipeline under `scripts/`.
2. Extracting helpers/modules for:
   1. report-task parsing
   2. Sonar API access / CE polling
   3. summary derivation
   4. markdown rendering
3. Strengthening types for Sonar payloads.
4. Small readability improvements directly justified by the refactor.

**Out of scope:**

1. Changing the reporting feature set.
2. Changing output file names or output directory shape.
3. Adding Sonar to the fast gate.
4. Broad cleanup of unrelated Sonar findings elsewhere in the repo.

## Approach

Refactor by responsibility, not by style nibbling.

1. Separate:
   1. input loading
   2. remote fetching
   3. summary computation
   4. output rendering
2. Replace weakly typed `unknown` plumbing with small explicit payload interfaces.
3. Make the entrypoint read like orchestration, not implementation.
4. Prefer fewer, clearer helpers over many tiny abstractions.

## Plan

### Deliverables

#### 1. Thin entrypoint

Expected target:

- `scripts/sonar-report.ts` mainly:
  1. validate env
  2. load report-task metadata
  3. fetch Sonar data
  4. derive summary
  5. write outputs
  6. print final paths

#### 2. Extracted modules

Likely shape:

```text
scripts/sonar/
  report-task.ts
  api.ts
  summary.ts
  render-markdown.ts
```

Equivalent names are fine if responsibilities stay clear.

#### 3. Typed payloads

Expected types for:

1. CE task payload
2. quality gate payload
3. measures payload
4. issues payload
5. final summary payload

#### 4. Cleaner markdown generation

Replace repeated `lines.push(...)` assembly with section helpers and/or a small table renderer.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add the story file and link it from `CVx.E4`. | `spec CVx.E4.S3` |
| 2 | refactor | Extract Sonar task/API access and add explicit payload typing. | `step 1: separate Sonar data access from report orchestration` |
| 3 | refactor | Extract summary derivation and markdown rendering; shrink the entrypoint. | `step 2: make the Sonar report pipeline readable` |
| 4 | close | Rerun `pnpm run sonar`, record the outcome, and close the story. | `close CVx.E4.S3` |

## Tests

1. **Layers touched:**
   - repo-tooling only
2. **Events / interactions covered:**
   - `pnpm run sonar` still succeeds
   - report bundle files are still written
   - summary still contains the expected top-level sections and counts
3. **Fakes added:** none
4. **Live tests added / updated:** none
5. **Deferred:** broader Sonar finding cleanup outside the reporting pipeline

## Verification

### Gate

```bash
pnpm run verify:fast
pnpm run sonar
```

### Expected

1. fast gate green
2. Sonar scan + report green
3. report artifacts written under `scripts/out/sonar/latest/`
4. implementation is structurally cleaner than the current single-file version

## Key files

- `scripts/sonar-report.ts`
- new `scripts/sonar/*.ts` modules
- `package.json` only if command wiring changes
- roadmap/worklog files at close

## Out of scope — explicitly

- Excluding the report pipeline from Sonar just to silence its findings
- Broad style cleanup across the repo
- Converting the Sonar experiment into a required gate
