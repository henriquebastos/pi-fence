[< S1](README.md)

# Test Guide: CV0.E2.S1 — Local graphviz processor

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E2 — Graphviz Local](../README.md)

---

## Prerequisites

- No prerequisites for the fast suite.
- Docker running with the `pi-fence-live-deps` container started via `pnpm live:up` for the live integration tests (the container already ships `graphviz`).
- For the manual script: `graphviz` installed locally (at least for the "available" branch). On Debian/Ubuntu: `apt install graphviz`. On macOS: `brew install graphviz`. Upstream: <https://graphviz.org/download/>.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test          # fast suite — unit + contract + extension
pnpm live:up       # start the container once
pnpm test:live     # integration suite — adds four graphviz-local cases
```

Expect green. Specifically new:

- `tests/unit/graphviz-local.test.ts` — `available()` ok + not-ok branches; `render()` happy/error/abort paths against a `FakeShellRunner`.
- `tests/unit/resolve.test.ts` *(or the equivalent expansion of `tests/unit/fence-command.test.ts`)* — `resolve(tag)` returns the first available processor matching the tag, falls through to the next when the preferred one is unavailable, returns `null` when none apply.
- `tests/unit/list.test.ts` — `listProcessors` accepts the availability map; `formatProcessorLines` emits a second indented line with reason + install hint for unavailable rows.
- `tests/unit/renderer.test.ts` — pi-fence:list renderer paints the second line when the formatter emits it.
- `tests/contract/graphviz-local.contract.test.ts` — shared contract green against a canned-good `FakeShellRunner`.
- `tests/contract/fence-processor.ts` — `available()` shape assertion fires for every processor running the contract.
- `tests/extension/pi-fence.test.ts` — two new cases (local-available; local-unavailable falling through to Kroki).
- `tests/integration/graphviz-local.live.test.ts` — four live cases inside the container.

Live-suite runtime delta: the four new cases together run in under two seconds on the calibration machine (local `dot` is faster than `kroki.io`).

---

## Manual test script

Run this after pi-fence is installed into pi (or symlinked under `~/.pi/agent/extensions/`).

### 1. With `graphviz` installed: `/fence list` shows both processors as `[registered]`

```text
dot -V
```

…should print a graphviz version string. Inside pi:

```text
/fence list
```

Expect:

- Header line `Processors`.
- Two rows:

  ```text
  graphviz-local [registered] — graphviz (dot)
  kroki          [registered] — mermaid, graphviz (dot), plantuml (puml), …
  ```

- No network request during `/fence list` (it's a read-only offline command; unchanged from S3).

### 2. A ```` ```dot ```` block renders locally — no kroki.io traffic

With `PI_FENCE_LOG_LEVEL=debug pi 2> /tmp/pi-fence.log`, ask the assistant:

> Draw a DOT graph of A → B → C.

Expect:

- PNG appears inline below the assistant's reply.
- `/tmp/pi-fence.log` contains a line like `[pi-fence:graphviz-local] debug: shelling out to dot …` **and** does not contain a `[pi-fence:kroki] debug: request` line for that turn.
- No HTTPS traffic to `kroki.io` (optional: confirm with `lsof -i :443 | grep kroki` during the render, or run `pi` on an interface with `kroki.io` in `/etc/hosts` → `127.0.0.1` and confirm the render still succeeds).

### 3. Uninstall graphviz → the same block falls through to Kroki

```text
sudo apt remove graphviz    # or: brew uninstall graphviz
```

Restart pi (or run `/reload`). Inside pi:

```text
/fence list
```

Expect:

- Two rows:

  ```text
  graphviz-local [unavailable] — graphviz (dot)
      dot binary not found on PATH. Install via: apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS) · https://graphviz.org/download/
  kroki          [registered]  — mermaid, graphviz (dot), plantuml (puml), …
  ```

Now ask the assistant for the same DOT graph. Expect:

- PNG still appears inline.
- `PI_FENCE_LOG_LEVEL=debug` log for the turn shows `[pi-fence:kroki] debug: request {"tag":"graphviz", …}` — Kroki served it.

### 4. Mermaid is untouched by S1

Ask the assistant for a mermaid flowchart. Expect:

- Behaviour identical to CV0.E1 — Kroki renders it regardless of whether `graphviz` is installed. The log line is `[pi-fence:kroki] debug: request {"tag":"mermaid", …}`.

### 5. Malformed DOT surfaces an error when local serves it

With `graphviz` installed, ask the assistant to emit a deliberately broken DOT source (e.g. `digraph { A -> }`). Expect:

- An error-kind `pi-fence:output` panel appears, surfacing `dot`'s stderr, truncated to ~500 chars.
- pi remains responsive.
- No kroki.io traffic for that turn (the local processor claimed the tag; it failed cleanly; there is no retry against Kroki in S1 — retries-across-processors is a future story).

### 6. Offline behaviour

Disconnect the network. Ask for a DOT diagram:

- With `graphviz` installed: renders fine. Privacy / offline path works.
- Without `graphviz` installed: the Kroki fallback tries and surfaces a network error, same as CV0.E1's offline behaviour for any Kroki tag. pi stays responsive.

Ask for a mermaid diagram:

- Network error, same as CV0.E1. Unaffected by S1.

---

## Rollback

Same as every CV0.E1 story: `pi uninstall pi-fence`, `/reload`. `/fence list` becomes unknown again; DOT blocks render as raw fenced source.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [Epic](../README.md) · [CV0.E1.S3 test guide](../../cv0-e1-kroki-through-the-wire/cv0-e1-s3-fence-list/test-guide.md) · [S0 `pnpm live:up` docs](../../cv0-e1-kroki-through-the-wire/cv0-e1-s0-testing-foundation/test-guide.md)
