/**
 * Unit tests for the scenario registry the CVx.E2 verifier consumes.
 *
 * The registry is the seam between "what pi-fence rendering shape are
 * we verifying" and "the headless pipeline that paints it." Each
 * scenario's `build()` function produces a byte stream + intended
 * terminal dimensions; both flow through the render pipeline unchanged.
 *
 * These tests cover the registry's contract, not the pipeline itself.
 * The pipeline (Chromium + xterm.js + addon-image) is exercised in the
 * Render Image live-suite test under `tests/render-image/`.
 */

import { describe, expect, it } from "vitest";

import {
	getScenario,
	listScenarios,
} from "../../scripts/verify/scenarios.ts";

describe("scenario registry", () => {
	it("listScenarios() returns at least the mermaid-happy-path scenario", () => {
		const names = listScenarios().map((s) => s.name);
		expect(names).toContain("mermaid-happy-path");
	});

	it("each scenario has a unique name, a description, and a build function", () => {
		const seen = new Set<string>();
		for (const scenario of listScenarios()) {
			expect(scenario.name.length).toBeGreaterThan(0);
			expect(scenario.description.length).toBeGreaterThan(0);
			expect(typeof scenario.build).toBe("function");
			expect(seen.has(scenario.name)).toBe(false);
			seen.add(scenario.name);
		}
	});

	it("getScenario('mermaid-happy-path') resolves to the registered scenario", () => {
		const scenario = getScenario("mermaid-happy-path");
		expect(scenario.name).toBe("mermaid-happy-path");
	});

	it("getScenario() throws a clear error for an unknown name", () => {
		expect(() => getScenario("does-not-exist")).toThrow(/does-not-exist/);
	});

	it(
		"mermaid-happy-path.build() produces a non-empty byte stream and sensible dimensions",
		async () => {
			const scenario = getScenario("mermaid-happy-path");
			const { bytes, cols, rows } = await scenario.build();
			expect(bytes.length).toBeGreaterThan(0);
			// Kitty graphics sequence must be present — this is the whole
			// point of the render scenario.
			expect(bytes).toContain("\x1b_G");
			// 120x60 matches the render-layer harness, which the scenario
			// inherits. The exact values matter less than "plausible
			// terminal dimensions."
			expect(cols).toBeGreaterThanOrEqual(80);
			expect(rows).toBeGreaterThanOrEqual(20);
		},
		20_000,
	);
});
