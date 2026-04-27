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
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createPiFenceExtension } from "../../extensions/pi-fence/index.ts";
import type { Availability, FenceProcessor, FenceResult } from "../../extensions/pi-fence/processor.ts";
import { FakeHttpClient } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import type { LogEntry } from "../utilities/logger.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";
import { FakeExtensionAPI } from "../utilities/extension-api.ts";

function stubProcessor(
	id: string,
	tags: readonly string[],
	aliases: Readonly<Record<string, string>> = {},
	availability: Availability = { ok: true },
): FenceProcessor {
	return {
		id,
		placement: "remote",
		tags,
		aliases,
		async available(): Promise<Availability> {
			return availability;
		},
		async render(): Promise<FenceResult> {
			return { ok: false, error: "stub processor — render() is not exercised in command tests" };
		},
	};
}

function asExtensionAPI(api: FakeExtensionAPI): ExtensionAPI {
	return api as unknown as ExtensionAPI;
}

async function setupExtension(
	processor: FenceProcessor,
): Promise<{ api: FakeExtensionAPI; logger: FakeLogger }> {
	const api = new FakeExtensionAPI();
	const logger = new FakeLogger();
	await createPiFenceExtension(asExtensionAPI(api), {
		http: new FakeHttpClient(),
		// Default shell is never invoked by these tests (the stub
		// processor doesn't shell out) but PiFenceRuntimeDeps.shell became
		// required in CV0.E2.S1 step 7, so we pass a dead fake that
		// throws if anything ever calls it.
		shell: new FakeShellRunner(),
		logger,
		processors: [processor],
	});
	return { api, logger };
}

describe("/fence command — registration", () => {
	it("registers the /fence command with a description", async () => {
		const { api } = await setupExtension(stubProcessor("kroki-remote", ["mermaid"]));

		const entry = api.registeredCommands.get("fence") as
			| { description?: string; handler: unknown }
			| undefined;
		expect(entry).toBeDefined();
		expect(typeof entry?.description).toBe("string");
		expect(entry?.description?.length ?? 0).toBeGreaterThan(0);
	});

	it("registers the pi-fence:list message renderer", async () => {
		const { api } = await setupExtension(stubProcessor("kroki-remote", ["mermaid"]));

		expect(api.registeredRenderers.has("pi-fence:list")).toBe(true);
	});
});

describe("/fence list — subcommand", () => {
	it("emits a pi-fence:list custom message describing the active processor", async () => {
		const krokiRemote = stubProcessor("kroki-remote", ["mermaid", "graphviz", "plantuml", "d2"], {
			dot: "graphviz",
			puml: "plantuml",
		});
		const { api, logger } = await setupExtension(krokiRemote);

		await api.invokeCommand("fence", "list");

		// Logging: a debug entry on the command subsystem records the subcommand.
		const commandDebugs = logger.bySubsystem("command").filter((e) => e.level === "debug");
		expect(commandDebugs).toHaveLength(1);
		expect((commandDebugs[0].meta as { subcommand?: string }).subcommand).toBe("list");

		const listMessages = api.sentMessages.filter((m) => m.customType === "pi-fence:list");
		expect(listMessages).toHaveLength(1);

		const message = listMessages[0];
		expect(message.details).toMatchObject({
			listings: [
				{
					id: "kroki-remote",
					status: "registered",
					tags: ["mermaid", "graphviz", "plantuml", "d2"],
					aliases: { dot: "graphviz", puml: "plantuml" },
				},
			],
			lines: ["kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), d2"],
		});

		// Content mirrors the formatted lines for renderers that don't read
		// `details` (text-only fallback).
		expect(message.content).toEqual([
			{
				type: "text",
				text: "kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), d2",
			},
		]);

		// No follow-up user message, no notify.
		expect(api.sentUserMessages).toHaveLength(0);
		expect(api.ui.notifications).toHaveLength(0);
	});

	it("tolerates surrounding whitespace in the arg string", async () => {
		const { api } = await setupExtension(stubProcessor("kroki-remote", ["mermaid"]));

		await api.invokeCommand("fence", "  list  ");

		expect(api.sentMessages.filter((m) => m.customType === "pi-fence:list")).toHaveLength(1);
	});
});

describe("/fence kroki — Docker lifecycle subcommands", () => {
	it("kroki status notifies with the container status", async () => {
		const api = new FakeExtensionAPI();
		const logger = new FakeLogger();
		const shell = new FakeShellRunner();
		shell.setResponse(
			"docker",
			["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"],
			{ stdout: "true\n", stderr: "", exitCode: 0 },
		);
		shell.setResponse(
			"docker",
			["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"],
			{ stdout: "yuzutech/kroki\n", stderr: "", exitCode: 0 },
		);
		shell.setResponse(
			"docker",
			["inspect", "--format", `{{ index .Config.Labels "pi-fence.sandbox" }}`, "pi-fence-kroki"],
			{ stdout: "kroki\n", stderr: "", exitCode: 0 },
		);
		await createPiFenceExtension(asExtensionAPI(api), {
			http: new FakeHttpClient(),
			shell,
			logger,
			processors: [stubProcessor("kroki-remote", ["mermaid"])],
		});

		await api.invokeCommand("fence", "kroki status");

		expect(api.ui.notifications).toHaveLength(1);
		expect(api.ui.notifications[0].message).toContain("running");
	});

	it("kroki start notifies on success", async () => {
		const api = new FakeExtensionAPI();
		const logger = new FakeLogger();
		const shell = new FakeShellRunner();
		// inspect → absent
		shell.setResponse(
			"docker",
			["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"],
			{ stdout: "", stderr: "No such container", exitCode: 1 },
		);
		// docker run → success
		shell.setResponse(
			"docker",
			[
				"run", "-d",
				"--name", "pi-fence-kroki",
				"--label", "pi-fence.sandbox=kroki",
				"-p", "8000:8000",
				"yuzutech/kroki",
			],
			{ stdout: "abc123\n", stderr: "", exitCode: 0 },
		);
		await createPiFenceExtension(asExtensionAPI(api), {
			http: new FakeHttpClient(),
			shell,
			logger,
			processors: [stubProcessor("kroki-remote", ["mermaid"])],
		});

		await api.invokeCommand("fence", "kroki start");

		expect(api.ui.notifications).toHaveLength(1);
		expect(api.ui.notifications[0].message).toContain("Started");
	});

	it("kroki stop notifies on success", async () => {
		const api = new FakeExtensionAPI();
		const logger = new FakeLogger();
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"], {
			stdout: "yuzutech/kroki\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", `{{ index .Config.Labels "pi-fence.sandbox" }}`, "pi-fence-kroki"], {
			stdout: "kroki\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["stop", "pi-fence-kroki"], {
			stdout: "pi-fence-kroki\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["rm", "pi-fence-kroki"], {
			stdout: "pi-fence-kroki\n",
			stderr: "",
			exitCode: 0,
		});
		await createPiFenceExtension(asExtensionAPI(api), {
			http: new FakeHttpClient(),
			shell,
			logger,
			processors: [stubProcessor("kroki-remote", ["mermaid"])],
		});

		await api.invokeCommand("fence", "kroki stop");

		expect(api.ui.notifications).toHaveLength(1);
		expect(api.ui.notifications[0].message).toContain("Stopped");
	});

	it("kroki with unknown sub notifies warning", async () => {
		const { api } = await setupExtension(stubProcessor("kroki-remote", ["mermaid"]));

		await api.invokeCommand("fence", "kroki bogus");

		expect(api.ui.notifications).toHaveLength(1);
		expect(api.ui.notifications[0].type).toBe("warning");
		expect(api.ui.notifications[0].message).toContain("bogus");
	});
});

describe("/fence — no subcommand / unknown subcommand", () => {
	it("notifies with a warning listing the available subcommands when called with no args", async () => {
		const { api, logger } = await setupExtension(stubProcessor("kroki-remote", ["mermaid"]));

		await api.invokeCommand("fence", "");

		expect(api.sentMessages.filter((m) => m.customType === "pi-fence:list")).toHaveLength(0);
		expect(api.ui.notifications).toHaveLength(1);

		const notification = api.ui.notifications[0];
		expect(notification.type).toBe("warning");
		expect(notification.message).toContain("list");

		// Logging: a warn entry on the command subsystem flags the unknown
		// subcommand for operators tailing the log.
		const warns: LogEntry[] = logger.bySubsystem("command").filter((e) => e.level === "warn");
		expect(warns).toHaveLength(1);
	});

	it("notifies with a warning on an unknown subcommand and does not send a message", async () => {
		const { api } = await setupExtension(stubProcessor("kroki-remote", ["mermaid"]));

		await api.invokeCommand("fence", "bogus");

		expect(api.sentMessages.filter((m) => m.customType === "pi-fence:list")).toHaveLength(0);
		expect(api.ui.notifications).toHaveLength(1);
		expect(api.ui.notifications[0].type).toBe("warning");
		expect(api.ui.notifications[0].message).toContain("bogus");
	});
});
