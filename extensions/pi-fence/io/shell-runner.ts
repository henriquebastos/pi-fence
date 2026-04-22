/**
 * ShellRunner — production-owned subprocess seam for pi-fence runtime code.
 *
 * Production adapters import the contract and `NodeShellRunner` from here.
 * Test fakes and live-only wrappers stay under `tests/utilities/`.
 */

import { execFile } from "node:child_process";

export interface ShellResult {
	stdout: string;
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
					encoding: "buffer",
					maxBuffer: 50 * 1024 * 1024,
				},
				(err, stdoutBuf, stderrBuf) => {
					const stdoutBuffer = toBuffer(stdoutBuf);
					const stderrBuffer = toBuffer(stderrBuf);
					const stdout = stdoutBuffer.toString("utf8");
					const stderr = stderrBuffer.toString("utf8");
					if (err) {
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

function toBuffer(x: unknown): Buffer {
	if (Buffer.isBuffer(x)) return x;
	if (typeof x === "string") return Buffer.from(x, "utf8");
	return Buffer.alloc(0);
}
