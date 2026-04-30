# CV11 — Trust Boundaries

> npm-installed pi-fence is safe and predictable across config, plugin, render, artifact, and TypeScript boundaries.

**Type:** `control`
**Status:** In progress

This CV turns the read-only TypeScript architecture review into ordered, implementable work. The theme is trust: users can install pi-fence from npm, configure endpoints intentionally, accept semi-trusted processors without letting malformed plugin objects corrupt runtime state, and rely on the same quality gates for tooling that the extension runtime already has.

This CV intentionally does **not** remove user control. Project-local Kroki endpoints remain allowed; the work here validates and diagnoses them instead of banning them.

This CV is done when every Story in its Epics is done.

## Execution order

The order is deliberate:

1. **Installed runtime trust** first, because npm installs must not depend on source-checkout-relative assets or accidentally publish local services broadly.
2. **Source-retention decision** before message/result refactors, because the persistence model determines what output details should carry.
3. **Explicit runtime model** before plugin/result hardening and render limits, because a resolved policy object and explicit output union reduce churn in later stories.
4. **Semi-trusted processors** once result normalization has a stable domain shape.
5. **Render resource limits** after source retention and policy shape are clear.
6. **Tooling quality** before stricter TypeScript, so scripts have the same small pure-core shape as runtime modules.
7. **Staged stricter TypeScript** last, after optional-field and indexing cleanup has a smaller surface.

## Epics

| Code | Epic | State |
|------|------|-------|
| [CV11.E1](cv11-e1--installed-runtime-trust.md) | **Installed Runtime Trust** | Done |
| [CV11.E2](cv11-e2--source-retention-decision.md) | **Source Retention Decision** | Done |
| [CV11.E3](cv11-e3--explicit-runtime-model.md) | **Explicit Runtime Model** | Not started |
| [CV11.E4](cv11-e4--semi-trusted-processors.md) | **Semi-trusted Processors** | Not started |
| [CV11.E5](cv11-e5--render-resource-limits.md) | **Render Resource Limits** | Not started |
| [CV11.E6](cv11-e6--tooling-quality.md) | **Tooling Quality** | Not started |
| [CV11.E7](cv11-e7--strict-typescript.md) | **Staged Strict TypeScript** | Not started |

## Done criterion (CV-level)

1. npm package contents include every runtime asset required by installed users.
2. Runtime paths for shipped assets resolve from the installed package, not the user's project cwd.
3. User-provided endpoint URLs are parsed, normalized, validated, and diagnosed at the config boundary.
4. Managed Docker/Kroki services bind to loopback by default.
5. Custom-message source retention has an evidence-backed decision recorded before implementation.
6. Runtime config is resolved into a safer operational policy object before use.
7. Processor outputs and sandbox statuses are explicit discriminated unions or equivalent exhaustive domain shapes.
8. Third-party processors are treated as semi-trusted: registration and runtime results are validated/normalized.
9. Fence source and processor outputs have enforced limits with visible error output.
10. Tooling scripts expose tested pure parsing/planning helpers, use atomic writes for repo artifacts, and reduce high CRAP hotspots.
11. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are adopted through staged lanes and promoted only after they are clean.
12. `pnpm run feedback` remains green throughout; completion stories use `pnpm run inspect`.
