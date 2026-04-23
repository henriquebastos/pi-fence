/**
 * Contract test for the `color` processor.
 *
 * Text-output variant: passes `outputKind: "text"`.
 */

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createColorProcessor } from "../../extensions/pi-fence/color.ts";

runFenceProcessorContract(
	"color",
	() => createColorProcessor(),
	{
		tag: "color",
		goodSource: "#ff5733",
		badSource: "",
		outputKind: "text",
	},
);
