/**
 * Live tests for `DockerExecShellRunner`.
 *
 * Skipped when the pi-fence-live-deps container isn't running. Start it
 * with `pnpm live:build && pnpm live:up` before running `pnpm test:live`.
 *
 * These tests exercise the Docker-specific behaviour of the shell runner:
 * argument passing into the container, exit-code capture through
 * `docker exec`, stdin piping via `-i`, and cwd via `-w`. The broader
 * cross-layer exemplar (`example.live.test.ts`) proves the whole path
 * end-to-end with `echo hello`.
 */

import { describe, expect, it } from "vitest";

import { DockerExecShellRunner } from "../utilities/shell-runner.ts";
import { hasContainer } from "../utilities/live-deps.ts";

const CONTAINER = "pi-fence-live-deps";
const containerRunning = await hasContainer(CONTAINER);

describe.skipIf(!containerRunning)("DockerExecShellRunner — live", () => {
	const shell = new DockerExecShellRunner(CONTAINER);

	it("captures stdout from a command inside the container", async () => {
		const result = await shell.run("echo", ["hello from container"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("hello from container\n");
	});

	it("captures stderr", async () => {
		const result = await shell.run("sh", ["-c", "echo oops >&2"]);
		expect(result.stderr).toBe("oops\n");
	});

	it("reports non-zero exit without throwing", async () => {
		const result = await shell.run("sh", ["-c", "exit 7"]);
		expect(result.exitCode).toBe(7);
	});

	it("pipes stdin via `-i` when opts.input is set", async () => {
		const result = await shell.run("cat", [], { input: "hello stdin" });
		expect(result.stdout).toBe("hello stdin");
	});

	it("honours opts.cwd as a container-internal path via `-w`", async () => {
		const result = await shell.run("pwd", [], { cwd: "/tmp" });
		expect(result.stdout.trim()).toBe("/tmp");
	});

	it("reaches graphviz — `dot -V` responds", async () => {
		// Spot check that the container carries the binary the image is
		// built for. This is the whole point of having the container.
		const result = await shell.run("dot", ["-V"]);
		// graphviz emits its version on stderr by convention.
		const combined = `${result.stdout}${result.stderr}`;
		expect(combined).toMatch(/graphviz/i);
	});
});
