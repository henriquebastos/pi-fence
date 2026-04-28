import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";
import type { ExecSandboxEnvironment, SandboxController } from "./sandbox.ts";

export const BUNDLE_SANDBOX_PROCESSOR_ID = "bundle-sandbox";
export const BUNDLE_MANIFEST_PATH = "/opt/pi-fence-bundle/manifest.json";

const BUNDLE_TAGS = ["graphviz", "mermaid"] as const;
const BUNDLE_ALIASES: Readonly<Record<string, string>> = { dot: "graphviz" };
const REQUIRED_TOOLS = ["dot", "mmdc"] as const;
const INSTALL_HINT =
	"Build and start the pi-fence bundle container from docker/bundle before enabling sandbox placement.";

type BundleToolId = typeof REQUIRED_TOOLS[number];

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
		render: async (tag, source, signal): Promise<FenceResult> => renderBundle(env, tag, source, signal),
	};
}

async function renderBundle(
	env: ExecSandboxEnvironment,
	tag: string,
	source: string,
	signal?: AbortSignal,
): Promise<FenceResult> {
	if (tag === "graphviz" || tag === "dot") return renderGraphviz(env, source, signal);
	return {
		ok: false,
		error: `${BUNDLE_SANDBOX_PROCESSOR_ID} render for ${tag} is not implemented yet`,
	};
}

async function renderGraphviz(
	env: ExecSandboxEnvironment,
	source: string,
	signal?: AbortSignal,
): Promise<FenceResult> {
	try {
		const result = await env.run("dot", ["-Tpng"], { input: source, signal });
		if (result.exitCode === 0) {
			return { ok: true, png: result.stdoutBuffer ?? Buffer.from(result.stdout, "utf8") };
		}
		return { ok: false, error: result.stderr.trim() || `dot exited ${result.exitCode}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
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

		for (const toolId of REQUIRED_TOOLS) {
			const probe = await probeTool(env, manifestResult.manifest, toolId);
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
