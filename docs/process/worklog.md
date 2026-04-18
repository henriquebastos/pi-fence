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
- Foundational decisions captured in [briefing.md](../project/briefing.md): D1–D8 covering registry-based architecture, hybrid activation (interception + tool), Kroki as default engine, lazy loading, plugin surface via event bus, user ownership of the registry, `FenceProcessor` as the core abstraction, English as the internal language.
- Full roadmap drafted: CV0 (It Works) → CV1 (Take Control) → CV2 (Work Offline) → CV3 (Beyond Diagrams) → CV4 (Platform). Only CV0.E1.S1 is fully specced. The rest are named and sequenced.
- Design principles in [principles.md](../product/principles.md).

No code yet beyond the extension stub. Implementation starts with S1.

Commit: `chore: scaffold repository with docs structure`.
