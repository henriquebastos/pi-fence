[< CV0.E1 — Kroki Through The Wire](../README.md)

# S4 — Every text-based Kroki language renders through pi-fence ✅ Done

S1–S2 added four languages one story at a time. S4 makes the coverage honest: every text-based language the public Kroki endpoint supports — and that pi-fence's current text-body flow fits — renders with a verified live test.

- [Plan](plan.md) — deliverables, implementation order, verification steps
- [Test Guide](test-guide.md) — manual test script

## Done criterion

For every text-based language on Kroki's public endpoint (as enumerated by a research step that is part of this story's work), pi-fence:

1. Accepts the tag in its allowlist (aliases included where colloquial names diverge from Kroki's canonical endpoint names).
2. Has at least one live integration test asserting the language renders end-to-end against real `kroki.io` — PNG magic + a size floor calibrated per language.
3. Surfaces the user's original tag in the rendering label and details payload (alias resolution is invisible outside the URL).

Languages that Kroki hosts but the public endpoint does not serve (plus-tier, discontinued, opt-in) are documented as unsupported with a pointer to self-hosted Kroki (CV2.E2).

## Scope

**In scope:**

- Research pass to enumerate the actual text-based languages on Kroki's public endpoint today.
- Expanded `SUPPORTED_TAGS` and `KROKI_TAG_ALIASES` in `extensions/pi-fence/kroki.ts` and `extensions/pi-fence/index.ts`.
- One live test per verified language in `tests/integration/kroki.live.test.ts`. Accept slower live suite.
- Updated README and `docs/getting-started.md` with the full list plus documented exceptions.
- Unit test sweep for the new aliases (URL shape).

**Out of scope:**

- JSON-body languages (Vega, Vega-Lite, Excalidraw) — see [S5](../cv0-e1-s5-kroki-json-body-languages/README.md).
- Self-hosted Kroki setup — CV2.E2.
- `/fence list` command — that's [S3](../).
- Language-specific parameter tuning (size, theme, layout) beyond what pi-fence already passes as an info-string meta.
- Case-insensitive tag matching.

---

**See also:** [Plan](plan.md) · [Test Guide](test-guide.md) · [S1](../cv0-e1-s1-mermaid-via-kroki/README.md) · [S2](../cv0-e1-s2-other-kroki-tags/README.md) · [S5](../cv0-e1-s5-kroki-json-body-languages/README.md) · [Principles — Testing](../../../../../product/principles.md#testing)
