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
import { DEFAULT_PROCESSOR_PRECEDENCE } from "./config.ts";
import { registerFenceCommand } from "./command.ts";
import { createGraphvizLocalProcessor } from "./graphviz-local.ts";
import { createKrokiDockerManager } from "./kroki-docker.ts";
import { createMermaidLocalProcessor } from "./mermaid-local.ts";
import {
	loadPiFenceConfig,
	type LoadConfigOptions,
} from "./io/config-loader.ts";
import type { HttpClient } from "./io/http-client.ts";
import { NodeHttpClient } from "./io/http-client.ts";
import type { Logger } from "./io/logger.ts";
import { NodeLogger } from "./io/node-logger.ts";
import type { ShellRunner } from "./io/shell-runner.ts";
import { NodeShellRunner } from "./io/shell-runner.ts";
import { createColorProcessor } from "./color.ts";
import { MetricsCollector } from "./metrics.ts";
import { createHighlightProcessor } from "./highlight.ts";
import { createKrokiProcessor, isDarkThemeName } from "./kroki.ts";
import { createQrProcessor } from "./qr.ts";
import { createTableProcessor } from "./table.ts";
import {
	PI_FENCE_LIST_MESSAGE_TYPE,
	PI_FENCE_OUTPUT_MESSAGE_TYPE,
} from "./messages.ts";
import type { FenceProcessor } from "./processor.ts";
import { validateProcessor, registerProcessor, type ProcessorRegistry } from "./register.ts";
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
	const configResult = await loadPiFenceConfig({
		logger: deps.logger,
		...deps.configOptions,
	});
	const config = configResult.config;

	const themeState: ThemeState = {};
	const processors = deps.processors ?? createDefaultProcessors(
		deps,
		themeState,
		config.kroki?.endpoint,
	);
	const bindings = config.bindings;
	const disabled: ReadonlySet<string> = new Set(config.disabled ?? []);
	const processorPrecedence = config.processorPrecedence ?? DEFAULT_PROCESSOR_PRECEDENCE;
	const probedProcessors = filterProcessorsForAvailabilityProbe(
		processors,
		disabled,
		processorPrecedence,
	);
	const availability = await probeAvailability(probedProcessors);
	logAvailability(probedProcessors, availability, deps.logger);
	const bindingRows = resolveBindings(
		processors,
		availability,
		bindings,
		disabled,
		processorPrecedence,
	);
	logBindingResolution(bindingRows, deps.logger);
	logDisabled(disabled, deps.logger);
	logProcessorPrecedence(processorPrecedence, deps.logger);

	// Auto-start Docker Kroki if configured and policy allows kroki-remote.
	if (config.kroki?.docker?.autoStart && isProcessorAllowed("kroki-remote", "remote", disabled, processorPrecedence)) {
		const dockerMgr = createKrokiDockerManager(deps.shell, deps.logger);
		const dockerStatus = await dockerMgr.status();
		if (dockerStatus.status === "running") {
			deps.logger.debug("pi-fence", "Docker Kroki already running", {
				endpoint: dockerStatus.endpoint,
			});
		} else {
			const startResult = await dockerMgr.start();
			if (startResult.ok) {
				deps.logger.info("pi-fence", "Docker Kroki auto-started", {
					endpoint: startResult.endpoint,
				});
			} else {
				deps.logger.warn("pi-fence", "Docker Kroki auto-start failed", {
					error: startResult.message,
				});
			}
		}
	}

	// Build the endpoints map for /fence list display.
	const endpoints: Record<string, string> = {};
	if (config.kroki?.endpoint) endpoints["kroki-remote"] = config.kroki.endpoint;

	// Build the shared mutable registry for dynamic processor registration.
	const registry: ProcessorRegistry = { processors, availability };

	// Listen for third-party processor registrations via the event bus (D5).
	if (pi.events) {
		pi.events.on("pi-fence:register", async (data: unknown) => {
			const validated = validateProcessor(data);
			if (!validated.ok) {
				deps.logger.warn("pi-fence", "register rejected", { error: validated.error });
				pi.events.emit("pi-fence:register-error", { error: validated.error });
				return;
			}
			const result = await registerProcessor(registry, validated.processor, {
				disabled,
				processorPrecedence,
			});
			if (!result.ok) {
				deps.logger.warn("pi-fence", "register rejected", { error: result.error });
				pi.events.emit("pi-fence:register-error", { error: result.error });
				return;
			}
			deps.logger.info("pi-fence", "third-party processor registered", {
				id: result.id,
				tags: [...result.tags],
			});
			pi.events.emit("pi-fence:registered", { id: result.id, tags: [...result.tags] });
		});
	}

	const metrics = new MetricsCollector();

	registerPiFenceRenderers(pi);
	registerFenceCommand({
		pi,
		logger: deps.logger,
		processors,
		availability,
		bindingRows,
		disabled,
		processorPrecedence,
		endpoints: Object.keys(endpoints).length > 0 ? endpoints : undefined,
		configStatus: {
			globalPath: configResult.globalPath,
			globalStatus: configResult.globalStatus,
			projectPath: configResult.projectPath,
			projectStatus: configResult.projectStatus,
		},
		shell: deps.shell,
		metrics,
	});
	registerPiFenceAgentEndHandler({
		pi,
		logger: deps.logger,
		processors,
		availability,
		bindings,
		disabled,
		processorPrecedence,
		supportedTags: () => collectSupportedTags(processors),
		themeState,
		maxBlocksPerTurn: MAX_BLOCKS_PER_TURN,
		metrics,
	});
}

function filterProcessorsForAvailabilityProbe(
	processors: readonly FenceProcessor[],
	disabled: ReadonlySet<string>,
	processorPrecedence: readonly string[],
): FenceProcessor[] {
	return processors.filter((processor) =>
		isProcessorAllowed(processor.id, processor.placement, disabled, processorPrecedence),
	);
}

function isProcessorAllowed(
	processorId: string,
	placement: string,
	disabled: ReadonlySet<string>,
	processorPrecedence: readonly string[],
): boolean {
	return !disabled.has(processorId) && processorPrecedence.includes(placement);
}

function createDefaultProcessors(
	deps: PiFenceRuntimeDeps,
	themeState: ThemeState,
	krokiEndpoint?: string,
): FenceProcessor[] {
	return [
		createGraphvizLocalProcessor(deps.shell, deps.logger),
		createMermaidLocalProcessor(deps.shell, deps.logger),
		createTableProcessor(),
		createHighlightProcessor(),
		createQrProcessor(),
		createColorProcessor(),
		createKrokiProcessor(deps.http, krokiEndpoint, deps.logger, () =>
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
				...("placement" in row ? { placement: row.placement } : {}),
			});
		} else if ("placement" in row) {
			logger.warn("pi-fence", "binding ignored", {
				tag: row.tag,
				placement: row.placement,
				reason: row.reason,
				...("processorIds" in row ? { processorIds: row.processorIds } : {}),
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

function logProcessorPrecedence(
	processorPrecedence: readonly string[],
	logger: Logger,
): void {
	logger.debug("pi-fence", "processor precedence", {
		placements: [...processorPrecedence],
	});
}

function registerPiFenceRenderers(pi: ExtensionAPI): void {
	const tuiPrimitives = {
		Box,
		Text,
		Spacer,
		Image,
		truncateToWidth,
	};
	pi.registerMessageRenderer(
		PI_FENCE_OUTPUT_MESSAGE_TYPE,
		createPiFenceMessageRenderer(tuiPrimitives),
	);
	pi.registerMessageRenderer(
		PI_FENCE_LIST_MESSAGE_TYPE,
		createPiFenceListRenderer(tuiPrimitives),
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
