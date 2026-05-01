import { describe, expect, it } from "vitest";

import { createBundleSandboxProcessor } from "../../extensions/pi-fence/bundle-sandbox.ts";
import { DEFAULT_FENCE_SOURCE_MAX_BYTES, DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES } from "../../extensions/pi-fence/policy.ts";
import type { Availability, FenceProcessor } from "../../extensions/pi-fence/processor.ts";
import { resolveProcessor } from "../../extensions/pi-fence/resolve.ts";
import type {
	ExecSandboxEnvironment,
	ExecSandboxRunOptions,
	ExecSandboxRunResult,
	ExecSandboxWorkspace,
	SandboxController,
} from "../../extensions/pi-fence/sandbox.ts";
import { sandboxStatus, type TestSandboxStatus } from "../utilities/sandbox-status.ts";

const MANIFEST = JSON.stringify({
	name: "pi-fence-bundle",
	version: "0.1.0",
	tools: {
		dot: { command: "dot", versionCommand: ["dot", "-V"] },
		mmdc: { command: "mmdc", versionCommand: ["mmdc", "--version"] },
	},
});

const OK: ExecSandboxRunResult = { stdout: "", stderr: "", exitCode: 0 };

type RecordedExecCall = {
	command: string;
	args: readonly string[];
	options?: ExecSandboxRunOptions;
};

type RecordedWorkspaceCall =
	| { operation: "writeText"; name: string; contents: string; options?: ExecSandboxRunOptions }
	| { operation: "readBuffer"; name: string; options?: ExecSandboxRunOptions }
	| { operation: "dispose"; options?: ExecSandboxRunOptions };

class FakeExecSandboxWorkspace implements ExecSandboxWorkspace {
	readonly calls: RecordedWorkspaceCall[] = [];

	constructor(
		private readonly root: string,
		private readonly files: Readonly<Record<string, Buffer>> = {},
	) {}

	path(name: string): string {
		return `${this.root}/${name}`;
	}

	async writeText(name: string, contents: string, options?: ExecSandboxRunOptions): Promise<void> {
		this.calls.push({ operation: "writeText", name, contents, ...(options ? { options } : {}) });
	}

	async readBuffer(name: string, options?: ExecSandboxRunOptions): Promise<Buffer> {
		this.calls.push({ operation: "readBuffer", name, ...(options ? { options } : {}) });
		return this.files[name] ?? Buffer.alloc(0);
	}

	async dispose(options?: ExecSandboxRunOptions): Promise<void> {
		this.calls.push({ operation: "dispose", ...(options ? { options } : {}) });
	}
}

class FakeExecSandboxEnvironment implements ExecSandboxEnvironment {
	readonly calls: RecordedExecCall[] = [];
	workspace?: FakeExecSandboxWorkspace;
	createWorkspaceOptions?: ExecSandboxRunOptions;
	private readonly responses = new Map<string, ExecSandboxRunResult>();

	setResponse(command: string, args: readonly string[], result: ExecSandboxRunResult): void {
		this.responses.set(this.key(command, args), result);
	}

	async run(
		command: string,
		args: readonly string[],
		options?: ExecSandboxRunOptions,
	): Promise<ExecSandboxRunResult> {
		this.calls.push({ command, args: [...args], options });
		const response = this.responses.get(this.key(command, args));
		if (!response) {
			throw new Error(`No fake exec response for ${command} ${args.join(" ")}`);
		}
		return response;
	}

	async createWorkspace(options?: ExecSandboxRunOptions): Promise<ExecSandboxWorkspace> {
		this.createWorkspaceOptions = options;
		if (!this.workspace) throw new Error("workspace not configured");
		return this.workspace;
	}

	private key(command: string, args: readonly string[]): string {
		return `${command}\0${args.join("\0")}`;
	}
}

function controllerWithStatus(status: TestSandboxStatus): SandboxController {
	return {
		id: "bundle",
		kind: "exec",
		runtime: "docker-container",
		status: async () => sandboxStatus(status),
		start: async () => sandboxStatus(status),
		stop: async () => sandboxStatus(status),
	};
}

function throwingController(message: string): SandboxController {
	return {
		id: "bundle",
		kind: "exec",
		runtime: "docker-container",
		status: async () => {
			throw new Error(message);
		},
		start: async () => sandboxStatus({ state: "error", message }),
		stop: async () => sandboxStatus({ state: "error", message }),
	};
}

function fakeSandboxProcessor(id: string): FenceProcessor {
	return {
		id,
		placement: "sandbox",
		tags: ["graphviz"],
		aliases: {},
		available: async () => ({ ok: true }),
		render: async () => ({ kind: "error", error: "not used" }),
	};
}

describe("bundle-sandbox processor", () => {
	it("reports available after the bundle controller is ready and required tool probes pass", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("cat", ["/opt/pi-fence-bundle/manifest.json"], {
			stdout: MANIFEST,
			stderr: "",
			exitCode: 0,
		});
		env.setResponse("dot", ["-V"], OK);
		env.setResponse("mmdc", ["--version"], OK);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "Container pi-fence-bundle is running." }),
			env,
		);

		expect(processor.id).toBe("bundle-sandbox");
		expect(processor.placement).toBe("sandbox");
		expect(processor.tags).toEqual(["graphviz", "mermaid"]);
		expect(processor.aliases).toEqual({ dot: "graphviz" });
		await expect(processor.available()).resolves.toEqual({ ok: true });
		expect(env.calls.map((call) => [call.command, call.args])).toEqual([
			["cat", ["/opt/pi-fence-bundle/manifest.json"]],
			["dot", ["-V"]],
			["mmdc", ["--version"]],
		]);
	});

	it("passes a timeout-backed signal to Graphviz exec", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("dot", ["-Tpng"], {
			stdout: "",
			stdoutBuffer: Buffer.from([0x89]),
			stderr: "",
			exitCode: 0,
		});
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.render("graphviz", "digraph{}" as string)).resolves.toEqual({
			kind: "image",
			data: Buffer.from([0x89]),
			mimeType: "image/png",
		});

		expect(env.calls[0]?.options?.signal).toBeDefined();
		expect(env.calls[0]?.options?.signal?.aborted).toBe(false);
	});

	it("rejects oversized DOT source before sandbox exec", async () => {
		const env = new FakeExecSandboxEnvironment();
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.render("graphviz", "x".repeat(DEFAULT_FENCE_SOURCE_MAX_BYTES + 1));

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("Fence source is too large");
		expect(env.calls).toHaveLength(0);
	});

	it("renders DOT through the Graphviz bundle handler", async () => {
		const env = new FakeExecSandboxEnvironment();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		env.setResponse("dot", ["-Tpng"], {
			stdout: png.toString("binary"),
			stdoutBuffer: png,
			stderr: "",
			exitCode: 0,
		});
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.render("dot", "digraph { A -> B }");

		expect(result).toEqual({ kind: "image", data: png, mimeType: "image/png" });
		expect(env.calls).toEqual([
			{
				command: "dot",
				args: ["-Tpng"],
				options: expect.objectContaining({ input: "digraph { A -> B }", signal: expect.any(AbortSignal) }),
			},
		]);
	});

	it("rejects oversized bundle Graphviz output", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("dot", ["-Tpng"], {
			stdout: "",
			stdoutBuffer: Buffer.alloc(DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES + 1),
			stderr: "",
			exitCode: 0,
		});
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.render("graphviz", "digraph{}");

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("Processor output is too large");
	});

	it("rejects oversized Mermaid source before creating a workspace", async () => {
		const env = new FakeExecSandboxEnvironment();
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.render("mermaid", "x".repeat(DEFAULT_FENCE_SOURCE_MAX_BYTES + 1));

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("Fence source is too large");
		expect(env.createWorkspaceOptions).toBeUndefined();
	});

	it("passes timeout-backed signals to Mermaid workspace operations", async () => {
		const caller = new AbortController();
		const env = new FakeExecSandboxEnvironment();
		const png = Buffer.from([0x89, 0x50]);
		env.workspace = new FakeExecSandboxWorkspace("/tmp/pi-fence-work", { "output.png": png });
		env.setResponse(
			"mmdc",
			[
				"-i",
				"/tmp/pi-fence-work/input.mmd",
				"-o",
				"/tmp/pi-fence-work/output.png",
				"-b",
				"transparent",
				"-p",
				"/opt/pi-fence-bundle/puppeteer-config.json",
			],
			OK,
		);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.render("mermaid", "flowchart LR", caller.signal)).resolves.toEqual({
			kind: "image",
			data: png,
			mimeType: "image/png",
		});

		expect(env.createWorkspaceOptions?.signal).toBeDefined();
		expect(env.createWorkspaceOptions?.signal).not.toBe(caller.signal);
		expect(env.workspace.calls[0]).toMatchObject({
			operation: "writeText",
			options: { signal: env.createWorkspaceOptions?.signal },
		});
		expect(env.workspace.calls[1]).toMatchObject({
			operation: "readBuffer",
			options: { signal: env.createWorkspaceOptions?.signal },
		});
		expect(env.workspace.calls[2]).toMatchObject({
			operation: "dispose",
			options: { signal: expect.any(AbortSignal) },
		});
	});

	it("merges caller and timeout signals for Mermaid exec", async () => {
		const caller = new AbortController();
		const env = new FakeExecSandboxEnvironment();
		const png = Buffer.from([0x89, 0x50]);
		env.workspace = new FakeExecSandboxWorkspace("/tmp/pi-fence-work", { "output.png": png });
		env.setResponse(
			"mmdc",
			[
				"-i",
				"/tmp/pi-fence-work/input.mmd",
				"-o",
				"/tmp/pi-fence-work/output.png",
				"-b",
				"transparent",
				"-p",
				"/opt/pi-fence-bundle/puppeteer-config.json",
			],
			OK,
		);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.render("mermaid", "flowchart LR", caller.signal)).resolves.toEqual({
			kind: "image",
			data: png,
			mimeType: "image/png",
		});

		expect(env.calls[0]?.options?.signal).toBeDefined();
		expect(env.calls[0]?.options?.signal).not.toBe(caller.signal);
		expect(env.calls[0]?.options?.signal?.aborted).toBe(false);
	});

	it("renders Mermaid through a bundle workspace", async () => {
		const env = new FakeExecSandboxEnvironment();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		env.workspace = new FakeExecSandboxWorkspace("/tmp/pi-fence-work", { "output.png": png });
		env.setResponse(
			"mmdc",
			[
				"-i",
				"/tmp/pi-fence-work/input.mmd",
				"-o",
				"/tmp/pi-fence-work/output.png",
				"-b",
				"transparent",
				"-p",
				"/opt/pi-fence-bundle/puppeteer-config.json",
			],
			OK,
		);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.render("mermaid", "flowchart LR\nA --> B");

		expect(result).toEqual({ kind: "image", data: png, mimeType: "image/png" });
		expect(env.calls).toEqual([
			{
				command: "mmdc",
				args: [
					"-i",
					"/tmp/pi-fence-work/input.mmd",
					"-o",
					"/tmp/pi-fence-work/output.png",
					"-b",
					"transparent",
					"-p",
					"/opt/pi-fence-bundle/puppeteer-config.json",
				],
				options: expect.objectContaining({ signal: expect.any(AbortSignal) }),
			},
		]);
		expect(env.workspace.calls).toEqual([
			expect.objectContaining({
				operation: "writeText",
				name: "input.mmd",
				contents: "flowchart LR\nA --> B",
				options: { signal: expect.any(AbortSignal) },
			}),
			expect.objectContaining({
				operation: "readBuffer",
				name: "output.png",
				options: { signal: expect.any(AbortSignal) },
			}),
			expect.objectContaining({ operation: "dispose", options: { signal: expect.any(AbortSignal) } }),
		]);
	});

	it("rejects oversized bundle Mermaid output", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.workspace = new FakeExecSandboxWorkspace("/tmp/pi-fence-work", {
			"output.png": Buffer.alloc(DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES + 1),
		});
		env.setResponse(
			"mmdc",
			[
				"-i",
				"/tmp/pi-fence-work/input.mmd",
				"-o",
				"/tmp/pi-fence-work/output.png",
				"-b",
				"transparent",
				"-p",
				"/opt/pi-fence-bundle/puppeteer-config.json",
			],
			OK,
		);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.render("mermaid", "flowchart LR");

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("Processor output is too large");
	});

	it("returns a Mermaid workspace creation error as a render result", async () => {
		const env = new FakeExecSandboxEnvironment();
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.render("mermaid", "flowchart LR")).resolves.toEqual({
			kind: "error",
			error: "workspace not configured",
		});
	});

	it("returns a Mermaid CLI error and still disposes the workspace", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.workspace = new FakeExecSandboxWorkspace("/tmp/pi-fence-work");
		env.setResponse(
			"mmdc",
			[
				"-i",
				"/tmp/pi-fence-work/input.mmd",
				"-o",
				"/tmp/pi-fence-work/output.png",
				"-b",
				"transparent",
				"-p",
				"/opt/pi-fence-bundle/puppeteer-config.json",
			],
			{ stdout: "", stderr: "Parse error", exitCode: 1 },
		);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.render("mermaid", "flowchart LR")).resolves.toEqual({
			kind: "error",
			error: "Parse error",
		});
		expect(env.workspace.calls).toEqual([
			expect.objectContaining({
				operation: "writeText",
				name: "input.mmd",
				contents: "flowchart LR",
				options: { signal: expect.any(AbortSignal) },
			}),
			expect.objectContaining({ operation: "dispose", options: { signal: expect.any(AbortSignal) } }),
		]);
	});

	it("stays ambiguous with another sandbox processor until a binding selects bundle-sandbox", () => {
		const bundle = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			new FakeExecSandboxEnvironment(),
		);
		const krokiSandbox = fakeSandboxProcessor("kroki-sandbox");
		const availability = new Map<string, Availability>([
			["bundle-sandbox", { ok: true }],
			["kroki-sandbox", { ok: true }],
		]);

		const ambiguous = resolveProcessor(
			[bundle, krokiSandbox],
			availability,
			"graphviz",
			undefined,
			undefined,
			["sandbox"],
		);

		expect(ambiguous.processor).toBeNull();
		expect(ambiguous.ambiguity).toEqual({
			placement: "sandbox",
			processorIds: ["bundle-sandbox", "kroki-sandbox"],
		});

		const bound = resolveProcessor(
			[bundle, krokiSandbox],
			availability,
			"graphviz",
			{ graphviz: { processor: "bundle-sandbox" } },
			undefined,
			["sandbox"],
		);

		expect(bound.processor?.id).toBe("bundle-sandbox");
	});

	it("reports unavailable when the bundle controller status throws", async () => {
		const processor = createBundleSandboxProcessor(
			throwingController("docker unavailable"),
			new FakeExecSandboxEnvironment(),
		);

		await expect(processor.available()).resolves.toEqual({
			ok: false,
			reason: "bundle sandbox availability failed: docker unavailable",
			installHint: expect.stringContaining("docker/bundle"),
		});
	});

	it("reports unavailable when reading the bundle manifest throws", async () => {
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			new FakeExecSandboxEnvironment(),
		);

		const result = await processor.available();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain("bundle sandbox availability failed: No fake exec response for cat");
			expect(result.installHint).toContain("docker/bundle");
		}
	});

	it("reports unavailable without probing tools when the bundle controller is not ready", async () => {
		const env = new FakeExecSandboxEnvironment();
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "stopped", message: "Container pi-fence-bundle exists but is stopped." }),
			env,
		);

		await expect(processor.available()).resolves.toEqual({
			ok: false,
			reason: "bundle sandbox is stopped: Container pi-fence-bundle exists but is stopped.",
			installHint: expect.stringContaining("docker/bundle"),
		});
		expect(env.calls).toEqual([]);
	});

	it("reports unavailable when the manifest cannot be parsed", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("cat", ["/opt/pi-fence-bundle/manifest.json"], {
			stdout: "{",
			stderr: "",
			exitCode: 0,
		});
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		const result = await processor.available();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain("bundle manifest is invalid JSON");
			expect(result.installHint).toContain("docker/bundle");
		}
	});

	it("reports unavailable for malformed bundle manifest schema", async () => {
		const cases = [
			{ raw: JSON.stringify([]), reason: "bundle manifest must be an object" },
			{
				raw: JSON.stringify({ name: "pi-fence-bundle", version: "0.1.0" }),
				reason: "bundle manifest is missing name, version, or tools",
			},
			{
				raw: JSON.stringify({
					name: "pi-fence-bundle",
					version: "0.1.0",
					tools: { dot: null },
				}),
				reason: "bundle manifest tool dot must be an object",
			},
			{
				raw: JSON.stringify({
					name: "pi-fence-bundle",
					version: "0.1.0",
					tools: { dot: { versionCommand: ["dot", "-V"] } },
				}),
				reason: "bundle manifest tool dot is missing command",
			},
			{
				raw: JSON.stringify({
					name: "pi-fence-bundle",
					version: "0.1.0",
					tools: { dot: { command: "dot", versionCommand: [] } },
				}),
				reason: "bundle manifest tool dot has invalid versionCommand",
			},
		];

		for (const testCase of cases) {
			const env = new FakeExecSandboxEnvironment();
			env.setResponse("cat", ["/opt/pi-fence-bundle/manifest.json"], {
				stdout: testCase.raw,
				stderr: "",
				exitCode: 0,
			});
			const processor = createBundleSandboxProcessor(
				controllerWithStatus({ state: "ready", message: "ready" }),
				env,
			);

			await expect(processor.available()).resolves.toEqual({
				ok: false,
				reason: testCase.reason,
				installHint: expect.stringContaining("docker/bundle"),
			});
		}
	});

	it("reports unavailable when a required tool is missing from the manifest", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("cat", ["/opt/pi-fence-bundle/manifest.json"], {
			stdout: JSON.stringify({
				name: "pi-fence-bundle",
				version: "0.1.0",
				tools: { dot: { command: "dot", versionCommand: ["dot", "-V"] } },
			}),
			stderr: "",
			exitCode: 0,
		});
		env.setResponse("dot", ["-V"], OK);
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.available()).resolves.toEqual({
			ok: false,
			reason: "bundle manifest missing required tool: mmdc",
			installHint: expect.stringContaining("docker/bundle"),
		});
		expect(env.calls.map((call) => [call.command, call.args])).toEqual([
			["cat", ["/opt/pi-fence-bundle/manifest.json"]],
			["dot", ["-V"]],
		]);
	});

	it("reports unavailable when the bundle manifest cannot be read", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("cat", ["/opt/pi-fence-bundle/manifest.json"], {
			stdout: "",
			stderr: "permission denied",
			exitCode: 126,
		});
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.available()).resolves.toEqual({
			ok: false,
			reason: "bundle manifest unavailable: permission denied",
			installHint:
				"Build and start the pi-fence bundle container from docker/bundle before enabling sandbox placement.",
		});
	});

	it("reports unavailable when a required tool probe fails", async () => {
		const env = new FakeExecSandboxEnvironment();
		env.setResponse("cat", ["/opt/pi-fence-bundle/manifest.json"], {
			stdout: MANIFEST,
			stderr: "",
			exitCode: 0,
		});
		env.setResponse("dot", ["-V"], OK);
		env.setResponse("mmdc", ["--version"], {
			stdout: "",
			stderr: "mmdc not found",
			exitCode: 127,
		});
		const processor = createBundleSandboxProcessor(
			controllerWithStatus({ state: "ready", message: "ready" }),
			env,
		);

		await expect(processor.available()).resolves.toEqual({
			ok: false,
			reason: "bundle tool mmdc probe failed: mmdc --version mmdc not found",
			installHint: expect.stringContaining("docker/bundle"),
		});
	});
});
