# CV9 — Processor Policy

> Processor selection is governed by explicit user policy, not import order, filesystem order, or implicit trust assumptions.

**Type:** `control`
**Status:** In progress

At the start of CV9, pi-fence could bind tags to processor ids and block processors, but the default choice still depended on registration order. That becomes brittle once built-in processors are discovered from a folder and multiple backends can serve the same tag.

This CV introduces trust/placement-aware resolution:

1. `embedded` — runs inside the pi-fence process; no host binary, sandbox runtime, or external service.
2. `host` — calls host binaries discovered/probed on `PATH`.
3. `sandbox` — uses an isolated runtime pi-fence can identify and control, initially Docker-backed.
4. `remote` — calls an external service pi-fence only controls as a client.

Processor ids follow `<family>-<placement>[-variant]`, for example `table-embedded`, `graphviz-host`, `bundle-sandbox`, `kroki-sandbox`, and `kroki-remote`. A processor may represent a language-specific tool, a bundled exec backend, or a service gateway. Tags describe what it can serve; placement describes its trust/control boundary.

Variants appear only when multiple processors in the same family and placement can coexist, such as a future `graphviz-sandbox-docker` and `graphviz-sandbox-podman`.

The user's config owns precedence, bindings, and block policy. Omitting a placement from `processorPrecedence` disables that whole placement. Blocking tags or processors is stronger than bindings and cannot be bypassed by LLM-authored metadata.

This CV should land before order-independent processor folder discovery becomes the default. S6 supplies the managed Kroki `sandbox` processor base that CV7 can extend to companion-only tags.

This CV is done when every Story in its Epics is done.

## Epics

| Code | Epic | State |
|------|------|-------|
| [CV9.E1](cv9-e1--policy-driven-resolution.md) | **Policy-driven Resolution** | In progress |
