/**
 * ShellRunner — the subprocess seam used by every pi-fence component that
 * shells out to a local binary.
 *
 * This module lives under `tests/utilities/` for S0. A later story will
 * promote it (along with HttpClient and Logger) to `extensions/pi-fence/io/`
 * once production code starts importing it. The interface shape is stable;
 * the location is the only thing that will move.
 *
 * Contract:
 *   - Non-zero exit codes are NOT thrown. They are returned in the
 *     `exitCode` field so callers can branch on success/failure without
 *     try/catch around every call.
 *   - Errors that prevent the process from producing a ShellResult at all
 *     (spawn failure, bad path, abort) ARE thrown.
 *   - stdout/stderr are returned as UTF-8 strings. Binary stdio is a future
 *     concern; no current processor needs it.
 *
 * Three impls:
 *   - NodeShellRunner     production; wraps child_process.execFile.
 *   - DockerExecShellRunner (separate file) runs binaries inside a named
 *     Docker container via `docker exec`. Lands in a later step.
 *   - FakeShellRunner     in-memory capture/replay for tests.
 */

import { execFile } from "node:child_process";

export interface ShellResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface ShellRunOptions {
	cwd?: string;
	input?: string;
	signal?: AbortSignal;
}

export interface ShellRunner {
	run(cmd: string, args: string[], opts?: ShellRunOptions): Promise<ShellResult>;
}

// ---------------------------------------------------------------------------
// NodeShellRunner
// ---------------------------------------------------------------------------

/**
 * Production impl. Wraps `child_process.execFile`. Node spawns `cmd` directly
 * — no shell interpolation. Arguments arrive unmangled.
 */
export class NodeShellRunner implements ShellRunner {
	async run(cmd: string, args: string[], opts: ShellRunOptions = {}): Promise<ShellResult> {
		return new Promise<ShellResult>((resolve, reject) => {
			const child = execFile(
				cmd,
				args,
				{
					cwd: opts.cwd,
					signal: opts.signal,
					encoding: "utf8",
					// Buffer up to 50 MB of output. Rendered PNGs from Kroki
					// or local `dot` usually come as stdout; 50 MB is a
					// generous ceiling before something is clearly wrong.
					maxBuffer: 50 * 1024 * 1024,
				},
				(err, stdout, stderr) => {
					// execFile's err may be an ExecFileException with .code
					// for non-zero exits. We unpack both cases so the caller
					// gets a uniform ShellResult rather than a thrown error
					// for "the process ran but returned 3".
					if (err) {
						// AbortError and ENOENT (spawn failure) bubble up.
						// Non-zero-exit errors carry `code` as a number.
						const code = (err as NodeJS.ErrnoException & { code?: number | string }).code;
						if (typeof code === "number") {
							resolve({
								stdout: typeof stdout === "string" ? stdout : stdout.toString("utf8"),
								stderr: typeof stderr === "string" ? stderr : stderr.toString("utf8"),
								exitCode: code,
							});
							return;
						}
						reject(err);
						return;
					}
					resolve({
						stdout: typeof stdout === "string" ? stdout : stdout.toString("utf8"),
						stderr: typeof stderr === "string" ? stderr : stderr.toString("utf8"),
						exitCode: 0,
					});
				},
			);

			if (opts.input !== undefined && child.stdin) {
				child.stdin.end(opts.input);
			}
		});
	}
}

// ---------------------------------------------------------------------------
// FakeShellRunner
// ---------------------------------------------------------------------------

export interface RecordedShellCall {
	cmd: string;
	args: string[];
	cwd?: string;
	input?: string;
}

/**
 * Test fake. Programmed via `setResponse(cmd, args, result)`. Calls that
 * don't match a programmed (cmd, args) tuple fall back to the default
 * response passed at construction; if no default was set, `run()` throws.
 *
 * Every call is recorded in `calls` in the order received — tests assert
 * against that array directly.
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

		this.calls.push({ cmd, args, cwd: opts.cwd, input: opts.input });

		const programmed = this.programmed.get(keyFor(cmd, args));
		if (programmed) return programmed;
		if (this.defaultResult) return this.defaultResult;

		throw new Error(
			`FakeShellRunner: no programmed response for ${cmd} ${args.join(" ")} and no default set`,
		);
	}
}

function keyFor(cmd: string, args: string[]): string {
	// Args joined on a NUL byte so nothing user-provided collides with the
	// delimiter. Simple, deterministic, adequate for tests.
	return `${cmd}\0${args.join("\0")}`;
}
