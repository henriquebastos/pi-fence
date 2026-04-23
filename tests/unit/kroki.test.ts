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
import { createKrokiProcessor, isDarkThemeName } from "../../extensions/pi-fence/kroki.ts";

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

		const krokiLogs = logger.bySubsystem("kroki");
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
			.bySubsystem("kroki")
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

		const warnLogs = logger.bySubsystem("kroki").filter((e) => e.level === "warn");
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

		const errorLogs = logger.bySubsystem("kroki").filter((e) => e.level === "error");
		expect(errorLogs).toHaveLength(1);
		expect(errorLogs[0].message).toContain("network went away");
	});

	it("works without a logger (back-compat with the two-arg factory)", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(Buffer.from([0x89])));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "x");

		expect(result.ok).toBe(true);
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

		expect(result.ok).toBe(true);
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
	});

	it("returns the response body as a Buffer on 2xx", async () => {
		const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad]);
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(pngBytes));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(Buffer.compare(result.png, pngBytes)).toBe(0);
		}
	});

	it("returns ok:false with truncated body on 4xx", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(400, "bad mermaid syntax"));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "not valid mermaid");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("bad mermaid syntax");
		}
	});

	it("returns ok:false on 5xx", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(500, "internal kroki error"));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "flowchart LR\nA --> B");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("internal kroki error");
		}
	});

	it("truncates very long error bodies to at most 500 characters", async () => {
		const longBody = "x".repeat(5000);
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(400, longBody));
		const kroki = createKrokiProcessor(http);

		const result = await kroki.render("mermaid", "irrelevant");

		expect(result.ok).toBe(false);
		if (!result.ok) {
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

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("ECONNREFUSED");
		}
	});

	it("honours a custom endpoint passed at construction", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "http://localhost:8000/mermaid/png", pngResponse(Buffer.alloc(8)));
		const kroki = createKrokiProcessor(http, "http://localhost:8000");

		const result = await kroki.render("mermaid", "flowchart LR");

		expect(result.ok).toBe(true);
		expect(http.requests[0].url).toBe("http://localhost:8000/mermaid/png");
	});

	it("yields ok:false when the caller's signal is already aborted", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(Buffer.alloc(8)));
		const kroki = createKrokiProcessor(http);

		const controller = new AbortController();
		controller.abort();

		const result = await kroki.render("mermaid", "flowchart LR", controller.signal);

		expect(result.ok).toBe(false);
		if (!result.ok) {
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

			expect(result.ok).toBe(true);
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png");
		});

		it("resolves `puml` to Kroki's `/plantuml/png` endpoint", async () => {
			const http = new FakeHttpClient();
			http.setResponse("POST", "https://kroki.io/plantuml/png", pngResponse(Buffer.alloc(8)));
			const kroki = createKrokiProcessor(http);

			const result = await kroki.render("puml", "@startuml\nA -> B\n@enduml");

			expect(result.ok).toBe(true);
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

			expect(result.ok).toBe(true);
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

			expect(result.ok).toBe(true);
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

			expect(result.ok).toBe(true);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png");
		});
	});
});
