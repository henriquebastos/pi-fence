import { describe, expect, it } from "vitest";

import {
	createDockerExecSandboxEnvironment,
	createGondolinExecSandboxEnvironment,
	type GondolinExecOptions,
	type GondolinExecResult,
	type GondolinExecVM,
} from "../../extensions/pi-fence/sandbox.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

const CONTAINER = "pi-fence-bundle";

class FakeGondolinFs {
	readonly calls: Array<{ method: string; path: string; data?: string; options?: object }> = [];
	readonly files = new Map<string, Buffer>();

	async writeFile(path: string, data: string | Buffer, options?: object): Promise<void> {
		this.calls.push({ method: "writeFile", path, data: Buffer.isBuffer(data) ? data.toString("utf8") : data, options });
		this.files.set(path, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
	}

	async readFile(path: string, options?: object): Promise<Buffer> {
		this.calls.push({ method: "readFile", path, options });
		return this.files.get(path) ?? Buffer.alloc(0);
	}

	async deleteFile(path: string, options?: object): Promise<void> {
		this.calls.push({ method: "deleteFile", path, options });
	}
}

class FakeGondolinExecVM implements GondolinExecVM {
	readonly execCalls: Array<{ command: string | readonly string[]; options?: GondolinExecOptions }> = [];
	readonly fs = new FakeGondolinFs();
	private nextExecResult: GondolinExecResult = {
		stdout: "",
		stdoutBuffer: Buffer.alloc(0),
		stderr: "",
		exitCode: 0,
	};

	setExecResult(result: GondolinExecResult): void {
		this.nextExecResult = result;
	}

	async exec(command: string | readonly string[], options?: GondolinExecOptions): Promise<GondolinExecResult> {
		this.execCalls.push({ command, options });
		return this.nextExecResult;
	}
}

describe("Gondolin exec sandbox environment", () => {
	it("runs commands through the VM while preserving stdin, cwd, signal, and binary stdout", async () => {
		const vm = new FakeGondolinExecVM();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const signal = new AbortController().signal;
		vm.setExecResult({ stdout: png.toString("binary"), stdoutBuffer: png, stderr: "", exitCode: 0 });
		const env = createGondolinExecSandboxEnvironment(vm);

		const result = await env.run("dot", ["-Tpng"], {
			cwd: "/work",
			input: "digraph { A -> B }",
			signal,
		});

		expect(result.stdoutBuffer).toEqual(png);
		expect(vm.execCalls).toEqual([
			{
				command: ["/usr/bin/env", "dot", "-Tpng"],
				options: {
					cwd: "/work",
					stdin: "digraph { A -> B }",
					stdout: "buffer",
					stderr: "buffer",
					signal,
				},
			},
		]);
	});

	it("creates, uses, and disposes a workspace inside the VM", async () => {
		const vm = new FakeGondolinExecVM();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		vm.setExecResult({ stdout: "/tmp/pi-fence-a1b2c3\n", stdoutBuffer: Buffer.alloc(0), stderr: "", exitCode: 0 });
		vm.fs.files.set("/tmp/pi-fence-a1b2c3/output.png", png);
		const env = createGondolinExecSandboxEnvironment(vm);

		const workspace = await env.createWorkspace();
		expect(workspace.path("input.mmd")).toBe("/tmp/pi-fence-a1b2c3/input.mmd");
		expect(() => workspace.path("../escape.mmd")).toThrow("workspace path must be relative");
		expect(() => workspace.path("")).toThrow("workspace path must be relative");
		expect(() => workspace.path("/tmp/escape.mmd")).toThrow("workspace path must be relative");

		await workspace.writeText("input.mmd", "flowchart LR\nA --> B");
		expect(await workspace.readBuffer("output.png")).toEqual(png);
		await workspace.dispose();

		expect(vm.execCalls).toEqual([
			{
				command: ["/usr/bin/env", "mktemp", "-d", "/tmp/pi-fence-XXXXXX"],
				options: { stdout: "buffer", stderr: "buffer" },
			},
		]);
		expect(vm.fs.calls).toEqual([
			{
				method: "writeFile",
				path: "/tmp/pi-fence-a1b2c3/input.mmd",
				data: "flowchart LR\nA --> B",
				options: undefined,
			},
			{
				method: "readFile",
				path: "/tmp/pi-fence-a1b2c3/output.png",
				options: { encoding: null },
			},
			{
				method: "deleteFile",
				path: "/tmp/pi-fence-a1b2c3",
				options: { recursive: true, force: true },
			},
		]);
	});

	it("rejects oversized workspace reads before reading from VM fs", async () => {
		const vm = new FakeGondolinExecVM();
		vm.setExecResult({ stdout: "/tmp/pi-fence-a1b2c3\n", stdoutBuffer: Buffer.alloc(0), stderr: "", exitCode: 0 });
		const env = createGondolinExecSandboxEnvironment(vm);
		const workspace = await env.createWorkspace();
		vm.setExecResult({ stdout: "11 /tmp/pi-fence-a1b2c3/output.png\n", stdoutBuffer: Buffer.alloc(0), stderr: "", exitCode: 0 });

		await expect(workspace.readBuffer("output.png", undefined, 10)).rejects.toThrow("workspace file output.png is too large");

		expect(vm.fs.calls).toEqual([]);
		expect(vm.execCalls[1]).toEqual({
			command: ["/usr/bin/env", "wc", "-c", "/tmp/pi-fence-a1b2c3/output.png"],
			options: { stdout: "buffer", stderr: "buffer" },
		});
	});

	it("rejects a non-absolute workspace root", () => {
		expect(() =>
			createGondolinExecSandboxEnvironment(new FakeGondolinExecVM(), {
				workspaceRoot: "tmp",
			}),
		).toThrow("workspace root must be an absolute container path");
	});
});

describe("Docker exec sandbox environment", () => {
	it("wraps command runs in docker exec while preserving stdin, cwd, and binary stdout", async () => {
		const shell = new FakeShellRunner();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		shell.setResponse(
			"docker",
			["exec", "-i", "-w", "/work", CONTAINER, "dot", "-Tpng"],
			{ stdout: png.toString("binary"), stdoutBuffer: png, stderr: "", exitCode: 0 },
		);
		const env = createDockerExecSandboxEnvironment(shell, { containerName: CONTAINER });

		const result = await env.run("dot", ["-Tpng"], {
			cwd: "/work",
			input: "digraph { A -> B }",
		});

		expect(result.stdoutBuffer).toEqual(png);
		expect(shell.calls).toEqual([
			{
				cmd: "docker",
				args: ["exec", "-i", "-w", "/work", CONTAINER, "dot", "-Tpng"],
				input: "digraph { A -> B }",
			},
		]);
	});

	it("creates, uses, and disposes a workspace inside the container", async () => {
		const shell = new FakeShellRunner();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		shell.setResponse("docker", ["exec", CONTAINER, "mktemp", "-d", "/tmp/pi-fence-XXXXXX"], {
			stdout: "/tmp/pi-fence-a1b2c3\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse(
			"docker",
			["exec", "-i", CONTAINER, "sh", "-c", "cat > \"$1\"", "sh", "/tmp/pi-fence-a1b2c3/input.mmd"],
			{ stdout: "", stderr: "", exitCode: 0 },
		);
		shell.setResponse("docker", ["exec", CONTAINER, "cat", "/tmp/pi-fence-a1b2c3/output.png"], {
			stdout: png.toString("binary"),
			stdoutBuffer: png,
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["exec", CONTAINER, "rm", "-rf", "--", "/tmp/pi-fence-a1b2c3"], {
			stdout: "",
			stderr: "",
			exitCode: 0,
		});
		const env = createDockerExecSandboxEnvironment(shell, { containerName: CONTAINER });

		const workspace = await env.createWorkspace();
		expect(workspace.path("input.mmd")).toBe("/tmp/pi-fence-a1b2c3/input.mmd");
		expect(() => workspace.path("../escape.mmd")).toThrow("workspace path must be relative");
		expect(() => workspace.path("")).toThrow("workspace path must be relative");
		expect(() => workspace.path("/tmp/escape.mmd")).toThrow("workspace path must be relative");

		await workspace.writeText("input.mmd", "flowchart LR\nA --> B");
		expect(await workspace.readBuffer("output.png")).toEqual(png);
		await workspace.dispose();

		expect(shell.calls.map((call) => call.args)).toEqual([
			["exec", CONTAINER, "mktemp", "-d", "/tmp/pi-fence-XXXXXX"],
			["exec", "-i", CONTAINER, "sh", "-c", "cat > \"$1\"", "sh", "/tmp/pi-fence-a1b2c3/input.mmd"],
			["exec", CONTAINER, "cat", "/tmp/pi-fence-a1b2c3/output.png"],
			["exec", CONTAINER, "rm", "-rf", "--", "/tmp/pi-fence-a1b2c3"],
		]);
	});

	it("rejects oversized workspace reads before cat", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["exec", CONTAINER, "mktemp", "-d", "/tmp/pi-fence-XXXXXX"], {
			stdout: "/tmp/pi-fence-a1b2c3\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["exec", CONTAINER, "wc", "-c", "/tmp/pi-fence-a1b2c3/output.png"], {
			stdout: "11 /tmp/pi-fence-a1b2c3/output.png\n",
			stderr: "",
			exitCode: 0,
		});
		const env = createDockerExecSandboxEnvironment(shell, { containerName: CONTAINER });
		const workspace = await env.createWorkspace();

		await expect(workspace.readBuffer("output.png", undefined, 10)).rejects.toThrow("workspace file output.png is too large");

		expect(shell.calls.map((call) => call.args)).toEqual([
			["exec", CONTAINER, "mktemp", "-d", "/tmp/pi-fence-XXXXXX"],
			["exec", CONTAINER, "wc", "-c", "/tmp/pi-fence-a1b2c3/output.png"],
		]);
	});

	it("rejects a non-absolute workspace root", () => {
		expect(() =>
			createDockerExecSandboxEnvironment(new FakeShellRunner(), {
				containerName: CONTAINER,
				workspaceRoot: "tmp",
			}),
		).toThrow("workspace root must be an absolute container path");
	});

	it("fails workspace creation when mktemp returns a normalized path outside the workspace root", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["exec", CONTAINER, "mktemp", "-d", "/tmp/pi-fence-XXXXXX"], {
			stdout: "/tmp/../opt/pi-fence-a1b2c3\n",
			stderr: "",
			exitCode: 0,
		});
		const env = createDockerExecSandboxEnvironment(shell, { containerName: CONTAINER });

		await expect(env.createWorkspace()).rejects.toThrow(
			"mktemp returned path outside /tmp: /tmp/../opt/pi-fence-a1b2c3",
		);
	});

	it("fails workspace creation when mktemp does not return a usable path", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["exec", CONTAINER, "mktemp", "-d", "/tmp/pi-fence-XXXXXX"], {
			stdout: "",
			stderr: "mktemp failed",
			exitCode: 1,
		});
		const env = createDockerExecSandboxEnvironment(shell, { containerName: CONTAINER });

		await expect(env.createWorkspace()).rejects.toThrow("mktemp failed");
	});
});
