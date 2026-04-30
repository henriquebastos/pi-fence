/**
 * The `FenceProcessor` interface. In S1 there is a single implementation
 * (Kroki) and no registry yet — that arrives with CV0.E2 when a second
 * processor (local graphviz) needs to compete for the same tag.
 *
 * Defining the interface here rather than inside `kroki.ts` signals intent:
 * any new processor lands by implementing this shape. The contract helper
 * at `tests/contract/fence-processor.ts` imports this interface and
 * asserts every processor satisfies the shape with a small live call.
 *
 * Output is a `FenceOutput`: an explicit image/text/error discriminated
 * union. Legacy `{ ok, png|text|error }` results are still accepted at the
 * message seam for older tests and session compatibility, but processor
 * implementations return explicit variants directly.
 */

export const PROCESSOR_PLACEMENTS = ["embedded", "host", "sandbox", "remote"] as const;

export type ProcessorPlacement = typeof PROCESSOR_PLACEMENTS[number];

export type FenceOutput =
	| { kind: "image"; data: Buffer; mimeType: "image/png" }
	| { kind: "text"; text: string }
	| { kind: "error"; error: string };

export type FenceResult =
	| { ok: true; png: Buffer }
	| { ok: true; text: string }
	| { ok: false; error: string };

export function imageOutput(data: Buffer): FenceOutput {
	return { kind: "image", data, mimeType: "image/png" };
}

export function textOutput(text: string): FenceOutput {
	return { kind: "text", text };
}

export function errorOutput(error: string): FenceOutput {
	return { kind: "error", error };
}

export function normalizeFenceOutput(result: FenceResult | FenceOutput): FenceOutput {
	if ("kind" in result) return result;
	if (!result.ok) return { kind: "error", error: result.error };
	if ("png" in result) return { kind: "image", data: result.png, mimeType: "image/png" };
	return { kind: "text", text: result.text };
}

export const DEFAULT_RENDER_TIMEOUT_MS = 15_000;

export function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
	const real = signals.filter((signal): signal is AbortSignal => signal !== undefined);
	if (real.length === 0) return undefined;
	if (real.length === 1) return real[0];
	return AbortSignal.any(real);
}

export type RenderFunction = (
	tag: string,
	source: string,
	signal?: AbortSignal,
) => Promise<FenceOutput>;

export function withSignalGuard(render: RenderFunction): RenderFunction {
	return async (tag, source, signal) => {
		if (signal?.aborted) {
			return errorOutput("Aborted before render");
		}
		return render(tag, source, signal);
	};
}

export function withRenderGuards(render: RenderFunction): RenderFunction {
	return withSignalGuard(async (tag, source, signal) => {
		const trimmed = source.trim();
		if (trimmed.length === 0) {
			return errorOutput(`${tag}: empty input`);
		}
		return render(tag, trimmed, signal);
	});
}

/**
 * One-shot capability probe result. Landed with CV0.E2.S1 when the second
 * processor (graphviz-host) made availability a real user-visible concern
 * — a machine without `dot` on PATH should still render `graphviz` blocks,
 * just via Kroki instead. Kroki's own impl is the trivial `{ ok: true }`
 * because its failure mode (unreachable endpoint) surfaces per-render as
 * an error panel rather than up-front unavailability; a future `/fence
 * doctor` story revisits.
 *
 * `reason` is required on the not-ok branch so `/fence list` has something
 * human to show; `installHint` is optional but encouraged for processors
 * whose unavailability has a known fix.
 */
export type Availability =
	| { ok: true }
	| { ok: false; reason: string; installHint?: string };

export function normalizeAvailabilityResult(result: unknown): Availability {
	if (!isRecord(result)) return malformedAvailability();
	if (result.ok === true) {
		if (Object.hasOwn(result, "reason") || Object.hasOwn(result, "installHint")) {
			return malformedAvailability();
		}
		return { ok: true };
	}
	if (result.ok === false) {
		if (typeof result.reason !== "string" || result.reason.length === 0) {
			return malformedAvailability();
		}
		if (Object.hasOwn(result, "installHint") && typeof result.installHint !== "string") {
			return malformedAvailability();
		}
		return {
			ok: false,
			reason: result.reason,
			...(typeof result.installHint === "string" ? { installHint: result.installHint } : {}),
		};
	}
	return malformedAvailability();
}

export function availabilityFromThrownError(err: unknown): Availability {
	return { ok: false, reason: `available() threw: ${safeErrorMessage(err)}` };
}

function malformedAvailability(): Availability {
	return { ok: false, reason: "available() returned malformed result" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(err: unknown): string {
	try {
		if (err instanceof Error) return String(err.message);
		return String(err);
	} catch {
		return "non-stringifiable error";
	}
}

export interface FenceProcessor {
	/** Stable id used for logs, settings, and future registry lookups. */
	readonly id: string;

	/** Trust/control boundary used by policy-driven resolution. */
	readonly placement: ProcessorPlacement;

	/**
	 * Canonical tag names this processor handles. Non-empty. Used by the
	 * extension to build its fenced-block allowlist and by `/fence list`
	 * to advertise what the processor accepts.
	 */
	readonly tags: readonly string[];

	/**
	 * Map from alias tag → canonical tag. Every value must appear in `tags`.
	 * Empty object for processors that do not declare aliases. Readonly so
	 * callers of `/fence list` cannot mutate a processor's advertised
	 * configuration.
	 */
	readonly aliases: Readonly<Record<string, string>>;

	/**
	 * One-shot capability probe. The extension calls this once at wire time
	 * and caches the result for the session; no processor should assume it
	 * will be called per-render. Processors whose availability can change
	 * mid-session are visible only after `/reload` until a future `/fence
	 * doctor --refresh` story lands.
	 *
	 * Must never throw — a spawn failure, a bad PATH, or any other probe
	 * hazard maps to `{ ok: false, reason, installHint? }`. The contract
	 * helper asserts the shape; live tests cover the real probe.
	 */
	available(): Promise<Availability>;

	/** Render the source for the given tag. Returns data on both success and failure paths. */
	render(tag: string, source: string, signal?: AbortSignal): Promise<FenceOutput>;
}
