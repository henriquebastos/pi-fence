# CV10.E1 — Gondolin Bundle Runtime

**Roadmap:** [CV10](README.md)
**Last updated:** 2026-04-29 — spec

`bundle-sandbox` already hides renderer binaries behind the `ExecSandboxEnvironment` seam. Today the only production implementation is Docker exec. This epic adds a second implementation backed by [Gondolin](https://github.com/earendil-works/gondolin): a local Linux micro-VM with host-controlled execution, filesystem, and network policy.

The user-visible model stays the same:

```json
{
  "processorPrecedence": ["sandbox"],
  "sandboxes": {
    "bundle": {
      "kind": "exec",
      "runtime": "gondolin-vm",
      "autoStart": true
    }
  }
}
```

The processor id remains `bundle-sandbox`. Runtime selection belongs to `sandboxes.bundle.runtime`; policy selection remains placement/processor based.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv10-e1-s1--gondolin-bundle-runtime.md) | **Gondolin VM runtime for bundle-sandbox** | Ready |

## Done criterion (epic-level)

1. `sandboxes.bundle.runtime: "gondolin-vm"` is accepted for `kind: "exec"` and rejected for service sandboxes.
2. pi-fence can start, status-check, and stop a Gondolin VM for the bundle sandbox.
3. `bundle-sandbox` renders `graphviz`/`dot` and `mermaid` through the same processor code when backed by Gondolin.
4. The Gondolin bundle runtime does not mount host project files or expose host networking for renderer execution.
5. Docker-backed `bundle-sandbox` behavior remains unchanged.
6. Unit, extension, contract, and live gates prove the VM runtime without requiring Gondolin for the fast suite.
