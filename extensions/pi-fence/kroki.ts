/**
 * Kroki renderer. Posts a text-based diagram source to Kroki's `/png`
 * endpoint and returns the rendered PNG bytes.
 *
 * DI-only: callers supply an `HttpClient`. Production wires
 * `NodeHttpClient`; unit tests wire `FakeHttpClient`. A future story
 * promotes HttpClient out of `tests/utilities/` into
 * `extensions/pi-fence/io/`; the import path shifts then, the semantics
 * don't.
 *
 * Contract:
 *   - POST `{endpoint}/{tag}/png` with Content-Type: text/plain, body = source.
 *   - 15-second timeout by default (AbortSignal.timeout). Merged with the
 *     caller's signal when provided.
 *   - 2xx: return { ok: true, png: Buffer }. Response body passed through
 *     unchanged.
 *   - 4xx/5xx: return { ok: false, error: <truncated body, up to 500 chars> }.
 *   - HttpClient throw (network failure, DNS, abort): return
 *     { ok: false, error: <error message> }.
 *   - Pre-aborted caller signal: early return { ok: false, error: "..." }
 *     without hitting HttpClient.
 *   - Endpoint is configurable at construction; defaults to https://kroki.io.
 */

import type { HttpClient } from "../../tests/utilities/http-client.ts";
import type { Logger } from "../../tests/utilities/logger.ts";
import type { FenceProcessor, FenceResult } from "./processor.ts";

/**
 * No-op logger used when the caller passes no `Logger`. Keeps the render
 * path free of `if (logger)` branches while preserving the two-arg
 * factory signature the existing callers already use.
 */
const NULL_LOGGER: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const DEFAULT_ENDPOINT = "https://kroki.io";
const DEFAULT_TIMEOUT_MS = 15_000;
const ERROR_BODY_MAX_CHARS = 500;

/**
 * Canonical tags the Kroki processor handles. Matches the Kroki public
 * endpoint's naming. Aliases that users/LLMs actually write live in
 * `KROKI_ALIASES` below and resolve to one of these at request time.
 *
 * Exported so the extension's `/fence list` command can advertise the
 * processor's accepted tags without duplicating the list.
 */
export const KROKI_CANONICAL_TAGS: readonly string[] = [
	"mermaid",
	"graphviz",
	"plantuml",
	"d2",
];

/**
 * Map colloquial tag names to Kroki's canonical endpoint names. Extend when
 * a user or LLM writes a tag Kroki doesn't recognise directly.
 *
 * Kept inline in this module because Kroki is the only consumer today. A
 * second processor (graphviz-local in CV0.E2) calls `dot` directly, so
 * this map doesn't apply there. Extract to a shared module only when a
 * second alias map earns its place.
 *
 * Exported so `/fence list` can surface the aliases in its output. Every
 * value in this map must appear in `KROKI_CANONICAL_TAGS` — the
 * `FenceProcessor` contract enforces that, the contract test asserts it.
 */
export const KROKI_ALIASES: Readonly<Record<string, string>> = {
	dot: "graphviz",
	puml: "plantuml",
};

/**
 * Resolver the Kroki factory calls at render time to decide whether to
 * pass `?theme=dark` on the URL. The extension wiring reads pi's current
 * theme from `ctx.ui.theme` and returns `"dark"` or `"light"` by mapping
 * the theme name via `isDarkThemeName`. Called fresh on every render so
 * live theme changes take effect without reconstruction.
 */
export type KrokiAppearanceResolver = () => "light" | "dark";

/**
 * Name substrings that indicate a light theme. Pi's built-in `light`,
 * `solarized-light`, `github-light`, `catppuccin-latte`, plain `day`.
 * Case-insensitive match.
 */
const LIGHT_NAME_MARKERS = ["light", "latte", "day"];

/**
 * Heuristic: is this pi theme name dark? Returns `true` when the name
 * contains a dark-theme marker or none of the light markers; defaults to
 * `true` for undefined/unknown names because the failure mode (pale
 * diagrams on a dark terminal) is worse than its mirror.
 *
 * Exported for the extension wiring and tested directly in
 * `tests/unit/kroki.test.ts`. Name-based heuristic chosen over parsing
 * theme background ANSI because pi's exported `Theme` surface gives us
 * `name` for free; any deeper integration would require reaching into
 * `@mariozechner/pi-coding-agent`'s private submodule paths.
 */
export function isDarkThemeName(name: string | undefined): boolean {
	if (!name) return true;
	const lower = name.toLowerCase();
	for (const marker of LIGHT_NAME_MARKERS) {
		if (lower.includes(marker)) return false;
	}
	return true;
}

// Back-compat alias for kroki-specific code that imported KrokiResult
// directly. New code should prefer `FenceResult` from `./processor.ts`.
export type KrokiResult = FenceResult;

// Retained as a narrower alias over the shared FenceProcessor. Not strictly
// necessary but keeps existing call sites typed as "a kroki renderer" when
// they care about provenance.
export type KrokiRenderer = FenceProcessor;

export function createKrokiRenderer(
	http: HttpClient,
	endpoint: string = DEFAULT_ENDPOINT,
	logger: Logger = NULL_LOGGER,
	appearance?: KrokiAppearanceResolver,
): FenceProcessor {
	const base = endpoint.replace(/\/+$/, "");

	return {
		id: "kroki",
		tags: KROKI_CANONICAL_TAGS,
		aliases: KROKI_ALIASES,

		async render(tag, source, signal): Promise<FenceResult> {
			if (signal?.aborted) {
				logger.warn("kroki", "Aborted before request", { tag });
				return { ok: false, error: "Aborted before request" };
			}

			const combinedSignal = mergeSignals([signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)]);
			const krokiTag = KROKI_ALIASES[tag] ?? tag;
			const mode = appearance?.();
			const query = mode === "dark" ? "?theme=dark" : "";
			const url = `${base}/${krokiTag}/png${query}`;

			logger.debug("kroki", "request", {
				tag,
				krokiTag,
				url,
				appearance: mode ?? "default",
				sourceBytes: Buffer.byteLength(source, "utf8"),
			});

			let response;
			try {
				response = await http.request({
					method: "POST",
					url,
					headers: { "content-type": "text/plain" },
					body: source,
					signal: combinedSignal,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.error("kroki", message, { url, tag });
				return { ok: false, error: message };
			}

			if (response.status >= 200 && response.status < 300) {
				logger.debug("kroki", "response ok", {
					status: response.status,
					tag,
					bytes: response.body.length,
				});
				return { ok: true, png: response.body };
			}

			const text = response.body.toString("utf8");
			const truncated =
				text.length > ERROR_BODY_MAX_CHARS ? text.slice(0, ERROR_BODY_MAX_CHARS) : text;
			logger.warn("kroki", "response error", {
				status: response.status,
				tag,
				bodyBytes: response.body.length,
			});
			return { ok: false, error: truncated };
		},
	};
}

/**
 * Combine a caller's AbortSignal with an internal timeout signal. Aborting
 * either one aborts the combined result. Returns `undefined` when all inputs
 * are `undefined` so we don't pass a dummy signal to HttpClient.
 */
function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
	const real = signals.filter((s): s is AbortSignal => s !== undefined);
	if (real.length === 0) return undefined;
	if (real.length === 1) return real[0];

	// AbortSignal.any was added in Node 20 and is present in pi's supported
	// runtime. Using it keeps this trivial; the fallback exists only for
	// defensive paranoia.
	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any(real);
	}

	const controller = new AbortController();
	for (const s of real) {
		if (s.aborted) {
			controller.abort(s.reason);
			break;
		}
		s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
	}
	return controller.signal;
}
