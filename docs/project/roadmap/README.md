[< Docs](../../README.md)

# Roadmap — pi-fence

> Where the project is headed. Hierarchy is deliberate: the roadmap README tracks CVs, each CV README tracks Epics, and each Epic file tracks Stories.

A CV is **done** only when every Story in its Epics is done.

## CVs

| CV | Type | State | Goal |
|----|------|-------|------|
| [CV0 — It Works](cv0--it-works/README.md) | `legibility` | Done | The extension renders diagrams inline with a zero-config happy path. |
| [CV1 — Take Control](cv1--take-control/README.md) | `control` | Done | The user owns the registry through configuration, diagnosis, and the error feedback loop. |
| [CV2 — Work Offline](cv2--work-offline/README.md) | `portability` | Done | Core rendering paths work without the public Kroki service. |
| [CV3 — Beyond Diagrams](cv3--beyond-diagrams/README.md) | `legibility` | Done | The platform proves itself on non-diagram text-to-visual use cases. |
| [CV4 — Platform](cv4--platform/README.md) | `extensibility` | Done | Third parties write processors as first-class citizens. |
| [CVx — Verifiability](cvx--verifiability/README.md) | `verifiability` | Done | Testing and inspection infrastructure make correctness provable. |
| [CV5 — SVG Languages](cv5--svg-languages/README.md) | `legibility` | Done | Unlock Kroki languages the public endpoint serves only as SVG. |
| [CV6 — Fixture Completeness](cv6--fixture-completeness/README.md) | `verifiability` | Not started | Every I/O-seam processor has live-derived fixtures; drift is detected automatically. |
| [CV7 — Companion Backends](cv7--companion-backends/README.md) | `legibility` | Not started | Languages behind Kroki companion containers render via a shipped Compose stack. |
| [CV8 — Internal Quality](cv8--internal-quality/README.md) | `simplification` | In progress | Simplify internals that accumulated duplication or unnecessary indirection during feature delivery. |
