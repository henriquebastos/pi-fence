import {
	DEFAULT_PROCESSOR_PRECEDENCE,
	type PiFenceConfig,
	type SandboxConfig,
	type SandboxKind,
	type SandboxRuntime,
	type TagBinding,
} from "./config.ts";
import type { ProcessorPlacement } from "./processor.ts";

export const DEFAULT_KROKI_ENDPOINT = "https://kroki.io";
export const DEFAULT_MAX_BLOCKS_PER_TURN = 5;
export const DEFAULT_SOURCE_PREVIEW_MAX_BYTES = 8192;
export const DEFAULT_SOURCE_PREVIEW_MAX_LINES = 40;
export const DEFAULT_FENCE_SOURCE_MAX_BYTES = 262_144;
export const DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES = 10_485_760;

export interface ResolvedSandboxPolicy {
	kind: SandboxKind;
	runtime: SandboxRuntime;
	autoStart: boolean;
	image?: string;
}

export interface SourceRetentionPolicy {
	mode: "bounded-preview";
	maxBytes: number;
	maxLines: number;
}

export interface RenderLimitsPolicy {
	maxBlocksPerTurn: number;
	fenceSourceMaxBytes: number;
	processorOutputMaxBytes: number;
}

export type ProcessorBindingPolicy =
	| { processor: string }
	| { placement: ProcessorPlacement };

export interface ProcessorResolutionPolicy {
	bindings: Readonly<Record<string, ProcessorBindingPolicy>>;
	blockedProcessors: ReadonlySet<string>;
	blockedTags: ReadonlySet<string>;
	processorPrecedence: readonly ProcessorPlacement[];
}

export interface KrokiEndpointPolicy {
	endpoint: string;
	customEndpoint: boolean;
}

export interface ProcessorFactoryPolicy {
	kroki: KrokiEndpointPolicy;
}

export interface ResolvedPiFencePolicy {
	processorResolution: ProcessorResolutionPolicy;
	processorFactories: ProcessorFactoryPolicy;
	kroki: KrokiEndpointPolicy;
	endpointsByProcessor: Readonly<Record<string, string>>;
	sandboxes: ReadonlyMap<string, ResolvedSandboxPolicy>;
	autoStart: {
		bundleSandbox: boolean;
		krokiSandbox: boolean;
	};
	sourceRetention: SourceRetentionPolicy;
	renderLimits: RenderLimitsPolicy;
}

export function resolvePiFencePolicy(config: PiFenceConfig): ResolvedPiFencePolicy {
	const sandboxes = resolveSandboxes(config);
	const krokiEndpoint = config.kroki?.endpoint ?? DEFAULT_KROKI_ENDPOINT;
	const customKrokiEndpoint = config.kroki?.endpoint !== undefined;
	const processorResolution: ProcessorResolutionPolicy = {
		bindings: copyBindings(config.bindings),
		blockedProcessors: new Set(config.blocked?.processors ?? []),
		blockedTags: new Set(config.blocked?.tags ?? []),
		processorPrecedence: [...(config.processorPrecedence ?? DEFAULT_PROCESSOR_PRECEDENCE)],
	};
	const kroki: KrokiEndpointPolicy = {
		endpoint: krokiEndpoint,
		customEndpoint: customKrokiEndpoint,
	};
	return {
		processorResolution,
		processorFactories: { kroki },
		kroki,
		endpointsByProcessor: customKrokiEndpoint ? { "kroki-remote": krokiEndpoint } : {},
		sandboxes,
		autoStart: {
			bundleSandbox: sandboxes.get("bundle")?.autoStart === true,
			krokiSandbox: sandboxes.get("kroki")?.autoStart === true,
		},
		sourceRetention: {
			mode: "bounded-preview",
			maxBytes: DEFAULT_SOURCE_PREVIEW_MAX_BYTES,
			maxLines: DEFAULT_SOURCE_PREVIEW_MAX_LINES,
		},
		renderLimits: {
			maxBlocksPerTurn: DEFAULT_MAX_BLOCKS_PER_TURN,
			fenceSourceMaxBytes: DEFAULT_FENCE_SOURCE_MAX_BYTES,
			processorOutputMaxBytes: DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES,
		},
	};
}

function copyBindings(bindings: Readonly<Record<string, TagBinding>>): Record<string, ProcessorBindingPolicy> {
	const out = Object.create(null) as Record<string, ProcessorBindingPolicy>;
	for (const [tag, binding] of Object.entries(bindings)) {
		out[tag] = { ...binding };
	}
	return out;
}

function resolveSandboxes(config: PiFenceConfig): ReadonlyMap<string, ResolvedSandboxPolicy> {
	const sandboxes = new Map<string, ResolvedSandboxPolicy>();
	for (const [id, sandbox] of Object.entries(config.sandboxes ?? {})) {
		sandboxes.set(id, resolveSandboxPolicy(config, id, sandbox));
	}
	return sandboxes;
}

function resolveSandboxPolicy(
	config: PiFenceConfig,
	id: string,
	sandbox: SandboxConfig,
): ResolvedSandboxPolicy {
	const resolved: ResolvedSandboxPolicy = {
		kind: sandbox.kind,
		runtime: sandbox.runtime,
		autoStart: effectiveSandboxAutoStart(config, id, sandbox),
	};
	if (sandbox.image !== undefined) resolved.image = sandbox.image;
	return resolved;
}

function effectiveSandboxAutoStart(
	config: PiFenceConfig,
	id: string,
	sandbox: SandboxConfig,
): boolean {
	if (id === "kroki") return shouldAutoStartKrokiSandbox(config, sandbox);
	if (id === "bundle") return shouldAutoStartBundleSandbox(sandbox);
	return sandbox.autoStart === true;
}

function shouldAutoStartKrokiSandbox(
	config: PiFenceConfig,
	sandbox: SandboxConfig,
): boolean {
	const legacyAutoStart = config.kroki?.docker?.autoStart === true;
	if (sandbox.kind !== "service") return false;
	if (sandbox.runtime === "docker-container") return sandbox.autoStart ?? legacyAutoStart;
	if (sandbox.runtime === "docker-compose") return sandbox.autoStart === true;
	return false;
}

function shouldAutoStartBundleSandbox(sandbox: SandboxConfig): boolean {
	return sandbox.kind === "exec" &&
		sandbox.runtime === "gondolin-vm" &&
		sandbox.autoStart === true;
}
