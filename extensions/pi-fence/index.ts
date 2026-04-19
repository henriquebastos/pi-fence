/**
 * pi-fence — fenced code block processor extension.
 *
 * S1 implementation: interception-only; a single hardcoded Kroki processor
 * handles fenced `mermaid` blocks. Error feedback to the LLM (CV1.E2),
 * user-configurable processor binding (CV1.E1), local graphviz (CV0.E2),
 * and the rest of the roadmap land on top of this foundation.
 *
 * Module exports:
 *   - default (ExtensionFactory): wires production deps and calls
 *     createPiFenceExtension. This is what pi auto-discovers.
 *   - createPiFenceExtension(pi, deps): the test-friendly seam. Tests pass
 *     a FakeHttpClient and FakeLogger to avoid network and capture log
 *     output.
 */

import { Box, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { HttpClient } from "../../tests/utilities/http-client.ts";
import { NodeHttpClient } from "../../tests/utilities/http-client.ts";
import type { Logger } from "../../tests/utilities/logger.ts";
import { NodeLogger } from "../../tests/utilities/logger.ts";

import { extractFencedBlocks } from "./parser.ts";
import { createKrokiRenderer } from "./kroki.ts";
import type { FenceProcessor, FenceResult } from "./processor.ts";
import { createPiFenceMessageRenderer, type PiFenceOutputDetails } from "./renderer.ts";

const CUSTOM_MESSAGE_TYPE = "pi-fence:output";
const SUPPORTED_TAGS = ["mermaid"];
const MAX_BLOCKS_PER_TURN = 5;

export interface PiFenceDeps {
	http: HttpClient;
	logger: Logger;
	processor?: FenceProcessor;
}

/**
 * Wire pi-fence's hooks, commands, and renderer into the given ExtensionAPI.
 *
 * Separated from the default export so tests can supply fake deps. The
 * default export below wires production deps and calls through.
 */
export function createPiFenceExtension(pi: ExtensionAPI, deps: PiFenceDeps): void {
	const processor = deps.processor ?? createKrokiRenderer(deps.http);

	// Custom message renderer — composes pi-tui primitives around the
	// image/error content pi's runtime draws.
	const messageRenderer = createPiFenceMessageRenderer({
		Box: Box as never,
		Text: Text as never,
		Spacer: Spacer as never,
		truncateToWidth,
	});
	pi.registerMessageRenderer(CUSTOM_MESSAGE_TYPE, messageRenderer as never);

	// Hook the assistant's turn — parse fenced blocks, render each via the
	// processor, emit a custom message per block.
	pi.on("agent_end", async (event, _ctx) => {
		const assistantText = extractAssistantText(event.messages);
		if (!assistantText) return;

		const blocks = extractFencedBlocks(assistantText, SUPPORTED_TAGS);
		if (blocks.length === 0) return;

		const toRender = blocks.slice(0, MAX_BLOCKS_PER_TURN);
		if (blocks.length > MAX_BLOCKS_PER_TURN) {
			deps.logger.warn(
				"pi-fence",
				`Assistant emitted ${blocks.length} fenced blocks; rendering first ${MAX_BLOCKS_PER_TURN}`,
			);
		}

		for (const block of toRender) {
			const result = await processor.render(block.tag, block.source);
			pi.sendMessage(buildCustomMessage(block.tag, block.source, processor.id, result));
		}
	});
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function extractAssistantText(messages: unknown): string {
	if (!Array.isArray(messages)) return "";
	let text = "";
	for (const message of messages as Array<{ role?: string; content?: unknown }>) {
		if (message?.role !== "assistant") continue;
		const content = message.content;
		if (typeof content === "string") {
			text += content + "\n";
			continue;
		}
		if (Array.isArray(content)) {
			for (const part of content as Array<{ type?: string; text?: string }>) {
				if (part?.type === "text" && typeof part.text === "string") {
					text += part.text + "\n";
				}
			}
		}
	}
	return text;
}

function buildCustomMessage(
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
			customType: CUSTOM_MESSAGE_TYPE,
			content: [
				{
					type: "image",
					data: result.png.toString("base64"),
					mimeType: "image/png",
				},
				{
					type: "text",
					text: `Rendered ${tag} via ${processorId}`,
				},
			] as never,
			details: details as never,
			display: true,
		};
	}

	return {
		customType: CUSTOM_MESSAGE_TYPE,
		content: [
			{
				type: "text",
				text: `Error rendering ${tag} via ${processorId}: ${result.error}`,
			},
		] as never,
		details: details as never,
		display: true,
	};
}

// ---------------------------------------------------------------------------
// Default export: production wiring
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
	createPiFenceExtension(pi, {
		http: new NodeHttpClient(),
		logger: new NodeLogger(),
	});
}
