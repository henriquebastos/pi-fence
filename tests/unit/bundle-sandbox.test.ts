import { describe, expect, it } from "vitest";

import { createBundleSandboxProcessor } from "../../extensions/pi-fence/bundle-sandbox.ts";
import type {
	ExecSandboxEnvironment,
	ExecSandboxRunOptions,
	ExecSandboxRunResult,
	ExecSandboxWorkspace,
	SandboxController,
	SandboxStatus,
} from "../../extensions/pi-fence/sandbox.ts";

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

class FakeExecSandboxEnvironment implements ExecSandboxEnvironment {
	readonly calls: RecordedExecCall[] = [];
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

	async createWorkspace(): Promise<ExecSandboxWorkspace> {
		throw new Error("workspace not used by availability tests");
	}

	private key(command: string, args: readonly string[]): string {
		return `${command}\0${args.join("\0")}`;
	}
}

function controllerWithStatus(status: SandboxStatus): SandboxController {
	return {
		id: "bundle",
		kind: "exec",
		runtime: "docker-container",
		status: async () => status,
		start: async () => status,
		stop: async () => status,
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

		expect(result).toEqual({ ok: true, png });
		expect(env.calls).toEqual([
			{
				command: "dot",
				args: ["-Tpng"],
				options: { input: "digraph { A -> B }" },
			},
		]);
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
