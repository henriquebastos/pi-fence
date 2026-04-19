/**
 * Placeholder extension-layer test.
 *
 * Exists to prove the extension-layer pattern: stand up a real pi
 * `AgentSession`, replace `session.agent.streamFn` with a fake that emits
 * a canned assistant message, and assert the session reaches `agent_end`.
 *
 * No pi-fence code is involved yet. S1 replaces this file with the real
 * `tests/extension/pi-fence.test.ts` that loads pi-fence as an extension
 * and asserts it emits a `pi-fence:output` custom message when the fake
 * LLM stream contains a mermaid block.
 *
 * See `cv0-e1-s1-mermaid-via-kroki/plan.md`, Key files → Deleted.
 */

import { afterEach, describe, expect, it } from "vitest";

import { AuthStorage, createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { AssistantMessage, AssistantMessageEventStream } from "@mariozechner/pi-ai";

import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";

describe("extension-layer sanity — fake LLM stream", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"reaches agent_end after a canned assistant message",
		async () => {
			const agentDir = makeTempDir("pi-fence-agentdir-");
			const authStorage = AuthStorage.create(`${agentDir}/auth.json`);
			authStorage.setRuntimeApiKey("anthropic", "test-key-not-used");

			const model = getModel("anthropic", "claude-sonnet-4-5");
			if (!model) throw new Error("anthropic/claude-sonnet-4-5 model not found in built-in registry");

			const { session } = await createAgentSession({
				cwd: agentDir,
				agentDir,
				model,
				authStorage,
				sessionManager: SessionManager.inMemory(),
			});

			// Replace the LLM stream with one that emits a canned assistant
			// message immediately. No network, no real model, no cost.
			session.agent.streamFn = createCannedStreamFn(model, "Hello from a fake LLM.");

			// Subscribe before prompt so we catch the full event sequence.
			const seen: string[] = [];
			const unsubscribe = session.subscribe((event) => {
				seen.push(event.type);
			});

			try {
				await session.prompt("hi");
			} finally {
				unsubscribe();
				session.dispose();
			}

			// agent_end must have fired at least once — that's what pi-fence
			// hooks in S1 onward.
			expect(seen).toContain("agent_end");
		},
		// Bumping the default (5s) because first-time module loading of pi's
		// bundled deps can exceed that on cold caches. 15s is generous but
		// well under "something is actually wrong" territory.
		15_000,
	);
});

// ---------------------------------------------------------------------------
// Helper: canned stream function
// ---------------------------------------------------------------------------

/**
 * Build a replacement for `session.agent.streamFn` that emits one text chunk
 * then stops. The session treats this as if a real LLM replied.
 *
 * Uses the public `AssistantMessageEventStream` shape from `@mariozechner/pi-ai`.
 */
function createCannedStreamFn(model: Parameters<typeof getModel>[0] extends string ? ReturnType<typeof getModel> : never, text: string) {
	return async (activeModel: NonNullable<ReturnType<typeof getModel>>): Promise<AssistantMessageEventStream> => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [{ type: "text", text }],
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

		// Build a minimal async iterable that yields start → text_start →
		// text_delta → text_end → end. This matches the shape every provider
		// in pi-ai produces. We don't import the helper because importing it
		// from a test is brittle across versions — this shape is stable.
		const events: Array<Record<string, unknown>> = [
			{ type: "start", partial: output },
			{ type: "text_start", contentIndex: 0, partial: output },
			{ type: "text_delta", contentIndex: 0, delta: text, partial: output },
			{ type: "text_end", contentIndex: 0, content: text, partial: output },
			{ type: "end", message: output },
		];

		async function* iterator() {
			for (const e of events) {
				yield e as unknown as AssistantMessageEventStream extends AsyncIterable<infer U> ? U : never;
			}
		}

		return iterator() as unknown as AssistantMessageEventStream;
	};
}
