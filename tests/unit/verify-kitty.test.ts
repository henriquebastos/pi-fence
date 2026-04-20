/**
 * Unit tests for `countKittyImages` — the pipeline's Kitty graphics
 * sentinel pre-counter. The pipeline awaits this many
 * `ImageAddon.onImageAdded` events before screenshotting, so this
 * function's correctness directly gates the pipeline's determinism.
 *
 * Only transmit actions (`a=T` / `a=t`) count; query (`a=q`) and
 * delete (`a=d`) do not. Multi-chunk transmits (`m=1` continuation)
 * count as a single image.
 */

import { describe, expect, it } from "vitest";

import { countKittyImages } from "../../scripts/verify/kitty.ts";
import { getScenario } from "../../scripts/verify/scenarios.ts";

describe("countKittyImages", () => {
	it("returns 0 for a stream with no APCs", () => {
		expect(countKittyImages("hello world")).toBe(0);
		expect(countKittyImages("")).toBe(0);
		expect(countKittyImages("\x1b[0m some text \x1b[2J")).toBe(0);
	});

	it("counts a single single-chunk transmit (a=T)", () => {
		const single = "\x1b_Ga=T,f=100,c=60,r=30;base64payload\x1b\\";
		expect(countKittyImages(single)).toBe(1);
	});

	it("counts a single multi-chunk transmit (a=T with m=1 continuations) as one image", () => {
		const multi =
			"\x1b_Ga=T,f=100,m=1;chunk1\x1b\\" +
			"\x1b_Gm=1;chunk2\x1b\\" +
			"\x1b_Gm=0;chunk3\x1b\\";
		expect(countKittyImages(multi)).toBe(1);
	});

	it("does not count query actions (a=q)", () => {
		const query = "\x1b_Ga=q,i=1;\x1b\\";
		expect(countKittyImages(query)).toBe(0);
	});

	it("does not count delete actions (a=d)", () => {
		const del = "\x1b_Ga=d,d=A\x1b\\";
		expect(countKittyImages(del)).toBe(0);
	});

	it(
		"counts one image in the real mermaid-happy-path byte stream",
		async () => {
			const scenario = getScenario("mermaid-happy-path");
			const variant = scenario.variants[0];
			expect(variant).toBeDefined();
			const { bytes } = await scenario.build(variant!);
			expect(countKittyImages(bytes)).toBe(1);
		},
		20_000,
	);

	it(
		"counts zero images in the real mermaid-error-path byte stream",
		async () => {
			const scenario = getScenario("mermaid-error-path");
			const variant = scenario.variants[0];
			expect(variant).toBeDefined();
			const { bytes } = await scenario.build(variant!);
			expect(countKittyImages(bytes)).toBe(0);
		},
		20_000,
	);
});
