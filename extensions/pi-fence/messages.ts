/** Message helpers for pi-fence custom render output. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { formatProcessorLines, listProcessors, type ListProcessorsOptions, type ProcessorListing } from "./list.ts";
import { DEFAULT_SOURCE_PREVIEW_MAX_BYTES, DEFAULT_SOURCE_PREVIEW_MAX_LINES } from "./policy.ts";
import { normalizeFenceOutput, type FenceOutput } from "./processor.ts";
import type {
	Availability,
	FenceProcessor,
	FenceResult,
} from "./processor.ts";
import {
	type PiFenceListDetails,
	type PiFenceOutputDetails,
	type SourcePreviewDetails,
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

export interface SourcePreviewPolicy {
	maxBytes: number;
	maxLines: number;
}

export function buildPiFenceOutputMessage(
	tag: string,
	source: string,
	processorId: string,
	result: FenceResult | FenceOutput,
	previewPolicy: SourcePreviewPolicy = {
		maxBytes: DEFAULT_SOURCE_PREVIEW_MAX_BYTES,
		maxLines: DEFAULT_SOURCE_PREVIEW_MAX_LINES,
	},
): Parameters<ExtensionAPI["sendMessage"]>[0] {
	return buildPiFenceOutputMessageWithPreview(
		tag,
		buildSourcePreview(source, previewPolicy),
		processorId,
		result,
	);
}

export function buildPiFenceOutputMessageWithPreview(
	tag: string,
	sourcePreview: SourcePreviewDetails,
	processorId: string,
	result: FenceResult | FenceOutput,
): Parameters<ExtensionAPI["sendMessage"]>[0] {
	const output = normalizeFenceOutput(result);
	const details: PiFenceOutputDetails = {
		tag,
		processor: processorId,
		kind: output.kind === "error" ? "error" : "ok",
		outputKind: output.kind,
		sourcePreview,
	};
	return {
		customType: PI_FENCE_OUTPUT_MESSAGE_TYPE,
		content: outputContent(output),
		details,
		display: true,
	};
}

export function buildBoundedSourcePreview(
	source: string,
	originalBytes: number,
	policy: SourcePreviewPolicy,
): SourcePreviewDetails {
	const text = previewPrefix(source, policy);
	const retainedBytes = Buffer.byteLength(text, "utf8");
	return {
		text,
		truncated: true,
		omittedBytes: Math.max(0, originalBytes - retainedBytes),
		omittedLines: 0,
	};
}

function outputContent(output: FenceOutput): MessageContent[] {
	if (output.kind === "image") {
		return [{ type: "image", data: output.data.toString("base64"), mimeType: output.mimeType }];
	}
	if (output.kind === "text") return [{ type: "text", text: output.text }];
	return [{ type: "text", text: output.error }];
}

function buildSourcePreview(source: string, policy: SourcePreviewPolicy): SourcePreviewDetails {
	const sourceLines = source.split(/\r?\n/);
	const retainedLines = sourceLines.slice(0, policy.maxLines);
	const lineClipped = retainedLines.length < sourceLines.length;
	const linePreview = retainedLines.join("\n");
	const text = clipUtf8ToBytes(linePreview, policy.maxBytes);
	const originalBytes = Buffer.byteLength(source, "utf8");
	const retainedBytes = Buffer.byteLength(text, "utf8");
	return {
		text,
		truncated: lineClipped || retainedBytes < Buffer.byteLength(linePreview, "utf8"),
		omittedBytes: Math.max(0, originalBytes - retainedBytes),
		omittedLines: Math.max(0, sourceLines.length - retainedLines.length),
	};
}

function previewPrefix(source: string, policy: SourcePreviewPolicy): string {
	let out = "";
	let bytes = 0;
	let lines = 1;
	for (const char of source) {
		if (char === "\n" && lines >= policy.maxLines) break;
		const charBytes = Buffer.byteLength(char, "utf8");
		if (bytes + charBytes > policy.maxBytes) break;
		out += char;
		bytes += charBytes;
		if (char === "\n") lines += 1;
	}
	return out;
}

function clipUtf8ToBytes(text: string, maxBytes: number): string {
	return previewPrefix(text, { maxBytes, maxLines: Number.POSITIVE_INFINITY });
}
