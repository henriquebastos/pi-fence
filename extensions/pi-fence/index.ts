/**
 * pi-fence — fenced code block processor extension.
 *
 * CV0.E2.S1 wiring: capability-based registry with two processors. The
 * graphviz-local processor shells out to the local `dot` binary when
 * available; Kroki handles everything else (and graphviz itself on
 * machines without `dot`). Resolution is capability-based and
 * registration-order-preferred; explicit per-tag bindings from settings
 * defer to CV0.E2.S2.
 *
 * Module exports:
 *   - default (ExtensionFactory): wires production deps and awaits
 *     createPiFenceExtension. This is what pi auto-discovers.
 *   - createPiFenceExtension(pi, deps): test-friendly seam. Tests pass a
 *     FakeHttpClient + FakeShellRunner + FakeLogger to avoid I/O and
 *     capture outputs. Now async: probeAvailability runs every
 *     processor's available() once at wire time and the map is cached
 *     for the session.
 */

import { Box, Image, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { HttpClient } from "../../tests/utilities/http-client.ts";
import { NodeHttpClient } from "../../tests/utilities/http-client.ts";
import type { Logger } from "../../tests/utilities/logger.ts";
import { NodeLogger } from "../../tests/utilities/logger.ts";
import type { ShellRunner } from "../../tests/utilities/shell-runner.ts";
import { NodeShellRunner } from "../../tests/utilities/shell-runner.ts";

import { loadPiFenceConfig, type LoadConfigOptions } from "./config.ts";
import { extractFencedBlocks } from "./parser.ts";
import { createGraphvizLocalRenderer } from "./graphviz-local.ts";
import { createKrokiRenderer, isDarkThemeName } from "./kroki.ts";
import { formatProcessorLines, listProcessors, type ProcessorListing } from "./list.ts";
import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";
import {
	collectSupportedTags,
	probeAvailability,
	resolveBindings,
	resolveProcessor,
	type BindingResolution,
} from "./resolve.ts";
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

const MAX_BLOCKS_PER_TURN = 5;

export interface PiFenceDeps {
	http: HttpClient;
	shell: ShellRunner;
	logger: Logger;
	/**
	 * Test-only override: pin the processor set. Production callers pass
	 * `undefined` and get the default `[graphviz-local, kroki]` pair.
	 * Tests that want deterministic resolution (the extension-layer
	 * cases for local-available vs local-unavailable) pass explicit
	 * processors instead of relying on the default registration order.
	 */
	processors?: FenceProcessor[];
	/**
	 * Options forwarded to `loadPiFenceConfig`. Tests override
	 * `globalConfigPath` / `projectConfigPath` / `home` / `cwd` to point
	 * into `os.tmpdir()`-scoped paths. Production callers pass
	 * `undefined` and the loader defaults to `<home>/.pi/agent/` +
	 * `<cwd>/.pi/`.
	 */
	configOptions?: LoadConfigOptions;
}

/**
 * Wire pi-fence's hooks, commands, and renderer into the given ExtensionAPI.
 *
 * Separated from the default export so tests can supply fake deps. The
 * default export below wires production deps and calls through. Async
 * because `probeAvailability` runs every processor's `available()` once
 * at wire time; the result is captured and reused for the session.
 */
export async function createPiFenceExtension(
	pi: ExtensionAPI,
	deps: PiFenceDeps,
): Promise<void> {
	// Latest pi theme name captured from event-handler contexts. Read at
	// render time by the Kroki appearance resolver so live theme changes
	// take effect without reconstructing the processor. Defaults to
	// undefined (treated as dark by `isDarkThemeName`) until the first
	// event fires — safe because pi's agent_end always fires before the
	// extension renders anything.
	let currentThemeName: string | undefined;

	// Default processor array in registration-order precedence:
	// graphviz-local first (wins graphviz/dot when `dot` is on PATH),
	// Kroki second (fallback for graphviz + default for every other tag).
	// Capability-based only in S1; explicit per-tag binding from settings
	// defers to S2.
	const processors: FenceProcessor[] = deps.processors ?? [
		createGraphvizLocalRenderer(deps.shell, deps.logger),
		createKrokiRenderer(deps.http, undefined, deps.logger, () =>
			isDarkThemeName(currentThemeName) ? "dark" : "light",
		),
	];

	// Wire-time capability probe. The returned map is captured in the
	// closure and reused by both the /fence list command and the
	// agent_end resolver. A processor that crashes during available()
	// is caught by probeAvailability and marked unavailable with the
	// thrown message — one misbehaving processor cannot take the
	// extension down at registration.
	const availability = await probeAvailability(processors);
	for (const processor of processors) {
		const status = availability.get(processor.id);
		if (status?.ok) {
			deps.logger.debug("pi-fence", "processor available", { id: processor.id });
		} else {
			deps.logger.info("pi-fence", "processor unavailable", {
				id: processor.id,
				reason: status && !status.ok ? status.reason : "availability unknown",
			});
		}
	}

	// Wire-time config load. User-level per-tag bindings override the
	// capability-based resolution rule. Missing / malformed / unreadable
	// config files return defaults + a warn log — never crash.
	const config = await loadPiFenceConfig({
		logger: deps.logger,
		...(deps.configOptions ?? {}),
	});
	const bindings: Readonly<Record<string, string>> = config.bindings;
	const bindingRows = resolveBindings(processors, availability, bindings);
	for (const row of bindingRows) {
		if (row.status === "effective") {
			deps.logger.info("pi-fence", "binding effective", {
				tag: row.tag,
				processorId: row.processorId,
			});
		} else {
			deps.logger.warn("pi-fence", "binding ignored", {
				tag: row.tag,
				processorId: row.processorId,
				reason: row.reason,
			});
		}
	}

	// The parser's fenced-block allowlist is derived from the registered
	// processors' canonical tags + alias keys. Adding a new processor in
	// a future story grows the allowlist automatically; no more duplicate
	// tag list to maintain.
	const supportedTags = collectSupportedTags(processors);

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
				sendListMessage(pi, processors, availability, bindingRows);
				return;
			}
			notifyUnknownSubcommand(ctx, subcommand);
			deps.logger.warn("command", "unknown subcommand", { subcommand });
		},
	});

	// Hook the assistant's turn — parse fenced blocks, render each via the
	// processor, emit a custom message per block.
	pi.on("agent_end", async (event, ctx) => {
		// Capture the current pi theme so the Kroki renderer can pick the
		// matching appearance. Reading `ctx.ui.theme.name` is safe in
		// production but throws in test environments that don't initialise
		// pi's global theme singleton. Swallow and fall back to the default
		// (dark) appearance.
		try {
			const themeName = (ctx as { ui?: { theme?: { name?: string } } })?.ui?.theme?.name;
			if (typeof themeName === "string" && themeName.length > 0) {
				currentThemeName = themeName;
			}
		} catch (err) {
			deps.logger.debug("pi-fence", "theme read failed", {
				error: err instanceof Error ? err.message : String(err),
			});
		}

		const assistantText = extractAssistantText(event.messages);
		if (!assistantText) return;

		const blocks = extractFencedBlocks(assistantText, supportedTags);
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
			const processor = resolveProcessor(processors, availability, block.tag, bindings);
			if (!processor) {
				// Shouldn't happen — supportedTags is derived from the same
				// processor set the parser uses, so an unresolvable tag means
				// every claimer is unavailable. Log and skip rather than
				// propagate an error panel; the user sees the raw fenced block
				// in the transcript, which is the pre-pi-fence baseline.
				deps.logger.warn("pi-fence", "no available processor for tag", {
					tag: block.tag,
				});
				continue;
			}
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

function sendListMessage(
	pi: ExtensionAPI,
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	bindingRows: readonly BindingResolution[],
): void {
	const listings: ProcessorListing[] = listProcessors(processors, availability);
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
		// Content is just the image. The renderer's chrome (`Rendered <tag>
		// via <processor>`) already labels the output; a duplicate text item
		// here would render twice when pi invokes our renderer. Earlier
		// versions included that text item as a fallback for imageless
		// terminals, but the renderer is authoritative, so the fallback only
		// produced the visible duplicate.
		return {
			customType: CUSTOM_MESSAGE_TYPE,
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

	// Symmetric with the happy-path branch above: the renderer's chrome
	// (`Error rendering <tag> via <processor>`) is authoritative and
	// already labels the output. The content item here is just the raw
	// upstream error body — prefixing it with the same `Error rendering
	// <tag> via <processor>:` string the renderer paints as its red
	// header produces a visible duplicate in the rendered panel.
	return {
		customType: CUSTOM_MESSAGE_TYPE,
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

// ---------------------------------------------------------------------------
// Default export: production wiring
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI): Promise<void> {
	await createPiFenceExtension(pi, {
		http: new NodeHttpClient(),
		shell: new NodeShellRunner(),
		logger: new NodeLogger(),
	});
}
