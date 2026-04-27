[< Docs](../README.md)

# Autonomous implementation loop

This is the operating loop for turning one selected pi-fence story into finished, reviewed, committed work.

The loop has one active scope: **the current epic**. Every story, implementation task, bug, review finding, and dependency created during the loop must be represented as a bean under that epic, directly or through descendants. Chat memory is not state.

## Required skills

Before planning or implementing a story, load and follow these skills:

1. `beans` — source of truth for bean CLI syntax, claiming, dependencies, parent/child relationships, and closure commands. This document defines the repo-specific ledger shape; the skill defines the operating details.
2. `tdd` — source of truth for the red → green → refactor mechanics, vertical tracer bullets, and behavior-focused tests. This document says where TDD fits in the pi-fence loop; the skill says how to execute each cycle.

Do not proceed from memory if either skill has not been loaded in the current session.

## 1. Bean hierarchy

Use beans as the execution ledger.

```text
Epic bean
└── Story bean
    ├── Implementation task bean
    ├── Implementation task bean
    │   └── Smaller task bean, if needed
    └── Inspection finding bean
```

Rules:

1. The **epic bean** is the root for the active workflow.
2. The **story bean** represents the selected roadmap story and is a child of the epic bean.
3. Implementation tasks are children of the story bean or of another task under the same story.
4. Inspection findings are `bug` or `task` beans under the story or the most relevant task.
5. Every task/finding must remain a descendant of the current epic so `beans ready` can show unblocked epic work.
6. Dependencies between beans must be explicit in beans, not implied by ordering in a markdown file.

Definitions:

- **Ready bean**: open, unclaimed, and all dependencies are closed.
- **Blocked bean**: open, but at least one dependency is still open.
- **Claimed bean**: assigned to an agent; other agents should not edit for it.
- **Closed bean**: done, with verification recorded.

## 2. Phase A — Turn story into implementation plan

Input: one selected story.

Goal: create enough bean state that a fresh empty agent session can pick any ready bean and know what to do.

Steps:

1. Create or find the epic bean.
2. Create or find the story bean under the epic bean.
3. Break the story into small vertical slices.
4. Create one self-contained bean per slice.
5. Add dependencies between beans where order matters.
6. Stop planning when each ready bean can be handed to a new agent without chat context.

A good implementation bean includes:

```md
Goal:
What behavior this slice delivers.

Context:
The minimum project/story context a fresh agent needs.

Scope:
What may change.

Out of scope:
What must not change.

TDD plan:
- RED: behavior test to write first
- GREEN: minimal implementation expected to make it pass
- REFACTOR: cleanup to consider after green

Verification:
Targeted command(s) for this bean.

Dependencies:
Beans that must close first.

Stop conditions:
When to stop and ask instead of guessing.
```

Vertical slice rule:

> A task should deliver one narrow behavior through the relevant layers, with its own test and verification. Do not create horizontal tasks like “write all tests” or “implement all config.”

Story file boundary:

1. Story files are reusable specs, not implementation transcripts.
2. Story status values are `Draft`, `Ready`, and `Done`. Do not use `In progress`; active work is represented by claimed/open beans.
3. Once a story is `Ready`, treat the story file as mostly immutable.
4. The story `Plan` section contains acceptance-oriented slices: stable behavior groups tied to user value, not exact TDD order, inspection findings, or implementation task lists.
5. TDD micro-steps, execution order, dependencies, current RED targets, and inspection remediation plans live in beans.
6. After `Ready`, allowed story-file edits are limited to:
   - status changes;
   - correcting a wrong or misleading acceptance criterion;
   - clarifying scope when implementation proves the story was ambiguous;
   - final close status.
7. After `Ready`, do not edit the story file to add TDD micro-steps, track inspection findings, update implementation order, or record discovered cleanup tasks.
8. If implementation discovers a missing behavior:
   - update the story only when the acceptance contract or user-visible promise changes;
   - create or split beans when execution work changes;
   - record what happened in the worklog after the relevant commit exists.
9. At close, actual commands, test counts, Sonar status, commit lists, deviations, and carry-forwards live in bean close reasons and the worklog. The story file only moves to `Done`.

## 3. Phase B — Implementation

Input: one ready, unclaimed bean under the current epic. This includes implementation tasks and inspection finding beans.

Goal: close the bean with a verified commit.

Before editing:

1. State the current **RED target** in chat or progress notes.
2. If the next edit would add more than one failing behavior test, stop and split the edit.
3. If a bean or story-plan row lists multiple behaviors, execute only the first unimplemented behavior, then return to this checklist after green/refactor.
4. If the bean came from inspection, do not treat it as a special "fix mode". It still enters this same TDD micro-loop.

Loop:

1. Pick a ready unclaimed bean.
2. Claim it.
3. Load and follow the TDD skill.
4. Write one behavior test for the vertical slice.
5. Run the targeted command and confirm the test fails for the expected reason.
6. Implement the simplest solution that makes the test pass.
7. Run the targeted command and confirm green.
8. Do not add the next behavior test until the current test is green.
9. Treat steps 4–8 as a hard micro-loop boundary: one RED target, one GREEN fix, then refactor. Do not batch multiple inspection findings or multiple behaviors into one red/green pass.
10. Evaluate the result:

    - if the code is not yet clear, clean, easy to understand, or easy to change, refactor while green;
    - otherwise continue with the next behavior needed by this bean.

11. Repeat red → green → refactor until the bean is done.
12. Run the bean’s verification command(s).
13. Commit the completed bean.
14. Close the bean with the commit hash and verification summary.

Refactor rule:

> Refactoring is not just debt control. Refactor to make the codebase great: clear names, strong seams, simple flow, local reasoning, and easy future change. Never refactor while red.

Commit rule:

1. Commit only one coherent bean or tightly coupled bean group.
2. Use a semantic, why-focused commit message.
3. Include the bean id in the commit message with `#closes <bean-id>`.
4. After committing, close the bean with the commit hash copied from git output.

Example:

```bash
git commit -m "fix(policy): reject blocked processors during resolution #closes PF-123"
beans close PF-123 --reason "Implemented in <commit-hash>; verified with pnpm vitest run tests/unit/resolve.test.ts"
```

## 4. Phase C — Inspection

Input: at least one implementation commit for the current story.

Goal: turn review feedback into more beans, not chat-only notes.

Steps:

1. Run `inspect5p` on the story diff.
2. Inspection agents analyze changes; they do not fix code directly.
3. Phase C is discovery only. Do not edit production code, tests, or docs while still triaging inspection output.
4. Each concrete finding becomes a `bug` or `task` bean under the current epic.
5. Add dependencies if a finding must be fixed before another bean can proceed.
6. If one finding contains multiple independent behaviors, split it into child finding beans before editing. Keep the parent as a tracking bean and close it only after the child beans close.
7. When inspection finishes, return to the ready-bean selection loop. The next edit happens through Phase B, not through a separate inspection-fix mode.

A good inspection finding bean includes:

```md
Source:
inspect5p round N, pass name

Severity:
high | medium | low

Finding:
What is wrong or risky.

Expected closure:
- fix needed
- test needed
- verification command

Parent context:
Story/task/commit this finding relates to.
```

Inspection remediation rules:

1. Every inspection finding is remediated through Phase B.
2. A correctness, regression, safety, privacy, or user-visible behavior finding must start with one RED test that reproduces the finding.
3. A missing-coverage finding starts with one behavior test. If the test is already green, record that it was a coverage-only finding and continue with no production edit unless another RED target is identified.
4. A refactor-only finding starts by naming the preservation target and running the smallest targeted command that characterizes current behavior before editing. Refactor while green, then rerun the same command.
5. A docs/process-only finding may use markdown/link validation instead of a code RED test, but it must not be bundled with behavior or refactor changes.
6. If remediation reveals another behavior, create or split a bean for that behavior. Do not add a second RED target inside the current micro-loop.

Severity rules:

1. `bug`: correctness, regression, safety, privacy, or broken user-visible behavior.
2. `task`: cleanup, missing docs, missing tests, unclear names, process gaps, or maintainability improvements.
3. High/medium findings should be fixed before the story is considered done unless explicitly deferred by the user.

## 5. Phase D — Driver loop

The agent repeatedly selects the next ready bean under the current epic.

```text
story selected
→ create story bean and implementation beans
→ pick ready bean
→ implement with TDD
→ commit and close bean
→ inspect
→ inspection creates more beans
→ pick next ready bean
→ implement finding with the same TDD micro-loop
→ repeat
```

Decision rules after each closed bean:

1. If ready beans exist under the current epic, pick the highest-value unclaimed ready bean and implement it.
2. If no ready beans exist but blocked beans remain, report blockers and stop unless the blocker is resolvable by the agent.
3. If no ready beans or blocked beans remain, run another inspection round for the story.
4. If inspection creates new beans, return to Phase B. Inspection findings do not get a looser fix/refactor/test loop.
5. If inspection creates no beans, the story implementation loop is complete.
6. Stop after 5 inspection rounds for the same story, even if inspection still creates demands; summarize remaining findings and ask the user how to proceed.

## 6. Completion condition

A story is implementation-complete when all are true:

1. Every implementation bean for the story is closed.
2. Every inspection finding bean is closed or explicitly deferred.
3. There are no ready or blocked beans left under the story.
4. The latest inspection round produced no new demand, or the story reached the 5-round inspection limit and the user accepted the remaining state.
5. All required verification commands for the touched surface passed.

Only then move to story-close bookkeeping.
