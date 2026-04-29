/**
 * Kroki's conformance to the `FenceProcessor` contract.
 *
 * Uses `FakeHttpClient` to program deterministic responses — no network.
 * Live verification against real kroki.io is a separate integration test
 * (`tests/integration/kroki.live.test.ts`).
 */

import { describe, expect, it } from "vitest";

import { createKrokiProcessor, createKrokiSandboxProcessor } from "../../extensions/pi-fence/kroki.ts";
import type { SandboxController, SandboxStatus } from "../../extensions/pi-fence/sandbox.ts";
import { FakeHttpClient, type HttpResponse } from "../utilities/http-client.ts";
import { runFenceProcessorContract } from "./fence-processor.ts";

const TINY_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
]);

function setKrokiResponses(http: FakeHttpClient, endpoint: string): void {
	// Good source for the happy path.
	http.setResponse("POST", `${endpoint}/mermaid/png`, (req): HttpResponse => {
		const body = typeof req.body === "string" ? req.body : "";
		if (body.includes("not actually mermaid")) {
			return {
				status: 400,
				headers: { "content-type": "text/plain" },
				body: Buffer.from("Syntax error at line 1", "utf8"),
			};
		}
		return {
			status: 200,
			headers: { "content-type": "image/png" },
			body: TINY_PNG,
		};
	});
}

function makeKroki(): ReturnType<typeof createKrokiProcessor> {
	const http = new FakeHttpClient();
	setKrokiResponses(http, "https://kroki.io");
	return createKrokiProcessor(http);
}

function serviceController(status: SandboxStatus): SandboxController {
	return {
		id: "kroki",
		kind: "service",
		runtime: "docker-container",
		status: async () => status,
		start: async () => status,
		stop: async () => status,
	};
}

function makeKrokiSandbox(): ReturnType<typeof createKrokiSandboxProcessor> {
	const http = new FakeHttpClient();
	setKrokiResponses(http, "http://localhost:8000");
	return createKrokiSandboxProcessor(
		http,
		serviceController({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Kroki sandbox is ready.",
		}),
	);
}

describe("kroki contract harness", () => {
	it("builds the processor under test", () => {
		expect(makeKroki().tags).toContain("mermaid");
		expect(makeKrokiSandbox().tags).toContain("mermaid");
	});
});

runFenceProcessorContract("kroki-remote", makeKroki, {
	tag: "mermaid",
	goodSource: "flowchart LR\nA --> B",
	badSource: "not actually mermaid",
});

runFenceProcessorContract("kroki-sandbox", makeKrokiSandbox, {
	tag: "mermaid",
	goodSource: "flowchart LR\nA --> B",
	badSource: "not actually mermaid",
});
