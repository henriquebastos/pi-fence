import { describe, expect, it } from "vitest";

import { createDockerExecSandboxEnvironment } from "../../extensions/pi-fence/sandbox.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

const CONTAINER = "pi-fence-bundle";

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
