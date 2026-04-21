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
 *   - NodeShellRunner       production; wraps child_process.execFile.
 *   - DockerExecShellRunner  runs binaries inside a named Docker container
 *                            via `docker exec`. Used by live integration
 *                            tests; production never wires it.
 *   - FakeShellRunner        in-memory capture/replay for tests.
 */

import { execFile } from "node:child_process";

export interface ShellResult {
	/**
	 * stdout as a UTF-8 decoded string. Lossy for binary payloads —
	 * high-bit bytes become replacement characters. Binary-consuming
	 * callers must read `stdoutBuffer` instead.
	 */
	stdout: string;
	/**
	 * stdout as raw bytes. Always populated by `NodeShellRunner` and
	 * `DockerExecShellRunner` (which wraps Node). Optional on
	 * `FakeShellRunner` results — tests that don't care about binary
	 * fidelity (the majority: exit codes, stderr strings, call capture)
	 * leave it unset and callers fall back to encoding `stdout` as
	 * UTF-8. Tests that assert on PNG bytes (graphviz-local) set
	 * `stdoutBuffer` explicitly in the programmed response.
	 *
	 * Introduced in CV0.E2.S1 for the graphviz-local processor whose
	 * `render()` returns raw PNG bytes from `dot -Tpng` stdout. Option
	 * (b) from the S1 spec's deferred-decision list: widen `ShellResult`
	 * rather than add a sibling `runBinary()` method — zero blast
	 * radius on existing callers, ~30 LOC of plumbing, memory cost is
	 * negligible for the PNG sizes pi-fence handles.
	 */
	stdoutBuffer?: Buffer;
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
					// Binary-safe: execFile's "buffer" encoding yields Buffer
					// stdout/stderr instead of lossy UTF-8 strings. We decode
					// into `stdout` for text-path callers and keep the raw
					// bytes in `stdoutBuffer` for binary-path callers
					// (graphviz-local reads PNG bytes from `dot -Tpng` stdout).
					encoding: "buffer",
					// Buffer up to 50 MB of output. Rendered PNGs from Kroki
					// or local `dot` usually come as stdout; 50 MB is a
					// generous ceiling before something is clearly wrong.
					maxBuffer: 50 * 1024 * 1024,
				},
				(err, stdoutBuf, stderrBuf) => {
					const stdoutBuffer = toBuffer(stdoutBuf);
					const stderrBuffer = toBuffer(stderrBuf);
					const stdout = stdoutBuffer.toString("utf8");
					const stderr = stderrBuffer.toString("utf8");
					// execFile's err may be an ExecFileException with .code
					// for non-zero exits. We unpack both cases so the caller
					// gets a uniform ShellResult rather than a thrown error
					// for "the process ran but returned 3".
					if (err) {
						// AbortError and ENOENT (spawn failure) bubble up.
						// Non-zero-exit errors carry `code` as a number.
						const code = (err as NodeJS.ErrnoException & { code?: number | string }).code;
						if (typeof code === "number") {
							resolve({ stdout, stdoutBuffer, stderr, exitCode: code });
							return;
						}
						reject(err);
						return;
					}
					resolve({ stdout, stdoutBuffer, stderr, exitCode: 0 });
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

/**
 * Coerce `execFile`'s callback stdout/stderr into a Buffer. With
 * `encoding: "buffer"` the callback yields Buffer instances; the
 * defensive `string`/`nullish` branches exist so a future Node
 * behaviour change doesn't silently produce corrupted bytes.
 */
function toBuffer(x: unknown): Buffer {
	if (Buffer.isBuffer(x)) return x;
	if (typeof x === "string") return Buffer.from(x, "utf8");
	return Buffer.alloc(0);
}

function keyFor(cmd: string, args: string[]): string {
	// Args joined on a NUL byte so nothing user-provided collides with the
	// delimiter. Simple, deterministic, adequate for tests.
	return `${cmd}\0${args.join("\0")}`;
}

// ---------------------------------------------------------------------------
// DockerExecShellRunner
// ---------------------------------------------------------------------------

/**
 * Wraps every call in `docker exec [-i] [-w <cwd>] <container> <cmd> ...`.
 * Used by live integration tests to reach a binary inside the
 * pi-fence-live-deps container without installing it on the host.
 *
 * Production never uses this impl. It exists so live tests can drive the
 * same `ShellRunner` interface the production `NodeShellRunner` would, from
 * a container whose binaries the repo controls.
 *
 * When `opts.input` is present we add `-i` so docker keeps stdin open for
 * the exec'd process. When `opts.cwd` is present we add `-w <cwd>` — this
 * is the path inside the container, not on the host.
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
			// cwd on the host doesn't matter — docker exec is what runs. Only
			// input and signal propagate.
			input: opts.input,
			signal: opts.signal,
		});
	}
}
