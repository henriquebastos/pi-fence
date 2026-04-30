# CV11.E1.S2 — Kroki endpoint config is normalized and diagnosed

**Status:** Ready

**Epic:** [CV11.E1 — Installed Runtime Trust](cv11-e1--installed-runtime-trust.md)
**Depends on:** [CV11.E1.S1 — Package runtime assets resolve from npm installs](cv11-e1-s1--package-runtime-assets.md)
**Date:** 2026-04-29 (spec)

## Summary

Validate `kroki.endpoint` as an operational URL at the config boundary. Project-local endpoints remain allowed, but invalid strings, unsupported schemes, credentials, and surprising URL parts must fail closed instead of flowing into string-concatenated request URLs.

## Done criterion

1. `kroki.endpoint` accepts credential-free `http:` and `https:` URLs.
2. `kroki.endpoint` rejects malformed URLs, non-HTTP schemes, and username/password credentials.
3. Hash fragments are stripped or rejected deterministically.
4. Query strings are stripped/rejected or explicitly preserved with redaction; choose one and test it.
5. Endpoint path prefixes are preserved safely, e.g. `https://example.com/kroki` renders to `https://example.com/kroki/mermaid/png`.
6. Request URL construction uses URL helpers or a tested join helper, not raw string concatenation.
7. Project-local endpoints remain allowed and produce a clear log or `/fence doctor` diagnostic that diagram source may be sent to that endpoint.
8. `pnpm run feedback` passes.

## Scope

**In scope:**

1. Config validation in `extensions/pi-fence/config.ts`.
2. Kroki request URL construction in `extensions/pi-fence/kroki.ts`.
3. Endpoint display/log redaction if query/userinfo is rejected or normalized.
4. Config status/provenance diagnostics when a project endpoint is active.
5. Unit and extension tests for accepted/rejected endpoints.

**Out of scope:**

1. Banning project-local endpoints.
2. Network reachability probing.
3. Authentication headers or secret storage.
4. Managed Kroki loopback binding — S3.

## Plan

1. **RED — endpoint validation.** Add `tests/unit/config.test.ts` cases for `file://`, `ftp://`, malformed strings, credentials, hashes, query behavior, localhost, HTTPS, and path prefixes.
2. **GREEN — endpoint parser.** Introduce a small normalized endpoint value or validated string helper. Keep raw config parsing as `unknown → validated`.
3. **RED — request URL construction.** Add `tests/unit/kroki.test.ts` cases for path-prefix endpoints, trailing slashes, and dark-theme query construction.
4. **GREEN — URL builder.** Replace `${base}/${tag}/${format}` construction with a helper that has unit coverage.
5. **RED — project diagnostic.** Add an extension or doctor test proving project-local endpoint config surfaces an explicit diagnostic.
6. **GREEN — diagnostic.** Thread enough provenance from config loading/validation to log or doctor output without banning the config.

## Tests

1. **Layers touched:** unit config/Kroki tests and one extension/doctor diagnostic test.
2. **Events / interactions covered:** config parsing, merge/provenance, request URL construction, and user-facing diagnostics.
3. **Fakes added:** none expected; `FakeHttpClient` and `FakeLogger` are sufficient.
4. **Live tests:** not required; no real network needed.
5. **Deferred:** endpoint health probing and auth.

## Verification

```bash
pnpm vitest run tests/unit/config.test.ts tests/unit/kroki.test.ts
pnpm vitest run tests/extension/pi-fence.test.ts --testNamePattern "endpoint|doctor"
pnpm run feedback
```

## Key files

- `extensions/pi-fence/config.ts`
- `extensions/pi-fence/io/config-loader.ts`
- `extensions/pi-fence/kroki.ts`
- `extensions/pi-fence/doctor.ts`
- `tests/unit/config.test.ts`
- `tests/unit/kroki.test.ts`
- `tests/extension/pi-fence.test.ts`
