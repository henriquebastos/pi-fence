/** Assistant-turn interception and render policy for pi-fence. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { Logger } from "./io/logger.ts";
import { buildPiFenceOutputMessage, type TextContent } from "./messages.ts";
import { extractFencedBlocks, type FencedBlock } from "./parser.ts";
import type { MetricsCollector } from "./metrics.ts";
import type { ProcessorResolutionPolicy } from "./policy.ts";
import type { Availability, FenceProcessor } from "./processor.ts";
import { resolveBindings, resolveProcessor, type BindingResolution } from "./resolve.ts";

export interface ThemeState {
	currentName?: string;
}

interface RegisterAgentEndHandlerOptions {
	pi: ExtensionAPI;
	logger: Logger;
	processors: readonly FenceProcessor[];
	availability: ReadonlyMap<string, Availability>;
	processorPolicy: ProcessorResolutionPolicy;
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
	processorPolicy,
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
			await renderBlock(block, {
				pi,
				logger,
				processors,
				availability,
				processorPolicy,
				metrics,
			});
		}
	});
}

interface RenderBlockOptions {
	pi: ExtensionAPI;
	logger: Logger;
	processors: readonly FenceProcessor[];
	availability: ReadonlyMap<string, Availability>;
	processorPolicy: ProcessorResolutionPolicy;
	metrics?: MetricsCollector;
}

async function renderBlock(block: FencedBlock, options: RenderBlockOptions): Promise<void> {
	const { processor, steps, ambiguity } = resolveProcessor(
		options.processors,
		options.availability,
		block.tag,
		options.processorPolicy.bindings,
		options.processorPolicy.blockedProcessors,
		options.processorPolicy.processorPrecedence,
		options.processorPolicy.blockedTags,
	);
	options.logger.debug("pi-fence", "processor resolution", {
		tag: block.tag,
		processor: processor?.id ?? null,
		steps,
		...(ambiguity ? { ambiguity } : {}),
	});
	if (!processor) {
		if (!logBindingIssueForBlock(block, options)) {
			logUnresolvedBlock(block, options.logger, ambiguity);
		}
		return;
	}

	options.logger.debug("pi-fence", "rendering block", {
		tag: block.tag,
		processor: processor.id,
		sourceBytes: block.source.length,
	});
	const result = await processor.render(block.tag, block.source);
	logRenderResult(block, processor, result, options.logger);
	options.pi.sendMessage(buildPiFenceOutputMessage(block.tag, block.source, processor.id, result));
	const succeeded = result.kind !== "error";
	options.metrics?.recordRender(processor.id, block.tag, succeeded);
	if (!succeeded) sendErrorFollowup(block, processor.id, result.error, options);
}

function logBindingIssueForBlock(block: FencedBlock, options: RenderBlockOptions): boolean {
	const issue = resolveBindings(
		options.processors,
		options.availability,
		options.processorPolicy.bindings,
		options.processorPolicy.blockedProcessors,
		options.processorPolicy.processorPrecedence,
		options.processorPolicy.blockedTags,
	).find((row): row is Extract<BindingResolution, { status: "issue" }> =>
		row.tag === block.tag && row.status === "issue",
	);
	if (!issue) return false;
	logBindingIssue(issue, options.logger);
	return true;
}

function logBindingIssue(row: Extract<BindingResolution, { status: "issue" }>, logger: Logger): void {
	if (row.selector === "placement") {
		logger.warn("pi-fence", "binding issue", {
			tag: row.tag,
			placement: row.placement,
			reason: row.reason,
			...("processorIds" in row ? { processorIds: row.processorIds } : {}),
		});
		return;
	}
	logger.warn("pi-fence", "binding issue", {
		tag: row.tag,
		processorId: row.processorId,
		reason: row.reason,
	});
}

function logUnresolvedBlock(
	block: FencedBlock,
	logger: Logger,
	ambiguity: ReturnType<typeof resolveProcessor>["ambiguity"],
): void {
	if (ambiguity) {
		logger.warn("pi-fence", "ambiguous processor resolution", {
			tag: block.tag,
			...ambiguity,
		});
		return;
	}
	logger.warn("pi-fence", "no available processor for tag", { tag: block.tag });
}

function logRenderResult(
	block: FencedBlock,
	processor: FenceProcessor,
	result: Awaited<ReturnType<FenceProcessor["render"]>>,
	logger: Logger,
): void {
	if (result.kind === "error") {
		logger.warn("pi-fence", "block render failed", {
			tag: block.tag,
			processor: processor.id,
			error: result.error.slice(0, 200),
		});
		return;
	}
	const bytes = result.kind === "image" ? result.data.length : Buffer.byteLength(result.text, "utf8");
	logger.info("pi-fence", "block rendered", {
		tag: block.tag,
		processor: processor.id,
		bytes,
	});
}

function sendErrorFollowup(
	block: FencedBlock,
	processorId: string,
	error: string,
	options: Pick<RenderBlockOptions, "pi" | "logger">,
): void {
	const content: TextContent[] = [
		{
			type: "text",
			text: `pi-fence: render error for \`${block.tag}\` via ${processorId}: ${error}`,
		},
	];
	options.pi.sendMessage(
		{
			customType: "pi-fence:error-followup",
			content,
			display: false,
		},
		{ deliverAs: "followUp" },
	);
	options.logger.debug("pi-fence", "error follow-up sent to LLM", {
		tag: block.tag,
		processor: processorId,
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
