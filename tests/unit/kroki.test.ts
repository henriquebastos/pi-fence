/**
 * Unit tests for the Kroki renderer.
 *
 * These tests exercise the HTTP wiring through the `FakeHttpClient` seam.
 * The production impl uses `NodeHttpClient` against real kroki.io; that
 * path is covered by `tests/integration/kroki.live.test.ts`.
 *
 * Contract captured here:
 *   - Posts to `{endpoint}/{tag}/png` with Content-Type: text/plain.
 *   - Body is the raw source, unchanged.
 *   - On 2xx, returns { ok: true, png: Buffer } with the exact response body.
 *   - On 4xx/5xx, returns { ok: false, error: <truncated text up to 500> }.
 *   - On HttpClient throw (network failure), returns { ok: false, error: <message> }.
 *   - Honours AbortSignal: pre-aborted signal yields an ok:false result with
 *     an error mentioning the abort, rather than throwing.
 *   - Endpoint is configurable via the factory argument; defaults to kroki.io.
 */

import { describe, expect, it } from "vitest";

import { FakeHttpClient, type HttpResponse } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { createKrokiProcessor, createKrokiSandboxProcessor, isDarkThemeName } from "../../extensions/pi-fence/kroki.ts";
import { DEFAULT_SVG_RASTER_INPUT_MAX_BYTES } from "../../extensions/pi-fence/svg-to-png.ts";
import type { SandboxController } from "../../extensions/pi-fence/sandbox.ts";
import { sandboxStatus, type TestSandboxStatus } from "../utilities/sandbox-status.ts";

function textResponse(status: number, body: string): HttpResponse {
	return {
		status,
		headers: { "content-type": "text/plain" },
		body: Buffer.from(body, "utf8"),
	};
}

function pngResponse(bytes: Buffer): HttpResponse {
	return {
		status: 200,
		headers: { "content-type": "image/png" },
		body: bytes,
	};
}

function serviceController(status: TestSandboxStatus): SandboxController {
	return {
		id: "kroki",
		kind: "service",
		runtime: "docker-container",
		status: async () => sandboxStatus(status),
		start: async () => sandboxStatus(status),
		stop: async () => sandboxStatus(status),
	};
}

describe("createKrokiProcessor — metadata", () => {
	it("declares the remote processor id and placement", () => {
		const kroki = createKrokiProcessor(new FakeHttpClient());

		expect(kroki.id).toBe("kroki-remote");
		expect(kroki.placement).toBe("remote");
	});

	it("stays remote when configured with a localhost endpoint", () => {
		const kroki = createKrokiProcessor(new FakeHttpClient(), "http://localhost:8000");

		expect(kroki.id).toBe("kroki-remote");
		expect(kroki.placement).toBe("remote");
	});

	it("declares the sandbox processor id and placement when the service controller is ready", async () => {
		const kroki = createKrokiSandboxProcessor(
			new FakeHttpClient(),
			serviceController({
				state: "ready",
				endpoint: "http://localhost:8000",
				message: "Kroki sandbox is ready.",
			}),
		);

		expect(kroki.id).toBe("kroki-sandbox");
		expect(kroki.placement).toBe("sandbox");
		expect(kroki.tags).toContain("mermaid");
		expect(kroki.aliases.dot).toBe("graphviz");
		expect(await kroki.available()).toEqual({ ok: true });
	});
});

describe("createKrokiSandboxProcessor", () => {
	it("renders through the ready service controller endpoint", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"http://localhost:8000/mermaid/png",
			pngResponse(Buffer.from([0x89, 0x50])),
		);
		const logger = new FakeLogger();
		const kroki = createKrokiSandboxProcessor(
			http,
			serviceController({
				state: "ready",
				endpoint: "http://localhost:8000",
				message: "Kroki sandbox is ready.",
			}),
			logger,
		);

		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result.kind).toBe("image");
		expect(http.requests).toHaveLength(1);
		expect(http.requests[0].url).toBe("http://localhost:8000/mermaid/png");
		expect(http.requests[0].body).toBe("flowchart LR\nA --> B");
		expect(http.requests[0].maxResponseBytes).toBe(10_485_760);
		expect(logger.bySubsystem("kroki-sandbox").length).toBeGreaterThan(0);
	});

	it("includes component details when the service controller is partial", async () => {
		const kroki = createKrokiSandboxProcessor(
			new FakeHttpClient(),
			serviceController({
				state: "partial",
				message: "Sandbox kroki has 1 of 2 component(s) ready.",
				components: [
					{ id: "core", state: "ready", message: "Container pi-fence-kroki-core is running." },
					{ id: "mermaid", state: "stopped", message: "Container pi-fence-kroki-mermaid exists but is stopped." },
				],
			}),
		);

		expect(await kroki.available()).toEqual({
			ok: false,
			reason: "Kroki sandbox is partial: Sandbox kroki has 1 of 2 component(s) ready. Components: core=ready (Container pi-fence-kroki-core is running.); mermaid=stopped (Container pi-fence-kroki-mermaid exists but is stopped.)",
		});
	});

	it("is unavailable and does not render when the service controller is not ready", async () => {
		const http = new FakeHttpClient();
		const kroki = createKrokiSandboxProcessor(
			http,
			serviceController({
				state: "partial",
				message: "Sandbox kroki has 1 of 2 component(s) ready.",
			}),
		);

		expect(await kroki.available()).toEqual({
			ok: false,
			reason: "Kroki sandbox is partial: Sandbox kroki has 1 of 2 component(s) ready.",
		});
		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result).toEqual({
			kind: "error",
			error: "Kroki sandbox is partial: Sandbox kroki has 1 of 2 component(s) ready.",
		});
		expect(http.requests).toHaveLength(0);
	});
});

describe("createKrokiProcessor — logging", () => {
	it("logs a debug entry with the resolved URL when the request goes out", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png",
			pngResponse(Buffer.from([0x89, 0x50])),
		);
		const logger = new FakeLogger();
		const kroki = createKrokiProcessor(http, undefined, logger);

		await kroki.render("mermaid", "flowchart LR\nA --> B");

		const krokiLogs = logger.bySubsystem("kroki-remote");
		expect(krokiLogs.length).toBeGreaterThanOrEqual(1);
		const requestLog = krokiLogs.find((e) => e.level === "debug");
		expect(requestLog?.meta).toMatchObject({ url: "https://kroki.io/mermaid/png" });
	});

	it("logs a debug entry with the 2xx status on success", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png",
			pngResponse(Buffer.from([0x89, 0x50])),
		);
		const logger = new FakeLogger();
		const kroki = createKrokiProcessor(http, undefined, logger);

		await kroki.render("mermaid", "x");

		const successLogs = logger
			.bySubsystem("kroki-remote")
			.filter((e) => e.meta && typeof (e.meta as { status?: number }).status === "number");
		expect(successLogs).toHaveLength(1);
		expect((successLogs[0].meta as { status: number }).status).toBe(200);
		expect(successLogs[0].level).toBe("debug");
	});

	it("logs a warn entry on a 4xx/5xx response", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png",
			textResponse(400, "syntax error"),
		);
		const logger = new FakeLogger();
		const kroki = createKrokiProcessor(http, undefined, logger);

		await kroki.render("mermaid", "bad source");

		const warnLogs = logger.bySubsystem("kroki-remote").filter((e) => e.level === "warn");
		expect(warnLogs).toHaveLength(1);
		expect((warnLogs[0].meta as { status?: number }).status).toBe(400);
	});

	it("logs an error entry when the HttpClient throws", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", () => {
			throw new Error("network went away");
		});
		const logger = new FakeLogger();
		const kroki = createKrokiProcessor(http, undefined, logger);

		await kroki.render("mermaid", "x");

		const errorLogs = logger.bySubsystem("kroki-remote").filter((e) => e.level === "error");
		expect(errorLogs).toHaveLength(1);
		expect(errorLogs[0].message).toContain("network went away");
	});

	it("works without a logger (back-compat with the two-arg factory)", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(Buffer.from([0x89])));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "x");

		expect(result.kind).toBe("image");
	});
});

describe("isDarkThemeName", () => {
	it("classifies pi's built-in `dark` as dark", () => {
		expect(isDarkThemeName("dark")).toBe(true);
	});

	it("classifies pi's built-in `light` as light", () => {
		expect(isDarkThemeName("light")).toBe(false);
	});

	it("classifies popular dark-theme names as dark", () => {
		expect(isDarkThemeName("tokyo-night")).toBe(true);
		expect(isDarkThemeName("gruvbox-dark")).toBe(true);
		expect(isDarkThemeName("catppuccin-mocha")).toBe(true);
		expect(isDarkThemeName("dracula")).toBe(true);
		expect(isDarkThemeName("nord")).toBe(true);
		expect(isDarkThemeName("one-dark")).toBe(true);
	});

	it("classifies popular light-theme names as light", () => {
		expect(isDarkThemeName("github-light")).toBe(false);
		expect(isDarkThemeName("solarized-light")).toBe(false);
		expect(isDarkThemeName("catppuccin-latte")).toBe(false);
		expect(isDarkThemeName("day")).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(isDarkThemeName("Tokyo-Night")).toBe(true);
		expect(isDarkThemeName("GITHUB-LIGHT")).toBe(false);
	});

	it("defaults to dark when the name is undefined or empty", () => {
		// We err on the side of dark: more pi sessions run in dark terminals
		// than light ones, and the failure mode (pale lines on dark bg) is
		// worse than its mirror.
		expect(isDarkThemeName(undefined)).toBe(true);
		expect(isDarkThemeName("")).toBe(true);
	});

	it("defaults to dark for unknown theme names that mention neither light nor dark", () => {
		expect(isDarkThemeName("custom-theme")).toBe(true);
	});
});

describe("createKrokiProcessor — appearance/theme", () => {
	it("appends ?theme=dark when the appearance resolver returns dark", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png?theme=dark",
			pngResponse(Buffer.from([0x89, 0x50])),
		);
		const kroki = createKrokiProcessor(http, undefined, undefined, () => "dark");

		const result = await kroki.render("mermaid", "x");

		expect(result.kind).toBe("image");
		expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png?theme=dark");
	});

	it("omits the theme parameter when the appearance resolver returns light", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png",
			pngResponse(Buffer.from([0x89, 0x50])),
		);
		const kroki = createKrokiProcessor(http, undefined, undefined, () => "light");

		await kroki.render("mermaid", "x");

		expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
	});

	it("reads the resolver at request time so live theme changes take effect", async () => {
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png",
			pngResponse(Buffer.from([0x89])),
		);
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png?theme=dark",
			pngResponse(Buffer.from([0x89])),
		);

		let appearance: "light" | "dark" = "light";
		const kroki = createKrokiProcessor(http, undefined, undefined, () => appearance);

		await kroki.render("mermaid", "first");
		appearance = "dark";
		await kroki.render("mermaid", "second");

		expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
		expect(http.requests[1].url).toBe("https://kroki.io/mermaid/png?theme=dark");
	});

	it("defaults to no theme parameter when no resolver is provided (back-compat)", async () => {
		// Keeps the factory's two/three-arg callers (tests, contract helper)
		// producing the original URLs. The extension wiring in `index.ts`
		// passes the resolver; plain factory consumers opt in explicitly.
		const http = new FakeHttpClient();
		http.setResponse(
			"POST",
			"https://kroki.io/mermaid/png",
			pngResponse(Buffer.from([0x89])),
		);
		const kroki = createKrokiProcessor(http);

		await kroki.render("mermaid", "x");

		expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
	});
});

describe("createKrokiProcessor", () => {
	it("posts the source to {endpoint}/{tag}/png with the right headers", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
		const kroki = createKrokiProcessor(http);

		await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(http.requests).toHaveLength(1);
		expect(http.requests[0].method).toBe("POST");
		expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
		expect(http.requests[0].headers?.["content-type"]).toBe("text/plain");
		expect(http.requests[0].body).toBe("flowchart LR\nA --> B");
		expect(http.requests[0].maxResponseBytes).toBe(10_485_760);
	});

	it("returns an error when a 2xx response body exceeds the output limit", async () => {
		const oversizedPng = Buffer.alloc(10_485_761);
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(oversizedPng));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toBe("Kroki response is too large: 10485761 bytes exceeds limit of 10485760 bytes");
		}
	});

	it("returns the response body as a Buffer on 2xx", async () => {
		const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad]);
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(pngBytes));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result.kind).toBe("image");
		if (result.kind === "image") {
			expect(Buffer.compare(result.data, pngBytes)).toBe(0);
		}
	});

	it("returns ok:false with truncated body on 4xx", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(400, "bad mermaid syntax"));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "not valid mermaid");

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toContain("bad mermaid syntax");
		}
	});

	it("returns a limit error before decoding an oversized 4xx body", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(400, "x".repeat(10_485_761)));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "not valid mermaid");

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toBe("Kroki response is too large: 10485761 bytes exceeds limit of 10485760 bytes");
		}
	});

	it("returns ok:false on 5xx", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(500, "internal kroki error"));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toContain("internal kroki error");
		}
	});

	it("truncates very long error bodies to at most 500 characters", async () => {
		const longBody = "x".repeat(5000);
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(400, longBody));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "irrelevant");

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error.length).toBeLessThanOrEqual(500);
		}
	});

	it("returns ok:false with err.message when the HttpClient throws", async () => {
		class ThrowingHttp {
			async request(): Promise<HttpResponse> {
				throw new Error("ECONNREFUSED");
			}
		}
		const kroki = createKrokiProcessor(new ThrowingHttp());

		const result = await kroki.render("mermaid", "flowchart LR");

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toContain("ECONNREFUSED");
		}
	});

	it("honours a custom endpoint passed at construction", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "http://localhost:8000/mermaid/png", pngResponse(Buffer.alloc(8)));
		const kroki = createKrokiProcessor(http, "http://localhost:8000");

		const result = await kroki.render("mermaid", "flowchart LR");

		expect(result.kind).toBe("image");
		expect(http.requests[0].url).toBe("http://localhost:8000/mermaid/png");
	});

	it("preserves custom endpoint path prefixes while appending tag, format, and theme", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://example.com/kroki/mermaid/png?theme=dark", pngResponse(Buffer.alloc(8)));
		const kroki = createKrokiProcessor(http, "https://example.com/kroki/", undefined, () => "dark");

		const result = await kroki.render("mermaid", "flowchart LR");

		expect(result.kind).toBe("image");
		expect(http.requests[0].url).toBe("https://example.com/kroki/mermaid/png?theme=dark");
	});

	it("yields ok:false when the caller's signal is already aborted", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(Buffer.alloc(8)));
		const kroki = createKrokiProcessor(http);

		const controller = new AbortController();
		controller.abort();

		const result = await kroki.render("mermaid", "flowchart LR", controller.signal);

		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toMatch(/abort/i);
		}
	});

	it("passes the source body through unchanged — no re-encoding", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(Buffer.alloc(8)));
		const kroki = createKrokiProcessor(http);

		// Source with whitespace quirks the caller might care about.
		const source = "  flowchart LR\n    A --> B\n\n  ";
		await kroki.render("mermaid", source);

		expect(http.requests[0].body).toBe(source);
	});

	describe("tag aliases", () => {
		it("resolves `dot` to Kroki's `/graphviz/png` endpoint", async () => {
			const http = new FakeHttpClient();
			http.setResponse("POST", "https://kroki.io/graphviz/png", pngResponse(Buffer.alloc(8)));
			const kroki = createKrokiProcessor(http);

			const result = await kroki.render("dot", "digraph { A -> B }");

			expect(result.kind).toBe("image");
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png");
		});

		it("resolves `puml` to Kroki's `/plantuml/png` endpoint", async () => {
			const http = new FakeHttpClient();
			http.setResponse("POST", "https://kroki.io/plantuml/png", pngResponse(Buffer.alloc(8)));
			const kroki = createKrokiProcessor(http);

			const result = await kroki.render("puml", "@startuml\nA -> B\n@enduml");

			expect(result.kind).toBe("image");
			expect(http.requests[0].url).toBe("https://kroki.io/plantuml/png");
		});

		it("passes unaliased tags through unchanged", async () => {
			// `blockdiag` is a canonical Kroki tag that has no alias entry,
			// so the renderer must pass it through to /blockdiag/png without
			// a rewrite. Any other unaliased canonical tag would serve this
			// assertion; blockdiag picked because it's a real endpoint pi-fence
			// advertises post-S4, unlike the previous `d2` example which
			// mis-advertised since S2 (Kroki's public endpoint refuses PNG
			// for d2 — see docs/product/kroki-support.md).
			const http = new FakeHttpClient();
			http.setResponse(
				"POST",
				"https://kroki.io/blockdiag/png",
				pngResponse(Buffer.alloc(8)),
			);
			const kroki = createKrokiProcessor(http);

			const result = await kroki.render("blockdiag", "{ A -> B }");

			expect(result.kind).toBe("image");
			expect(http.requests[0].url).toBe("https://kroki.io/blockdiag/png");
		});

		it("resolves `vega-lite` to Kroki's `/vegalite/png` endpoint", async () => {
			const http = new FakeHttpClient();
			http.setResponse(
				"POST",
				"https://kroki.io/vegalite/png",
				pngResponse(Buffer.alloc(8)),
			);
			const kroki = createKrokiProcessor(http);

			const result = await kroki.render("vega-lite", '{"data":{}}');

			expect(result.kind).toBe("image");
			expect(http.requests[0].url).toBe("https://kroki.io/vegalite/png");
			expect(http.requests[0].headers?.["content-type"]).toBe("text/plain");
		});

		it("also honours the canonical name (`graphviz` -> /graphviz/png)", async () => {
			// Alias resolution is 'dot -> graphviz', not 'graphviz -> dot'. A user
			// or LLM who writes `graphviz` directly must get the same endpoint.
			const http = new FakeHttpClient();
			http.setResponse("POST", "https://kroki.io/graphviz/png", pngResponse(Buffer.alloc(8)));
			const kroki = createKrokiProcessor(http);

			const result = await kroki.render("graphviz", "digraph { A -> B }");

			expect(result.kind).toBe("image");
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png");
		});
	});
});

describe("createKrokiProcessor — SVG-only tags", () => {
	const MINIMAL_SVG =
		'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
		'<rect width="10" height="10" fill="red"/></svg>';

	const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	it("requests /svg for SVG-only tags and rasterizes to PNG", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/d2/svg", {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
			body: Buffer.from(MINIMAL_SVG),
		});
		const kroki = createKrokiProcessor(http, undefined, new FakeLogger());

		const result = await kroki.render("d2", "x -> y: hello");

		expect(result.kind).toBe("image");
		if (result.kind !== "image") return;
		expect(Buffer.compare(result.data.subarray(0, 8), PNG_MAGIC)).toBe(0);
		expect(http.requests[0].url).toBe("https://kroki.io/d2/svg");
	});

	it("still requests /png for non-SVG-only tags", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", {
			status: 200,
			headers: { "content-type": "image/png" },
			body: Buffer.from([0x89, 0x50]),
		});
		const kroki = createKrokiProcessor(http, undefined, new FakeLogger());

		await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
	});

	it("returns ok:false when SVG rasterization fails", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/d2/svg", {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
			body: Buffer.from("not valid svg at all"),
		});
		const kroki = createKrokiProcessor(http, undefined, new FakeLogger());

		const result = await kroki.render("d2", "x -> y");

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.error).toContain("SVG rasterization failed");
	});

	it("returns visible error output when SVG input exceeds the rasterization cap", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/d2/svg", {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
			body: Buffer.from(`<svg>${"x".repeat(DEFAULT_SVG_RASTER_INPUT_MAX_BYTES + 1)}</svg>`),
		});
		const kroki = createKrokiProcessor(http, undefined, new FakeLogger(), undefined, DEFAULT_SVG_RASTER_INPUT_MAX_BYTES + 20);

		const result = await kroki.render("d2", "x -> y");

		expect(result.kind).toBe("error");
		if (result.kind !== "error") return;
		expect(result.error).toContain("SVG rasterization failed: SVG input is too large");
	});
});
