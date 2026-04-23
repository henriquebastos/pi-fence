/**
 * Contract test for the `table` processor.
 *
 * Text-output variant: passes `outputKind: "text"` so the shared contract
 * helper asserts `typeof result.text === "string"` instead of
 * `Buffer.isBuffer(result.png)`.
 */

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createTableProcessor } from "../../extensions/pi-fence/table.ts";

runFenceProcessorContract(
	"table",
	() => createTableProcessor(),
	{
		tag: "csv",
		goodSource: "name,age\nAlice,30\nBob,25",
		badSource: "",
		outputKind: "text",
	},
);
