# CVx.E3.S2 — Architecture map + hotspot inventory

**Status:** Done

**Epic:** [CVx.E3 — Refactor Confidence](cvx-e3--refactor-confidence.md)
**Depends on:** [CVx.E3.S1 — Static confidence gate for refactoring](cvx-e3-s1--static-confidence-gate.md)
**Date:** 2026-04-22 (spec)

## Summary

`CVx.E3.S1` made the fast gate trustworthy. What it did **not** do is make the repository's architecture easy to name.

Today, the intended boundary-injected shape is still partly implicit:

- `extensions/pi-fence/index.ts` is both the default export and a many-jobs orchestration file.
- Production modules still import runtime seams from `tests/utilities/`.
- `extensions/pi-fence/config.ts` mixes ambient Node reads (`fs`, `os.homedir()`, `process.cwd()`) with pure validation/merge logic.
- The render-verifier tooling (`scripts/verify/**`) deliberately reuses test harness pieces, but that coupling is not yet written down as a separate lane from the extension runtime.

Before moving seams (`S3`), shrinking the composition root (`S4`), or polishing internal APIs (`S5`), the repo needs one explicit architecture note that says what is pure, what is an adapter, what is a runtime seam, what the composition root is, and which files are the current hotspots.

This story is documentation-first and intentionally behavior-preserving. It maps the code **before** code moves.

## Done criterion

A contributor returning to pi-fence can read one architecture note and orient without guessing.

1. A new durable note exists at `docs/project/architecture.md`, adjacent to the roadmap rather than buried in a story file.
2. That note defines the vocabulary this Epic uses consistently: **pure module**, **adapter**, **runtime seam**, **composition root**, and **hotspot**.
3. The note classifies the current extension-runtime modules (`extensions/pi-fence/*.ts`) by responsibility and boundary type.
4. The note explicitly distinguishes the **extension runtime lane** from the **repo-tooling / verifier lane** so later seam-promotion work (`S3`) does not accidentally absorb scripts whose coupling is intentional and local to developer tooling.
5. The note contains a named hotspot inventory with, at minimum:
   1. `extensions/pi-fence/index.ts` as the orchestration hotspot / future thin composition root target.
   2. Production imports from `tests/utilities/` as the runtime-seam placement hotspot.
   3. `extensions/pi-fence/config.ts` as the mixed ambient-I/O + pure-validation hotspot.
   4. Any repo-tooling couplings that matter to refactor planning (for example `scripts/verify/**` depending on `tests/utilities/**`), clearly marked as tooling-lane concerns rather than extension-runtime blockers.
6. The note names which later story owns each follow-through: `S3` for production-owned seams, `S4` for the thin composition root, `S5` for internal API/naming cleanup.
7. No production code moves in this story. The output is architectural clarity, not implementation.
8. `pnpm run verify:fast` is green at close.

## Scope

**In scope:**

- A new durable architecture note at `docs/project/architecture.md`.
- A current-state module map for the extension runtime (`extensions/pi-fence/*.ts`).
- A smaller, clearly-separated map for repo tooling only where it affects the refactor plan (`scripts/verify/**`, `scripts/render-verify.ts`, `scripts/render-gallery.ts`).
- A hotspot inventory tied explicitly to `CVx.E3.S3`–`S5`.
- Discoverability links from the nearest navigation surfaces (`docs/README.md` and `cvx-e3--refactor-confidence.md`).
- A small amount of evidence-gathering from the current tree (`rg`, `wc -l`, import census) if needed to keep the note factual.

**Out of scope:**

- Moving `HttpClient`, `ShellRunner`, or `Logger` out of `tests/utilities/`.
- Splitting `extensions/pi-fence/index.ts` yet.
- Renaming modules or changing import graphs for elegance.
- Adding lint rules or CI enforcement for the architecture map. This story names the rules; a later story may automate them.
- Whole-repo cataloguing of every test helper, fixture, or script unrelated to the refactor plan.
- User-facing behavior changes.

## Approach

Write down the **current truth** and the **intended direction** separately.

The architecture note should not pretend the code is already where `CVx.E3` wants it to be. It should say, plainly:

1. What each production module currently owns.
2. Which modules are pure and can stay direct.
3. Which files are adapters sitting at environment boundaries.
4. Which runtime seams exist today, even if they are still misplaced under `tests/utilities/`.
5. Where the composition root currently begins and where it has grown too wide.
6. Which couplings belong to developer tooling rather than the extension runtime.
7. Which next story owns each cleanup.

The note is a map for refactoring, not an aspirational essay.

## Plan

### Deliverables

#### 1. `docs/project/architecture.md` — durable architecture note

Create a new project-level note, linked from `docs/README.md`, with at least these sections:

1. **Vocabulary** — define pure module, adapter, runtime seam, composition root, hotspot.
2. **Current extension-runtime map** — one table naming each `extensions/pi-fence/*.ts` module, its responsibility, and its architectural category.
3. **Runtime seam inventory** — name `HttpClient`, `ShellRunner`, and `Logger`, where they live today, where `CVx.E3` intends them to live, and which files currently consume them.
4. **Hotspot inventory** — one row per hotspot with: file(s), why it is hot, what is intentionally *not* fixed in S2, and which later story owns the move.
5. **Repo-tooling lane** — concise note on how `scripts/verify/**` and related tooling fit into the architecture without being mistaken for extension-runtime composition.
6. **Refactor sequence** — short section mapping S3/S4/S5 to the hotspots they resolve.

A Mermaid diagram is welcome if it clarifies the lanes faster than prose.

#### 2. Current-state module classification, not aspiration

The note should classify the current production modules with concrete labels. Expected shape:

- **Pure modules** — `parser.ts`, `resolve.ts`, `list.ts`, and any other file whose logic is boundary-free and directly testable.
- **Boundary contracts / types** — `processor.ts` and any small types-only files that define what adapters plug into.
- **Adapters** — `kroki.ts`, `graphviz-local.ts`, `renderer.ts`, and the runtime-reading parts of `config.ts`.
- **Composition root / orchestration hotspot** — `index.ts`.
- **Mixed-concern hotspot** — `config.ts`, unless the evidence gathered says another label is more truthful.

If the census reveals a better classification than the list above, prefer the truthful one and record the reason in the note.

#### 3. Hotspot inventory with explicit ownership by later stories

At minimum, the hotspot table should cover:

1. **`extensions/pi-fence/index.ts`** — why it is currently both composition root and orchestration hotspot; what `S4` should leave behind.
2. **Production imports from `tests/utilities/`** — why they obscure the architecture; what `S3` will promote into production-owned seams.
3. **`extensions/pi-fence/config.ts`** — what is pure versus what is ambient/runtime-bound; which later move should separate those concerns.
4. **Verifier/test-harness couplings** — which script-side imports from `tests/utilities/` are tooling-lane realities, not extension-runtime defects.

This inventory is the load-bearing part of the story. If later cleanup work is not obviously traceable back to these rows, S2 did not map the terrain precisely enough.

#### 4. Discoverability links

Update the nearest docs entry points so the architecture note is easy to find:

- `docs/README.md`
- `docs/project/roadmap/cvx--verifiability/cvx-e3--refactor-confidence.md`

The epic file should stop referring to an architecture map only in abstract; it should point at the concrete note once it exists.

#### 5. No code moves, no rule enforcement yet

S2 names the architecture and hotspots. It does **not** also start moving seams or splitting modules just because the map made those moves obvious.

That boundary is the whole value of the story: make the later refactors smaller because the thinking is already written down.

### Implementation order

Atomic green commits only.

| Step | Layer | What | Commit |
|------|-------|------|--------|
| 1 | spec | Create the S2 story file and link it from `cvx-e3--refactor-confidence.md`. | `spec CVx.E3.S2` |
| 2 | docs | Write `docs/project/architecture.md` and add the discoverability links from `docs/README.md` + the CVx.E3 epic file. No production code moves. | `step 1: map the current architecture before moving seams` |
| 3 | close | Mark S2 done in the roadmap/worklog and carry the hotspot ownership forward to S3–S5. | `close CVx.E3.S2` |

## Tests

1. **Layers touched:**
   - No new test layer is introduced.
   - Existing fast-suite + docs gates rerun as regression protection for this docs-only story.

2. **Events / interactions covered:**
   - The new architecture note is linked and discoverable.
   - The architecture/hotspot claims are checked against the current tree before close.
   - No accidental production-code moves land under the cover of a docs story.

3. **Fakes added:**
   - None.

4. **Live tests added / updated:**
   - None.

5. **Deferred:**
   - Automated enforcement of the architecture rules (for example dependency-cruiser or targeted lint rules).
   - Production-owned seam promotion (`S3`).
   - Thin composition-root extraction (`S4`).
   - Internal API and naming cleanup (`S5`).

## Verification

### Gate

Minimum close gate:

```bash
pnpm install
pnpm run verify:fast
```

Expected:

1. `pnpm run verify:fast` exits 0.
2. The diff for the story is documentation-only.
3. The architecture note gives a concrete answer to "what is pure / what is an adapter / where are the seams / what is the composition root / what are the hotspots?"

### Prerequisites

Normal contributor setup only.

```bash
pnpm install
```

No Docker requirement. No network requirement beyond dependency installation.

### Automated tests

```bash
pnpm run verify:fast
```

No new test files are expected for S2. The value is in a truthful architecture note plus the unchanged fast gate staying green.

### Manual test script

#### 1. The architecture note exists and is linked

```bash
rg -n "architecture\.md|Architecture" docs/README.md docs/project/roadmap/cvx--verifiability/cvx-e3--refactor-confidence.md docs/project/architecture.md
```

Expect:

- `docs/project/architecture.md` exists.
- `docs/README.md` links to it.
- `cvx-e3--refactor-confidence.md` points at it explicitly.

#### 2. The vocabulary is explicit

Open `docs/project/architecture.md` and confirm it defines, in visible headings or a table, the terms:

- pure module
- adapter
- runtime seam
- composition root
- hotspot

A later cleanup story should be able to quote those terms verbatim rather than invent its own synonyms.

#### 3. The seam inventory matches the current tree

Run:

```bash
rg -n 'from "\.\./\.\./tests/utilities/' extensions/pi-fence scripts
```

Expect every extension-runtime hit to be accounted for in the architecture note's seam/hotspot inventory, and any script-side hits to be called out as tooling-lane couplings rather than mixed into the extension-runtime map.

#### 4. The orchestration hotspot is named concretely

Run:

```bash
wc -l extensions/pi-fence/index.ts extensions/pi-fence/config.ts extensions/pi-fence/renderer.ts
```

Expect the note to explain why `index.ts` is the composition-root hotspot today and why `config.ts` is a mixed-concern file worth separating later, rather than merely listing filenames without rationale.

#### 5. The story stayed in bounds

Run:

```bash
git diff --stat -- docs/README.md docs/project docs/process/worklog.md
```

Expect a docs-only diff. No production `.ts` file should have moved in S2.

### Rollback

S2 is internal documentation only. If the note is wrong or unhelpful, revert the docs commits and the repository returns to the pre-story state immediately.

```bash
git revert <sha>
```

No runtime migration, fixture refresh, or user-facing rollback path is needed.

## Key files

**Modified:**

- `docs/project/roadmap/cvx--verifiability/cvx-e3--refactor-confidence.md` — link S2 and point at the architecture note.
- `docs/README.md` — add the architecture note to the project docs index.
- `docs/project/architecture.md` — new durable architecture map.
- `docs/process/worklog.md` — S2 close entry.
- Roadmap/CVx/story statuses at close.

**New:**

- `docs/project/architecture.md`

## Out of scope — explicitly

- Promoting `HttpClient`, `ShellRunner`, or `Logger` into production code.
- Splitting `extensions/pi-fence/index.ts` into smaller modules.
- Changing any import path in production code.
- Adding new commands, processors, configuration knobs, or rendering behavior.
- Adding dependency-graph enforcement tooling in the same story.
- Renaming modules for aesthetics without a hotspot-driven reason.
