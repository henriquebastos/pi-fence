# CV11.E1.S3 — Managed Kroki runtimes bind to loopback

**Status:** Ready

**Epic:** [CV11.E1 — Installed Runtime Trust](cv11-e1--installed-runtime-trust.md)
**Depends on:** [CV11.E1.S1 — Package runtime assets resolve from npm installs](cv11-e1-s1--package-runtime-assets.md)
**Date:** 2026-04-29 (spec)

## Summary

Bind pi-fence-managed Kroki services to `127.0.0.1` instead of Docker's default all-interface host binding. The service is local developer/runtime infrastructure, not a LAN service.

## Done criterion

1. Single-container Kroki startup uses `-p 127.0.0.1:8000:8000` or equivalent.
2. `docker/kroki/compose.yaml` publishes `127.0.0.1:8000:8000`.
3. Managed Kroki runtimes (single-container and Compose) report `http://127.0.0.1:8000` to pi-fence so the advertised endpoint matches the verified IPv4 loopback bind.
4. Existing managed Kroki runtimes that publish `8000/tcp` outside `127.0.0.1:8000` fail closed instead of being treated as ready.
5. Unmanaged `kroki.endpoint` behavior is unchanged.
6. Tests prove the Docker command, Compose file, runtime port verification, and managed endpoint pinning.
7. Docs mentioning quick local Kroki or managed sandbox behavior stay accurate.
8. `pnpm run feedback` passes.

## Scope

**In scope:**

1. `extensions/pi-fence/kroki-docker.ts` Docker run args.
2. `docker/kroki/compose.yaml` port binding.
3. Tests for command construction and Compose file text.
4. README/getting-started updates only if visible command docs change.

**Out of scope:**

1. Full Docker hardening for Kroki service containers beyond loopback binding.
2. Changing bundle-sandbox Docker security checks.
3. Changing public unmanaged `kroki.endpoint` behavior.

## Plan

1. **RED — single-container binding.** Add/update `tests/unit/kroki-docker.test.ts` to require `127.0.0.1:8000:8000` in `docker run`.
2. **GREEN — command args.** Update `createKrokiDockerManager().start()`.
3. **RED — Compose binding.** Add/update a test that reads `docker/kroki/compose.yaml` and asserts loopback binding.
4. **GREEN — Compose file.** Change the port mapping.
5. **REFACTOR.** Keep endpoint reporting and docs consistent.

## Tests

1. **Layers touched:** unit tests for Docker run args, Compose YAML, runtime port binding, and managed endpoint pinning; extension-layer fixtures updated to program the same Docker port-binding inspection and the IPv4 loopback endpoint.
2. **Events / interactions covered:** Docker run args, Compose YAML port binding, Docker `NetworkSettings.Ports` verification on the managed single-container and Compose core services, and the managed endpoint pi-fence advertises through `kroki-sandbox`.
3. **Fakes added:** none.
4. **Live tests:** optional; existing `pnpm test:live` can be run if Docker is available.
5. **Deferred:** broader container resource limits, deduplication of the Docker port-binding helper between `kroki-docker.ts` and `sandbox.ts`.

## Verification

```bash
pnpm vitest run tests/unit/kroki-docker.test.ts tests/unit/kroki-compose.test.ts
pnpm run feedback
```

Optional with Docker:

```bash
pnpm test:live
```

## Key files

- `extensions/pi-fence/kroki-docker.ts`
- `docker/kroki/compose.yaml`
- `tests/unit/kroki-docker.test.ts`
- `tests/unit/kroki-compose.test.ts`
