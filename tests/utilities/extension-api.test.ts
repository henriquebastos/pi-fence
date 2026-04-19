/**
 * Self-tests for `FakeExtensionAPI`.
 *
 * The fake implements only the slice of `ExtensionAPI` that pi-fence's
 * handlers need in the near term: `on()` for event registration,
 * `sendMessage()` / `sendUserMessage()` for message emission,
 * `registerMessageRenderer()`, `registerCommand()`, `registerTool()`.
 * Every other method on the real `ExtensionAPI` throws
 * `"not implemented in FakeExtensionAPI"` — loud failure so we notice when
 * a new consumer needs new fake coverage.
 *
 * The fake also exposes a `dispatch(event, ctx)` helper so tests can fire
 * registered handlers synchronously without needing a real pi runtime.
 */

import { describe, expect, it } from "vitest";

import { FakeExtensionAPI } from "./extension-api.ts";

describe("FakeExtensionAPI — event handlers", () => {
	it("registers a handler via on() and dispatches it", async () => {
		const api = new FakeExtensionAPI();
		let received: unknown;
		api.on("agent_end", async (event) => {
			received = event;
		});

		await api.dispatch("agent_end", { type: "agent_end", messages: [] });

		expect(received).toEqual({ type: "agent_end", messages: [] });
	});

	it("supports multiple handlers on the same event, called in registration order", async () => {
		const api = new FakeExtensionAPI();
		const order: string[] = [];
		api.on("agent_end", async () => {
			order.push("first");
		});
		api.on("agent_end", async () => {
			order.push("second");
		});

		await api.dispatch("agent_end", { type: "agent_end", messages: [] });

		expect(order).toEqual(["first", "second"]);
	});

	it("passes the extension context to handlers", async () => {
		const api = new FakeExtensionAPI();
		let receivedCwd: string | undefined;
		api.on("agent_end", async (_event, ctx) => {
			receivedCwd = ctx.cwd;
		});

		await api.dispatch(
			"agent_end",
			{ type: "agent_end", messages: [] },
			{ cwd: "/custom/cwd" },
		);

		expect(receivedCwd).toBe("/custom/cwd");
	});

	it("dispatch resolves after all handlers finish, including async ones", async () => {
		const api = new FakeExtensionAPI();
		let completed = false;
		api.on("agent_end", async () => {
			await new Promise((r) => setTimeout(r, 20));
			completed = true;
		});

		await api.dispatch("agent_end", { type: "agent_end", messages: [] });
		expect(completed).toBe(true);
	});

	it("dispatching an event with no handlers is a no-op", async () => {
		const api = new FakeExtensionAPI();
		await expect(
			api.dispatch("agent_end", { type: "agent_end", messages: [] }),
		).resolves.toBeUndefined();
	});
});

describe("FakeExtensionAPI — sendMessage capture", () => {
	it("records every sendMessage call in source order", () => {
		const api = new FakeExtensionAPI();
		api.sendMessage({
			customType: "pi-fence:output",
			content: [{ type: "text", text: "one" }],
			display: true,
		});
		api.sendMessage({
			customType: "pi-fence:output",
			content: [{ type: "text", text: "two" }],
			display: true,
		});

		expect(api.sentMessages).toHaveLength(2);
		expect(api.sentMessages[0].customType).toBe("pi-fence:output");
		expect(api.sentMessages[1].content).toEqual([{ type: "text", text: "two" }]);
	});

	it("records sendMessage options alongside the message", () => {
		const api = new FakeExtensionAPI();
		api.sendMessage(
			{ customType: "pi-fence:output", content: [], display: false },
			{ deliverAs: "followUp" },
		);

		expect(api.sentMessages[0].options).toEqual({ deliverAs: "followUp" });
	});

	it("records sendUserMessage calls separately", () => {
		const api = new FakeExtensionAPI();
		api.sendUserMessage("hello", { deliverAs: "steer" });

		expect(api.sentUserMessages).toHaveLength(1);
		expect(api.sentUserMessages[0]).toMatchObject({
			content: "hello",
			options: { deliverAs: "steer" },
		});
	});
});

describe("FakeExtensionAPI — registrations", () => {
	it("records registerMessageRenderer calls", () => {
		const api = new FakeExtensionAPI();
		const renderer = (() => null) as unknown as Parameters<
			FakeExtensionAPI["registerMessageRenderer"]
		>[1];
		api.registerMessageRenderer("pi-fence:output", renderer);

		expect(api.registeredRenderers.get("pi-fence:output")).toBe(renderer);
	});

	it("records registerCommand calls by name", () => {
		const api = new FakeExtensionAPI();
		const opts = { description: "hi", handler: async () => {} };
		api.registerCommand("fence", opts);

		expect(api.registeredCommands.get("fence")).toBe(opts);
	});

	it("records registerTool calls by tool name", () => {
		const api = new FakeExtensionAPI();
		const tool = { name: "render_fence", description: "stub", parameters: {}, execute: async () => ({ content: [] }) };
		api.registerTool(tool as unknown as Parameters<FakeExtensionAPI["registerTool"]>[0]);

		expect(api.registeredTools.get("render_fence")).toBe(tool);
	});
});

describe("FakeExtensionAPI — ui capture", () => {
	it("captures ctx.ui.notify calls during dispatch", async () => {
		const api = new FakeExtensionAPI();
		api.on("agent_end", (_event, ctx) => {
			ctx.ui.notify("hello", "warning");
		});

		await api.dispatch("agent_end", { type: "agent_end", messages: [] });

		expect(api.ui.notifications).toEqual([{ message: "hello", type: "warning" }]);
	});

	it("defaults notify type to 'info' when not given", () => {
		const api = new FakeExtensionAPI();
		api.ui.notify("just an FYI");
		expect(api.ui.notifications).toEqual([{ message: "just an FYI", type: "info" }]);
	});

	it("throws loudly on unimplemented ui methods", async () => {
		const api = new FakeExtensionAPI();
		await expect(api.ui.select("title", ["a", "b"])).rejects.toThrow(
			/not implemented in FakeExtensionAPI/i,
		);
		await expect(api.ui.confirm("title", "sure?")).rejects.toThrow(
			/not implemented in FakeExtensionAPI/i,
		);
	});
});

describe("FakeExtensionAPI — invokeCommand", () => {
	it("runs a registered command handler with the given args", async () => {
		const api = new FakeExtensionAPI();
		let received = "";
		api.registerCommand("hello", {
			handler: async (args: string) => {
				received = args;
			},
		});

		await api.invokeCommand("hello", "world");

		expect(received).toBe("world");
	});

	it("passes a fake command context with ui attached", async () => {
		const api = new FakeExtensionAPI();
		api.registerCommand("noisy", {
			handler: async (_args: string, ctx: { ui: { notify: (m: string) => void } }) => {
				ctx.ui.notify("invoked");
			},
		});

		await api.invokeCommand("noisy", "");

		expect(api.ui.notifications).toEqual([{ message: "invoked", type: "info" }]);
	});

	it("throws when invoking an unregistered command", async () => {
		const api = new FakeExtensionAPI();
		await expect(api.invokeCommand("nope", "")).rejects.toThrow(/not registered/);
	});
});

describe("FakeExtensionAPI — unimplemented methods throw loudly", () => {
	it("throws on appendEntry with a clear message", () => {
		const api = new FakeExtensionAPI();
		expect(() => api.appendEntry("whatever")).toThrow(/not implemented in FakeExtensionAPI/i);
	});

	it("throws on setSessionName", () => {
		const api = new FakeExtensionAPI();
		expect(() => api.setSessionName("x")).toThrow(/not implemented in FakeExtensionAPI/i);
	});
});
