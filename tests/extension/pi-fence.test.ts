/**
 * Extension-layer test for pi-fence.
 *
 * Replaces the S0 exemplar. Full pipeline: stand up a real pi
 * `AgentSession` via `createAgentSession`, load pi-fence as an inline
 * extension factory (with a FakeHttpClient so no network is hit), replace
 * `session.agent.streamFn` with a canned assistant message containing a
 * fenced mermaid block, call `session.prompt`, and assert the extension
 * emitted a `pi-fence:output` custom message containing an image content
 * item.
 *
 * What's NOT tested here:
 *   - Real Kroki HTTP (that's the live test in tests/integration/kroki.live.test.ts).
 *   - The pi-tui Component visual output (fundamentally requires a terminal).
 */

import { afterEach, describe, expect, it } from "vitest";

import { AssistantMessageEventStream, getModel } from "@mariozechner/pi-ai";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createPiFenceExtension } from "../../extensions/pi-fence/index.ts";
import { FakeHttpClient, type HttpResponse } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";

const TINY_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
]);

describe("pi-fence extension — intercepts mermaid on agent_end", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"emits a pi-fence:output custom message with image content for a mermaid block",
		async () => {
			const http = new FakeHttpClient();
			http.setResponse("POST", "https://kroki.io/mermaid/png", pngResponse(TINY_PNG));
			const logger = new FakeLogger();

			const sentCustomMessages: Array<{ customType: string; content: unknown; details: unknown }> = [];

			const agentDir = makeTempDir("pi-fence-ext-");
			const authStorage = AuthStorage.create(`${agentDir}/auth.json`);
			authStorage.setRuntimeApiKey("anthropic", "test-key-not-used");

			const model = getModel("anthropic", "claude-sonnet-4-5");
			if (!model) throw new Error("model not found");

			// Extension factory: wire pi-fence with our test deps and also
			// capture sendMessage calls into the outer array so the
			// assertion can inspect them.
			const extensionFactory = (pi: ExtensionAPI) => {
				const originalSendMessage = pi.sendMessage.bind(pi);
				pi.sendMessage = ((message: Parameters<ExtensionAPI["sendMessage"]>[0], options?: Parameters<ExtensionAPI["sendMessage"]>[1]) => {
					sentCustomMessages.push({
						customType: message.customType,
						content: message.content,
						details: message.details,
					});
					return originalSendMessage(message, options);
				}) as ExtensionAPI["sendMessage"];

				createPiFenceExtension(pi, { http, logger });
			};

			const settingsManager = SettingsManager.create(agentDir, agentDir);
			const resourceLoader = new DefaultResourceLoader({
				cwd: agentDir,
				agentDir,
				settingsManager,
				extensionFactories: [extensionFactory],
			});
			await resourceLoader.reload();

			const { session } = await createAgentSession({
				cwd: agentDir,
				agentDir,
				model,
				authStorage,
				sessionManager: SessionManager.inMemory(),
				settingsManager,
				resourceLoader,
			});

			session.agent.streamFn = cannedAssistantStream(
				model,
				"Here's your diagram:\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nDone.",
			);

			session.subscribe(() => {});

			try {
				await session.prompt("make a mermaid");
			} finally {
				session.dispose();
			}

			// Wait a tick for any deferred sendMessage calls triggered by
			// agent_end to settle.
			await new Promise((r) => setTimeout(r, 50));

			const piFenceOutputs = sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:output",
			);
			expect(piFenceOutputs.length).toBeGreaterThanOrEqual(1);

			const first = piFenceOutputs[0];
			expect(first.details).toMatchObject({
				tag: "mermaid",
				processor: "kroki",
				kind: "ok",
			});

			// Content should include an image content item whose data is our
			// fixture PNG.
			const content = first.content as Array<{ type: string; data?: string; mimeType?: string; text?: string }>;
			const imageItem = content.find((c) => c.type === "image");
			expect(imageItem).toBeDefined();
			expect(imageItem?.mimeType).toBe("image/png");
			// data is base64-encoded; decode and compare against fixture.
			if (imageItem?.data) {
				const decoded = Buffer.from(imageItem.data, "base64");
				expect(Buffer.compare(decoded, TINY_PNG)).toBe(0);
			}

			// HTTP call should have hit Kroki with the correct body.
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
			expect(http.requests[0].body).toBe("flowchart LR\nA --> B");
		},
		20_000,
	);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pngResponse(bytes: Buffer): HttpResponse {
	return { status: 200, headers: { "content-type": "image/png" }, body: bytes };
}

function cannedAssistantStream(_model: NonNullable<ReturnType<typeof getModel>>, text: string) {
	return (activeModel: NonNullable<ReturnType<typeof getModel>>): AssistantMessageEventStream => {
		// Real providers construct an AssistantMessageEventStream (a class,
		// not a plain async iterable) and push events into it while mutating
		// `output.content[i]` in place. We mirror the minimum of that protocol
		// for a text-only response. The completion event is `type: "done"`,
		// after which `stream.end()` releases any waiting consumers.
		const stream = new AssistantMessageEventStream();
		const textBlock = { type: "text" as const, text: "" };
		const output: AssistantMessage = {
			role: "assistant",
			content: [textBlock],
			api: activeModel.api,
			provider: activeModel.provider,
			model: activeModel.id,
			usage: {
				input: 1,
				output: text.length,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 1 + text.length,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		// Emit synchronously; the stream's internal queue handles delivery
		// to the async consumer.
		stream.push({ type: "start", partial: output });
		stream.push({ type: "text_start", contentIndex: 0, partial: output } as never);
		textBlock.text = text;
		stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output } as never);
		stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output } as never);
		stream.push({ type: "done", reason: "stop", message: output } as never);
		stream.end();

		return stream;
	};
}
