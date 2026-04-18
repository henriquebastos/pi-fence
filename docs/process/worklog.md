[< Docs](../README.md)

# Worklog

What was done, what's next. Updated each session. Dated entries are chronological — oldest first, newest appended at the bottom.

## Current focus

**[CV0.E1 — Kroki Through The Wire](../project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/README.md)**.

## Next

Implement [CV0.E1.S1 — Mermaid via Kroki](../project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s1-mermaid-via-kroki/plan.md).

Follow the plan step by step. Each step is its own commit. Tests pass on every commit. Run the manual test guide at the end.

---

## Done

### 2026-04-18 — Repository scaffold

Created `~/me/oss/pi-fence/` with:

- Top-level project files: `README.md`, `CHANGELOG.md`, `LICENSE` (MIT), `package.json`, `tsconfig.json`, `.gitignore`.
- Extension stub at `extensions/pi-fence/index.ts` (exports default function, no logic — logic lands in S1).
- Docs tree inspired by Alisson Vale's [mirror-mind](https://github.com/alissonvale/mirror-mind) convention: Community Value → Epic → Story, with breadcrumbs and `README.md` as folder index. Dated logs (worklog, decisions) are chronological ascending so every update is an append at the end of the file.
- Foundational decisions captured in [briefing.md](../project/briefing.md): D1–D8 covering registry-based architecture, activation strategy, Kroki as default engine, lazy loading, plugin surface via event bus, user ownership of the registry, `FenceProcessor` as the core abstraction, English as the internal language. (D2 was later revised from hybrid to interception-only — see the 2026-04-18 decision entry.)
- Full roadmap drafted: CV0 (It Works) → CV1 (Take Control) → CV2 (Work Offline) → CV3 (Beyond Diagrams) → CV4 (Platform). Only CV0.E1.S1 is fully specced. The rest are named and sequenced.
- Design principles in [principles.md](../product/principles.md).

No code yet beyond the extension stub. Implementation starts with S1.

Commit: `chore: scaffold repository with docs structure`.

### 2026-04-18 — pnpm + link checker

Adopted pnpm as the package manager (matching the sibling agent-tools monorepo where pi-graphviz and pi-charts live). Pinned via `packageManager: pnpm@10.33.0`.

Added `scripts/check-links.ts` — validates internal markdown links and heading fragments across the docs tree. Runs via `pnpm run check` (umbrella) or `pnpm run check:links` (specific).

First run caught a latent bug: several `#fragment` links in the roadmap and Epic docs were pointing to valid slugs, but my earlier inline Python validator had a path-normalization bug (keys prefixed with `./`) that silently skipped fragment checks. The TypeScript script is stricter and uses absolute paths throughout. Its slugifier also matches GitHub's real behavior (per-space hyphen, not collapsed whitespace), so double-hyphen slugs like `cv1--take-control-control` resolve correctly.

Updated `docs/product/principles.md`, S1's plan and test-guide to use `pnpm` commands. The `pnpm run check` step is now part of S1's verification list.

Commits: `wip(agent): adopt pnpm as package manager`, `wip(agent): add link checker script and wire pnpm run check`.

### 2026-04-18 — markdownlint-cli2

Added markdownlint-cli2 for structural markdown linting (complements our link checker, doesn't replace it). Config philosophy: start from defaults, disable only rules we actively fight.

Disabled: MD013 (line length), MD033 (inline HTML), MD034 (bare URLs), MD041 (first-line heading — our breadcrumb convention puts a link before the H1), MD060 (table column style — our tables are readable in source without column alignment).

Configured: MD029 (`ordered` sequential numbering, not all-ones), MD046 (`fenced` only).

First run surfaced 127 issues across all files. Auto-fix handled most (blank lines around lists and fences). Two MD040 violations (fenced blocks without a language tag) were ASCII-art diagrams in the Epic spec; tagged them as `text`. Final state: 0 violations, `pnpm run check` green.

Also updated `docs/product/principles.md` to reference the new check script.

Commits: `wip(agent): add markdownlint-cli2 with minimal config`, `wip(agent): fix markdown lint violations surfaced by initial run`.
