/** Assistant-turn interception and render policy for pi-fence. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { Logger } from "./io/logger.ts";
import { buildPiFenceOutputMessage, type TextContent } from "./messages.ts";
import { extractFencedBlocks } from "./parser.ts";
import type { MetricsCollector } from "./metrics.ts";
import type { Availability, FenceProcessor } from "./processor.ts";
import { resolveProcessor } from "./resolve.ts";

export interface ThemeState {
	currentName?: string;
}

interface RegisterAgentEndHandlerOptions {
	pi: ExtensionAPI;
	logger: Logger;
	processors: readonly FenceProcessor[];
	availability: ReadonlyMap<string, Availability>;
	bindings: Readonly<Record<string, string>>;
	disabled: ReadonlySet<string>;
	supportedTags: string[] | (() => string[]);
	themeState: ThemeState;
	maxBlocksPerTurn: number;
	metrics?: MetricsCollector;
}

export function registerPiFenceAgentEndHandler({
	pi,
	logger,
	processors,
	availability,
	bindings,
	disabled,
	supportedTags,
	themeState,
	maxBlocksPerTurn,
	metrics,
}: RegisterAgentEndHandlerOptions): void {
	pi.on("agent_end", async (event, ctx) => {
		tryCaptureThemeName(ctx, logger, themeState);

		const assistantText = extractAssistantText(event.messages);
		if (!assistantText) return;

		const tags = typeof supportedTags === "function" ? supportedTags() : supportedTags;
		const blocks = extractFencedBlocks(assistantText, tags);
		logger.debug("pi-fence", "agent_end parsed", {
			assistantTextBytes: assistantText.length,
			blocks: blocks.length,
		});
		if (blocks.length === 0) return;

		const toRender = blocks.slice(0, maxBlocksPerTurn);
		if (blocks.length > maxBlocksPerTurn) {
			logger.warn(
				"pi-fence",
				`Assistant emitted ${blocks.length} fenced blocks; rendering first ${maxBlocksPerTurn}`,
			);
		}

		for (const block of toRender) {
			const { processor, steps } = resolveProcessor(
				processors,
				availability,
				block.tag,
				bindings,
				disabled,
			);
			logger.debug("pi-fence", "processor resolution", {
				tag: block.tag,
				processor: processor?.id ?? null,
				steps,
			});
			if (!processor) {
				logger.warn("pi-fence", "no available processor for tag", { tag: block.tag });
				continue;
			}
			logger.debug("pi-fence", "rendering block", {
				tag: block.tag,
				processor: processor.id,
				sourceBytes: block.source.length,
			});
			const result = await processor.render(block.tag, block.source);
			if (result.ok) {
				const bytes =
					"png" in result ? result.png.length : Buffer.byteLength(result.text, "utf8");
				logger.info("pi-fence", "block rendered", {
					tag: block.tag,
					processor: processor.id,
					bytes,
				});
			} else {
				logger.warn("pi-fence", "block render failed", {
					tag: block.tag,
					processor: processor.id,
					error: result.error.slice(0, 200),
				});
			}
			pi.sendMessage(buildPiFenceOutputMessage(block.tag, block.source, processor.id, result));
			metrics?.recordRender(processor.id, block.tag, result.ok);

			// Feed the error back to the LLM so it can self-correct (D2).
			if (!result.ok) {
				const content: TextContent[] = [
					{
						type: "text",
						text: `pi-fence: render error for \`${block.tag}\` via ${processor.id}: ${result.error}`,
					},
				];
				pi.sendMessage(
					{
						customType: "pi-fence:error-followup",
						content,
						display: false,
					},
					{ deliverAs: "followUp" },
				);
				logger.debug("pi-fence", "error follow-up sent to LLM", {
					tag: block.tag,
					processor: processor.id,
				});
			}
		}
	});
}

function tryCaptureThemeName(
	ctx: unknown,
	logger: Logger,
	themeState: ThemeState,
): void {
	try {
		const themeName = (ctx as { ui?: { theme?: { name?: string } } })?.ui?.theme?.name;
		if (typeof themeName === "string" && themeName.length > 0) {
			themeState.currentName = themeName;
		}
	} catch (err) {
		logger.debug("pi-fence", "theme read failed", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

function extractAssistantText(messages: unknown): string {
	if (!Array.isArray(messages)) {
		return "";
	}

	let text = "";
	for (const message of messages as Array<{ role?: string; content?: unknown }>) {
		if (message?.role === "assistant") {
			text += extractAssistantContentText(message.content);
		}
	}
	return text;
}

function extractAssistantContentText(content: unknown): string {
	if (typeof content === "string") {
		return `${content}\n`;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	let text = "";
	for (const part of content as Array<{ type?: string; text?: string }>) {
		if (part?.type === "text" && typeof part.text === "string") {
			text += `${part.text}\n`;
		}
	}
	return text;
}
