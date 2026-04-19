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

import { Box, Image, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { HttpClient } from "../../tests/utilities/http-client.ts";
import { NodeHttpClient } from "../../tests/utilities/http-client.ts";
import type { Logger } from "../../tests/utilities/logger.ts";
import { NodeLogger } from "../../tests/utilities/logger.ts";

import { extractFencedBlocks } from "./parser.ts";
import { createKrokiRenderer } from "./kroki.ts";
import { formatProcessorLines, listProcessors, type ProcessorListing } from "./list.ts";
import type { FenceProcessor, FenceResult } from "./processor.ts";
import {
	createPiFenceListRenderer,
	createPiFenceMessageRenderer,
	type PiFenceListDetails,
	type PiFenceOutputDetails,
} from "./renderer.ts";

const CUSTOM_MESSAGE_TYPE = "pi-fence:output";
const LIST_MESSAGE_TYPE = "pi-fence:list";

// Subcommands pi-fence's `/fence` command accepts today. Widened by
// future stories (`/fence doctor`, `/fence trace`).
const FENCE_SUBCOMMANDS = ["list"] as const;

// Tags pi-fence claims on fenced blocks in the assistant's output. Order
// is for readability; matching is by exact string membership.
//
// The Kroki processor resolves its own aliases (e.g. `dot` -> `graphviz`)
// at request time, so both aliases and canonical names appear here.
const SUPPORTED_TAGS = [
	"mermaid",
	"graphviz",
	"dot",
	"plantuml",
	"puml",
	"d2",
];
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
	const processor = deps.processor ?? createKrokiRenderer(deps.http, undefined, deps.logger);
	const processors: FenceProcessor[] = [processor];

	// Custom message renderers — compose pi-tui primitives around the
	// image/error content pi's runtime draws.
	const tuiPrimitives = {
		Box: Box as never,
		Text: Text as never,
		Spacer: Spacer as never,
		Image: Image as never,
		truncateToWidth,
	};
	pi.registerMessageRenderer(
		CUSTOM_MESSAGE_TYPE,
		createPiFenceMessageRenderer(tuiPrimitives) as never,
	);
	pi.registerMessageRenderer(
		LIST_MESSAGE_TYPE,
		createPiFenceListRenderer(tuiPrimitives) as never,
	);

	// Slash command: `/fence <subcommand>`. Today the only subcommand is
	// `list`. Unknown or empty subcommands surface a warning naming the
	// available ones — help text grows when more subcommands exist.
	pi.registerCommand("fence", {
		description: "List or inspect pi-fence processors (usage: /fence list)",
		handler: async (args, ctx) => {
			const subcommand = args.trim().split(/\s+/)[0] ?? "";
			deps.logger.debug("command", "/fence invoked", { subcommand });
			if (subcommand === "list") {
				sendListMessage(pi, processors);
				return;
			}
			notifyUnknownSubcommand(ctx, subcommand);
			deps.logger.warn("command", "unknown subcommand", { subcommand });
		},
	});

	// Hook the assistant's turn — parse fenced blocks, render each via the
	// processor, emit a custom message per block.
	pi.on("agent_end", async (event, _ctx) => {
		const assistantText = extractAssistantText(event.messages);
		if (!assistantText) return;

		const blocks = extractFencedBlocks(assistantText, SUPPORTED_TAGS);
		deps.logger.debug("pi-fence", "agent_end parsed", {
			assistantTextBytes: assistantText.length,
			blocks: blocks.length,
		});
		if (blocks.length === 0) return;

		const toRender = blocks.slice(0, MAX_BLOCKS_PER_TURN);
		if (blocks.length > MAX_BLOCKS_PER_TURN) {
			deps.logger.warn(
				"pi-fence",
				`Assistant emitted ${blocks.length} fenced blocks; rendering first ${MAX_BLOCKS_PER_TURN}`,
			);
		}

		for (const block of toRender) {
			deps.logger.debug("pi-fence", "rendering block", {
				tag: block.tag,
				processor: processor.id,
				sourceBytes: block.source.length,
			});
			const result = await processor.render(block.tag, block.source);
			if (result.ok) {
				deps.logger.info("pi-fence", "block rendered", {
					tag: block.tag,
					processor: processor.id,
					bytes: result.png.length,
				});
			} else {
				deps.logger.warn("pi-fence", "block render failed", {
					tag: block.tag,
					processor: processor.id,
					error: result.error.slice(0, 200),
				});
			}
			pi.sendMessage(buildCustomMessage(block.tag, block.source, processor.id, result));
		}
	});
}

// ---------------------------------------------------------------------------
// /fence command helpers
// ---------------------------------------------------------------------------

function sendListMessage(pi: ExtensionAPI, processors: readonly FenceProcessor[]): void {
	const listings: ProcessorListing[] = listProcessors(processors);
	const lines = formatProcessorLines(listings);
	const details: PiFenceListDetails & { listings: ProcessorListing[] } = {
		lines,
		listings,
	};
	pi.sendMessage({
		customType: LIST_MESSAGE_TYPE,
		content: [{ type: "text", text: lines.join("\n") }] as never,
		details: details as never,
		display: true,
	});
}

/**
 * Shape of the minimal bit of `ExtensionCommandContext` pi-fence uses. We
 * only ever call `ctx.ui.notify`, so typing it as this narrow slice keeps
 * the unit test's fake context compatible without pulling in the full
 * pi-coding-agent ctx type.
 */
interface NotifyContext {
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

function notifyUnknownSubcommand(ctx: NotifyContext, subcommand: string): void {
	const available = FENCE_SUBCOMMANDS.join(", ");
	const prefix = subcommand === "" ? "No subcommand given" : `Unknown subcommand '${subcommand}'`;
	ctx.ui.notify(`${prefix}. Available: ${available}`, "warning");
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
