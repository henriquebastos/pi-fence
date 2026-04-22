/**
 * graphviz-local processor — renders DOT source via the local `dot`
 * binary. The second processor pi-fence ships, registered alongside
 * Kroki in CV0.E2.S1. Wins the `graphviz`/`dot` tag when `dot` is on
 * PATH; otherwise the extension's capability-based resolver falls
 * through to Kroki.
 *
 * DI-only: callers supply a `ShellRunner` (`NodeShellRunner` in
 * production; `FakeShellRunner` in unit tests; `DockerExecShellRunner`
 * in the live integration test that runs `dot -Tpng` inside the
 * pi-fence-live-deps container). Matches `kroki.ts`'s factory shape.
 *
 * Contract:
 *   - `available()`: `dot -V` exits 0 → { ok: true }; non-zero exit or
 *     shell-runner throw → { ok: false, reason, installHint }. Never
 *     throws — a crashing probe would propagate out of the extension's
 *     wire-time `available()` loop and take the whole extension down.
 *   - `render(tag, source, signal)`: shells out `dot -Tpng` with
 *     `source` on stdin. Exit 0 → { ok: true, png: Buffer } where
 *     `png` reads from `ShellResult.stdoutBuffer` (binary-safe;
 *     `stdout` is the UTF-8 decoded variant, lossy for PNGs). Non-zero
 *     exit → { ok: false, error: stderr (or `dot exited N`) truncated
 *     to 500 chars }. Shell-runner throw → { ok: false, error:
 *     exception message }. Pre-aborted signal → early
 *     { ok: false, error: "Aborted before request" } with no spawn.
 *   - Aliases: the processor advertises `dot → graphviz`. Alias
 *     resolution to the canonical tag is not meaningful internally
 *     (the shell command is the same regardless of how the tag was
 *     written); the aliases map is advertised so `/fence list` + the
 *     extension's `resolve(tag)` can match against it.
 *   - Config-free: `dot` on PATH is the entire runtime dependency.
 *     No endpoint, no credentials, no environment knobs. Theme-aware
 *     DOT output (Kroki's `?theme=dark` analog via `-G bgcolor=…`) is
 *     deferred to a later story.
 */

import type { ShellRunner } from "./io/shell-runner.ts";
import type { Logger } from "./io/logger.ts";
import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";

const NULL_LOGGER: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const ERROR_BODY_MAX_CHARS = 500;

/**
 * Install hint surfaced on `/fence list` when `dot` is not available.
 * Covers the common platforms pi users run on; the upstream URL is the
 * fallback for everything else. Kept as a single string (not a structured
 * per-platform map) because `/fence list` renders it as free prose; any
 * future `/fence doctor` that wants per-platform detection can add that
 * shape without breaking this one.
 */
const INSTALL_HINT =
	"Install graphviz — apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS) · https://graphviz.org/download/";

/**
 * Canonical tags graphviz-local handles. Just `graphviz` today; `dot`
 * is exposed as an alias via `GRAPHVIZ_LOCAL_ALIASES`. Exported for the
 * extension's `/fence list` + the resolution rule in `index.ts` so those
 * modules do not duplicate the list.
 */
export const GRAPHVIZ_LOCAL_CANONICAL_TAGS: readonly string[] = ["graphviz"];

/**
 * Alias → canonical map. `dot` is the colloquial name for the DOT
 * language; Kroki advertises the same alias. Exported for `/fence list`
 * and for the extension's `resolve(tag)` so it can match alias keys as
 * well as canonical tags.
 */
export const GRAPHVIZ_LOCAL_ALIASES: Readonly<Record<string, string>> = {
	dot: "graphviz",
};

export function createGraphvizLocalProcessor(
	shell: ShellRunner,
	logger: Logger = NULL_LOGGER,
): FenceProcessor {
	return {
		id: "graphviz-local",
		tags: GRAPHVIZ_LOCAL_CANONICAL_TAGS,
		aliases: GRAPHVIZ_LOCAL_ALIASES,

		async available(): Promise<Availability> {
			try {
				const probe = await shell.run("dot", ["-V"]);
				if (probe.exitCode === 0) {
					logger.debug("graphviz-local", "available", {
						stderr: probe.stderr.trim(),
					});
					return { ok: true };
				}
				logger.debug("graphviz-local", "unavailable", {
					exitCode: probe.exitCode,
					stderr: probe.stderr,
				});
				return {
					ok: false,
					reason: `dot -V exited ${probe.exitCode}: ${probe.stderr.trim().slice(0, 200) || "no stderr"}`,
					installHint: INSTALL_HINT,
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.debug("graphviz-local", "unavailable (spawn failure)", {
					error: message,
				});
				return {
					ok: false,
					reason: `dot binary not found on PATH (${message})`,
					installHint: INSTALL_HINT,
				};
			}
		},

		async render(tag, source, signal): Promise<FenceResult> {
			if (signal?.aborted) {
				logger.warn("graphviz-local", "Aborted before request", { tag });
				return { ok: false, error: "Aborted before request" };
			}

			logger.debug("graphviz-local", "shelling out to dot", {
				tag,
				sourceBytes: Buffer.byteLength(source, "utf8"),
			});

			let result;
			try {
				result = await shell.run("dot", ["-Tpng"], { input: source, signal });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.error("graphviz-local", message, { tag });
				return { ok: false, error: message };
			}

			if (result.exitCode === 0) {
				// `stdoutBuffer` is binary-safe and always populated by
				// NodeShellRunner / DockerExecShellRunner. FakeShellRunner
				// test cases that assert on PNG bytes set it explicitly;
				// the rest leave it unset and we fall back to encoding
				// `stdout` as UTF-8 — lossy for real PNGs but fine for
				// assertion-style tests that never touch bytes.
				const png = result.stdoutBuffer ?? Buffer.from(result.stdout, "utf8");
				logger.info("graphviz-local", "dot ok", { tag, bytes: png.length });
				return { ok: true, png };
			}

			const error = (result.stderr || `dot exited ${result.exitCode}`).slice(
				0,
				ERROR_BODY_MAX_CHARS,
			);
			logger.warn("graphviz-local", "dot error", {
				tag,
				exitCode: result.exitCode,
			});
			return { ok: false, error };
		},
	};
}
