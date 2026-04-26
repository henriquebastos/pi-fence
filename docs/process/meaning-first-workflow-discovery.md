[< Docs](../README.md)

# Meaning-first workflow discovery

**Date:** 2026-04-26
**Status:** Historical note

This note records a design conversation about how planning should work in this project. It is not a new process specification yet. It captures the conceptual shift we reached together so it can be shared, challenged, and later turned into operating rules.

## Starting point

The conversation began with a comparison between two planning styles:

1. A PRD-style workflow that turns current context into a GitHub issue.
2. This repo's CV/Epic/Story workflow, which turns value into roadmap files, story specs, tests, verification, commits, and worklog entries.

The existing repo workflow has value: it preserves intent, forces tests into the plan, keeps history auditable, and gives future contributors a map. But it also risks becoming ceremonial. The central concern was not whether CVs, Epics, or Stories are useful; it was whether the workflow sometimes forces shape before meaning is clear.

## What we discovered

The important unit is not a template. The important unit is a coherent meaning.

Planning should not be understood as:

```text
fill CV template → fill Epic template → fill Story template → code
```

It should be understood as semantic navigation:

```text
collapsed unclear thing
→ expand into visible parts
→ collapse parts into meaningful units
→ rebalance the tree
→ choose the next movement
→ repeat until some unit is executable
```

CV, Epic, Story, Step, test, commit, and worklog entry are names for possible units in that tree. They are useful only when they improve memory, communication, commitment, or execution.

## The first phase: ideation

The preferred starting mode is exploratory ideation.

A hunch begins collapsed and ill-defined. The human states a problem, concern, irritation, attraction, or intuition. The assistant interviews the human, often through a `grill-me` style conversation. This phase is intentionally loose:

1. The human thinks by speaking.
2. The conversation can wander.
3. The human may change their mind.
4. The assistant asks, reflects, challenges, and synthesizes.
5. The goal is not to plan implementation.
6. The goal is to make the hunch's boundary visible.

Useful outputs from this phase are problem descriptions, vocabulary, boundaries, tensions, open questions, and candidate units of value. They are not necessarily roadmap commitments.

## Broad and focused ideation

Ideation can produce different shapes.

### Broad ideation

Sometimes understanding is unclear and the ideas are broad, uneven, and mixed. The conversation produces actions, concepts, deliverables, worries, code changes, principles, and future possibilities all at once.

In that case, forcing CV/Epic/Story too early is harmful. The better move is to cluster the material into rough value-bearing units that can be remembered without committing to delivery.

A possible name for this is a **Value Sketch**: a rough cluster of related value, insight, or future direction. It is CV-like, but not yet a roadmap CV.

### Focused ideation

Sometimes the idea is already sharp. The conversation may produce a refined value outcome, a concrete capability, or even an executable story.

In that case, the workflow should not require unnecessary levels. A focused bug or small feature may move directly from hunch to Story or implementation slice. A larger focused idea may become a CV with Epics and Stories.

The rule is: use the smallest artifact that preserves meaning.

## The expand/collapse movement

The conversation arrived at a deeper model: planning is a succession of expansion and collapse movements.

A hunch is collapsed. Conversation expands it. Expansion exposes many parts. Those parts must then be collapsed into meaningful groups. Each group can then be expanded again. This movement happens top-down and bottom-up.

Example:

```text
1 vague concern
→ many observations
→ several clusters
→ one selected cluster
→ internal parts of that cluster
→ one executable slice
```

The reverse movement is just as important:

```text
many implementation actions
→ one story
→ several related stories
→ one epic
→ one value outcome
```

This is not a one-way path from abstract to concrete. Concrete details can reveal a higher-level unit. A set of code changes can expose a story. A set of stories can reveal an epic. Several epics can reveal a CV.

## Units and levels

A **unit** is a coherent thing we can name, inspect, discuss, remember, or execute.

A **level** is relative, not absolute:

1. A higher-level unit explains why lower-level parts belong together.
2. A lower-level unit explains what composes or realizes a higher-level unit.

For example:

```text
CV: Processor Policy
└── Epic: Policy-driven Resolution
    └── Story: Object bindings and ambiguity
        ├── Test: string bindings are invalid
        ├── Test: placement binding cannot bypass precedence
        ├── Code: TagBinding type
        └── Code: resolver constraint logic
```

But that same structure might be discovered from the bottom up by first noticing related tests and implementation actions.

## Rebalancing

Rebalancing is the meaning-level equivalent of refactoring.

In TDD, each green state invites a refactor question: should the code be reshaped before the next test? The same pattern applies to planning. Every stable state invites a rebalance question: should the meaning tree be reshaped before the next movement?

Rebalancing can happen after any movement:

1. After an interview synthesis.
2. After naming concepts.
3. After clustering ideas.
4. After drafting a Value Sketch.
5. After promoting something to a CV.
6. After splitting an Epic into Stories.
7. After a failing test clarifies behavior.
8. After green code changes the design.
9. After closing a story.

Rebalancing asks:

1. Is this one thing or many?
2. Does the name still fit?
3. Are children at the same kind of level?
4. Is an important unit missing?
5. Is anything here present only because ceremony demanded it?
6. Should we split, merge, rename, promote, demote, park, or discard something?

## The movement router

After each stable state, the workflow needs a way to decide where to move next. Four movements are available.

### Expand sideways

Stay at the same level and look for more siblings.

Use this when the current set feels incomplete.

Example:

```text
We listed what we like about the current workflow.
Now list worries, dislikes, and non-negotiables at the same level.
```

### Zoom in

Select one unit and expand its internals.

Use this when a unit is coherent but still too opaque to act on.

Example:

```text
"Value Sketch" sounds useful.
Now define its sections, lifecycle, and promotion rules.
```

### Zoom out / collapse upward

Look at several units and create a parent meaning.

Use this when multiple concrete things appear to be examples of a larger thing.

Example:

```text
- CVs sometimes act as parking lots.
- Story specs sometimes force commitment too early.
- Worklog updates preserve memory but add ceremony.

Collapse upward:
The workflow is mixing artifact roles: memory, commitment, execution, and history.
```

### Park / defer

Keep a unit, but remove it from the active path.

Use this when the unit is valuable but not part of the current movement.

Example:

```text
A future idea about generating worklogs from Git history may be worth keeping,
but it should not distract from redesigning the planning workflow now.
```

Rebalancing is not a fifth movement. It is the inspection/refactor step after any movement.

## Semantic tests

The movement router is guided by semantic tests.

### Peer test

Are these items the same kind of thing?

Mixed example:

```text
- improve story template
- user control
- update AGENTS.md
- verifiability
```

These are mixed levels: action, value, file edit, quality. They should be rebalanced before moving on.

### Parent test

Can we name why these things belong together?

If yes, collapse upward.

### Child test

Can we explain what realizes this unit?

If no, zoom in.

### Affordance test

Does this unit suggest a next action?

If no, rename, split, or rebalance.

### Commitment test

Are we ready to treat this as delivery work?

If no, keep it as a sketch, note, or parking-lot item. If yes, promote it toward roadmap or execution.

### Beauty test

Does the structure feel inevitable, cohesive, and clear, or bureaucratic?

If a file exists only because the process demands it, the structure is suspect. If the file preserves a meaningful distinction, it earns its place.

## Artifact roles

A better workflow should classify artifacts by role before classifying them by template.

| Role | Purpose | Possible artifact |
|------|---------|-------------------|
| Exploration | Make an unclear hunch visible | Conversation synthesis, concept note |
| Memory | Preserve valuable but uncommitted ideas | Value Sketch, parking lot |
| Commitment | Declare a value outcome worth pursuing | CV |
| Delivery grouping | Organize a cohesive capability or strategy | Epic |
| Execution | Define a verifiable implementation slice | Story |
| Proof | Show that behavior works | Tests, verification commands |
| History | Preserve what actually happened | Worklog, changelog |

The artifact should follow the role. The role should not be invented to justify the artifact.

## Reinterpreting CV, Epic, and Story

CV, Epic, and Story remain useful if treated as semantic roles rather than ceremonies.

### CV

A CV is a unit whose cohesion is primarily value:

```text
This creates a recognizable kind of value.
```

A CV answers:

1. What higher-level result matters?
2. Why is this worth pursuing?
3. What kind of value is it?
4. What would make the value feel realized?

### Epic

An Epic is a unit whose cohesion is primarily capability, strategy, or system shape:

```text
These changes belong together because they build one capability.
```

An Epic answers:

1. What capability are we constructing?
2. What concepts, modules, or interactions belong together?
3. What smaller deliverables compose it?
4. What would make this capability complete enough?

### Story

A Story is a unit whose cohesion is primarily execution:

```text
This is a verifiable slice we can implement and close.
```

A Story answers:

1. What changes?
2. What is in scope and out of scope?
3. What proves it works?
4. What is the implementation path?
5. What verification closes it?

## The principle we reached

The central principle is:

> Planning is alternating expansion, coherence testing, and rebalancing. Artifacts are named compressions of understanding. They should be created only when they improve shared reasoning, memory, commitment, execution, or history.

A shorter form:

> Workflow is semantic navigation, not ceremony.

## What this implies for the repo

This historical note does not yet prescribe changes, but it suggests likely directions:

1. Add an exploratory artifact before roadmap commitment, probably a Value Sketch or concept note.
2. Keep the roadmap for committed or likely delivery units, not every useful thought.
3. Let focused work skip unnecessary hierarchy when the meaning is already clear.
4. Make rebalancing explicit at every stable state, not only after implementation.
5. Define promotion rules from hunch to sketch, sketch to CV, CV to Epic, Epic to Story, and Story to steps.
6. Treat CV/Epic/Story as semantic roles with clear cohesion tests.
7. Preserve the current workflow's strengths: tests, verification, history, and explicit done criteria.
8. Remove or relax ceremony that does not improve meaning.

## Open questions

1. Should Value Sketch become a real repo artifact?
2. Where should sketches live: `docs/project/sketches/`, `docs/process/`, GitHub issues, or elsewhere?
3. Should every CV start as a sketch, or only broad/uncertain work?
4. Should the roadmap contain only committed work?
5. Can a Story exist without a CV/Epic wrapper for small focused changes?
6. What is the minimum useful shape for a Story when work is obvious?
7. How should the worklog change if history should record what happened without creating too much ceremony?

## Why this note exists

This note preserves the path of understanding, not just the conclusion. The path matters because the conclusion came from noticing a recurring motion:

```text
hunch → expansion → collapse → rebalance → movement choice
```

That motion is fractal. It applies to conversations, product value, roadmap structure, stories, tests, code, commits, and documentation.

The next step is to test this model against real project work, then decide which parts should become operating instructions.
