/**
 * Contract test for the `color` processor.
 *
 * Text-output variant: passes `outputKind: "text"`.
 */

import { describe, expect, it } from "vitest";

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createColorProcessor } from "../../extensions/pi-fence/color.ts";

describe("color contract harness", () => {
	it("builds the processor under test", () => {
		expect(createColorProcessor().tags).toContain("color");
	});
});

runFenceProcessorContract(
	"color-embedded",
	() => createColorProcessor(),
	{
		tag: "color",
		goodSource: "#ff5733",
		badSource: "",
		outputKind: "text",
	},
);
