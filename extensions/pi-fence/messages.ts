/** Message helpers for pi-fence custom render output. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { formatProcessorLines, listProcessors, type ListProcessorsOptions, type ProcessorListing } from "./list.ts";
import type {
	Availability,
	FenceProcessor,
	FenceResult,
} from "./processor.ts";
import {
	type PiFenceListDetails,
	type PiFenceOutputDetails,
} from "./renderer.ts";
import type { BindingResolution } from "./resolve.ts";

export const PI_FENCE_OUTPUT_MESSAGE_TYPE = "pi-fence:output";
export const PI_FENCE_LIST_MESSAGE_TYPE = "pi-fence:list";

export interface TextContent {
	type: "text";
	text: string;
}

export interface ImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export type MessageContent = TextContent | ImageContent;

export interface PiFenceListMessageOptions {
	processors: readonly FenceProcessor[];
	availability: ReadonlyMap<string, Availability>;
	bindingRows: readonly BindingResolution[];
	listOptions?: ListProcessorsOptions;
}

export function sendPiFenceListMessage(
	pi: ExtensionAPI,
	{
		processors,
		availability,
		bindingRows,
		listOptions,
	}: PiFenceListMessageOptions,
): void {
	const listings: ProcessorListing[] = listProcessors(
		processors,
		availability,
		listOptions,
	);
	const lines = formatProcessorLines(listings, bindingRows, [...(listOptions?.blockedTags ?? [])]);
	const details: PiFenceListDetails & {
		listings: ProcessorListing[];
		bindings: readonly BindingResolution[];
		blockedTags: readonly string[];
	} = {
		lines,
		listings,
		bindings: bindingRows,
		blockedTags: [...(listOptions?.blockedTags ?? [])],
	};
	const content: TextContent[] = [{ type: "text", text: lines.join("\n") }];
	pi.sendMessage<typeof details>({
		customType: PI_FENCE_LIST_MESSAGE_TYPE,
		content,
		details,
		display: true,
	});
}

export function sendPiFenceDoctorMessage(
	pi: ExtensionAPI,
	lines: readonly string[],
): void {
	const content: TextContent[] = [{ type: "text", text: lines.join("\n") }];
	const details: PiFenceListDetails = { lines: [...lines] };
	pi.sendMessage<PiFenceListDetails>({
		customType: PI_FENCE_LIST_MESSAGE_TYPE,
		content,
		details,
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
		const content: MessageContent[] =
			"png" in result
				? [
						{
							type: "image",
							data: result.png.toString("base64"),
							mimeType: "image/png",
						},
					]
				: [{ type: "text", text: result.text }];

		return {
			customType: PI_FENCE_OUTPUT_MESSAGE_TYPE,
			content,
			details,
			display: true,
		};
	}

	const content: TextContent[] = [
		{
			type: "text",
			text: result.error,
		},
	];
	return {
		customType: PI_FENCE_OUTPUT_MESSAGE_TYPE,
		content,
		details,
		display: true,
	};
}
