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
import type { FenceProcessor, FenceResult } from "./processor.ts";

const DEFAULT_ENDPOINT = "https://kroki.io";
const DEFAULT_TIMEOUT_MS = 15_000;
const ERROR_BODY_MAX_CHARS = 500;

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
): FenceProcessor {
	const base = endpoint.replace(/\/+$/, "");

	return {
		id: "kroki",

		async render(tag, source, signal): Promise<FenceResult> {
			if (signal?.aborted) {
				return { ok: false, error: "Aborted before request" };
			}

			const combinedSignal = mergeSignals([signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)]);

			let response;
			try {
				response = await http.request({
					method: "POST",
					url: `${base}/${tag}/png`,
					headers: { "content-type": "text/plain" },
					body: source,
					signal: combinedSignal,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return { ok: false, error: message };
			}

			if (response.status >= 200 && response.status < 300) {
				return { ok: true, png: response.body };
			}

			const text = response.body.toString("utf8");
			const truncated =
				text.length > ERROR_BODY_MAX_CHARS ? text.slice(0, ERROR_BODY_MAX_CHARS) : text;
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
