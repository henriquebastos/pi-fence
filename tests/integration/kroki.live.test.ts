/**
 * Live integration test for the Kroki renderer.
 *
 * Exercises `NodeHttpClient` against real `https://kroki.io` to verify
 * the HTTP contract and PNG round-trip end-to-end. Skipped when network
 * is unavailable.
 *
 * Two shapes live here:
 *
 *   1. **Data-driven happy-path round-trip** — iterates
 *      `KROKI_TEXT_LANGUAGES` from the research fixture
 *      (`tests/fixtures/kroki/canonical-sources.ts`). Each language
 *      contributes one `it()` asserting that the canonical source
 *      returns a real PNG (magic byte check + per-language size floor).
 *      Aliases (e.g. `dot`, `puml`) get their own `it()` blocks that
 *      exercise the alias-resolution path end-to-end against the
 *      canonical endpoint. Adding a new language = edit the fixture,
 *      nothing else.
 *
 *   2. **Handwritten specific-behaviour cases** — malformed source
 *      (error path), mid-flight cancellation (AbortSignal path). These
 *      verify behaviours data-driving can't express.
 *
 * No byte-comparison against a committed PNG: Kroki's PNG output is
 * not bit-stable across releases (font hinting, version drift). Size
 * floors in the fixture catch the common regression pattern \u2014 Kroki
 * returning a ~300-byte "error PNG" on bad input.
 *
 * Live-suite runtime on the calibration machine: ~25\u201330s wall-clock
 * for the full set, dominated by c4plantuml which pulls the C4-PlantUML
 * stdlib over HTTPS at Kroki's render time. Accept the cost \u2014 it's the
 * honest price of verifying real rendering.
 */

import { describe, expect, it } from "vitest";

import { createKrokiProcessor } from "../../extensions/pi-fence/kroki.ts";
import { KROKI_TEXT_LANGUAGES } from "../fixtures/kroki/canonical-sources.ts";
import { hasNetwork } from "../utilities/live-deps.ts";
import { NodeHttpClient } from "../../extensions/pi-fence/io/http-client.ts";

const KROKI_ENDPOINT = "https://kroki.io";
const networkUp = await hasNetwork(KROKI_ENDPOINT);

// Deliberately malformed mermaid; Kroki returns 4xx with a parse error.
const BROKEN_MERMAID = "flowchart\n  A ->>> B";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Per-case timeout. c4plantuml's stdlib fetch on Kroki's side has been
// observed at ~10s; the rest land in the 1\u20133s range. 30s leaves head-
// room for transient slow paths without masking a genuinely hung request.
const PER_LANGUAGE_TIMEOUT_MS = 30_000;

describe.skipIf(!networkUp)("kroki renderer \u2014 live", () => {
	const kroki = createKrokiProcessor(new NodeHttpClient(), KROKI_ENDPOINT);

	describe("happy-path PNG round-trip per language", () => {
		for (const spec of KROKI_TEXT_LANGUAGES) {
			it(
				`renders a canonical \`${spec.tag}\` source as a real PNG (\u2265 ${spec.sizeFloorBytes}B)`,
				async () => {
					const result = await kroki.render(spec.tag, spec.source);

					expect(result.ok).toBe(true);
					if (!result.ok || !("png" in result)) return;

					// Magic byte check: the response is a real PNG, not HTML,
					// not JSON, not a redirect body.
					expect(
						result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
					).toBe(true);

					// Per-language size floor. Guards against Kroki regressing
					// to ~300-byte "error PNG" responses on otherwise 200 status.
					// Calibrated in the fixture from the research pass.
					expect(result.png.length).toBeGreaterThan(spec.sizeFloorBytes);
				},
				PER_LANGUAGE_TIMEOUT_MS,
			);
		}
	});

	describe("alias resolution (end-to-end)", () => {
		for (const spec of KROKI_TEXT_LANGUAGES) {
			for (const alias of spec.aliases) {
				it(
					`resolves alias \`${alias}\` to \`${spec.tag}\` and renders a real PNG`,
					async () => {
						// Caller writes the alias; kroki.ts maps to the
						// /<canonical>/png endpoint at request time. A
						// successful PNG here proves both the alias path and
						// the live wiring work against real Kroki \u2014 the unit
						// test exercises the URL rewrite against a fake HTTP
						// client, so here we specifically want the whole
						// round-trip.
						const result = await kroki.render(alias, spec.source);

						expect(result.ok).toBe(true);
						if (!result.ok || !("png" in result)) return;

						expect(
							result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
						).toBe(true);
						expect(result.png.length).toBeGreaterThan(spec.sizeFloorBytes);
					},
					PER_LANGUAGE_TIMEOUT_MS,
				);
			}
		}
	});

	it(
		"returns ok:false with an error message on malformed mermaid",
		async () => {
			const result = await kroki.render("mermaid", BROKEN_MERMAID);

			expect(result.ok).toBe(false);
			if (result.ok) return;

			// Kroki's error bodies are prose; we only assert non-empty.
			// Specific wording drifts across kroki versions.
			expect(result.error.length).toBeGreaterThan(0);
		},
		PER_LANGUAGE_TIMEOUT_MS,
	);

	it(
		"survives a cancellation mid-flight via AbortSignal",
		async () => {
			const controller = new AbortController();
			// Fire abort almost immediately \u2014 likely lands before the response.
			setTimeout(() => controller.abort(), 10);

			const result = await kroki.render(
				"mermaid",
				"flowchart LR\nA --> B",
				controller.signal,
			);

			expect(result.ok).toBe(false);
			// The error message content depends on where in the round-trip
			// the abort took effect. All paths must produce ok:false without
			// throwing.
		},
		PER_LANGUAGE_TIMEOUT_MS,
	);
});
