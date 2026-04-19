/**
 * Self-tests for the `ShellRunner` interface and its Fake implementation.
 *
 * `NodeShellRunner` is covered by its own test block below (runs a real
 * binary). `DockerExecShellRunner` is covered by the integration-layer
 * exemplar at `tests/integration/example.live.test.ts` because it needs a
 * running container.
 *
 * These tests lock down the contract every ShellRunner must honour:
 *   - Capturing argv as-is (no shell-quoting surprises).
 *   - Returning stdout/stderr/exitCode as structured data, not thrown
 *     exceptions for non-zero exits.
 *   - Respecting cwd, stdin, and AbortSignal when the impl supports them.
 */

import { describe, expect, it } from "vitest";

import {
	FakeShellRunner,
	NodeShellRunner,
	type ShellResult,
	type ShellRunner,
} from "./shell-runner.ts";

describe("FakeShellRunner", () => {
	it("returns the default response when no match is programmed", async () => {
		const shell: ShellRunner = new FakeShellRunner({
			stdout: "default",
			stderr: "",
			exitCode: 0,
		});
		const result = await shell.run("anything", []);
		expect(result).toEqual({ stdout: "default", stderr: "", exitCode: 0 });
	});

	it("returns a programmed response for a matching (cmd, args)", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("echo", ["hello"], {
			stdout: "hello\n",
			stderr: "",
			exitCode: 0,
		});
		const result = await shell.run("echo", ["hello"]);
		expect(result.stdout).toBe("hello\n");
	});

	it("distinguishes responses by args", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("dot", ["-V"], { stdout: "dot - graphviz 10", stderr: "", exitCode: 0 });
		shell.setResponse("dot", ["-Tpng"], { stdout: "png bytes", stderr: "", exitCode: 0 });

		expect((await shell.run("dot", ["-V"])).stdout).toBe("dot - graphviz 10");
		expect((await shell.run("dot", ["-Tpng"])).stdout).toBe("png bytes");
	});

	it("records every call in the order received", async () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		await shell.run("dot", ["-V"]);
		await shell.run("neato", ["-Tpng"], { cwd: "/tmp/example" });

		expect(shell.calls).toHaveLength(2);
		expect(shell.calls[0]).toMatchObject({ cmd: "dot", args: ["-V"] });
		expect(shell.calls[1]).toMatchObject({ cmd: "neato", args: ["-Tpng"], cwd: "/tmp/example" });
	});

	it("records the stdin input when provided", async () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		await shell.run("dot", ["-Tpng"], { input: "digraph { A -> B }" });

		expect(shell.calls[0].input).toBe("digraph { A -> B }");
	});

	it("throws when no default is set and no match is programmed", async () => {
		const shell = new FakeShellRunner();
		await expect(shell.run("unknown", [])).rejects.toThrow(/no programmed response/i);
	});

	it("supports abort via AbortSignal by rejecting with AbortError", async () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const controller = new AbortController();
		controller.abort();

		await expect(shell.run("slow", [], { signal: controller.signal })).rejects.toThrow(
			/abort/i,
		);
	});
});

describe("NodeShellRunner", () => {
	const shell = new NodeShellRunner();

	it("runs /bin/echo and captures stdout", async () => {
		// POSIX-only smoke test. Windows support for NodeShellRunner is out of
		// scope for S0 (see S0 plan, §3 note).
		const result: ShellResult = await shell.run("/bin/echo", ["hello"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("hello\n");
		expect(result.stderr).toBe("");
	});

	it("captures a non-zero exit code without throwing", async () => {
		const result = await shell.run("/bin/sh", ["-c", "exit 3"]);
		expect(result.exitCode).toBe(3);
	});

	it("captures stderr", async () => {
		const result = await shell.run("/bin/sh", ["-c", "echo oops >&2"]);
		expect(result.stderr).toBe("oops\n");
		expect(result.exitCode).toBe(0);
	});

	it("pipes stdin when opts.input is set", async () => {
		const result = await shell.run("/bin/cat", [], { input: "piped data" });
		expect(result.stdout).toBe("piped data");
	});

	it("respects cwd", async () => {
		const { mkdtempSync, realpathSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const dir = mkdtempSync(join(tmpdir(), "pi-fence-cwd-"));
		try {
			const result = await shell.run("/bin/pwd", [], { cwd: dir });
			// On macOS /tmp is a symlink to /private/tmp, so `pwd` returns the
			// canonical path. realpath normalises both sides.
			expect(result.stdout.trim()).toBe(realpathSync(dir));
		} finally {
			const { rmSync } = await import("node:fs");
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("rejects with AbortError when the signal fires mid-run", async () => {
		const controller = new AbortController();
		const running = shell.run("/bin/sh", ["-c", "sleep 5"], { signal: controller.signal });
		// Fire the abort after the process has started.
		setTimeout(() => controller.abort(), 20);
		await expect(running).rejects.toThrow(/abort/i);
	});
});
