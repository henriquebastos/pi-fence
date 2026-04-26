/**
 * Contract test for the `qr` processor.
 *
 * Image-output variant (default): asserts `Buffer.isBuffer(result.png)`.
 */

import { describe, expect, it } from "vitest";

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createQrProcessor } from "../../extensions/pi-fence/qr.ts";

describe("qr contract harness", () => {
	it("builds the processor under test", () => {
		expect(createQrProcessor().tags).toContain("qr");
	});
});

runFenceProcessorContract(
	"qr-embedded",
	() => createQrProcessor(),
	{
		tag: "qr",
		goodSource: "https://example.com",
		badSource: "",
	},
);
