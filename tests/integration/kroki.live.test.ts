/**
 * Live integration test for the Kroki renderer.
 *
 * Exercises `NodeHttpClient` against real `https://kroki.io` to verify the
 * HTTP contract and PNG round-trip end-to-end. Skipped when network is
 * unavailable.
 *
 * No byte-comparison against a fixture: kroki's PNG output is not
 * bit-stable across releases (font hinting, mermaid version drift). We
 * assert on the PNG magic number, a reasonable size floor, and semantic
 * response shape instead. A fixture that binds us to specific bytes
 * would be a maintenance burden without catching real regressions.
 */

import { describe, expect, it } from "vitest";

import { createKrokiRenderer } from "../../extensions/pi-fence/kroki.ts";
import { hasNetwork } from "../utilities/live-deps.ts";
import { NodeHttpClient } from "../utilities/http-client.ts";

const KROKI_ENDPOINT = "https://kroki.io";
const networkUp = await hasNetwork(KROKI_ENDPOINT);

// Minimal mermaid flowchart that kroki is comfortable with.
const SIMPLE_MERMAID = "flowchart LR\nA --> B";

// Deliberately malformed; kroki returns 4xx with a parse error.
const BROKEN_MERMAID = "flowchart\n  A ->>> B";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe.skipIf(!networkUp)("kroki renderer — live", () => {
	const kroki = createKrokiRenderer(new NodeHttpClient(), KROKI_ENDPOINT);

	it(
		"renders a simple graphviz DOT graph as a real PNG (covers alias resolution)",
		async () => {
			// Caller writes `dot`; kroki.ts maps to the /graphviz/png endpoint
			// at request time. A successful PNG here proves both the alias
			// path and the live wiring work against real Kroki.
			const result = await kroki.render("dot", "digraph { A -> B; B -> C }");

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
			expect(result.png.length).toBeGreaterThan(200);
		},
		20_000,
	);

	it(
		"renders a simple mermaid flowchart as a real PNG",
		async () => {
			const result = await kroki.render("mermaid", SIMPLE_MERMAID);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			// PNG magic number check — the response is a real image, not HTML,
			// not JSON, not a redirect body.
			expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);

			// Size floor: the simplest mermaid rendered by kroki comes back at
			// several KB. Anything under 200 bytes is suspect (a placeholder,
			// a corrupted stream, a zero-byte response).
			expect(result.png.length).toBeGreaterThan(200);
		},
		20_000,
	);

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
		20_000,
	);

	it(
		"survives a cancellation mid-flight via AbortSignal",
		async () => {
			const controller = new AbortController();
			// Fire abort almost immediately — likely lands before the response.
			setTimeout(() => controller.abort(), 10);

			const result = await kroki.render("mermaid", SIMPLE_MERMAID, controller.signal);

			expect(result.ok).toBe(false);
			// The error message content depends on where in the round-trip
			// the abort took effect. All paths must produce ok:false without
			// throwing.
		},
		20_000,
	);
});
