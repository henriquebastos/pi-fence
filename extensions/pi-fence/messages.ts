/** Message helpers for pi-fence custom render output. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { formatProcessorLines, listProcessors, type ProcessorListing } from "./list.ts";
import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";
import {
	type PiFenceListDetails,
	type PiFenceOutputDetails,
} from "./renderer.ts";
import type { BindingResolution } from "./resolve.ts";

export const PI_FENCE_OUTPUT_MESSAGE_TYPE = "pi-fence:output";
export const PI_FENCE_LIST_MESSAGE_TYPE = "pi-fence:list";

export function sendPiFenceListMessage(
	pi: ExtensionAPI,
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	bindingRows: readonly BindingResolution[],
	disabled?: ReadonlySet<string>,
	endpoints?: Readonly<Record<string, string>>,
): void {
	const listings: ProcessorListing[] = listProcessors(
		processors,
		availability,
		{ disabled, endpoints },
	);
	const lines = formatProcessorLines(listings, bindingRows);
	const details: PiFenceListDetails & {
		listings: ProcessorListing[];
		bindings: readonly BindingResolution[];
	} = {
		lines,
		listings,
		bindings: bindingRows,
	};
	pi.sendMessage({
		customType: PI_FENCE_LIST_MESSAGE_TYPE,
		content: [{ type: "text", text: lines.join("\n") }] as never,
		details: details as never,
		display: true,
	});
}

export function buildPiFenceOutputMessage(
	tag: string,
	source: string,
	processorId: string,
	result: FenceResult,
): Parameters<ExtensionAPI["sendMessage"]>[0] {
	const details: PiFenceOutputDetails = {
		tag,
		processor: processorId,
		kind: result.ok ? "ok" : "error",
		source,
	};

	if (result.ok) {
		return {
			customType: PI_FENCE_OUTPUT_MESSAGE_TYPE,
			content: [
				{
					type: "image",
					data: result.png.toString("base64"),
					mimeType: "image/png",
				},
			] as never,
			details: details as never,
			display: true,
		};
	}

	return {
		customType: PI_FENCE_OUTPUT_MESSAGE_TYPE,
		content: [
			{
				type: "text",
				text: result.error,
			},
		] as never,
		details: details as never,
		display: true,
	};
}
