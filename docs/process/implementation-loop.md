[< Docs](../README.md)

# Implementation loop

Operational workflow for one pi-fence story. This doc complements the high-level rules in [Principles](../product/principles.md) and the contributor index in [AGENTS.md](../../AGENTS.md).

## Goal

Keep implementation, review, and commit history finite and auditable:

1. Work one roadmap story at a time.
2. Drive behavior with the TDD skill and red-green-refactor tracer bullets.
3. Track implementation work in beans before coding starts.
4. Track review findings in beans instead of chat memory.
5. Run inspect5p as a gate on a stable diff, not as an unbounded development loop.
6. Commit only when the story diff and bean ledger are reconciled.

## Terms

- **Story**: a roadmap story file under `docs/project/roadmap/**/cv*-e*-s*--*.md`.
- **Story bean**: a beans item of type `story` that mirrors the active roadmap story.
- **Implementation bean**: a child `task` bean created from the story's execution plan before coding starts.
- **Finding bean**: a child `bug` or `task` bean created from a review, inspect5p, or verification finding.
- **Stable diff**: the implementation is believed complete, local gates pass, and no known finding remains untriaged.
- **Gate**: a command or review whose result decides whether work may be committed.

## Required skills

Load and follow these skills before planning or coding implementation work:

1. `tdd` — drives behavior with red-green-refactor tracer bullets.
2. `beans` — keeps the story, implementation tasks, findings, blockers, and deferrals in the project ledger.

The `tdd` skill's constraints are part of this loop:

1. Plan behavior before code.
2. Work in vertical tracer bullets.
3. Write one failing behavior test.
4. Implement the smallest green change.
5. Refactor only while green.
6. Repeat one behavior at a time.

The `beans` skill's constraints are part of this loop:

1. Create or claim the story bean before implementation planning.
2. Turn the story execution plan into self-contained implementation beans before coding.
3. Claim a bean before editing for it.
4. Add review, gate, and blocker findings as child beans.
5. Close beans only with a verification note or explicit deferral rationale.

Do not switch to horizontal slicing: avoid writing many tests first and then filling in all implementation later. Do not track implementation or review state only in chat memory.

## Setup for a story

Start only from a clean worktree unless the user explicitly asks to resume existing uncommitted work.

1. Read the story file and nearest completed story in the same area.
2. Set the story metadata to `**Status:** In progress` when implementation starts.
3. Create or claim the story bean:

   ```bash
   beans create "CV9.E1.S1 placement precedence tracer bullet" --type story
   beans claim <story-id> --actor <name>
   ```

4. Translate the story's `Plan` into detailed, self-contained implementation beans before coding. Each implementation bean should describe one coherent behavior slice that can be picked up without reading chat history and completed through one or more red-green-refactor cycles.

   ```bash
   beans create "Add placement-aware resolver tests" --parent <story-id> --body "Goal: prove placement order selects the winning processor.
   Scope: tests/unit/resolve.test.ts and resolver behavior only.
   Red test: host before remote selects graphviz-host for dot.
   Verification: pnpm vitest run tests/unit/resolve.test.ts"

   beans create "Gate disabled processor side effects" --parent <story-id> --body "Goal: disabled or omitted placements do not run I/O probes.
   Scope: startup probes, Docker Kroki auto-start, dynamic registration.
   Red tests: extension/register tests assert fake shell/available() are not called.
   Verification: pnpm vitest run tests/unit/register.test.ts tests/extension/pi-fence.test.ts"
   ```

5. Use dependencies when one implementation bean must finish before another:

   ```bash
   beans dep add <blocker-task-id> <blocked-task-id>
   ```

6. Do not duplicate every mechanical checklist item from the story file. Create beans for executable implementation slices, review findings, blockers, and explicit deferrals.
7. If the story plan changes, update the story file and then update the implementation beans before coding around the new plan.

## TDD step loop

Use this loop for each ready implementation bean. Keep the `tdd` and `beans` skills active for every cycle.

1. Pick the next ready implementation bean.
2. Confirm the bean names observable behavior, public interface, red test, scope, and verification. Update the bean before coding if any of those are missing.
3. Claim it before editing:

   ```bash
   beans claim <task-id> --actor <name>
   ```

4. Write one failing behavior test first.
5. Run the smallest targeted command that proves the red state.
6. Implement the smallest green change.
7. Refactor while tests stay green.
8. Run targeted tests again.
9. Update docs/spec only when behavior or workflow changed.
10. Close the implementation bean only after verification is recorded.

Example closure note:

```bash
beans close <task-id> --reason "Added resolver precedence tests; pnpm vitest run tests/unit/resolve.test.ts passed"
```

## Local gates before review

When the TDD session feels complete, run the project gates appropriate to the touched surface.

1. Always run the fast gate:

   ```bash
   pnpm run feedback
   ```

2. Run completion inspection when the implementation feels done:

   ```bash
   pnpm run inspect
   ```

3. Run live I/O gates when adding or changing a processor, I/O seam, live fixture, or renderer golden:

   ```bash
   pnpm test:live
   pnpm run render:verify
   ```

4. If a gate fails, create or update finding beans for non-trivial failures before continuing. These findings are added to the same story ledger as the implementation beans.

## inspect5p gate

Run inspect5p only when the diff is stable enough to review as a candidate commit.

1. Run one 5-pass inspection.
2. Convert every concrete finding into a new child bean before fixing more code. Review findings add to the story ledger; they do not replace the original implementation beans.
3. Use `bug` for correctness, safety, privacy, or regression findings.
4. Use `task` for docs, test gaps, cleanup, or process findings.
5. Attach finding beans to the active story bean.

Finding bean body template:

```text
Source: inspect5p run <n>, <pass name>
Severity: high|medium|low
Refs:
- path/to/file.ts:123

Finding:
<copy or summarize the reviewer finding>

Expected closure:
- fix:
- test:
- verification:

Disposition:
open|fixed|deferred|accepted
```

## Finding closure loop

Do not rerun inspect5p immediately after each individual fix. First reconcile the whole ledger from the previous run.

1. List open children for the story.
2. Group findings by cause, not by symptom.
3. Fix the whole class of issue.
4. For behavior changes, add or adjust tests before or with the fix.
5. Run targeted tests while iterating.
6. Close each finding bean with the verification command that proved closure.
7. Defer only with an explicit reason and follow-up location.

Useful commands:

```bash
beans show <story-id>
beans list --status open
beans ready
beans close <finding-id> --reason "Fixed by <change>; verified with <command>"
```

## Rerun rule

A second inspect5p run is allowed when all findings from the previous run are reconciled:

1. High and medium findings are fixed or explicitly deferred with rationale.
2. Low findings are fixed, deferred, or accepted as non-blocking.
3. Targeted tests for touched areas pass.
4. `pnpm run feedback` passes after the closure batch.
5. The finding ledger has no untriaged open item from the previous run.

For doc-only or narrow wording fixes after a clean review, prefer targeted checks such as `pnpm run lint:markdown` and `git diff --check HEAD` instead of another full inspect5p run.

## Commit boundary

Before committing a story step:

1. Confirm the ledger:

   ```bash
   beans show <story-id>
   beans list --status open
   ```

2. Confirm gates:

   ```bash
   pnpm run feedback
   git diff --check HEAD
   ```

3. Confirm additional gates required by the touched surface were run.
4. Commit one coherent step with the repository's commit-message convention.
5. Do not write worklog or changelog entries that reference the commit until the commit exists.

## Close boundary

Close a story only after its implementation commits exist and the worktree is clean, except for the closing docs commit.

1. Run the required completion/acceptance gates for the story and epic.
2. Set story status to `Done`.
3. Update parent roadmap status files.
4. Append the worklog entry with real commit SHAs copied from `git log`.
5. Update `CHANGELOG.md`, `README.md`, and `docs/getting-started.md` if user-visible behavior changed.
6. Close the story bean with the verification summary.

## Anti-loop rules

1. Never start coding before loading the `tdd` and `beans` skills and representing the story plan as implementation beans.
2. Never batch many tests ahead of implementation; keep tracer bullets vertical.
3. Never use inspect5p as the primary implementation driver.
4. Never rerun inspect5p while previous findings are still untriaged.
5. Never fix only the named file when the finding describes a class of issue.
6. Never rely on chat memory for implementation or review closure; put both in beans.
7. Never let a review finding silently widen story scope. Update the story plan, add implementation/finding beans, or create a follow-up.
8. Never commit with open high or medium finding beans unless the user explicitly accepts the deferral.
