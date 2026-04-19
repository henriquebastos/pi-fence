/**
 * Extension-layer tests for pi-fence.
 *
 * Full pipeline: stand up a real pi `AgentSession` via `createAgentSession`,
 * load pi-fence as an inline extension factory (with a FakeHttpClient so
 * no network is hit), replace `session.agent.streamFn` with a canned
 * assistant message containing one or more fenced blocks, call
 * `session.prompt`, assert the extension emitted the right
 * `pi-fence:output` custom message(s).
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

describe("pi-fence extension — intercepts fenced blocks on agent_end", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"emits a pi-fence:output custom message for a mermaid block",
		async () => {
			const http = makeKrokiHttp({ "https://kroki.io/mermaid/png": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"Here's your diagram:\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nDone.",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "mermaid",
				processor: "kroki",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png");
			expect(http.requests[0].body).toBe("flowchart LR\nA --> B");
		},
		20_000,
	);

	it(
		"renders a dot block via Kroki's /graphviz/png endpoint while keeping the user's tag in details",
		async () => {
			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"Architecture:\n\n```dot\ndigraph { web -> api; api -> db }\n```",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);

			// The user wrote `dot`; the extension preserves that in details,
			// even though Kroki's endpoint is /graphviz/png.
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png");
			expect(http.requests[0].body).toBe("digraph { web -> api; api -> db }");
		},
		20_000,
	);
});

describe("pi-fence extension — /fence list command through AgentSession", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"emits a pi-fence:list custom message describing the Kroki processor",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithCommand(http, "/fence list");

			const listMessages = captured.sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);

			expect(listMessages[0].details).toMatchObject({
				listings: [
					{
						id: "kroki",
						status: "registered",
						tags: ["mermaid", "graphviz", "plantuml", "d2"],
						aliases: { dot: "graphviz", puml: "plantuml" },
					},
				],
				lines: ["kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2"],
			});

			// No HTTP calls — `/fence list` is offline.
			expect(http.requests).toHaveLength(0);
			// No pi-fence:output leaked into the command path.
			expect(
				captured.sentCustomMessages.filter((m) => m.customType === "pi-fence:output"),
			).toHaveLength(0);
		},
		20_000,
	);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface CapturedCustomMessage {
	customType: string;
	content: unknown;
	details: unknown;
}

interface Captured {
	sentCustomMessages: CapturedCustomMessage[];
}

function pngResponse(bytes: Buffer): HttpResponse {
	return { status: 200, headers: { "content-type": "image/png" }, body: bytes };
}

/** Build a FakeHttpClient pre-programmed with PNG responses for the given URLs. */
function makeKrokiHttp(urlToPng: Record<string, Buffer>): FakeHttpClient {
	const http = new FakeHttpClient();
	for (const [url, bytes] of Object.entries(urlToPng)) {
		http.setResponse("POST", url, pngResponse(bytes));
	}
	return http;
}

function filterPiFenceOutputs(messages: CapturedCustomMessage[]): CapturedCustomMessage[] {
	return messages.filter((m) => m.customType === "pi-fence:output");
}

function expectImageBytes(content: unknown, expectedBytes: Buffer): void {
	const items = content as Array<{ type: string; data?: string; mimeType?: string }>;
	const imageItem = items.find((c) => c.type === "image");
	expect(imageItem).toBeDefined();
	expect(imageItem?.mimeType).toBe("image/png");
	if (imageItem?.data) {
		const decoded = Buffer.from(imageItem.data, "base64");
		expect(Buffer.compare(decoded, expectedBytes)).toBe(0);
	}
}

/**
 * Stand up a real AgentSession with pi-fence loaded as an inline factory.
 * Returns the session, the captured custom messages array, and the model
 * for any caller that needs to wire `streamFn` before calling
 * `session.prompt(...)`.
 *
 * Shared between `runExtensionWithAssistantText` (which fires the full
 * agent_end pipeline through a canned stream) and `runExtensionWithCommand`
 * (which dispatches a slash command, bypassing streamFn entirely).
 */
async function buildSessionWithExtension(http: FakeHttpClient): Promise<{
	session: Awaited<ReturnType<typeof createAgentSession>>["session"];
	sentCustomMessages: CapturedCustomMessage[];
	model: NonNullable<ReturnType<typeof getModel>>;
}> {
	const logger = new FakeLogger();
	const sentCustomMessages: CapturedCustomMessage[] = [];

	const agentDir = makeTempDir("pi-fence-ext-");
	const authStorage = AuthStorage.create(`${agentDir}/auth.json`);
	authStorage.setRuntimeApiKey("anthropic", "test-key-not-used");

	const model = getModel("anthropic", "claude-sonnet-4-5");
	if (!model) throw new Error("anthropic/claude-sonnet-4-5 model not found in built-in registry");

	const extensionFactory = (pi: ExtensionAPI) => {
		const originalSendMessage = pi.sendMessage.bind(pi);
		pi.sendMessage = ((
			message: Parameters<ExtensionAPI["sendMessage"]>[0],
			options?: Parameters<ExtensionAPI["sendMessage"]>[1],
		) => {
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

	session.subscribe(() => {});

	return { session, sentCustomMessages, model };
}

/**
 * Stand up a real AgentSession with pi-fence loaded as an inline factory,
 * run `assistantText` through a canned stream, and return captured custom
 * messages.
 */
async function runExtensionWithAssistantText(
	http: FakeHttpClient,
	assistantText: string,
): Promise<Captured> {
	const { session, sentCustomMessages, model } = await buildSessionWithExtension(http);

	session.agent.streamFn = cannedAssistantStream(model, assistantText);

	try {
		await session.prompt("render it");
	} finally {
		session.dispose();
	}

	// Wait a tick for any deferred sendMessage calls triggered by agent_end
	// to settle.
	await new Promise((r) => setTimeout(r, 50));

	return { sentCustomMessages };
}

/**
 * Stand up a real AgentSession with pi-fence loaded and dispatch a slash
 * command through `session.prompt("/...")`. AgentSession routes commands
 * straight to the registered handler without involving the LLM, so no
 * stream is needed.
 */
async function runExtensionWithCommand(http: FakeHttpClient, command: string): Promise<Captured> {
	const { session, sentCustomMessages } = await buildSessionWithExtension(http);

	try {
		await session.prompt(command);
	} finally {
		session.dispose();
	}

	await new Promise((r) => setTimeout(r, 50));

	return { sentCustomMessages };
}

function cannedAssistantStream(_model: NonNullable<ReturnType<typeof getModel>>, text: string) {
	return (activeModel: NonNullable<ReturnType<typeof getModel>>): AssistantMessageEventStream => {
		// Real providers construct an AssistantMessageEventStream (a class,
		// not a plain async iterable) and push events into it while mutating
		// `output.content[i]` in place. We mirror the minimum of that
		// protocol for a text-only response. The completion event is
		// `type: "done"`, after which `stream.end()` releases any waiting
		// consumers.
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
