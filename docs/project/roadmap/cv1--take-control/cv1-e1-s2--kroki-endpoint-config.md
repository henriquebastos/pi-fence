# CV1.E1.S2 — Configure the Kroki endpoint

**Status:** In progress

**Epic:** [CV1.E1 — Explicit Configuration](cv1-e1--explicit-configuration.md)
**Depends on:** [CV1.E1.S1 — enable/disable processors](cv1-e1-s1--enable-disable-processors.md) (config infrastructure)
**Date:** 2026-04-22 (spec)

## Summary

The Kroki endpoint is hardcoded to `https://kroki.io`. Users running a local Docker Kroki (`http://localhost:8000`) or a self-hosted instance have no way to redirect pi-fence. S2 adds a `kroki.endpoint` config key so the user points Kroki at any URL.

## Done criterion

The user adds to `~/.pi/agent/pi-fence.config.json`:

```json
{
  "kroki": {
    "endpoint": "http://localhost:8000"
  }
}
```

On `/reload`, every Kroki-rendered tag hits `http://localhost:8000/<tag>/png` instead of `https://kroki.io/<tag>/png`. `/fence list` shows the effective endpoint (or nothing when it's the default). Removing the key restores the public endpoint.

## Scope

**In scope:**

- New config key `kroki.endpoint` — a URL string. Default: `https://kroki.io`. Validated as a string; no URL parsing beyond stripping a trailing slash.
- Merge semantics: project `kroki.endpoint` overrides global, same "last defined wins" as `disabled`. Absent key inherits.
- `createKrokiProcessor` already accepts an `endpoint` parameter. The wiring in `index.ts` reads it from config and passes it through.
- Unit tests for config validation/merge of `kroki.endpoint`.
- Extension test: Kroki processor uses the configured endpoint.
- `/fence list` shows the endpoint when non-default (a parenthetical after the processor id, e.g., `kroki [registered] (http://localhost:8000) — mermaid, …`).

**Out of scope:**

- Per-processor timeout, credentials, or authentication headers — future story.
- Privacy warning on first use of the public endpoint — future story.
- Env-var override (`PI_FENCE_KROKI_ENDPOINT`) — possible future, not needed for file-based config.
- Validating the endpoint URL is reachable. A bad URL surfaces per-render as an error; `/fence doctor` (S3) is where up-front health probing lands.

## Plan

### Deliverables

#### 1. Config shape: `kroki` section

`PiFenceConfig` gains `kroki?: { endpoint?: string }`. Validation: `kroki` must be an object if present; `endpoint` must be a string if present. Unknown keys inside `kroki` tolerated. Merge: project `kroki.endpoint` overrides global when defined; absent inherits.

#### 2. Wire endpoint through `index.ts`

`createDefaultProcessors` reads `config.kroki?.endpoint` and passes it to `createKrokiProcessor(http, endpoint, logger, appearance)`.

#### 3. `/fence list` endpoint display

When the effective endpoint is not the default (`https://kroki.io`), `listProcessors` or the formatter includes it in the kroki line. Keeps the default output unchanged (no noise for the common case).

### Implementation order

| Step | Layer | What |
|------|-------|------|
| 1 | unit + impl | Config: `kroki.endpoint` validation + merge (TDD) |
| 2 | unit + impl | Wire endpoint in index.ts + extension test |
| 3 | unit + impl | `/fence list` endpoint display |
| 4 | docs | getting-started, CHANGELOG |

## Tests

**Test layers touched:**

- **Unit** (`tests/unit/config.test.ts`): validation of `kroki` section (valid endpoint, non-object kroki, non-string endpoint, absent kroki). Merge: project overrides global, absent inherits.
- **Extension** (`tests/extension/pi-fence.test.ts`): configured endpoint → HTTP requests hit the configured URL, not `kroki.io`.
- **Unit** (`tests/unit/list.test.ts`): format line includes endpoint when non-default.
- **Contract**: unchanged.
- **Integration (live)**: unchanged.

**Events / interactions covered:**

- Config load with `kroki.endpoint` present/absent/malformed.
- Kroki HTTP requests to a custom endpoint.
- `/fence list` output with custom endpoint.

**Fakes added:** None new.

**Live tests added:** None.

**Deferred:**

- Env-var override for endpoint.
- Timeout and authentication per processor.

## Verification

### Gate

1. `pnpm run feedback` — full fast gate green.
2. No new CRAP functions above 25.

### Manual test script

#### 1. Local Docker Kroki

```bash
docker run -d -p 8000:8000 yuzutech/kroki
```

Add to config: `{"kroki": {"endpoint": "http://localhost:8000"}}`.
`/reload`. Ask for a mermaid diagram. Expect PNG from the local instance.

#### 2. Default (no config)

Remove the `kroki` key. `/reload`. Mermaid renders from `kroki.io`.

## Key files

**Modified:**

- `extensions/pi-fence/config.ts` — `PiFenceConfig.kroki`, validation, merge.
- `extensions/pi-fence/index.ts` — pass `config.kroki?.endpoint` to `createKrokiProcessor`.
- `extensions/pi-fence/list.ts` — endpoint display in format output.
- `extensions/pi-fence/messages.ts` — pass endpoint info to list.
- `tests/unit/config.test.ts`, `tests/unit/list.test.ts`, `tests/extension/pi-fence.test.ts`.
- `docs/getting-started.md`, `CHANGELOG.md`.

**New:** None.
