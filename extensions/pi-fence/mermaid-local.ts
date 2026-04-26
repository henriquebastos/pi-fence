/**
 * mermaid-local processor — renders Mermaid source via the local `mmdc`
 * binary (@mermaid-js/mermaid-cli). Wins the `mermaid` tag when `mmdc`
 * is on PATH; otherwise the extension's capability-based resolver falls
 * through to Kroki.
 *
 * DI-only: callers supply a `ShellRunner` and a temp-dir factory.
 * Production wires `NodeShellRunner`; tests wire `FakeShellRunner`.
 *
 * Contract:
 *   - `available()`: `mmdc --version` exits 0 → ok; non-zero or throw
 *     → unavailable with install hint. Never throws.
 *   - `render(tag, source, signal)`: writes source to a temp `.mmd`
 *     file, runs `mmdc -i <in> -o <out> -b transparent`, reads the
 *     output PNG. Cleans up temp files after render. Pre-aborted
 *     signal → early return without spawning.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { ShellRunner } from "./io/shell-runner.ts";
import { NULL_LOGGER, type Logger } from "./io/logger.ts";
import {
	DEFAULT_RENDER_TIMEOUT_MS,
	mergeSignals,
	withSignalGuard,
	type Availability,
	type FenceProcessor,
	type FenceResult,
} from "./processor.ts";

const ERROR_BODY_MAX_CHARS = 500;

const INSTALL_HINT =
	"Install @mermaid-js/mermaid-cli — npm i -g @mermaid-js/mermaid-cli · https://github.com/mermaid-js/mermaid-cli";

export const MERMAID_LOCAL_CANONICAL_TAGS: readonly string[] = ["mermaid"];
export const MERMAID_LOCAL_ALIASES: Readonly<Record<string, string>> = {};

export function createMermaidLocalProcessor(
	shell: ShellRunner,
	logger: Logger = NULL_LOGGER,
): FenceProcessor {
	return {
		id: "mermaid-local",
		placement: "host",
		tags: MERMAID_LOCAL_CANONICAL_TAGS,
		aliases: MERMAID_LOCAL_ALIASES,

		async available(): Promise<Availability> {
			try {
				const probe = await shell.run("mmdc", ["--version"]);
				if (probe.exitCode === 0) {
					logger.debug("mermaid-local", "available", {
						version: probe.stdout.trim(),
					});
					return { ok: true };
				}
				return {
					ok: false,
					reason: `mmdc --version exited ${probe.exitCode}`,
					installHint: INSTALL_HINT,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.debug("mermaid-local", "unavailable (spawn failure)", {
					error: message,
				});
				return {
					ok: false,
					reason: `mmdc binary not found on PATH (${message})`,
					installHint: INSTALL_HINT,
				};
			}
		},

		render: withSignalGuard(async (tag, source, signal): Promise<FenceResult> => {
			const combinedSignal = mergeSignals([
				signal,
				AbortSignal.timeout(DEFAULT_RENDER_TIMEOUT_MS),
			]);
			const id = randomUUID().slice(0, 8);
			const inPath = join(tmpdir(), `pi-fence-mmd-${id}.mmd`);
			const outPath = join(tmpdir(), `pi-fence-mmd-${id}.png`);

			try {
				await fs.writeFile(inPath, source, "utf8");

				logger.debug("mermaid-local", "shelling out to mmdc", {
					tag,
					sourceBytes: Buffer.byteLength(source, "utf8"),
				});

				const result = await shell.run(
					"mmdc",
					["-i", inPath, "-o", outPath, "-b", "transparent"],
					{ signal: combinedSignal },
				);

				if (result.exitCode !== 0) {
					const error = (result.stderr || `mmdc exited ${result.exitCode}`).slice(
						0,
						ERROR_BODY_MAX_CHARS,
					);
					logger.warn("mermaid-local", "mmdc error", {
						tag,
						exitCode: result.exitCode,
					});
					return { ok: false, error };
				}

				const png = await fs.readFile(outPath);
				logger.info("mermaid-local", "mmdc ok", { tag, bytes: png.length });
				return { ok: true, png };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.error("mermaid-local", message, { tag });
				return { ok: false, error: message };
			} finally {
				// Best-effort cleanup.
				await fs.unlink(inPath).catch(() => {});
				await fs.unlink(outPath).catch(() => {});
			}
		}),
	};
}
