[< S2](README.md)

# Test Guide: CV0.E2.S2 — Per-tag processor binding

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E2 — Graphviz Local](../README.md)

---

## Prerequisites

- No Docker.
- No network.
- `graphviz` installed for the most interesting manual scenarios (binding Kroki to override local graphviz). Scripts run without it; you just won't see the "bind local → override → fall back to Kroki" scenario.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test
```

Expect green. Specifically new:

- `tests/unit/config.test.ts` — two-file precedence, malformed JSON tolerance, missing-file tolerance, non-string value handling.
- `tests/unit/resolve.test.ts` — bindings branch: binding wins over capability when processor available; falls through on unavailable / unknown.
- `tests/unit/list.test.ts` — Bindings / Ignored bindings sections in `formatProcessorLines`.
- `tests/unit/renderer.test.ts` — viewport assertion on the new section paint.
- `tests/extension/pi-fence.test.ts` — four bindings scenarios through `AgentSession`.

No new live tests.

---

## Manual test script

Run with pi-fence installed / symlinked into pi.

### 1. No config file → default capability-based resolution

Fresh machine (no `pi-fence.config.json` anywhere). Inside pi:

```text
/fence list
```

Expect two processor rows + **no Bindings section** at all.

### 2. Global config binds graphviz to Kroki

```bash
cat > ~/.pi/agent/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "kroki",
    "dot": "kroki"
  }
}
EOF
```

Inside pi, `/reload`, then `/fence list`. Expect:

```text
Processors

  graphviz-local [registered] — graphviz (dot)
  kroki [registered] — mermaid, graphviz (dot), …

Bindings

  graphviz → kroki
  dot → kroki
```

Ask the assistant for a DOT graph. With `PI_FENCE_LOG_LEVEL=debug pi 2> /tmp/pi-fence.log`, expect:

- `[pi-fence:kroki] debug: request {"tag":"graphviz",…}` — Kroki served the block despite graphviz-local being available.
- No `[pi-fence:graphviz-local] debug: shelling out to dot` line for this turn.

### 3. Project config overrides global

```bash
cd /tmp/my-project
mkdir -p .pi
cat > .pi/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "graphviz-local"
  }
}
EOF
# Keep the global file from step 2 in place.
pi  # start from /tmp/my-project
```

Inside pi, `/fence list`. Expect the Bindings section to show:

```text
Bindings

  graphviz → graphviz-local   (project)
  dot → kroki
```

Ask for another DOT graph. Log should show `[pi-fence:graphviz-local]` serving it — project config won for the `graphviz` tag; global config's `dot` binding stays.

### 4. Binding to unknown processor is ignored

```bash
cat > .pi/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "nonexistent",
    "mermaid": "kroki"
  }
}
EOF
```

`/reload`, `/fence list`. Expect:

```text
Bindings

  mermaid → kroki

Ignored bindings

  graphviz → nonexistent (unknown processor)
```

Ask for a DOT graph — capability-based resolution kicks in (graphviz-local wins if dot is installed; else Kroki). Ask for mermaid — still Kroki (noop binding since Kroki already claims mermaid by default).

### 5. Binding to an unavailable processor falls through

On a machine where `graphviz` is NOT installed:

```bash
cat > ~/.pi/agent/pi-fence.config.json <<'EOF'
{
  "bindings": {
    "graphviz": "graphviz-local"
  }
}
EOF
```

`/reload`, `/fence list`. Expect:

```text
Bindings

Ignored bindings

  graphviz → graphviz-local (processor unavailable)
```

Ask for a DOT graph — Kroki serves it via capability-based fallback. The user sees that their binding preference was recorded but not honoured; the log entry at `info` level records the fallback.

### 6. Malformed JSON is tolerated

```bash
echo 'not valid json' > ~/.pi/agent/pi-fence.config.json
```

`/reload`. pi-fence does NOT crash. `PI_FENCE_LOG_LEVEL=warn pi 2> /tmp/pi-fence.log` shows one warn line flagging the parse failure. `/fence list` renders as if no config file existed.

### 7. Deleting the config restores defaults

```bash
rm ~/.pi/agent/pi-fence.config.json .pi/pi-fence.config.json
```

`/reload`, `/fence list`. No Bindings section. Default capability-based resolution applies. A DOT block goes through graphviz-local (if dot installed) or Kroki (if not).

---

## Rollback

Delete both config files + `/reload`.

For a complete uninstall: `pi uninstall pi-fence`, `/reload`.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [Epic](../README.md) · [S1 test guide](../cv0-e2-s1-local-graphviz/test-guide.md) · [Briefing D6](../../../../briefing.md)
