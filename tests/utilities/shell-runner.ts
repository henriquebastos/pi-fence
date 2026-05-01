/**
 * Test utilities for the ShellRunner seam.
 *
 * Production-owned contracts and the Node implementation live in
 * `extensions/pi-fence/io/shell-runner.ts`. This file keeps the fake and the
 * live-only Docker wrapper under the test lane.
 */

import {
	NodeShellRunner,
	type ShellResult,
	type ShellRunOptions,
	type ShellRunner,
} from "../../extensions/pi-fence/io/shell-runner.ts";

export type { ShellResult, ShellRunOptions, ShellRunner };

export interface RecordedShellCall {
	cmd: string;
	args: string[];
	cwd?: string;
	input?: string;
	maxStdoutBytes?: number;
}

/**
 * Test fake. Programmed via `setResponse(cmd, args, result)`.
 */
export class FakeShellRunner implements ShellRunner {
	readonly calls: RecordedShellCall[] = [];
	private readonly programmed = new Map<string, ShellResult>();
	private readonly defaultResult: ShellResult | undefined;

	constructor(defaultResult?: ShellResult) {
		this.defaultResult = defaultResult;
	}

	setResponse(cmd: string, args: string[], result: ShellResult): void {
		this.programmed.set(keyFor(cmd, args), result);
	}

	async run(cmd: string, args: string[], opts: ShellRunOptions = {}): Promise<ShellResult> {
		if (opts.signal?.aborted) {
			throw new DOMException("The operation was aborted.", "AbortError");
		}

		this.calls.push({ cmd, args, cwd: opts.cwd, input: opts.input, maxStdoutBytes: opts.maxStdoutBytes });

		const programmed = this.programmed.get(keyFor(cmd, args));
		if (programmed) return programmed;
		if (this.defaultResult) return this.defaultResult;

		throw new Error(
			`FakeShellRunner: no programmed response for ${cmd} ${args.join(" ")} and no default set`,
		);
	}
}

function keyFor(cmd: string, args: string[]): string {
	return `${cmd}\0${args.join("\0")}`;
}

/**
 * Wraps every call in `docker exec [-i] [-w <cwd>] <container> <cmd> ...`.
 * Used by live integration tests to reach a binary inside the
 * pi-fence-live-deps container without installing it on the host.
 */
export class DockerExecShellRunner implements ShellRunner {
	private readonly inner = new NodeShellRunner();

	constructor(private readonly containerName: string) {}

	async run(cmd: string, args: string[], opts: ShellRunOptions = {}): Promise<ShellResult> {
		const dockerArgs: string[] = ["exec"];
		if (opts.input !== undefined) dockerArgs.push("-i");
		if (opts.cwd !== undefined) dockerArgs.push("-w", opts.cwd);
		dockerArgs.push(this.containerName, cmd, ...args);

		return this.inner.run("docker", dockerArgs, {
			input: opts.input,
			signal: opts.signal,
			maxStdoutBytes: opts.maxStdoutBytes,
		});
	}
}
