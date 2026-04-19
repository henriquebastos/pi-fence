[< CV0.E1 — Kroki Through The Wire](../README.md)

# S0 — Testing foundation 🛠️

The test architecture pi-fence will use for every story after this one. No feature code yet. Ships: vitest setup, `tests/` tree, the three I/O-seam interfaces with fakes (`ShellRunner`, `HttpClient`, `Logger`), a `FakeExtensionAPI`, a Docker image for live dependencies (graphviz-only at this point), and container-lifecycle scripts.

Every piece of infrastructure S0 delivers is exercised by its own self-test. Infra without its own test would ship unverified and violate the project's own rule.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script for the infrastructure itself

## Done criterion

On a fresh clone on macOS or Linux:

1. `pnpm install` succeeds.
2. `pnpm test` runs the unit and extension self-tests to completion and exits green. No Docker required.
3. `pnpm live:up` pulls and starts the `pi-fence-live-deps` container; `pnpm live:status` reports it running.
4. `pnpm test:live` runs the integration self-test against the container and exits green.
5. `pnpm live:down` stops and removes the container cleanly.
6. A contributor reading `docs/product/principles.md` can point to where every guarantee in its Testing section is enforced in code.

## What counts as S0 being "done"

Not "the testing infrastructure is good." Good is subjective. **S0 is done when every interface, fake, runner, image, and script S0 introduces has at least one passing self-test that exercises it for real.** No dead code.

## What lands in S0 vs. later stories

| Concern | S0 delivers | Deferred to |
|---------|-------------|-------------|
| Test runner, `tests/` tree | ✅ | — |
| `ShellRunner` / `HttpClient` / `Logger` interfaces | ✅ | — |
| `Node*` and `Fake*` implementations | ✅ | — |
| `DockerExecShellRunner` | ✅ | — |
| `FakeExtensionAPI` | ✅ | — |
| `docker/Dockerfile` with graphviz | ✅ | — |
| `scripts/live-container.ts` | ✅ | — |
| `.github/workflows/` skeleton | ✅ | — |
| Self-tests for every piece above | ✅ | — |
| `FenceProcessor` interface | — | S1 |
| Parser, registry, renderer code | — | S1 |
| Kroki processor | — | S1 |
| Contract test for `FenceProcessor` | — | S1 |
| Real extension test with pi-fence code | — | S1 |
| Real integration test rendering a diagram | — | S1 |

The principle: infrastructure earns its place only with a test that actually uses it. Infrastructure for things that don't exist yet would be dead code.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [S1](../cv0-e1-s1-mermaid-via-kroki/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
