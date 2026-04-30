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
 *     JSON-body Kroki languages (vega, vegalite) also accept text/plain with
 *     the raw JSON source — no wrapping or content-type dispatch needed.
 *   - 15-second timeout by default (AbortSignal.timeout). Merged with the
 *     caller's signal when provided.
 *   - 2xx: return image output. Response body passed through unchanged.
 *   - 4xx/5xx: return error output with truncated body, up to 500 chars.
 *   - HttpClient throw (network failure, DNS, abort): return error output with
 *     the error message.
 *   - Pre-aborted caller signal: early return error output without hitting
 *     HttpClient.
 *   - Endpoint is configurable at construction; defaults to https://kroki.io.
 */

import type { HttpClient, HttpResponse } from "./io/http-client.ts";
import { NULL_LOGGER, type Logger } from "./io/logger.ts";
import { DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES } from "./policy.ts";
import type { SandboxController, SandboxStatus } from "./sandbox.ts";
import {
	DEFAULT_RENDER_TIMEOUT_MS,
	errorOutput,
	imageOutput,
	mergeSignals,
	withSignalGuard,
	type Availability,
	type FenceOutput,
	type FenceProcessor,
} from "./processor.ts";
import { svgToPng } from "./svg-to-png.ts";

const DEFAULT_ENDPOINT = "https://kroki.io";

/**
 * Tags that Kroki's public endpoint serves only as SVG. The processor
 * requests `/{tag}/svg` and rasterizes locally via `svgToPng`.
 *
 * Excluded: `bpmn` and `excalidraw` — Kroki's public endpoint lacks the
 * backend wiring (ECONNREFUSED), same category as `diagramsnet`.
 */
export const KROKI_SVG_ONLY_TAGS: ReadonlySet<string> = new Set([
	"d2",
	"bytefield",
	"dbml",
	"nomnoml",
	"pikchr",
	"svgbob",
	"wavedrom",
]);
const ERROR_BODY_MAX_CHARS = 500;

/**
 * Canonical tags the Kroki processor handles on the public endpoint.
 * Matches the Kroki public endpoint's naming. Aliases that users/LLMs
 * actually write live in `KROKI_ALIASES` below and resolve to one of
 * these at request time.
 *
 * Exported so the extension's `/fence list` command can advertise the
 * processor's accepted tags without duplicating the list.
 *
 * Every entry here renders to PNG on `https://kroki.io/<tag>/png` per
 * CV0.E1.S4's research pass. Languages Kroki hosts but the public
 * endpoint refuses PNG for (SVG-only: `d2`, `bpmn`, `bytefield`,
 * `dbml`, `nomnoml`, `pikchr`, `svgbob`, `wavedrom`) are documented as
 * unsupported in `docs/product/kroki-support.md` with a pointer to
 * self-hosted Kroki (CV2.E2). JSON-body languages (`vega`, `vegalite`,
 * `excalidraw`) are covered by CV0.E1.S5.
 *
 * Ordering groups related languages together (core → blockdiag family
 * → domain-specific) rather than alphabetising, so a reader scanning
 * the list sees the provenance of each block.
 */
export const KROKI_CANONICAL_TAGS: readonly string[] = [
	// core
	"mermaid",
	"graphviz",
	"plantuml",
	// blockdiag family
	"blockdiag",
	"seqdiag",
	"actdiag",
	"nwdiag",
	"packetdiag",
	"rackdiag",
	// domain-specific text diagrams
	"c4plantuml",
	"ditaa",
	"erd",
	"structurizr",
	"symbolator",
	"tikz",
	"umlet",
	"wireviz",
	// JSON-body Kroki languages — rendered via text/plain with raw JSON source.
	// Kroki accepts the plain JSON body without wrapping; no content-type
	// dispatch needed (verified against the public endpoint in CV0.E1.S5).
	"vega",
	"vegalite",
	// SVG-only on public endpoint — Kroki returns SVG, pi-fence rasterizes
	// to PNG locally via @resvg/resvg-js (CV5.E1.S1).
	"d2",
	"bytefield",
	"dbml",
	"nomnoml",
	"pikchr",
	"svgbob",
	"wavedrom",
];

/**
 * Map colloquial tag names to Kroki's canonical endpoint names. Extend when
 * a user or LLM writes a tag Kroki doesn't recognise directly.
 *
 * Kept inline in this module because Kroki is the only consumer today. A
 * second processor (graphviz-host in CV0.E2) calls `dot` directly, so
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
	"vega-lite": "vegalite",
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

interface KrokiRequestContext {
	tag: string;
	krokiTag: string;
	url: string;
	isSvgOnly: boolean;
	appearance: "light" | "dark" | undefined;
	maxResponseBytes: number;
}

interface SuccessfulKrokiRequest {
	ok: true;
	response: HttpResponse;
}

interface FailedKrokiRequest {
	ok: false;
	result: FenceOutput;
}

type KrokiRequestResult = SuccessfulKrokiRequest | FailedKrokiRequest;

function createKrokiRequestContext(
	base: string,
	tag: string,
	appearance: KrokiAppearanceResolver | undefined,
	maxResponseBytes: number,
): KrokiRequestContext {
	const krokiTag = KROKI_ALIASES[tag] ?? tag;
	const appearanceMode = appearance?.();
	const isSvgOnly = KROKI_SVG_ONLY_TAGS.has(krokiTag);
	const format = isSvgOnly ? "svg" : "png";

	return {
		tag,
		krokiTag,
		url: buildKrokiRequestUrl(base, krokiTag, format, appearanceMode),
		isSvgOnly,
		appearance: appearanceMode,
		maxResponseBytes,
	};
}

function buildKrokiRequestUrl(
	base: string,
	krokiTag: string,
	format: "png" | "svg",
	appearanceMode: "light" | "dark" | undefined,
): string {
	const endpoint = new URL(`${krokiTag}/${format}`, base.endsWith("/") ? base : `${base}/`);
	if (appearanceMode === "dark") endpoint.searchParams.set("theme", "dark");
	return endpoint.toString();
}

function logKrokiRequest(
	logger: Logger,
	processorId: string,
	context: KrokiRequestContext,
	source: string,
): void {
	logger.debug(processorId, "request", {
		tag: context.tag,
		krokiTag: context.krokiTag,
		url: context.url,
		appearance: context.appearance ?? "default",
		sourceBytes: Buffer.byteLength(source, "utf8"),
	});
}

async function requestKroki(
	http: HttpClient,
	logger: Logger,
	processorId: string,
	context: KrokiRequestContext,
	source: string,
	signal: AbortSignal | undefined,
): Promise<KrokiRequestResult> {
	try {
		const response = await http.request({
			method: "POST",
			url: context.url,
			headers: { "content-type": "text/plain" },
			body: source,
			signal,
		});
		return { ok: true, response };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(processorId, message, { url: context.url, tag: context.tag });
		return { ok: false, result: errorOutput(message) };
	}
}

async function renderKrokiResponse(
	response: HttpResponse,
	context: KrokiRequestContext,
	logger: Logger,
	processorId: string,
): Promise<FenceOutput> {
	return response.status >= 200 && response.status < 300
		? renderSuccessfulKrokiResponse(response, context, logger, processorId)
		: renderFailedKrokiResponse(response, context, logger, processorId);
}

async function renderSuccessfulKrokiResponse(
	response: HttpResponse,
	context: KrokiRequestContext,
	logger: Logger,
	processorId: string,
): Promise<FenceOutput> {
	if (response.body.length > context.maxResponseBytes) {
		return errorOutput(limitError("Kroki response", response.body.length, context.maxResponseBytes));
	}
	const rendered = await responseBodyToPng(response.body, context, logger, processorId);
	if (rendered.kind !== "image") return rendered;

	logger.debug(processorId, "response ok", {
		status: response.status,
		tag: context.tag,
		bytes: rendered.data.length,
	});
	return rendered;
}

async function responseBodyToPng(
	body: Buffer,
	context: KrokiRequestContext,
	logger: Logger,
	processorId: string,
): Promise<FenceOutput> {
	if (!context.isSvgOnly) return imageOutput(body);

	try {
		const png = await svgToPng(body);
		logger.debug(processorId, "svg→png rasterized", {
			tag: context.tag,
			svgBytes: body.length,
			pngBytes: png.length,
		});
		return imageOutput(png);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(processorId, `svg→png failed: ${message}`, { tag: context.tag });
		return errorOutput(`SVG rasterization failed: ${message}`);
	}
}

function limitError(label: string, actualBytes: number, maxBytes: number): string {
	return `${label} is too large: ${actualBytes} bytes exceeds limit of ${maxBytes} bytes`;
}

function renderFailedKrokiResponse(
	response: HttpResponse,
	context: KrokiRequestContext,
	logger: Logger,
	processorId: string,
): FenceOutput {
	const text = response.body.toString("utf8");
	const truncated = text.length > ERROR_BODY_MAX_CHARS
		? text.slice(0, ERROR_BODY_MAX_CHARS)
		: text;
	logger.warn(processorId, "response error", {
		status: response.status,
		tag: context.tag,
		bodyBytes: response.body.length,
	});
	return errorOutput(truncated);
}

export function createKrokiProcessor(
	http: HttpClient,
	endpoint: string = DEFAULT_ENDPOINT,
	logger: Logger = NULL_LOGGER,
	appearance?: KrokiAppearanceResolver,
	maxResponseBytes: number = DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES,
): FenceProcessor {
	const base = endpoint.replace(/\/+$/, "");

	return {
		id: "kroki-remote",
		placement: "remote",
		tags: KROKI_CANONICAL_TAGS,
		aliases: KROKI_ALIASES,

		// Kroki's endpoint is available at wire time by definition — the
		// processor is just an HTTP client, and network reachability is
		// a per-render concern surfaced as an error panel, not an up-front
		// `unavailable` status. Real endpoint-health probing (HEAD on the
		// endpoint, classify connection / DNS / 5xx) lands with the future
		// `/fence doctor` story; today's one-liner matches Kroki's contract
		// with the rest of the registry and keeps `/fence list` honest for
		// the graphviz-host alongside-Kroki shape CV0.E2 introduces.
		async available(): Promise<{ ok: true }> {
			return { ok: true };
		},

		render: renderKrokiWithEndpoint(http, logger, "kroki-remote", () => base, appearance, maxResponseBytes),
	};
}

export function createKrokiSandboxProcessor(
	http: HttpClient,
	controller: SandboxController,
	logger: Logger = NULL_LOGGER,
	appearance?: KrokiAppearanceResolver,
	maxResponseBytes: number = DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES,
): FenceProcessor {
	return {
		id: "kroki-sandbox",
		placement: "sandbox",
		tags: KROKI_CANONICAL_TAGS,
		aliases: KROKI_ALIASES,
		available: async () => sandboxEndpointAvailability(controller),
		render: withSignalGuard(async (tag, source, signal): Promise<FenceOutput> => {
			const endpoint = await readySandboxEndpoint(controller);
			if (!endpoint.ok) return errorOutput(endpoint.reason);
			return renderKrokiWithEndpoint(
				http,
				logger,
				"kroki-sandbox",
				() => endpoint.endpoint,
				appearance,
				maxResponseBytes,
			)(tag, source, signal);
		}),
	};
}

function renderKrokiWithEndpoint(
	http: HttpClient,
	logger: Logger,
	processorId: string,
	endpoint: () => string,
	appearance: KrokiAppearanceResolver | undefined,
	maxResponseBytes: number,
): FenceProcessor["render"] {
	return withSignalGuard(async (tag, source, signal): Promise<FenceOutput> => {
		const combinedSignal = mergeSignals([
			signal,
			AbortSignal.timeout(DEFAULT_RENDER_TIMEOUT_MS),
		]);
		const context = createKrokiRequestContext(endpoint(), tag, appearance, maxResponseBytes);

		logKrokiRequest(logger, processorId, context, source);
		const requested = await requestKroki(http, logger, processorId, context, source, combinedSignal);
		return requested.ok
			? renderKrokiResponse(requested.response, context, logger, processorId)
			: requested.result;
	});
}

async function sandboxEndpointAvailability(
	controller: SandboxController,
): Promise<Availability> {
	const endpoint = await readySandboxEndpoint(controller);
	return endpoint.ok ? { ok: true } : { ok: false, reason: endpoint.reason };
}

async function readySandboxEndpoint(
	controller: SandboxController,
): Promise<{ ok: true; endpoint: string } | { ok: false; reason: string }> {
	try {
		return sandboxEndpointFromStatus(await controller.status());
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, reason: `Kroki sandbox status failed: ${message}` };
	}
}

function sandboxEndpointFromStatus(
	status: SandboxStatus,
): { ok: true; endpoint: string } | { ok: false; reason: string } {
	if (status.kind !== "ready-service") {
		return {
			ok: false,
			reason: `Kroki sandbox is ${status.state}: ${status.message}${formatSandboxComponents(status)}`,
		};
	}
	return { ok: true, endpoint: status.endpoint.replace(/\/+$/, "") };
}

function formatSandboxComponents(status: SandboxStatus): string {
	if (!status.components || status.components.length === 0) return "";
	const components = status.components
		.map((component) => {
			const detail = component.message ? ` (${component.message})` : "";
			return `${component.id}=${component.state}${detail}`;
		})
		.join("; ");
	return ` Components: ${components}`;
}
