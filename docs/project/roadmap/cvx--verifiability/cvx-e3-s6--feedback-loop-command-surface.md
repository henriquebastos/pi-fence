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
3. `inspect` / `inspect:*` — completion-pass analyzers such as CRAP and Sonar

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
   - `inspect`
   - `inspect:coverage:nonlive`
   - `inspect:crap`
   - `inspect:crap:ext`
   - `inspect:crap:nonlive`
   - `inspect:sonar`
   - `inspect:sonar:scan`
   - `inspect:sonar:report`
2. Legacy names are removed from `package.json` so the repo exposes one canonical script vocabulary only.
3. An automated fast-suite test locks the canonical script surface and the absence of the removed aliases.
4. Contributor-facing docs and relevant workflow files teach the four-level testing workflow explicitly: TDD loop, completion, live I/O, and acceptance gate.
5. The workflow names the current quality targets explicitly: fast-suite extension coverage minimums of statements `90`, lines `90`, functions `90`, branches `75`; completion-pass CRAP target `<=25`; Sonar target of `0` open issues when configured.
6. `pnpm run feedback`, `pnpm run inspect`, and `pnpm run inspect:crap` all succeed on the current tree.

## Scope

**In scope:**

1. `package.json` script naming and wiring.
2. A repo-tooling test that validates the command surface.
3. Updating contributor-facing docs to prefer the canonical names and the explicit TDD/refactor/inspect workflow.
4. Setting the fast-suite extension coverage thresholds in `pnpm test`.
5. Updating workflow files that should speak the current script vocabulary.
6. Removing the replaced legacy aliases from `package.json` and docs.

**Out of scope:**

1. Changing the fast gate's actual composition beyond naming + the added coverage minimums.
2. Changing coverage scope or CRAP scope.
3. SonarQube server setup or rule tuning beyond optional detection in `pnpm run inspect`.
4. Adding a hard CRAP gate in code rather than documenting the workflow target.
5. Rewriting older roadmap/worklog history that mentions the old commands.

## Plan

### Deliverables

#### 1. Intent-first script families

Target families:

1. `feedback` for the normal implementation loop
2. `lint:*` for static checks, markdown validation, and markdown fixing
3. `inspect` / `inspect:*` for coverage/reporting analyzers and the broader completion pass
4. quality targets are explicit in the workflow, not implied: fast coverage minimums, completion-pass CRAP target, and Sonar cleanup target

`test:*`, `live:*`, and `render:*` stay as they are because those families already read clearly.

#### 2. Coverage minimums belong in the fast test command

`pnpm test` is the normal shipped-code quality signal, so its extension-focused coverage minimums belong there rather than in the inspection lane.

#### 3. Legacy aliases are removed

Historical docs and habit loops should be updated to the canonical names rather than preserved in parallel. The command surface should teach one vocabulary only.

#### 4. Docs teach the testing workflow explicitly

Contributor docs answer four levels in one pass:

1. **TDD loop** — `pnpm run feedback` (every commit)
2. **Completion** — `pnpm run inspect` (when TDD session feels done)
3. **Live I/O** — `pnpm test:live` (when adding or changing a processor)
4. **Acceptance** — `pnpm test:live` + `pnpm run render:verify` (before closing an epic)

No level requires human review.

### Implementation order

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Add `CVx.E3.S6`, reopen roadmap status, and name the command-surface taxonomy. | `spec CVx.E3.S6` |
| 2 | tooling | Rewire `package.json` around canonical `feedback` / `lint:*` / `inspect:*` names, remove replaced aliases, and add a fast-suite test for the command surface. | `step 1: make the local command surface intent-first` |
| 3 | tooling + docs | Add top-level `inspect` as the completion-pass wrapper and update contributor docs to teach the canonical workflow explicitly. | `step 2: teach the implementation feedback loop explicitly` |
| 4 | tooling + docs | Completion inspection pass, fast coverage thresholds, dependency-cruiser rules. | `step 3` through `step 4` + docs commits |
| 5 | docs | Teach the four-level testing workflow: TDD, completion, live I/O, acceptance. | `step 5: teach the four-level testing workflow` |
| 6 | close | Re-run the fast loop and broader inspection command, then close the story. | `close CVx.E3.S6` |

## Tests

1. **Layers touched:**
   - **Unit** / repo-tooling only — one fast-suite test file validating `package.json` script shape.
2. **Events / interactions covered:**
   - canonical scripts exist
   - removed legacy aliases stay absent
   - `pnpm test` carries the extension-coverage minimums directly
   - coverage attached to `pnpm test` stays separate from broader inspect-only coverage
   - `pnpm run inspect` always includes the broader CRAP path and conditionally includes Sonar when configured
   - CRAP analyzers live under `inspect:*` even when `feedback` calls the focused one
3. **Fakes added:** none.
4. **Live tests added / updated:** none.
5. **Deferred:** none for this naming pass.

## Verification

```bash
pnpm test
pnpm run feedback
pnpm run inspect
pnpm run inspect:crap
```

## Key files

- `package.json`
- `tests/unit/package-scripts.test.ts`
- `tests/unit/inspect.test.ts`
- `scripts/inspect.ts`
- `AGENTS.md`
- `README.md`
- `docs/getting-started.md`
- `.github/workflows/ci.yml`
- `.github/workflows/sonarqube-experiment.yml`
