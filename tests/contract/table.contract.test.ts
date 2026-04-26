/**
 * Contract test for the `table` processor.
 *
 * Text-output variant: passes `outputKind: "text"` so the shared contract
 * helper asserts `typeof result.text === "string"` instead of
 * `Buffer.isBuffer(result.png)`.
 */

import { describe, expect, it } from "vitest";

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createTableProcessor } from "../../extensions/pi-fence/table.ts";

describe("table contract harness", () => {
	it("builds the processor under test", () => {
		expect(createTableProcessor().tags).toContain("csv");
	});
});

runFenceProcessorContract(
	"table-embedded",
	() => createTableProcessor(),
	{
		tag: "csv",
		goodSource: "name,age\nAlice,30\nBob,25",
		badSource: "",
		outputKind: "text",
	},
);
