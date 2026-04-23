/**
 * Contract test for the `qr` processor.
 *
 * Image-output variant (default): asserts `Buffer.isBuffer(result.png)`.
 */

import { runFenceProcessorContract } from "./fence-processor.ts";
import { createQrProcessor } from "../../extensions/pi-fence/qr.ts";

runFenceProcessorContract(
	"qr",
	() => createQrProcessor(),
	{
		tag: "qr",
		goodSource: "https://example.com",
		badSource: "",
	},
);
