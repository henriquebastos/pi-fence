# CVx.E3.S6 — Feedback-loop command surface

**Status:** In progress

**Epic:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Depends on:** [CVx.E5.S1 — Coverage and CRAP feedback](cvx-e5-s1--coverage-and-crap-feedback.md)
**Date:** 2026-04-22 (spec)

## Summary

The repo's local command surface works, but the names mix intent and tool internals:

1. `verify:fast` is the normal implementation-loop gate, but its name emphasizes verification shape rather than feedback-loop purpose.
2. `typecheck` / `typecheck:deps` are really lint/static-analysis commands, and markdown-body + markdown-link validation belong under the same `lint:markdown:*` family.
3. `crap:*`, `coverage:nonlive`, and `sonar:*` are useful, but today they do not read as a distinct "inspection" lane separate from the normal fast loop.

That makes it harder for a contributor — and especially an agent operating inside the edit/verify loop — to answer three simple questions quickly:

1. What should I run after a meaningful code change?
2. Which commands are normal checks vs deeper inspection?
3. Which names are canonical today vs historical leftovers from earlier stories?

This story adds a small intent-first script taxonomy:

1. `feedback` / `feedback:*` — the normal implementation loop
2. `lint:*` — TypeScript, dependency-boundary, markdown validation, and markdown-fix commands
3. `inspect:*` — coverage/reporting analyzers such as CRAP and Sonar

The repo will prefer a single intent-first script taxonomy. Older names will be removed rather than kept as compatibility aliases so the contributor loop has one canonical vocabulary.

## Done criterion

1. `package.json` exposes these canonical intent-first scripts:
   - `feedback`
   - `feedback:fast`
   - `lint`
   - `lint:types`
   - `lint:deps`
   - `lint:markdown`
   - `lint:markdown:body`
   - `lint:markdown:links`
   - `lint:markdown:fix`
   - `inspect:coverage:nonlive`
   - `inspect:crap`
   - `inspect:crap:ext`
   - `inspect:crap:nonlive`
   - `inspect:sonar`
   - `inspect:sonar:scan`
   - `inspect:sonar:report`
2. Legacy names are removed from `package.json` so the repo exposes one canonical script vocabulary only.
3. An automated fast-suite test locks the canonical script surface and the absence of the removed aliases.
4. Contributor-facing docs and relevant workflow files prefer the canonical names only.
5. `pnpm run feedback` and `pnpm run inspect:crap` both succeed on the current tree.

## Scope

**In scope:**

1. `package.json` script naming and wiring.
2. A repo-tooling test that validates the command surface.
3. Updating contributor-facing docs to prefer the canonical names.
4. Updating workflow files that should speak the current script vocabulary.
5. Removing the replaced legacy aliases from `package.json` and docs.

**Out of scope:**

1. Changing the fast gate's actual composition.
2. Changing coverage scope or CRAP scope.
3. SonarQube server setup or rule tuning.
4. Rewriting older roadmap/worklog history that mentions the old commands.

## Plan

### Deliverables

#### 1. Intent-first script families

Target families:

1. `feedback` for the normal implementation loop
2. `lint:*` for static checks, markdown validation, and markdown fixing
3. `inspect:*` for coverage/reporting analyzers and deeper non-blocking inspection

`test:*`, `live:*`, and `render:*` stay as they are because those families already read clearly.

#### 2. Legacy aliases are removed

Historical docs and habit loops should be updated to the canonical names rather than preserved in parallel. The command surface should teach one vocabulary only.

#### 3. Docs teach the loop explicitly

Contributor docs should answer this flow in one pass:

1. run `pnpm run feedback` during implementation
2. run `pnpm test:watch` while iterating when helpful
3. read `pnpm test` coverage output as the default shipped-code coverage signal
4. run `pnpm run inspect:crap` for the broader non-blocking hotspot view
5. run `pnpm run inspect:sonar` only when the external experiment is intentionally in play

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add `CVx.E3.S6`, reopen roadmap status, and name the command-surface taxonomy. | `spec CVx.E3.S6` |
| 2 | tooling | Rewire `package.json` around canonical `feedback` / `lint:*` / `inspect:*` names, remove replaced aliases, and add a fast-suite test for the command surface. | `step 1: make the local command surface intent-first` |
| 3 | docs | Update contributor docs and workflow files to teach the canonical names only. | `step 2: teach the implementation feedback loop explicitly` |
| 4 | close | Re-run the fast loop and broader inspection command, then close the story. | `close CVx.E3.S6` |

## Tests

1. **Layers touched:**
   - **Unit** / repo-tooling only — one fast-suite test file validating `package.json` script shape.
2. **Events / interactions covered:**
   - canonical scripts exist
   - removed legacy aliases stay absent
   - coverage attached to `pnpm test` stays separate from broader inspect-only coverage
   - CRAP analyzers live under `inspect:*` even when `feedback` calls the focused one
3. **Fakes added:** none.
4. **Live tests added / updated:** none.
5. **Deferred:** none for this naming pass.

## Verification

```bash
pnpm test
pnpm run feedback
pnpm run inspect:crap
```

## Key files

- `package.json`
- `tests/unit/package-scripts.test.ts`
- `AGENTS.md`
- `README.md`
- `docs/getting-started.md`
- `.github/workflows/ci.yml`
- `.github/workflows/sonarqube-experiment.yml`
