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
	DEFAULT_VARIANT,
	getScenario,
	listScenarios,
} from "../../scripts/verify/scenarios.ts";

describe("scenario registry", () => {
	it("listScenarios() returns the registered scenarios", () => {
		const names = listScenarios().map((s) => s.name);
		expect(names).toContain("mermaid-happy-path");
		expect(names).toContain("mermaid-error-path");
		expect(names).toContain("mermaid-user-agent-trail");
	});

	it("each scenario has a unique name, a description, a build function, and at least one variant", () => {
		const seen = new Set<string>();
		for (const scenario of listScenarios()) {
			expect(scenario.name.length).toBeGreaterThan(0);
			expect(scenario.description.length).toBeGreaterThan(0);
			expect(typeof scenario.build).toBe("function");
			expect(scenario.variants.length).toBeGreaterThan(0);
			expect(seen.has(scenario.name)).toBe(false);
			seen.add(scenario.name);

			const variantNames = new Set<string>();
			for (const variant of scenario.variants) {
				expect(variant.name.length).toBeGreaterThan(0);
				expect(variant.cols).toBeGreaterThan(0);
				expect(variant.rows).toBeGreaterThan(0);
				expect(variantNames.has(variant.name)).toBe(false);
				variantNames.add(variant.name);
			}
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
		"mermaid-happy-path default variant produces a byte stream with the Kitty APC",
		async () => {
			const scenario = getScenario("mermaid-happy-path");
			const variant = scenario.variants[0];
			expect(variant).toBeDefined();
			const { bytes } = await scenario.build(variant!);
			expect(bytes.length).toBeGreaterThan(0);
			// Kitty graphics sequence must be present — this is the whole
			// point of an image-rendering scenario.
			expect(bytes).toContain("\x1b_G");
		},
		20_000,
	);

	it("DEFAULT_VARIANT exposes the S1-era 120x60 shape", () => {
		expect(DEFAULT_VARIANT.name).toBe("default");
		expect(DEFAULT_VARIANT.cols).toBe(120);
		expect(DEFAULT_VARIANT.rows).toBe(60);
	});

	it(
		"mermaid-error-path default variant produces a byte stream with no Kitty APC and an error-shaped label",
		async () => {
			const scenario = getScenario("mermaid-error-path");
			const variant = scenario.variants[0];
			expect(variant).toBeDefined();
			const { bytes } = await scenario.build(variant!);
			expect(bytes.length).toBeGreaterThan(0);
			// Error path has text content, not an image: no Kitty APC emits.
			expect(bytes).not.toContain("\x1b_G");
			// The error label shape is a user-visible surface; pinning it
			// in the bytes guards against silent phrasing drift.
			expect(bytes).toContain("Error rendering mermaid via kroki");
		},
		20_000,
	);

	it(
		"mermaid-user-agent-trail default variant composes user + assistant + pi-fence:output and emits the Kitty APC",
		async () => {
			const scenario = getScenario("mermaid-user-agent-trail");
			const variant = scenario.variants[0];
			expect(variant).toBeDefined();
			const { bytes } = await scenario.build(variant!);
			expect(bytes.length).toBeGreaterThan(0);
			// The custom-message wraps pi-fence's renderer which emits the
			// PNG via the Kitty graphics protocol: the APC MUST appear.
			expect(bytes).toContain("\x1b_G");
			// The single default variant pins the S1-era shape; other
			// widths are deferred per the story scope.
			expect(scenario.variants).toHaveLength(1);
			expect(variant!.name).toBe("default");
		},
		20_000,
	);
});
