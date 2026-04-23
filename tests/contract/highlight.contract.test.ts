/**
 * Contract test for the `highlight` processor.
 *
 * Text-output variant: passes `outputKind: "text"` so the shared contract
 * helper asserts `typeof result.text === "string"`.
 */

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createHighlightProcessor } from "../../extensions/pi-fence/highlight.ts";

runFenceProcessorContract(
	"highlight",
	() => createHighlightProcessor(),
	{
		tag: "sql",
		goodSource: "SELECT name FROM users WHERE age > 30",
		badSource: "",
		outputKind: "text",
	},
);
