/**
 * Self-tests for `HttpClient` and its Fake implementation.
 *
 * `NodeHttpClient` is a thin wrapper over the global `fetch`. Unit-testing
 * it would mostly exercise fetch. Live coverage lands in
 * `tests/integration/kroki.live.test.ts` (S1).
 *
 * FakeHttpClient is the workhorse fake for all unit-level tests that touch
 * HTTP — the Kroki processor test in S1 uses it for assertions like
 * "the kroki call posted the correct body to the correct URL".
 */

import { describe, expect, it } from "vitest";

import type { HttpClient, HttpRequest, HttpResponse } from "../../extensions/pi-fence/io/http-client.ts";
import { FakeHttpClient } from "./http-client.ts";

function textResponse(status: number, body: string): HttpResponse {
	return {
		status,
		headers: { "content-type": "text/plain" },
		body: Buffer.from(body, "utf8"),
	};
}

describe("FakeHttpClient", () => {
	it("returns the default response when no match is programmed", async () => {
		const http: HttpClient = new FakeHttpClient(textResponse(200, "default"));
		const result = await http.request({ method: "GET", url: "https://example.com" });
		expect(result.status).toBe(200);
		expect(result.body.toString("utf8")).toBe("default");
	});

	it("returns a programmed response for a matching (method, url)", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(200, "fake-png"));

		const result = await http.request({
			method: "POST",
			url: "https://kroki.io/mermaid/png",
			body: "flowchart LR\nA --> B",
		});

		expect(result.status).toBe(200);
		expect(result.body.toString("utf8")).toBe("fake-png");
	});

	it("distinguishes responses by method and URL", async () => {
		const http = new FakeHttpClient();
		http.setResponse("GET", "https://example.com/a", textResponse(200, "from-a"));
		http.setResponse("GET", "https://example.com/b", textResponse(200, "from-b"));

		expect((await http.request({ method: "GET", url: "https://example.com/a" })).body.toString()).toBe("from-a");
		expect((await http.request({ method: "GET", url: "https://example.com/b" })).body.toString()).toBe("from-b");
	});

	it("records every request in the order received", async () => {
		const http = new FakeHttpClient(textResponse(200, ""));
		await http.request({ method: "GET", url: "https://example.com/1" });
		await http.request({
			method: "POST",
			url: "https://example.com/2",
			headers: { "x-trace": "abc" },
			body: "hello",
		});

		expect(http.requests).toHaveLength(2);
		expect(http.requests[0]).toMatchObject({ method: "GET", url: "https://example.com/1" });
		expect(http.requests[1]).toMatchObject({
			method: "POST",
			url: "https://example.com/2",
			headers: { "x-trace": "abc" },
			body: "hello",
		});
	});

	it("supports binary response bodies", async () => {
		const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", {
			status: 200,
			headers: { "content-type": "image/png" },
			body: pngMagic,
		});

		const result = await http.request({
			method: "POST",
			url: "https://kroki.io/mermaid/png",
			body: "graph TD\nA",
		});

		expect(Buffer.compare(result.body, pngMagic)).toBe(0);
	});

	it("allows programmed error responses (4xx, 5xx) without throwing", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", textResponse(400, "bad syntax"));

		const result = await http.request({
			method: "POST",
			url: "https://kroki.io/mermaid/png",
			body: "not valid mermaid",
		});

		expect(result.status).toBe(400);
		expect(result.body.toString("utf8")).toBe("bad syntax");
	});

	it("throws when no default is set and no match is programmed", async () => {
		const http = new FakeHttpClient();
		await expect(
			http.request({ method: "GET", url: "https://nowhere.example" }),
		).rejects.toThrow(/no programmed response/i);
	});

	it("throws AbortError when the signal is already aborted", async () => {
		const http = new FakeHttpClient(textResponse(200, ""));
		const controller = new AbortController();
		controller.abort();

		await expect(
			http.request({
				method: "GET",
				url: "https://example.com",
				signal: controller.signal,
			}),
		).rejects.toThrow(/abort/i);
	});

	it("supports a function response for dynamic behavior", async () => {
		const http = new FakeHttpClient();
		http.setResponse("POST", "https://kroki.io/mermaid/png", (req: HttpRequest) => {
			// Echo the body length back so tests can verify the request reached us.
			const len = typeof req.body === "string" ? req.body.length : (req.body?.length ?? 0);
			return textResponse(200, `got ${len} bytes`);
		});

		const result = await http.request({
			method: "POST",
			url: "https://kroki.io/mermaid/png",
			body: "hello",
		});

		expect(result.body.toString("utf8")).toBe("got 5 bytes");
	});
});
