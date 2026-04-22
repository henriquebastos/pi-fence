# CVx.E4 — Quality Analyzers

**Roadmap:** [CVx](../README.md)
**Last updated:** 2026-04-22 — S1 Done, S2 Done, S3 Ready

`CVx.E3` made the architecture explicit and reduced the main runtime hotspots. The next confidence step is to encode those boundaries in tools that catch drift automatically.

This Epic adds two complementary analyzers:

1. an enforced architectural analyzer for import/layer rules
2. a non-blocking SonarQube experiment to evaluate whether its broader signal is worth adopting later

The order is deliberate. Architectural rules should become executable first. Broader code-quality reporting can follow as an experiment once the repo already knows how to reject the highest-value structural regressions.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cvx-e4-s1--dependency-cruiser-boundaries.md) | **Architectural import boundaries are enforced automatically with dependency-cruiser** | ✅ Done |
| [S2](cvx-e4-s2--sonarqube-experiment.md) | **SonarQube runs as a non-blocking experiment so we can judge its signal before adopting any gate** | ✅ Done |
| [S3](cvx-e4-s3--sonar-report-pipeline-cleanup.md) | **The Sonar report pipeline is readable enough that its own findings are signal, not self-noise** | Ready |

## Deliverable vision (epic scope)

A contributor changes pi-fence's architecture and gets fast, specific feedback when they accidentally violate the repo's intended shape.

1. Production runtime code cannot import from `tests/**`.
2. The extension runtime lane and tooling/test lanes have explicit, machine-checked boundaries where that pays its way.
3. A SonarQube experiment produces a report the team can inspect without turning generic smell counts into mandatory churn.
4. Future adoption decisions are evidence-based: architectural rules are enforced because they are high-signal; broader analyzers are adopted only if their findings are worth the maintenance cost.

## Why this Epic is earned now

Three things changed in `CVx.E3`:

1. Runtime seams are production-owned.
2. `index.ts` is now a composition root instead of a structural hotspot.
3. Internal names now match the architecture note.

That means the repo can finally encode meaningful structure without first fighting its own transitional shape.

## Architectural stance

This Epic is not a style crusade.

1. Enforce the repo's actual boundary rules first.
2. Prefer analyzers that catch accidental coupling over analyzers that produce cosmetic churn.
3. Treat SonarQube as an experiment until its signal-to-noise ratio is proven in this repo.
4. Keep contributor workflow simple: high-signal checks may join the normal gate; exploratory reporting should not block unrelated work.

## Out of scope — explicitly (epic-level)

- A broad style-heavy ESLint migration.
- Adopting every SonarQube default rule as policy.
- Replacing the existing fast gate with a large analyzer stack all at once.
- Multi-tool churn that touches the repo more than the actual rules justify.

## Done criterion (epic-level)

The Epic is done when the following are true together:

1. `dependency-cruiser` enforces at least the repo's highest-value architectural rule: no production imports from `tests/**`.
2. Any additional dependency rules adopted in the same story are documented and clearly tied to the architecture note.
3. SonarQube can run against the repo in a documented, reproducible, non-blocking way.
4. The SonarQube story closes with an explicit judgment about what was useful, what was noisy, and what — if anything — should become policy later.
5. The roadmap/worklog describe these analyzers as evidence-backed tooling, not as aspirational garnish.
