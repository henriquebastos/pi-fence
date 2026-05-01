import { DEFAULT_FENCE_SOURCE_MAX_BYTES, DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES, formatByteLimitError } from "./limits.ts";
import {
	DEFAULT_RENDER_TIMEOUT_MS,
	errorOutput,
	imageOutput,
	mergeSignals,
	withSignalGuard,
	type Availability,
	type FenceOutput,
	type FenceProcessor,
} from "./processor.ts";
import { WorkspaceFileLimitError, type ExecSandboxEnvironment, type ExecSandboxWorkspace, type SandboxController } from "./sandbox.ts";

export const BUNDLE_SANDBOX_PROCESSOR_ID = "bundle-sandbox";
export const BUNDLE_SANDBOX_CONTAINER_NAME = "pi-fence-bundle";
export const BUNDLE_SANDBOX_IMAGE = "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0";
export const BUNDLE_SANDBOX_LABELS: Readonly<Record<string, string>> = {
	"pi-fence.sandbox": "bundle",
};
export const BUNDLE_MANIFEST_PATH = "/opt/pi-fence-bundle/manifest.json";
export const BUNDLE_PUPPETEER_CONFIG_PATH = "/opt/pi-fence-bundle/puppeteer-config.json";

const INSTALL_HINT =
	"Build and start the pi-fence bundle container from docker/bundle before enabling sandbox placement.";

type BundleToolId = "dot" | "mmdc";

interface BundleToolHandler {
	id: BundleToolId;
	canonicalTag: string;
	aliases: readonly string[];
	render(env: ExecSandboxEnvironment, source: string, signal?: AbortSignal): Promise<FenceOutput>;
}

const BUNDLE_TOOL_HANDLERS: readonly BundleToolHandler[] = [
	{ id: "dot", canonicalTag: "graphviz", aliases: ["dot"], render: renderGraphviz },
	{ id: "mmdc", canonicalTag: "mermaid", aliases: [], render: renderMermaid },
];

const BUNDLE_TAGS = BUNDLE_TOOL_HANDLERS.map((handler) => handler.canonicalTag);
const BUNDLE_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
	BUNDLE_TOOL_HANDLERS.flatMap((handler) =>
		handler.aliases.map((alias) => [alias, handler.canonicalTag]),
	),
);

interface BundleToolManifest {
	command: string;
	versionCommand: readonly string[];
}

interface BundleManifest {
	name: string;
	version: string;
	tools: Record<string, BundleToolManifest>;
}

type ManifestParseResult =
	| { ok: true; manifest: BundleManifest }
	| { ok: false; reason: string };

export function createBundleSandboxProcessor(
	controller: SandboxController,
	env: ExecSandboxEnvironment,
): FenceProcessor {
	return {
		id: BUNDLE_SANDBOX_PROCESSOR_ID,
		placement: "sandbox",
		tags: BUNDLE_TAGS,
		aliases: BUNDLE_ALIASES,
		available: async () => bundleAvailable(controller, env),
		render: withSignalGuard(async (tag, source, signal): Promise<FenceOutput> =>
			renderBundle(env, tag, source, signal),
		),
	};
}

async function renderBundle(
	env: ExecSandboxEnvironment,
	tag: string,
	source: string,
	signal?: AbortSignal,
): Promise<FenceOutput> {
	const handler = bundleHandlerForTag(tag);
	if (!handler) {
		return errorOutput(`${BUNDLE_SANDBOX_PROCESSOR_ID} render for ${tag} is not implemented yet`);
	}
	return handler.render(env, source, signal);
}

function bundleHandlerForTag(tag: string): BundleToolHandler | undefined {
	return BUNDLE_TOOL_HANDLERS.find(
		(handler) => handler.canonicalTag === tag || handler.aliases.includes(tag),
	);
}

async function renderGraphviz(
	env: ExecSandboxEnvironment,
	source: string,
	signal?: AbortSignal,
): Promise<FenceOutput> {
	const sourceLimit = sourceLimitOutput(source);
	if (sourceLimit) return sourceLimit;
	try {
		const result = await env.run("dot", ["-Tpng"], {
			input: source,
			signal: bundleRenderSignal(signal),
			maxStdoutBytes: DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES,
		});
		if (result.exitCode === 0) {
			return imageOrOutputLimit(result.stdoutBuffer ?? Buffer.from(result.stdout, "utf8"));
		}
		return errorOutput(result.stderr.trim() || `dot exited ${result.exitCode}`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return errorOutput(message);
	}
}

async function renderMermaid(
	env: ExecSandboxEnvironment,
	source: string,
	signal?: AbortSignal,
): Promise<FenceOutput> {
	const sourceLimit = sourceLimitOutput(source);
	if (sourceLimit) return sourceLimit;
	let workspace: ExecSandboxWorkspace | undefined;
	const renderSignal = bundleRenderSignal(signal);
	try {
		workspace = await env.createWorkspace({ signal: renderSignal });
		const inputName = "input.mmd";
		const outputName = "output.png";
		await workspace.writeText(inputName, source, { signal: renderSignal });
		const result = await env.run(
			"mmdc",
			[
				"-i",
				workspace.path(inputName),
				"-o",
				workspace.path(outputName),
				"-b",
				"transparent",
				"-p",
				BUNDLE_PUPPETEER_CONFIG_PATH,
			],
			{ signal: renderSignal },
		);
		if (result.exitCode !== 0) {
			return errorOutput(result.stderr.trim() || `mmdc exited ${result.exitCode}`);
		}
		return imageOrOutputLimit(await workspace.readBuffer(outputName, { signal: renderSignal }, DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES));
	} catch (err) {
		if (err instanceof WorkspaceFileLimitError) {
			return errorOutput(formatByteLimitError("Processor output", err.actualBytes, err.maxBytes));
		}
		const message = err instanceof Error ? err.message : String(err);
		return errorOutput(message);
	} finally {
		await workspace?.dispose({ signal: AbortSignal.timeout(DEFAULT_RENDER_TIMEOUT_MS) }).catch(() => {});
	}
}

function bundleRenderSignal(signal?: AbortSignal): AbortSignal | undefined {
	return mergeSignals([signal, AbortSignal.timeout(DEFAULT_RENDER_TIMEOUT_MS)]);
}

function sourceLimitOutput(source: string): FenceOutput | undefined {
	const sourceBytes = Buffer.byteLength(source, "utf8");
	return sourceBytes > DEFAULT_FENCE_SOURCE_MAX_BYTES
		? errorOutput(formatByteLimitError("Fence source", sourceBytes, DEFAULT_FENCE_SOURCE_MAX_BYTES))
		: undefined;
}

function imageOrOutputLimit(png: Buffer): FenceOutput {
	return png.length > DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES
		? errorOutput(formatByteLimitError("Processor output", png.length, DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES))
		: imageOutput(png);
}

async function bundleAvailable(
	controller: SandboxController,
	env: ExecSandboxEnvironment,
): Promise<Availability> {
	try {
		const status = await controller.status();
		if (status.state !== "ready") {
			return {
				ok: false,
				reason: `bundle sandbox is ${status.state}: ${status.message}`,
				installHint: INSTALL_HINT,
			};
		}

		const manifestResult = await readManifest(env);
		if (!manifestResult.ok) {
			return { ok: false, reason: manifestResult.reason, installHint: INSTALL_HINT };
		}

		for (const handler of BUNDLE_TOOL_HANDLERS) {
			const probe = await probeTool(env, manifestResult.manifest, handler.id);
			if (!probe.ok) return probe;
		}
		return { ok: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: `bundle sandbox availability failed: ${message}`, installHint: INSTALL_HINT };
	}
}

async function readManifest(env: ExecSandboxEnvironment): Promise<ManifestParseResult> {
	const result = await env.run("cat", [BUNDLE_MANIFEST_PATH]);
	if (result.exitCode !== 0) {
		const detail = result.stderr.trim() || `exit ${result.exitCode}`;
		return { ok: false, reason: `bundle manifest unavailable: ${detail}` };
	}
	return parseBundleManifest(result.stdout);
}

function parseBundleManifest(raw: string): ManifestParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: `bundle manifest is invalid JSON: ${message}` };
	}
	if (!isRecord(parsed)) {
		return { ok: false, reason: "bundle manifest must be an object" };
	}
	const name = parsed.name;
	const version = parsed.version;
	const tools = parsed.tools;
	if (typeof name !== "string" || typeof version !== "string" || !isRecord(tools)) {
		return { ok: false, reason: "bundle manifest is missing name, version, or tools" };
	}
	const manifestTools: Record<string, BundleToolManifest> = {};
	for (const [id, tool] of Object.entries(tools)) {
		const parsedTool = parseToolManifest(id, tool);
		if (!parsedTool.ok) return parsedTool;
		manifestTools[id] = parsedTool.tool;
	}
	return { ok: true, manifest: { name, version, tools: manifestTools } };
}

function parseToolManifest(
	id: string,
	value: unknown,
): { ok: true; tool: BundleToolManifest } | { ok: false; reason: string } {
	if (!isRecord(value)) {
		return { ok: false, reason: `bundle manifest tool ${id} must be an object` };
	}
	const command = value.command;
	const versionCommand = value.versionCommand;
	if (typeof command !== "string" || command.length === 0) {
		return { ok: false, reason: `bundle manifest tool ${id} is missing command` };
	}
	if (
		!Array.isArray(versionCommand) ||
		versionCommand.length === 0 ||
		versionCommand.some((part) => typeof part !== "string" || part.length === 0)
	) {
		return { ok: false, reason: `bundle manifest tool ${id} has invalid versionCommand` };
	}
	return { ok: true, tool: { command, versionCommand: [...versionCommand] } };
}

async function probeTool(
	env: ExecSandboxEnvironment,
	manifest: BundleManifest,
	toolId: BundleToolId,
): Promise<Availability> {
	const tool = manifest.tools[toolId];
	if (!tool) {
		return { ok: false, reason: `bundle manifest missing required tool: ${toolId}`, installHint: INSTALL_HINT };
	}
	const [command, ...args] = tool.versionCommand;
	const result = await env.run(command, args);
	if (result.exitCode === 0) return { ok: true };
	const detail = result.stderr.trim() || `exit ${result.exitCode}`;
	return {
		ok: false,
		reason: `bundle tool ${toolId} probe failed: ${command} ${args.join(" ")} ${detail}`,
		installHint: INSTALL_HINT,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
