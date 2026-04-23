/**
 * pi-fence — fenced code block processor extension.
 *
 * `index.ts` is the composition root: it chooses concrete runtime
 * implementations, builds the default processor set, probes availability,
 * loads config, and wires focused handlers into pi.
 */

import { Box, Image, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPiFenceAgentEndHandler, type ThemeState } from "./agent-end.ts";
import { registerFenceCommand } from "./command.ts";
import { createGraphvizLocalProcessor } from "./graphviz-local.ts";
import { loadPiFenceConfig, type LoadConfigOptions } from "./io/config-loader.ts";
import type { HttpClient } from "./io/http-client.ts";
import { NodeHttpClient } from "./io/http-client.ts";
import type { Logger } from "./io/logger.ts";
import { NodeLogger } from "./io/logger.ts";
import type { ShellRunner } from "./io/shell-runner.ts";
import { NodeShellRunner } from "./io/shell-runner.ts";
import { createKrokiProcessor, isDarkThemeName } from "./kroki.ts";
import {
	PI_FENCE_LIST_MESSAGE_TYPE,
	PI_FENCE_OUTPUT_MESSAGE_TYPE,
} from "./messages.ts";
import type { FenceProcessor } from "./processor.ts";
import { collectSupportedTags, probeAvailability, resolveBindings } from "./resolve.ts";
import {
	createPiFenceListRenderer,
	createPiFenceMessageRenderer,
} from "./renderer.ts";

const MAX_BLOCKS_PER_TURN = 5;

export interface PiFenceRuntimeDeps {
	http: HttpClient;
	shell: ShellRunner;
	logger: Logger;
	processors?: FenceProcessor[];
	configOptions?: LoadConfigOptions;
}

export async function createPiFenceExtension(
	pi: ExtensionAPI,
	deps: PiFenceRuntimeDeps,
): Promise<void> {
	const themeState: ThemeState = {};
	const processors = deps.processors ?? createDefaultProcessors(deps, themeState);
	const availability = await probeAvailability(processors);
	logAvailability(processors, availability, deps.logger);

	const config = await loadPiFenceConfig({
		logger: deps.logger,
		...deps.configOptions,
	});
	const bindings: Readonly<Record<string, string>> = config.bindings;
	const disabled: ReadonlySet<string> = new Set(config.disabled ?? []);
	const bindingRows = resolveBindings(processors, availability, bindings, disabled);
	logBindingResolution(bindingRows, deps.logger);
	logDisabled(disabled, deps.logger);

	const supportedTags = collectSupportedTags(processors);
	registerPiFenceRenderers(pi);
	registerFenceCommand({
		pi,
		logger: deps.logger,
		processors,
		availability,
		bindingRows,
		disabled,
	});
	registerPiFenceAgentEndHandler({
		pi,
		logger: deps.logger,
		processors,
		availability,
		bindings,
		disabled,
		supportedTags,
		themeState,
		maxBlocksPerTurn: MAX_BLOCKS_PER_TURN,
	});
}

function createDefaultProcessors(
	deps: PiFenceRuntimeDeps,
	themeState: ThemeState,
): FenceProcessor[] {
	return [
		createGraphvizLocalProcessor(deps.shell, deps.logger),
		createKrokiProcessor(deps.http, undefined, deps.logger, () =>
			isDarkThemeName(themeState.currentName) ? "dark" : "light",
		),
	];
}

function logAvailability(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Awaited<ReturnType<FenceProcessor["available"]>>>,
	logger: Logger,
): void {
	for (const processor of processors) {
		const status = availability.get(processor.id);
		if (status?.ok) {
			logger.debug("pi-fence", "processor available", { id: processor.id });
		} else {
			logger.info("pi-fence", "processor unavailable", {
				id: processor.id,
				reason: status && !status.ok ? status.reason : "availability unknown",
			});
		}
	}
}

function logBindingResolution(
	bindingRows: ReturnType<typeof resolveBindings>,
	logger: Logger,
): void {
	for (const row of bindingRows) {
		if (row.status === "effective") {
			logger.info("pi-fence", "binding effective", {
				tag: row.tag,
				processorId: row.processorId,
			});
		} else {
			logger.warn("pi-fence", "binding ignored", {
				tag: row.tag,
				processorId: row.processorId,
				reason: row.reason,
			});
		}
	}
}

function logDisabled(
	disabled: ReadonlySet<string>,
	logger: Logger,
): void {
	if (disabled.size === 0) return;
	logger.info("pi-fence", "processors disabled by config", {
		ids: [...disabled],
	});
}

function registerPiFenceRenderers(pi: ExtensionAPI): void {
	const tuiPrimitives = {
		Box: Box as never,
		Text: Text as never,
		Spacer: Spacer as never,
		Image: Image as never,
		truncateToWidth,
	};
	pi.registerMessageRenderer(
		PI_FENCE_OUTPUT_MESSAGE_TYPE,
		createPiFenceMessageRenderer(tuiPrimitives) as never,
	);
	pi.registerMessageRenderer(
		PI_FENCE_LIST_MESSAGE_TYPE,
		createPiFenceListRenderer(tuiPrimitives) as never,
	);
}

export default async function activatePiFence(
	pi: ExtensionAPI,
): Promise<void> {
	await createPiFenceExtension(pi, {
		http: new NodeHttpClient(),
		shell: new NodeShellRunner(),
		logger: new NodeLogger(),
	});
}
