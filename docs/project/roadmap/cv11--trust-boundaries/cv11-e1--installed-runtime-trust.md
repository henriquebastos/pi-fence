# CV11.E1 — Installed Runtime Trust

**CV:** [CV11 — Trust Boundaries](README.md)
**Last updated:** 2026-04-30 — epic done
**Status:** Done

## Summary

Make pi-fence's installed runtime behavior match its source-checkout behavior while hardening the first config and service boundaries a user touches.

Today the npm package publishes `extensions/` but not all runtime assets used by Docker Compose or Gondolin workflows. Some runtime paths are source-checkout-relative, and `kroki.endpoint` accepts arbitrary strings. This epic makes the installed package self-contained and makes endpoint/service boundaries explicit.

Project-local Kroki endpoint config remains allowed. The improvement is validation and diagnosis, not prohibition.

## Stories

| Code | Story | Status |
|------|-------|--------|
| [S1](cv11-e1-s1--package-runtime-assets.md) | **Package runtime assets resolve from npm installs** | Done |
| [S2](cv11-e1-s2--kroki-endpoint-normalization.md) | **Kroki endpoint config is normalized and diagnosed** | Done |
| [S3](cv11-e1-s3--managed-kroki-loopback.md) | **Managed Kroki runtimes bind to loopback** | Done |

## Done criterion (epic-level)

1. `npm pack --dry-run --json` includes all runtime assets needed by exposed installed workflows.
2. Runtime code resolves shipped assets from package-relative paths, not `process.cwd()` or user project-relative paths.
3. `kroki.endpoint` accepts only valid, credential-free `http:`/`https:` URLs and normalizes trailing slash/hash behavior.
4. Project-local endpoint values remain valid but produce a clear diagnostic that diagram source may leave the project.
5. Single-container and Compose-managed Kroki bind to `127.0.0.1` by default.
6. Tests cover npm package contents, path resolution, endpoint validation, request URL construction, and Docker/Compose port binding.
7. `pnpm run feedback` passes.
