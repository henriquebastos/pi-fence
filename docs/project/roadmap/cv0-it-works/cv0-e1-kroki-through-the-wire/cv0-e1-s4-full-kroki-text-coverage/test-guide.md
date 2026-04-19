[< S4](README.md)

# Test Guide: CV0.E1.S4 — Full Kroki coverage for text-based languages

**Plan:** [plan.md](plan.md)
**Story:** [README.md](README.md)
**Epic:** [CV0.E1 — Kroki Through The Wire](../README.md)

---

## Prerequisites

Same as S2. No Docker needed for live tests — Kroki is an HTTP dependency.

---

## Automated tests

```bash
pnpm install
pnpm run check
pnpm test          # fast suite — unit alias assertions + unchanged extension test
pnpm test:live     # integration suite — one case per researched language
```

Expect the live suite to take noticeably longer than S2's (~20s for ~20 languages versus S2's ~3s for 4). That's the honest cost of verifying real rendering.

---

## Manual test script

Once pi-fence is installed into pi and S4 has landed:

### 1. Open `docs/product/kroki-support.md`

Skim the supported-languages table. Confirm the list matches what the live-test suite verifies — no language listed that doesn't have a test, no test that isn't listed.

### 2. For each unfamiliar language, ask the assistant to emit one

Pick three languages you haven't personally seen rendered: e.g., `bpmn`, `wavedrom`, `nomnoml`. Ask the assistant:

> Give me a tiny example of a `<language>` diagram. Use a fenced code block with `<language>` as the tag.

The assistant writes a ```` ```<language> ```` block. pi-fence posts to Kroki. A PNG appears inline.

Expect:

- Every supported language emits a PNG.
- The rendering label reflects whatever tag the assistant wrote.
- If the assistant writes an alias (e.g., `dot` for graphviz), the label preserves it while the underlying endpoint is the canonical name.

### 3. Try one known-unsupported language

The `kroki-support.md` document names languages Kroki hosts but the public endpoint does not serve. Ask the assistant for one of those:

Expect:

- pi-fence emits an error-kind `pi-fence:output` message. The error surfaces Kroki's response (commonly 404 or a plus-tier notice).
- pi remains responsive.
- The user can read `kroki-support.md` to learn why it isn't supported and what to do next (wait for CV2.E2 self-hosted Kroki).

### 4. Malformed input per language

Pick two languages. For each, ask the assistant to emit a deliberately broken source (e.g., unclosed brace in DOT, unknown mermaid keyword). Confirm pi-fence surfaces the error, truncated to 500 chars, without crashing the session.

### 5. Offline behavior unchanged

Same as S1/S2. Disconnect network, ask for any diagram. Expect a network-error custom message; pi stays responsive.

---

## Rollback

Same as previous stories — `pi uninstall pi-fence`, `/reload`.

---

**See also:** [Plan](plan.md) · [Story](README.md) · [S2 test guide](../cv0-e1-s2-other-kroki-tags/test-guide.md) · [S5](../cv0-e1-s5-kroki-json-body-languages/README.md)
