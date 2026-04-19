# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository scaffold: docs structure, package metadata, extension entry point stub.
- pnpm as the package manager, pinned via `packageManager` field.
- `scripts/check-links.ts`: validates internal markdown links and heading fragments. Runs via `pnpm run check`.
- `markdownlint-cli2` with minimal config, covering structural markdown (headings, lists, code blocks, whitespace). Runs via `pnpm run check:markdown`. Auto-fix via `pnpm run fix:markdown`.
- Framework: `Verifiability` Community Value type capturing "correctness is provable by automation"; cross-cutting, earned tacitly by feature stories and explicitly by testing-infrastructure stories.
- Framework: mandatory `Tests` section in every story's `plan.md`.
- Spec: `CV0.E1.S0` — Testing foundation. Story docs (`README.md`, `plan.md`, `test-guide.md`) describing vitest setup, the four-layer `tests/` tree, `ShellRunner` / `HttpClient` / `Logger` with fake and node impls, `FakeExtensionAPI`, `docker/Dockerfile` (graphviz only), `scripts/live-container.ts`, GitHub Actions workflow skeletons, and exemplar tests at each layer.
- Spec: `CV0.E1.S1` — Mermaid via Kroki plan rewritten to be test-first throughout, with `HttpClient` injection for `kroki.ts`, a mandatory `Tests` section enumerating layers and coverage, and deletion of the S0 exemplar tests as they are replaced by real S1 tests.
