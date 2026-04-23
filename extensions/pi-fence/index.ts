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
import { createKrokiDockerManager } from "./kroki-docker.ts";
import { createMermaidLocalProcessor } from "./mermaid-local.ts";
import {
	loadPiFenceConfigWithStatus,
	type LoadConfigOptions,
} from "./io/config-loader.ts";
import type { HttpClient } from "./io/http-client.ts";
import { NodeHttpClient } from "./io/http-client.ts";
import type { Logger } from "./io/logger.ts";
import { NodeLogger } from "./io/logger.ts";
import type { ShellRunner } from "./io/shell-runner.ts";
import { NodeShellRunner } from "./io/shell-runner.ts";
import { createColorProcessor } from "./color.ts";
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
	const configResult = await loadPiFenceConfigWithStatus({
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
	const availability = await probeAvailability(processors);
	logAvailability(processors, availability, deps.logger);
	const bindings: Readonly<Record<string, string>> = config.bindings;
	const disabled: ReadonlySet<string> = new Set(config.disabled ?? []);
	const bindingRows = resolveBindings(processors, availability, bindings, disabled);
	logBindingResolution(bindingRows, deps.logger);
	logDisabled(disabled, deps.logger);

	// Auto-start Docker Kroki if configured.
	if (config.kroki?.docker?.autoStart) {
		const dockerMgr = createKrokiDockerManager(deps.shell, deps.logger);
		const dockerStatus = await dockerMgr.status();
		if (dockerStatus.status !== "running") {
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
		} else {
			deps.logger.debug("pi-fence", "Docker Kroki already running", {
				endpoint: dockerStatus.endpoint,
			});
		}
	}

	// Build the endpoints map for /fence list display.
	const endpoints: Record<string, string> = {};
	if (config.kroki?.endpoint) endpoints.kroki = config.kroki.endpoint;

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
			const result = await registerProcessor(registry, validated.processor);
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

	registerPiFenceRenderers(pi);
	registerFenceCommand({
		pi,
		logger: deps.logger,
		processors,
		availability,
		bindingRows,
		disabled,
		endpoints: Object.keys(endpoints).length > 0 ? endpoints : undefined,
		configStatus: {
			globalPath: configResult.globalPath,
			globalStatus: configResult.globalStatus,
			projectPath: configResult.projectPath,
			projectStatus: configResult.projectStatus,
		},
		shell: deps.shell,
	});
	registerPiFenceAgentEndHandler({
		pi,
		logger: deps.logger,
		processors,
		availability,
		bindings,
		disabled,
		supportedTags: () => collectSupportedTags(processors),
		themeState,
		maxBlocksPerTurn: MAX_BLOCKS_PER_TURN,
	});
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
