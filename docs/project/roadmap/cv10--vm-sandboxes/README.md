# CV10 — VM Sandboxes

> CLI renderers can run inside a VM-backed sandbox when container isolation is not enough.

**Type:** `control`
**Status:** Done

CV9 made `sandbox` an explicit placement backed by named controllers. The first concrete exec sandbox, `bundle-sandbox`, is Docker-backed: pi-fence shells into a hardened `pi-fence-bundle` container that carries Graphviz and Mermaid CLI.

That is useful, but it still shares the host kernel. Fenced block sources are untrusted text passed into complex renderers (`dot`, Chromium/Puppeteer through `mmdc`, and future native/browser tooling). This CV adds a VM-backed exec runtime for the existing bundle sandbox so users can choose a stronger isolation boundary without changing processor policy.

This CV does not replace Docker service sandboxes. Kroki and companion services remain Docker/Compose-shaped until there is evidence that running them inside a VM produces enough value to justify the orchestration cost.

This CV is done when every Story in its Epics is done.

## Epics

| Code | Epic | State |
|------|------|-------|
| [CV10.E1](cv10-e1--gondolin-bundle-runtime.md) | **Gondolin Bundle Runtime** | Done |
