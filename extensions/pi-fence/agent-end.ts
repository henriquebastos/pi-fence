/** Assistant-turn interception and render policy for pi-fence. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { Logger } from "./io/logger.ts";
import { formatByteLimitError } from "./limits.ts";
import { buildPiFenceOutputMessage, type TextContent } from "./messages.ts";
import { extractFencedBlocks, type FencedBlock } from "./parser.ts";
import type { MetricsCollector } from "./metrics.ts";
import type { ProcessorResolutionPolicy, RenderLimitsPolicy, SourceRetentionPolicy } from "./policy.ts";
import { errorOutput, type Availability, type FenceOutput, type FenceProcessor } from "./processor.ts";
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
	sourceRetention: SourceRetentionPolicy;
	renderLimits: RenderLimitsPolicy;
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
	sourceRetention,
	renderLimits,
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

		const maxBlocksPerTurn = renderLimits.maxBlocksPerTurn;
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
				sourceRetention,
				renderLimits,
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
	sourceRetention: SourceRetentionPolicy;
	renderLimits: RenderLimitsPolicy;
	metrics?: MetricsCollector;
}

async function renderBlock(block: FencedBlock, options: RenderBlockOptions): Promise<void> {
	const sourceBytes = Buffer.byteLength(block.source, "utf8");
	if (sourceBytes > options.renderLimits.fenceSourceMaxBytes) {
		sendLimitError(
			block,
			formatByteLimitError("Fence source", sourceBytes, options.renderLimits.fenceSourceMaxBytes),
			options,
		);
		return;
	}

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
		sourceBytes,
	});
	const rendered = await processor.render(block.tag, block.source);
	const result = enforceOutputLimit(rendered, options.renderLimits.processorOutputMaxBytes);
	logRenderResult(block, processor, result, options.logger);
	options.pi.sendMessage(buildPiFenceOutputMessage(block.tag, block.source, processor.id, result, options.sourceRetention));
	const succeeded = result.kind !== "error";
	options.metrics?.recordRender(processor.id, block.tag, succeeded);
	if (!succeeded) sendErrorFollowup(block, processor.id, result.error, options);
}

function enforceOutputLimit(output: FenceOutput, maxBytes: number): FenceOutput {
	const bytes = outputByteLength(output);
	return bytes > maxBytes
		? errorOutput(formatByteLimitError("Processor output", bytes, maxBytes))
		: output;
}

function outputByteLength(output: FenceOutput): number {
	if (output.kind === "image") return output.data.length;
	return Buffer.byteLength(output.kind === "text" ? output.text : output.error, "utf8");
}

function sendLimitError(block: FencedBlock, message: string, options: RenderBlockOptions): void {
	options.logger.warn("pi-fence", "block render rejected by limit", {
		tag: block.tag,
		error: message,
	});
	options.pi.sendMessage(buildPiFenceOutputMessage(
		block.tag,
		block.source,
		"pi-fence",
		errorOutput(message),
		options.sourceRetention,
	));
	options.metrics?.recordRender("pi-fence", block.tag, false);
	sendErrorFollowup(block, "pi-fence", message, options);
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
