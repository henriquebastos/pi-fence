/**
 * Unit tests for pi-fence's `/fence` command handler.
 *
 * Drives `createPiFenceExtension` against a `FakeExtensionAPI` — no real
 * pi `AgentSession`, no streaming, no renderer invocation. The goal is to
 * lock down the handler's contract:
 *
 *   - `/fence list` emits a `pi-fence:list` custom message whose details
 *     match `listProcessors(...)` for the wired processors, and whose
 *     content is the formatter's output joined by newlines.
 *   - `/fence` with no subcommand (or with an unknown one) notifies the
 *     user with a help line naming the available subcommands and does
 *     NOT send a custom message.
 *   - The `pi-fence:list` renderer is registered.
 *
 * First real consumer of `FakeExtensionAPI` beyond its self-test. Uses
 * a stub processor so the test does not depend on the Kroki renderer's
 * HTTP surface.
 */

import { describe, expect, it } from "vitest";

import { createPiFenceExtension } from "../../extensions/pi-fence/index.ts";
import type { FenceProcessor, FenceResult } from "../../extensions/pi-fence/processor.ts";
import { FakeHttpClient } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { FakeExtensionAPI } from "../utilities/extension-api.ts";

function stubProcessor(
	id: string,
	tags: readonly string[],
	aliases: Readonly<Record<string, string>> = {},
): FenceProcessor {
	return {
		id,
		tags,
		aliases,
		async render(): Promise<FenceResult> {
			return { ok: false, error: "stub processor — render() is not exercised in command tests" };
		},
	};
}

function setupExtension(processor: FenceProcessor): FakeExtensionAPI {
	const api = new FakeExtensionAPI();
	createPiFenceExtension(api as never, {
		http: new FakeHttpClient(),
		logger: new FakeLogger(),
		processor,
	});
	return api;
}

describe("/fence command — registration", () => {
	it("registers the /fence command with a description", () => {
		const api = setupExtension(stubProcessor("kroki", ["mermaid"]));

		const entry = api.registeredCommands.get("fence") as
			| { description?: string; handler: unknown }
			| undefined;
		expect(entry).toBeDefined();
		expect(typeof entry?.description).toBe("string");
		expect(entry?.description?.length ?? 0).toBeGreaterThan(0);
	});

	it("registers the pi-fence:list message renderer", () => {
		const api = setupExtension(stubProcessor("kroki", ["mermaid"]));

		expect(api.registeredRenderers.has("pi-fence:list")).toBe(true);
	});
});

describe("/fence list — subcommand", () => {
	it("emits a pi-fence:list custom message describing the active processor", async () => {
		const kroki = stubProcessor("kroki", ["mermaid", "graphviz", "plantuml", "d2"], {
			dot: "graphviz",
			puml: "plantuml",
		});
		const api = setupExtension(kroki);

		await api.invokeCommand("fence", "list");

		const listMessages = api.sentMessages.filter((m) => m.customType === "pi-fence:list");
		expect(listMessages).toHaveLength(1);

		const message = listMessages[0];
		expect(message.details).toMatchObject({
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

		// Content mirrors the formatted lines for renderers that don't read
		// `details` (text-only fallback).
		expect(message.content).toEqual([
			{
				type: "text",
				text: "kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2",
			},
		]);

		// No follow-up user message, no notify.
		expect(api.sentUserMessages).toHaveLength(0);
		expect(api.ui.notifications).toHaveLength(0);
	});

	it("tolerates surrounding whitespace in the arg string", async () => {
		const api = setupExtension(stubProcessor("kroki", ["mermaid"]));

		await api.invokeCommand("fence", "  list  ");

		expect(api.sentMessages.filter((m) => m.customType === "pi-fence:list")).toHaveLength(1);
	});
});

describe("/fence — no subcommand / unknown subcommand", () => {
	it("notifies with a warning listing the available subcommands when called with no args", async () => {
		const api = setupExtension(stubProcessor("kroki", ["mermaid"]));

		await api.invokeCommand("fence", "");

		expect(api.sentMessages.filter((m) => m.customType === "pi-fence:list")).toHaveLength(0);
		expect(api.ui.notifications).toHaveLength(1);

		const notification = api.ui.notifications[0];
		expect(notification.type).toBe("warning");
		expect(notification.message).toContain("list");
	});

	it("notifies with a warning on an unknown subcommand and does not send a message", async () => {
		const api = setupExtension(stubProcessor("kroki", ["mermaid"]));

		await api.invokeCommand("fence", "bogus");

		expect(api.sentMessages.filter((m) => m.customType === "pi-fence:list")).toHaveLength(0);
		expect(api.ui.notifications).toHaveLength(1);
		expect(api.ui.notifications[0].type).toBe("warning");
		expect(api.ui.notifications[0].message).toContain("bogus");
	});
});
