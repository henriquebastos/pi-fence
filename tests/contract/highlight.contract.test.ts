/**
 * Contract test for the `highlight` processor.
 *
 * Text-output variant: passes `outputKind: "text"` so the shared contract
 * helper asserts `typeof result.text === "string"`.
 */

import { describe, expect, it } from "vitest";

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createHighlightProcessor } from "../../extensions/pi-fence/highlight.ts";

describe("highlight contract harness", () => {
	it("builds the processor under test", () => {
		expect(createHighlightProcessor().tags).toContain("sql");
	});
});

runFenceProcessorContract(
	"highlight-embedded",
	() => createHighlightProcessor(),
	{
		tag: "sql",
		goodSource: "SELECT name FROM users WHERE age > 30",
		badSource: "",
		outputKind: "text",
	},
);
