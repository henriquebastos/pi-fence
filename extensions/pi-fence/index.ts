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
import { createBuiltInProcessors } from "./built-in-processors.ts";
import { DEFAULT_PROCESSOR_PRECEDENCE, type PiFenceConfig } from "./config.ts";
import { registerFenceCommand } from "./command.ts";
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
import { MetricsCollector } from "./metrics.ts";
import {
	PI_FENCE_LIST_MESSAGE_TYPE,
	PI_FENCE_OUTPUT_MESSAGE_TYPE,
} from "./messages.ts";
import type { FenceProcessor } from "./processor.ts";
import { validateProcessor, registerProcessor, type ProcessorRegistry } from "./register.ts";
import { collectSupportedTags, isProcessorFullyTagBlocked, probeAvailability, resolveBindings } from "./resolve.ts";
import {
	createPiFenceListRenderer,
	createPiFenceMessageRenderer,
} from "./renderer.ts";
import type { SandboxController } from "./sandbox.ts";
import { createSandboxControllers } from "./sandbox-context.ts";

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
	const sandboxes = createSandboxControllers(deps, config);
	const processors = deps.processors ?? await createDefaultProcessors(
		deps,
		themeState,
		config,
		sandboxes,
	);
	const bindings = config.bindings;
	const blockedProcessors: ReadonlySet<string> = new Set(config.blocked?.processors ?? []);
	const blockedTags: ReadonlySet<string> = new Set(config.blocked?.tags ?? []);
	const processorPrecedence = config.processorPrecedence ?? DEFAULT_PROCESSOR_PRECEDENCE;

	// Auto-start Docker Kroki if configured and policy allows kroki-sandbox.
	const krokiController = sandboxes.get("kroki");
	if (krokiController && shouldAutoStartKrokiSandbox(config) && isKrokiAutoStartAllowed(processors, blockedProcessors, blockedTags, processorPrecedence)) {
		const controller = krokiController;
		const status = await controller.status();
		if (status.state === "ready") {
			deps.logger.debug("pi-fence", "Docker Kroki already running", {
				endpoint: status.endpoint,
			});
		} else {
			const startResult = await controller.start();
			if (startResult.state === "ready") {
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

	const probedProcessors = filterProcessorsForAvailabilityProbe(
		processors,
		blockedProcessors,
		blockedTags,
		processorPrecedence,
	);
	const availability = await probeAvailability(probedProcessors);
	logAvailability(probedProcessors, availability, deps.logger);
	const bindingRows = resolveBindings(
		processors,
		availability,
		bindings,
		blockedProcessors,
		processorPrecedence,
		blockedTags,
	);
	logBindingResolution(bindingRows, deps.logger);
	logBlockedProcessors(blockedProcessors, deps.logger);
	logProcessorPrecedence(processorPrecedence, deps.logger);

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
				blockedProcessors,
				blockedTags,
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
		bindings,
		blockedProcessors,
		blockedTags,
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
		blockedProcessors,
		blockedTags,
		processorPrecedence,
		supportedTags: () => collectSupportedTags(processors),
		themeState,
		maxBlocksPerTurn: MAX_BLOCKS_PER_TURN,
		metrics,
	});
}

function filterProcessorsForAvailabilityProbe(
	processors: readonly FenceProcessor[],
	blockedProcessors: ReadonlySet<string>,
	blockedTags: ReadonlySet<string>,
	processorPrecedence: readonly string[],
): FenceProcessor[] {
	return processors.filter((processor) =>
		isProcessorAllowed(processor.id, processor.placement, blockedProcessors, processorPrecedence) &&
		!isProcessorFullyTagBlocked(processor, processors, blockedTags),
	);
}

function isProcessorAllowed(
	processorId: string,
	placement: string,
	blockedProcessors: ReadonlySet<string>,
	processorPrecedence: readonly string[],
): boolean {
	return !blockedProcessors.has(processorId) && processorPrecedence.includes(placement);
}

function shouldAutoStartKrokiSandbox(config: PiFenceConfig): boolean {
	const legacyAutoStart = config.kroki?.docker?.autoStart === true;
	const krokiSandbox = config.sandboxes?.kroki;
	if (krokiSandbox === undefined) return false;
	if (krokiSandbox.kind !== "service") return false;
	if (krokiSandbox.runtime === "docker-container") return krokiSandbox.autoStart ?? legacyAutoStart;
	if (krokiSandbox.runtime === "docker-compose") return krokiSandbox.autoStart === true;
	return false;
}


function isKrokiAutoStartAllowed(
	processors: readonly FenceProcessor[],
	blockedProcessors: ReadonlySet<string>,
	blockedTags: ReadonlySet<string>,
	processorPrecedence: readonly string[],
): boolean {
	const krokiSandbox = processors.find((processor) => processor.id === "kroki-sandbox");
	return krokiSandbox !== undefined &&
		isProcessorAllowed(krokiSandbox.id, krokiSandbox.placement, blockedProcessors, processorPrecedence) &&
		!isProcessorFullyTagBlocked(krokiSandbox, processors, blockedTags);
}

async function createDefaultProcessors(
	deps: PiFenceRuntimeDeps,
	themeState: ThemeState,
	config: PiFenceConfig,
	sandboxes: ReadonlyMap<string, SandboxController>,
): Promise<FenceProcessor[]> {
	const result = await createBuiltInProcessors({
		http: deps.http,
		shell: deps.shell,
		logger: deps.logger,
		themeState,
		config,
		sandboxes,
	});
	for (const diagnostic of result.diagnostics) {
		deps.logger.warn("pi-fence", "processor factory diagnostic", { ...diagnostic });
	}
	return result.processors;
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
			logger.info("pi-fence", "binding effective", effectiveBindingLog(row));
		} else if (row.selector === "placement") {
			logger.debug("pi-fence", "binding issue", issuePlacementBindingLog(row));
		} else {
			logger.debug("pi-fence", "binding issue", {
				tag: row.tag,
				processorId: row.processorId,
				reason: row.reason,
			});
		}
	}
}

function effectiveBindingLog(row: Extract<ReturnType<typeof resolveBindings>[number], { status: "effective" }>) {
	return row.selector === "placement"
		? { tag: row.tag, processorId: row.processorId, placement: row.placement }
		: { tag: row.tag, processorId: row.processorId };
}

function issuePlacementBindingLog(
	row: Extract<ReturnType<typeof resolveBindings>[number], { status: "issue"; selector: "placement" }>,
) {
	return "processorIds" in row
		? { tag: row.tag, placement: row.placement, reason: row.reason, processorIds: row.processorIds }
		: { tag: row.tag, placement: row.placement, reason: row.reason };
}

function logBlockedProcessors(
	blockedProcessors: ReadonlySet<string>,
	logger: Logger,
): void {
	if (blockedProcessors.size === 0) return;
	logger.info("pi-fence", "processors blocked by config", {
		ids: [...blockedProcessors],
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
