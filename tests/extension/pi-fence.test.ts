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

import { createAssistantMessageEventStream, getModel } from "@mariozechner/pi-ai";
import type { AssistantMessage, Model } from "@mariozechner/pi-ai";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { Component } from "@mariozechner/pi-tui";

import type { LoadConfigOptions } from "../../extensions/pi-fence/io/config-loader.ts";
import { BUNDLE_MANIFEST_PATH } from "../../extensions/pi-fence/bundle-sandbox.ts";
import {
	GRAPHVIZ_LOCAL_ALIASES,
	GRAPHVIZ_LOCAL_CANONICAL_TAGS,
} from "../../extensions/pi-fence/graphviz-local.ts";
import { KROKI_ALIASES, KROKI_CANONICAL_TAGS } from "../../extensions/pi-fence/kroki.ts";
import { formatProcessorLines } from "../../extensions/pi-fence/list.ts";

import { createPiFenceExtension } from "../../extensions/pi-fence/index.ts";
import { KROKI_COMPOSE_FILE, type GondolinVMFactory, type GondolinVMHandle } from "../../extensions/pi-fence/sandbox.ts";
import { forceCapabilities } from "../utilities/force-capabilities.ts";
import { FakeHttpClient, type HttpResponse } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

// Node std imports for the bindings fixtures (temp-dir config files).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { paintComponent } from "../utilities/render.ts";
import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";
import { LoggingVirtualTerminal } from "../utilities/virtual-terminal.ts";

const TINY_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
]);

function expectedKrokiComposeFilePath(): string {
	return fileURLToPath(new URL(`../../${KROKI_COMPOSE_FILE}`, import.meta.url));
}

class FakeGondolinVM implements GondolinVMHandle {
	readonly fs = {
		writeFile: async (): Promise<void> => {},
		readFile: async (): Promise<Buffer> => TINY_PNG,
		deleteFile: async (): Promise<void> => {},
	};
	readonly execCalls: string[][] = [];
	startCalls = 0;
	closeCalls = 0;

	async exec(command: string | readonly string[]): Promise<{ stdout: string; stdoutBuffer: Buffer; stderr: string; exitCode: number }> {
		const parts = Array.isArray(command) ? command : [command];
		this.execCalls.push(parts);
		if (parts.includes("cat") && parts.includes(BUNDLE_MANIFEST_PATH)) {
			return {
				stdout: JSON.stringify({
					name: "pi-fence-bundle",
					version: "0.1.0",
					tools: {
						dot: { command: "dot", versionCommand: ["dot", "-V"] },
						mmdc: { command: "mmdc", versionCommand: ["mmdc", "--version"] },
					},
				}),
				stdoutBuffer: Buffer.alloc(0),
				stderr: "",
				exitCode: 0,
			};
		}
		if (parts.includes("dot") && parts.includes("-Tpng")) {
			return { stdout: "", stdoutBuffer: TINY_PNG, stderr: "", exitCode: 0 };
		}
		return { stdout: "ok\n", stdoutBuffer: Buffer.from("ok\n"), stderr: "", exitCode: 0 };
	}

	async start(): Promise<void> {
		this.startCalls += 1;
	}

	async close(): Promise<void> {
		this.closeCalls += 1;
	}
}

class FakeGondolinVMFactory implements GondolinVMFactory {
	readonly creates: Array<{ image?: string }> = [];
	readonly vm = new FakeGondolinVM();

	async create(options: { image?: string }): Promise<GondolinVMHandle> {
		this.creates.push(options);
		return this.vm;
	}
}

describe("pi-fence extension — intercepts fenced blocks on agent_end", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it("requires image data when comparing rendered bytes", () => {
		expect(() => expectImageBytes([{ type: "image", mimeType: "image/png" }], TINY_PNG)).toThrow();
	});

	it(
		"emits a pi-fence:output custom message for a mermaid block",
		async () => {
			// pi-fence defaults to dark appearance when pi's theme is not
			// initialised (as in this test) — Kroki's request URL carries
			// `?theme=dark`. See kroki.ts `isDarkThemeName` for the heuristic.
			const http = makeKrokiHttp({ "https://kroki.io/mermaid/png?theme=dark": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"Here's your diagram:\n\n```mermaid\nflowchart LR\nA --> B\n```\n\nDone.",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "mermaid",
				processor: "kroki-remote",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/mermaid/png?theme=dark");
			expect(http.requests[0].body).toBe("flowchart LR\nA --> B");

			// Render-layer assertion: paint the custom message through the
			// extension's registered pi-fence:output renderer into a
			// VirtualTerminal and confirm the viewport shows the expected
			// label, and the write log carries a Kitty graphics sequence
			// whose base64 payload decodes to the exact fixture PNG bytes.
			// This closes the gap between "data reached the renderer" (above)
			// and "the renderer actually paints an image" (here).
			const terminal = await paintCustomMessage(captured, outputs[0], "pi-fence:output");
			expect(
				terminal.getViewport().some((line) =>
					line.includes("Rendered mermaid via kroki-remote"),
				),
			).toBe(true);
			expect(terminal.getWrites()).toContain("\x1b_G");
			expect(extractKittyBase64(terminal.getWrites())).toBe(TINY_PNG.toString("base64"));
		},
		20_000,
	);

	it(
		"renders a dot block via Kroki's /graphviz/png endpoint while keeping the user's tag in details",
		async () => {
			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });
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
				processor: "kroki-remote",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png?theme=dark");
			expect(http.requests[0].body).toBe("digraph { web -> api; api -> db }");
		},
		20_000,
	);

	it(
		"emits debug+info log entries through the full render pipeline",
		async () => {
			const http = makeKrokiHttp({ "https://kroki.io/mermaid/png?theme=dark": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
			);

			const logger = captured.logger!;

			// Extension hook traced parse + per-block render.
			const fenceEntries = logger.bySubsystem("pi-fence");
			expect(fenceEntries.find((e) => e.message.includes("agent_end parsed"))).toBeDefined();
			const resolution = fenceEntries.find((e) => e.message.includes("processor resolution"));
			expect(resolution?.meta).toMatchObject({ tag: "mermaid", processor: "kroki-remote" });
			expect(resolution?.meta?.steps).toEqual(
				expect.arrayContaining([{ id: "kroki-remote", outcome: "selected-by-placement" }]),
			);
			expect(fenceEntries.find((e) => e.message.includes("rendering block"))).toBeDefined();
			expect(
				fenceEntries.find((e) => e.level === "info" && e.message.includes("block rendered")),
			).toBeDefined();

			// Kroki processor traced request + response.
			const krokiEntries = logger.bySubsystem("kroki-remote");
			expect(krokiEntries.filter((e) => e.level === "debug").length).toBeGreaterThanOrEqual(2);
		},
		20_000,
	);
	it(
		"renders a color block as ANSI swatches via the color processor",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"Brand colors:\n\n```color\n#ff5733 Primary\n#3498db Secondary\n```\n\nDone.",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "color",
				processor: "color-embedded",
				kind: "ok",
			});

			const items = outputs[0].content as Array<{ type: string; text?: string }>;
			expect(items).toHaveLength(1);
			expect(items[0].type).toBe("text");
			expect(items[0].text).toContain("\x1b[38;2;");
			expect(items[0].text).toContain("Primary");
			expect(items[0].text).toContain("Secondary");

			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"renders a qr block as a PNG QR code via the qr processor",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"Scan this:\n\n```qr\nhttps://example.com\n```\n\nDone.",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "qr",
				processor: "qr-embedded",
				kind: "ok",
			});

			// Content is an image.
			const items = outputs[0].content as Array<{ type: string; data?: string; mimeType?: string }>;
			expect(items).toHaveLength(1);
			expect(items[0].type).toBe("image");
			expect(items[0].mimeType).toBe("image/png");

			// No HTTP — QR is generated locally.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"renders a csv block as a text table via the table processor",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"Here's the data:\n\n```csv\nname,age\nAlice,30\nBob,25\n```\n\nDone.",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "csv",
				processor: "table-embedded",
				kind: "ok",
			});

			// Content is text, not image.
			const items = outputs[0].content as Array<{ type: string; text?: string }>;
			expect(items).toHaveLength(1);
			expect(items[0].type).toBe("text");
			expect(items[0].text).toContain("Alice");
			expect(items[0].text).toContain("Bob");
			expect(items[0].text).toContain("─");

			// No HTTP requests — table processor is pure logic.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"renders a sql block with ANSI syntax highlighting via the highlight processor",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"Here's the query:\n\n```sql\nSELECT name FROM users WHERE age > 30\n```\n\nDone.",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "sql",
				processor: "highlight-embedded",
				kind: "ok",
			});

			const items = outputs[0].content as Array<{ type: string; text?: string }>;
			expect(items).toHaveLength(1);
			expect(items[0].type).toBe("text");
			// Output contains ANSI escape sequences.
			expect(items[0].text).toContain("\x1b[");
			expect(items[0].text).toContain("SELECT");
			expect(items[0].text).toContain("users");

			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"renders a jsonl block as a text table via the table processor",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				'Data:\n\n```jsonl\n{"id":1,"name":"Alpha"}\n{"id":2,"name":"Beta"}\n```',
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "jsonl",
				processor: "table-embedded",
				kind: "ok",
			});

			const items = outputs[0].content as Array<{ type: string; text?: string }>;
			expect(items[0].type).toBe("text");
			expect(items[0].text).toContain("Alpha");
			expect(items[0].text).toContain("Beta");
		},
		20_000,
	);
});

describe("pi-fence extension — /fence list command through AgentSession", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"emits a pi-fence:list custom message describing built-in processors",
		async () => {
			// Default test shell has `dot -V` failing with exit 127 so
			// graphviz-host probes as unavailable and kroki-remote still serves
			// diagram tags. Asserts the graphviz-host unavailable row plus the
			// current built-in registry shape.
			const http = new FakeHttpClient();
			const captured = await runExtensionWithCommand(http, "/fence list");

			const listMessages = captured.sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);

			const details = listMessages[0].details as {
				listings: Array<{
					id: string;
					status: "registered" | "unavailable";
					tags: readonly string[];
					aliases: Readonly<Record<string, string>>;
					unavailableReason?: string;
					installHint?: string;
				}>;
				lines: string[];
			};

			expect(details.listings).toHaveLength(9);
			expect(details.listings[0]).toMatchObject({
				id: "graphviz-host",
				status: "unavailable",
				tags: GRAPHVIZ_LOCAL_CANONICAL_TAGS,
				aliases: GRAPHVIZ_LOCAL_ALIASES,
			});
			expect(details.listings[0].unavailableReason).toBeDefined();
			expect(details.listings[0].installHint).toContain("graphviz");
			expect(details.listings[1]).toMatchObject({
				id: "mermaid-host",
				status: "unavailable",
			});
			expect(details.listings[2]).toMatchObject({
				id: "table-embedded",
				status: "registered",
				tags: ["csv", "jsonl"],
			});
			expect(details.listings[3]).toMatchObject({
				id: "highlight-embedded",
				status: "registered",
				tags: ["sql", "regex", "jq"],
			});
			expect(details.listings[4]).toMatchObject({
				id: "qr-embedded",
				status: "registered",
				tags: ["qr"],
			});
			expect(details.listings[5]).toMatchObject({
				id: "color-embedded",
				status: "registered",
				tags: ["color", "palette"],
			});
			expect(details.listings[6]).toMatchObject({
				id: "bundle-sandbox",
				status: "unavailable",
				tags: ["graphviz", "mermaid"],
				aliases: { dot: "graphviz" },
			});
			expect(details.listings[6].unavailableReason).toContain("bundle sandbox is error");
			expect(details.listings[7]).toMatchObject({
				id: "kroki-sandbox",
				status: "unavailable",
				tags: KROKI_CANONICAL_TAGS,
				aliases: KROKI_ALIASES,
			});
			expect(details.listings[7].unavailableReason).toContain("Kroki sandbox is error");
			expect(details.listings[8]).toMatchObject({
				id: "kroki-remote",
				status: "registered",
				tags: KROKI_CANONICAL_TAGS,
				aliases: KROKI_ALIASES,
			});

			// Lines array matches what formatProcessorLines produces for the
			// same listings — drives the assertion off the formatter so future
			// formatter tweaks update here automatically.
			expect(details.lines).toEqual(formatProcessorLines(details.listings));

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

describe("pi-fence extension — graphviz-host vs kroki-remote resolution", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"renders a `dot` block via graphviz-host when `dot` is on PATH — zero HTTP traffic",
		async () => {
			// Shell programmed so:
			//   - `dot -V` exits 0 (graphviz-host probes as available).
			//   - `dot -Tpng` reads source on stdin, responds with PNG bytes.
			// HTTP is not programmed with any response; the test asserts
			// kroki.io never gets a request.
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0 (0)",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});
			const http = new FakeHttpClient();

			const captured = await runExtensionWithAssistantText(
				http,
				"Architecture:\n\n```dot\ndigraph { web -> api; api -> db }\n```",
				shell,
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "graphviz-host",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			// Privacy/offline claim: no HTTP left the host for this tag.
			expect(http.requests).toHaveLength(0);

			// Shell-out shape: probes (dot -V, mmdc --version) + one render (dot -Tpng).
			const dotCalls = shell.calls.filter((c) => c.cmd === "dot");
			expect(dotCalls).toHaveLength(2); // probe + render
			expect(dotCalls[0]).toMatchObject({ cmd: "dot", args: ["-V"] });
			expect(dotCalls[1]).toMatchObject({
				cmd: "dot",
				args: ["-Tpng"],
				input: "digraph { web -> api; api -> db }",
			});
			// No HTTP — graphviz-host handled it.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"falls through to Kroki for a `dot` block when graphviz-host is unavailable",
		async () => {
			// Default test shell reports `dot` as not-found — graphviz-host
			// probes as unavailable and Kroki serves the graphviz tag per
			// placement-policy fallback. HTTP is programmed with
			// a /graphviz/png response.
			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"Architecture:\n\n```dot\ndigraph { web -> api; api -> db }\n```",
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki-remote",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			// Kroki served it — one HTTP request to /graphviz/png.
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png?theme=dark");
		},
		20_000,
	);

	it(
		"leaves mermaid blocks to Kroki regardless of graphviz-host availability",
		async () => {
			// Mermaid is a Kroki-only tag. Whether or not graphviz-host is
			// available should not affect this path at all.
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			const http = makeKrokiHttp({ "https://kroki.io/mermaid/png?theme=dark": TINY_PNG });

			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				shell,
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "mermaid",
				processor: "kroki-remote",
			});

			// Wire-time probes: dot -V + mmdc --version. No render-time
			// shell call because mermaid goes to Kroki, not graphviz-host.
			const dotCalls = shell.calls.filter((c) => c.cmd === "dot");
			expect(dotCalls).toHaveLength(1);
			expect(dotCalls[0].args).toEqual(["-V"]);
		},
		20_000,
	);
});

describe("pi-fence extension — processorPrecedence tracer bullet (CV9.E1.S1)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"remote-only precedence skips graphviz-host and renders dot through kroki-remote",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ processorPrecedence: ["remote"] }),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki-remote",
				kind: "ok",
			});
			expect(http.requests).toHaveLength(1);
			expect(shell.calls.filter((c) => c.cmd === "dot")).toHaveLength(0);

			const resolution = captured.logger!
				.bySubsystem("pi-fence")
				.find((e) => e.message === "processor resolution");
			expect(resolution?.meta?.steps).toEqual(
				expect.arrayContaining([
					{ id: "graphviz-host", outcome: "skipped-placement-disabled" },
					{ id: "kroki-remote", outcome: "selected-by-placement" },
				]),
			);
		},
		20_000,
	);

	it(
		"/fence list marks processors outside precedence as disabled",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ processorPrecedence: ["remote"] }),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const listMessages = captured.sentCustomMessages.filter(
				(message) => message.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);
			const details = listMessages[0].details as { lines: string[] };
			expect(details.lines).toEqual(
				expect.arrayContaining([
					"graphviz-host [disabled] — graphviz (dot)",
					expect.stringContaining("kroki-remote [registered]"),
				]),
			);
			expect(shell.calls.filter((c) => c.cmd === "dot")).toHaveLength(0);
		},
		20_000,
	);

	it(
		"sandbox-only precedence renders dot through bundle-sandbox without host binaries or Kroki", async () => {
			const shell = new FakeShellRunner();
			programReadyBundleSandbox(shell, { dotPng: TINY_PNG });
			const http = new FakeHttpClient();

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ processorPrecedence: ["sandbox"] }),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "bundle-sandbox",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);
			expect(http.requests).toHaveLength(0);
			expect(shell.calls.some((call) => call.cmd === "dot" || call.cmd === "mmdc")).toBe(false);
			expect(shell.calls.some((call) => call.cmd === "docker" && call.args.includes("-Tpng"))).toBe(true);
		},
		20_000,
	);

	it(
		"sandbox-only precedence renders mermaid through bundle-sandbox without host binaries or Kroki", async () => {
			const shell = new FakeShellRunner();
			programReadyBundleSandbox(shell, { mermaidPng: TINY_PNG });
			const http = new FakeHttpClient();

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ processorPrecedence: ["sandbox"] }),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "mermaid",
				processor: "bundle-sandbox",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);
			expect(http.requests).toHaveLength(0);
			expect(shell.calls.some((call) => call.cmd === "dot" || call.cmd === "mmdc")).toBe(false);
			expect(shell.calls.some((call) => call.cmd === "docker" && call.args.includes("mmdc"))).toBe(true);
		},
		20_000,
	);

	it(
		"sandbox precedence renders dot through kroki-sandbox when the single-container service is ready",
		async () => {
			const shell = new FakeShellRunner();
			programReadyKrokiSandbox(shell);
			const http = makeKrokiHttp({
				"http://127.0.0.1:8000/graphviz/png?theme=dark": TINY_PNG,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-container" },
					},
				}),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki-sandbox",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("http://127.0.0.1:8000/graphviz/png?theme=dark");
			expect(shell.calls.some((call) => call.cmd === "dot")).toBe(false);
			expect(shell.calls.some((call) => call.args.includes("pi-fence-bundle"))).toBe(false);
		},
		20_000,
	);

	it(
		"sandbox precedence renders dot through kroki-sandbox when the Compose service is ready",
		async () => {
			const shell = new FakeShellRunner();
			programReadyKrokiComposeSandbox(shell);
			const http = makeKrokiHttp({
				"http://127.0.0.1:8000/graphviz/png?theme=dark": TINY_PNG,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-compose" },
					},
				}),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki-sandbox",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);
			expect(http.requests[0].url).toBe("http://127.0.0.1:8000/graphviz/png?theme=dark");
			expect(shell.calls.some((call) => call.args.includes("pi-fence-kroki-core"))).toBe(true);
			expect(shell.calls.some((call) => call.args.includes("pi-fence-kroki-mermaid"))).toBe(true);
		},
		20_000,
	);

	it(
		"falls back to kroki-remote when kroki-sandbox is unavailable",
		async () => {
			const shell = new FakeShellRunner();
			const http = makeKrokiHttp({
				"https://kroki.io/graphviz/png?theme=dark": TINY_PNG,
			});
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox", "remote"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-container" },
					},
				}),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki-remote",
				kind: "ok",
			});
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png?theme=dark");
		},
		20_000,
	);

	it(
		"same-placement bundle and Kroki sandbox processors are ambiguous until bound",
		async () => {
			const shell = new FakeShellRunner();
			programReadyBundleSandbox(shell, { dotPng: TINY_PNG });
			programReadyKrokiSandbox(shell);
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox", "remote"],
					sandboxes: {
						bundle: { kind: "exec", runtime: "docker-container" },
						kroki: { kind: "service", runtime: "docker-container" },
					},
				}),
			);

			const captured = await runExtensionWithAssistantText(
				new FakeHttpClient(),
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(filterPiFenceOutputs(captured.sentCustomMessages)).toHaveLength(0);
			const ambiguityLog = captured.logger!.bySubsystem("pi-fence").find((entry) =>
				entry.level === "warn" && entry.message === "ambiguous processor resolution",
			);
			expect(ambiguityLog?.meta).toMatchObject({
				tag: "dot",
				placement: "sandbox",
				processorIds: ["bundle-sandbox", "kroki-sandbox"],
			});
		},
		20_000,
	);

	it(
		"binding selects kroki-sandbox when bundle-sandbox is also ready",
		async () => {
			const shell = new FakeShellRunner();
			programReadyBundleSandbox(shell, { dotPng: Buffer.from([0x89, 0x50, 0x00]) });
			programReadyKrokiSandbox(shell);
			const http = makeKrokiHttp({
				"http://127.0.0.1:8000/graphviz/png?theme=dark": TINY_PNG,
			});
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox", "remote"],
					bindings: { dot: { processor: "kroki-sandbox" } },
					sandboxes: {
						bundle: { kind: "exec", runtime: "docker-container" },
						kroki: { kind: "service", runtime: "docker-container" },
					},
				}),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({ processor: "kroki-sandbox", kind: "ok" });
			expectImageBytes(outputs[0].content, TINY_PNG);
			expect(http.requests[0].url).toBe("http://127.0.0.1:8000/graphviz/png?theme=dark");
		},
		20_000,
	);

	it(
		"doctor explains partial Compose Kroki sandbox components",
		async () => {
			const shell = new FakeShellRunner();
			programPartialKrokiComposeSandbox(shell);
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-compose" },
					},
				}),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence doctor",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const listMessages = captured.sentCustomMessages.filter(
				(message) => message.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);
			const details = listMessages[0].details as { lines: string[] };
			expect(details.lines.some((line) => line.includes("kroki-sandbox [unavailable]"))).toBe(true);
			expect(details.lines.some((line) => line.includes("mermaid=stopped"))).toBe(true);
		},
		20_000,
	);

	it(
		"does not register bundle-sandbox when the configured bundle sandbox is not docker exec",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						bundle: { kind: "service", runtime: "docker-container" },
					},
				}),
			);
			const shell = new FakeShellRunner();

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const listMessages = captured.sentCustomMessages.filter(
				(message) => message.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);
			const details = listMessages[0].details as { listings: Array<{ id: string }> };
			expect(details.listings.map((listing) => listing.id)).not.toContain("bundle-sandbox");
			expect(shell.calls.some((call) => call.args.includes("pi-fence-bundle"))).toBe(false);
		},
		20_000,
	);

	it(
		"host-only precedence renders dot through graphviz-host and makes zero Kroki calls",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});
			const http = new FakeHttpClient();

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ processorPrecedence: ["host"] }),
			);

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "graphviz-host",
				kind: "ok",
			});
			expect(http.requests).toHaveLength(0);
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(1);

			const resolution = captured.logger!
				.bySubsystem("pi-fence")
				.find((e) => e.message === "processor resolution");
			expect(resolution?.meta?.steps).toEqual(
				expect.arrayContaining([
					{ id: "graphviz-host", outcome: "selected-by-placement" },
					{ id: "kroki-remote", outcome: "skipped-placement-disabled" },
				]),
			);
		},
		20_000,
	);

	it(
		"host-only precedence makes a remote processor binding select no processor",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: { dot: { processor: "kroki-remote" } },
					processorPrecedence: ["host"],
				}),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(0);
			expect(http.requests).toHaveLength(0);
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(0);

			const warns = captured.logger!
				.bySubsystem("pi-fence")
				.filter((e) => e.level === "warn" && e.message === "binding issue");
			expect(warns).toHaveLength(1);
			expect(warns[0].meta).toMatchObject({
				tag: "dot",
				processorId: "kroki-remote",
				reason: "processor-placement-disabled",
			});
		},
		20_000,
	);

	it(
		"placement binding routes dot to host when remote has precedence",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: { dot: { placement: "host" } },
					processorPrecedence: ["remote", "host"],
				}),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "graphviz-host",
				kind: "ok",
			});
			expect(http.requests).toHaveLength(0);

			const effective = captured.logger!
				.bySubsystem("pi-fence")
				.find((e) => e.level === "info" && e.message === "binding effective");
			expect(effective?.meta).toMatchObject({
				tag: "dot",
				placement: "host",
				processorId: "graphviz-host",
			});
		},
		20_000,
	);

	it(
		"placement binding to an omitted placement selects no processor",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: { dot: { placement: "remote" } },
					processorPrecedence: ["host"],
				}),
			);

			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(0);
			expect(http.requests).toHaveLength(0);
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(0);

			const warns = captured.logger!
				.bySubsystem("pi-fence")
				.filter((e) => e.level === "warn" && e.message === "binding issue");
			expect(warns).toHaveLength(1);
			expect(warns[0].meta).toMatchObject({
				tag: "dot",
				placement: "remote",
				reason: "placement-disabled",
			});
		},
		20_000,
	);

	it(
		"blocked Kroki tag families prevent Docker Kroki auto-start",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: KROKI_CANONICAL_TAGS, processors: [] },
					processorPrecedence: ["remote"],
					kroki: { docker: { autoStart: true } },
				}),
			);
			const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls).toHaveLength(0);
		},
		20_000,
	);

	it(
		"disabled remote placement prevents Docker Kroki auto-start",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["embedded"],
					kroki: { docker: { autoStart: true } },
				}),
			);
			const shell = new FakeShellRunner();

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls).toHaveLength(0);
		},
		20_000,
	);

	it(
		"sandbox-only placement allows single-container Kroki auto-start",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-container", autoStart: true },
					},
				}),
			);
			const shell = new FakeShellRunner();
			shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
				stdout: "",
				stderr: "No such container",
				exitCode: 1,
			});
			shell.setResponse(
				"docker",
				[
					"run", "-d",
					"--name", "pi-fence-kroki",
					"--label", "pi-fence.sandbox=kroki",
					"-p", "127.0.0.1:8000:8000",
					"yuzutech/kroki",
				],
				{ stdout: "abc123\n", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const runIndex = shell.calls.findIndex((call) => call.args[0] === "run");
			const statusIndices = shell.calls
				.map((call, index) =>
					call.args.includes("{{.State.Running}}") && call.args.includes("pi-fence-kroki")
						? index
						: -1,
				)
				.filter((index) => index >= 0);
			const lastStatusIndex = statusIndices[statusIndices.length - 1] ?? -1;
			expect(runIndex).toBeGreaterThanOrEqual(0);
			expect(lastStatusIndex).toBeGreaterThan(runIndex);
		},
		20_000,
	);

	it(
		"sandboxes.bundle.autoStart starts the Gondolin bundle VM",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						bundle: {
							kind: "exec",
							runtime: "gondolin-vm",
							image: "pi-fence-bundle:0.1.0",
							autoStart: true,
						},
					},
				}),
			);
			const gondolin = new FakeGondolinVMFactory();

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				new FakeShellRunner(),
				{ home, cwd: makeTempDir() },
				{ gondolin },
			);

			expect(gondolin.creates).toEqual([{ image: "pi-fence-bundle:0.1.0" }]);
			expect(gondolin.vm.startCalls).toBe(1);
		},
		20_000,
	);

	it(
		"renders through Gondolin-backed bundle-sandbox without Docker or Kroki fallback",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox", "remote"],
					sandboxes: {
						bundle: {
							kind: "exec",
							runtime: "gondolin-vm",
							image: "pi-fence-bundle:0.1.0",
							autoStart: true,
						},
					},
				}),
			);
			const gondolin = new FakeGondolinVMFactory();
			const http = new FakeHttpClient();
			const shell = new FakeShellRunner();

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
				undefined,
				{ gondolin },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "bundle-sandbox",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);
			expect(gondolin.creates).toEqual([{ image: "pi-fence-bundle:0.1.0" }]);
			expect(gondolin.vm.startCalls).toBe(1);
			expect(gondolin.vm.execCalls.some((call) => call.includes("dot") && call.includes("-Tpng"))).toBe(true);
			expect(http.requests).toHaveLength(0);
			expect(shell.calls.some((call) => call.cmd === "docker")).toBe(false);
		},
		20_000,
	);

	it(
		"sandboxes.bundle.autoStart false leaves the Gondolin bundle VM stopped",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						bundle: {
							kind: "exec",
							runtime: "gondolin-vm",
							autoStart: false,
						},
					},
				}),
			);
			const gondolin = new FakeGondolinVMFactory();

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				new FakeShellRunner(),
				{ home, cwd: makeTempDir() },
				{ gondolin },
			);

			expect(gondolin.creates).toEqual([]);
			expect(gondolin.vm.startCalls).toBe(0);
		},
		20_000,
	);

	it(
		"sandboxes.kroki.autoStart starts the single-container Kroki sandbox",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox", "remote"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-container", autoStart: true },
					},
				}),
			);
			const shell = new FakeShellRunner();
			shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
				stdout: "",
				stderr: "No such container",
				exitCode: 1,
			});
			shell.setResponse(
				"docker",
				[
					"run", "-d",
					"--name", "pi-fence-kroki",
					"--label", "pi-fence.sandbox=kroki",
					"-p", "127.0.0.1:8000:8000",
					"yuzutech/kroki",
				],
				{ stdout: "abc123\n", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls.some((call) => call.args[0] === "run")).toBe(true);
		},
		20_000,
	);

	it(
		"ignores project-configured Kroki sandbox image for auto-start",
		async () => {
			const home = makeTempDir();
			const cwd = makeTempDir();
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: {
							kind: "service",
							runtime: "docker-container",
							image: "registry.example/kroki:test",
							autoStart: true,
						},
					},
				}),
			);
			const shell = new FakeShellRunner();
			shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
				stdout: "",
				stderr: "No such container",
				exitCode: 1,
			});
			shell.setResponse(
				"docker",
				[
					"run", "-d",
					"--name", "pi-fence-kroki",
					"--label", "pi-fence.sandbox=kroki",
					"-p", "127.0.0.1:8000:8000",
					"yuzutech/kroki",
				],
				{ stdout: "abc123\n", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd },
			);

			expect(shell.calls.some((call) => call.args.includes("registry.example/kroki:test"))).toBe(false);
			expect(shell.calls.some((call) => call.args.includes("yuzutech/kroki"))).toBe(true);
		},
		20_000,
	);

	it(
		"ignores project-configured Kroki sandbox image for /fence kroki start",
		async () => {
			const home = makeTempDir();
			const cwd = makeTempDir();
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["remote"],
					sandboxes: {
						kroki: {
							kind: "service",
							runtime: "docker-container",
							image: "registry.example/kroki:test",
							autoStart: false,
						},
					},
				}),
			);
			const shell = new FakeShellRunner();
			shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
				stdout: "",
				stderr: "No such container",
				exitCode: 1,
			});
			shell.setResponse(
				"docker",
				[
					"run", "-d",
					"--name", "pi-fence-kroki",
					"--label", "pi-fence.sandbox=kroki",
					"-p", "127.0.0.1:8000:8000",
					"yuzutech/kroki",
				],
				{ stdout: "abc123\n", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence kroki start",
				shell,
				{ home, cwd },
			);

			expect(shell.calls.some((call) => call.args.includes("registry.example/kroki:test"))).toBe(false);
			expect(shell.calls.some((call) => call.args.includes("yuzutech/kroki"))).toBe(true);
		},
		20_000,
	);

	it(
		"project sandbox map without Kroki disables inherited legacy auto-start",
		async () => {
			const home = makeTempDir();
			const cwd = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					kroki: { docker: { autoStart: true } },
				}),
			);
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({
					sandboxes: {
						bundle: { kind: "exec", runtime: "docker-container" },
					},
				}),
			);
			const shell = new FakeShellRunner();

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd },
			);

			expect(shell.calls.some((call) => call.args.includes("pi-fence-kroki"))).toBe(false);
			expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
		},
		20_000,
	);

	it(
		"project sandbox autoStart:false overrides inherited legacy Kroki auto-start",
		async () => {
			const home = makeTempDir();
			const cwd = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					kroki: { docker: { autoStart: true } },
				}),
			);
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-container", autoStart: false },
					},
				}),
			);
			const shell = new FakeShellRunner();
			shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
				stdout: "",
				stderr: "No such container",
				exitCode: 1,
			});
			shell.setResponse(
				"docker",
				[
					"run", "-d",
					"--name", "pi-fence-kroki",
					"--label", "pi-fence.sandbox=kroki",
					"-p", "127.0.0.1:8000:8000",
					"yuzutech/kroki",
				],
				{ stdout: "abc123\n", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd },
			);

			expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
		},
		20_000,
	);

	it(
		"legacy Kroki autoStart remains a compatibility alias",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					kroki: { docker: { autoStart: true } },
				}),
			);
			const shell = new FakeShellRunner();
			shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
				stdout: "",
				stderr: "No such container",
				exitCode: 1,
			});
			shell.setResponse(
				"docker",
				[
					"run", "-d",
					"--name", "pi-fence-kroki",
					"--label", "pi-fence.sandbox=kroki",
					"-p", "127.0.0.1:8000:8000",
					"yuzutech/kroki",
				],
				{ stdout: "abc123\n", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls.some((call) => call.args[0] === "run")).toBe(true);
		},
		20_000,
	);

	it(
		"docker-compose Kroki autoStart uses the Compose lifecycle",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-compose", autoStart: true },
					},
				}),
			);
			const shell = new FakeShellRunner();
			const composeFile = expectedKrokiComposeFilePath();
			shell.setResponse(
				"docker",
				["compose", "-f", composeFile, "-p", "pi-fence-kroki", "up", "-d"],
				{ stdout: "", stderr: "", exitCode: 0 },
			);

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
			expect(shell.calls.some((call) => call.args.join(" ") === `compose -f ${composeFile} -p pi-fence-kroki up -d`)).toBe(true);
		},
		20_000,
	);

	it(
		"non-service Kroki sandbox config does not start the single-container manager",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "exec", runtime: "docker-container", autoStart: true },
					},
				}),
			);
			const shell = new FakeShellRunner();

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls).toHaveLength(0);
		},
		20_000,
	);

	it(
		"blocked Kroki tag families prevent sandbox Kroki auto-start",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: KROKI_CANONICAL_TAGS, processors: [] },
					processorPrecedence: ["sandbox"],
					sandboxes: {
						kroki: { kind: "service", runtime: "docker-container", autoStart: true },
					},
				}),
			);
			const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });

			await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(shell.calls).toHaveLength(0);
		},
		20_000,
	);

	it(
		"malformed global config fails closed before remote rendering",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(join(home, ".pi", "agent", "pi-fence.config.json"), "malformed{");

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			expect(filterPiFenceOutputs(captured.sentCustomMessages)).toHaveLength(0);
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);
});

describe("pi-fence extension — blocked processors", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"blocked kroki — mermaid block produces no pi-fence:output",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ blocked: { tags: [], processors: ["kroki-remote"] } }),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			// Kroki is the only processor for mermaid. Blocked → no output.
			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(0);
			// No HTTP — kroki was never called.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"legacy top-level disabled no longer suppresses kroki-remote at runtime",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ disabled: ["kroki-remote"] }),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			expect(filterPiFenceOutputs(captured.sentCustomMessages)).toHaveLength(1);
			expect(http.requests).toHaveLength(1);
		},
		20_000,
	);

	it(
		"/fence list shows blocked kroki as [blocked]",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ blocked: { tags: [], processors: ["kroki-remote"] } }),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithCommand(
				http,
				"/fence list",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const listMessages = captured.sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);

			const details = listMessages[0].details as {
				listings: Array<{ id: string; status: string }>;
				lines: string[];
			};

			const krokiListing = details.listings.find((l) => l.id === "kroki-remote");
			expect(krokiListing?.status).toBe("blocked");
			expect(details.lines.some((l) => l.includes("[blocked]"))).toBe(true);
		},
		20_000,
	);
});

describe("pi-fence extension — blocked tags", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"blocked host tag families suppress availability and render shell calls",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: ["dot", "mermaid"], processors: [] },
					processorPrecedence: ["host"],
				}),
			);
			const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });

			const captured = await runExtensionWithAssistantText(
				new FakeHttpClient(),
				"```dot\ndigraph { a -> b }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			expect(filterPiFenceOutputs(captured.sentCustomMessages)).toHaveLength(0);
			expect(shell.calls).toHaveLength(0);
		},
		20_000,
	);

	it(
		"blocked mermaid tag produces no pi-fence:output and no HTTP request",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ blocked: { tags: ["mermaid"], processors: [] } }),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			expect(filterPiFenceOutputs(captured.sentCustomMessages)).toHaveLength(0);
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"startup binding diagnostics classify blocked tags as issues",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: ["mermaid"], processors: [] },
					bindings: { mermaid: { processor: "kroki-remote" } },
				}),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const logger = captured.logger;
			expect(logger).toBeDefined();
			expect(
				logger!.bySubsystem("pi-fence").some((entry) =>
					entry.message === "binding issue" &&
					(entry.meta as { reason?: string }).reason === "tag-blocked",
				),
			).toBe(true);
			expect(
				logger!.bySubsystem("pi-fence").some((entry) =>
					entry.message === "binding effective" &&
					(entry.meta as { tag?: string }).tag === "mermaid",
				),
			).toBe(false);
		},
		20_000,
	);

	it(
		"/fence list marks fully tag-blocked processors as blocked",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: GRAPHVIZ_LOCAL_CANONICAL_TAGS, processors: [] },
					processorPrecedence: ["host"],
				}),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 }),
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find(
				(m) => m.customType === "pi-fence:list",
			)?.details as {
				listings: Array<{ id: string; status: string }>;
				lines: string[];
			};
			const graphvizListing = details.listings.find((l) => l.id === "graphviz-host");
			expect(graphvizListing?.status).toBe("blocked");
			expect(details.lines.some((line) => line.startsWith("graphviz-host [blocked]"))).toBe(true);
			expect(details.lines.some((line) => line.includes("graphviz-host is unavailable"))).toBe(false);
		},
		20_000,
	);

	it(
		"/fence list surfaces blocked processors, tags, and binding issues",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: ["mermaid"], processors: ["kroki-remote"] },
					bindings: { mermaid: { processor: "kroki-remote" } },
				}),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find(
				(m) => m.customType === "pi-fence:list",
			)?.details as {
				listings: Array<{ id: string; status: string }>;
				lines: string[];
			};
			const krokiListing = details.listings.find((l) => l.id === "kroki-remote");
			expect(krokiListing?.status).toBe("blocked");
			expect(details.lines.some((line) => line.startsWith("kroki-remote [blocked]"))).toBe(true);
			expect(details.lines).toContain("Binding issues");
			expect(details.lines).toContain("  mermaid → kroki-remote (tag blocked)");
			expect(details.lines).toContain("Blocked tags");
			expect(details.lines).toContain("  mermaid");
		},
		20_000,
	);
});

describe("pi-fence extension — /fence doctor (CV1.E1.S3)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"emits a doctor message with Config and Processors sections",
		async () => {
			const http = new FakeHttpClient();
			const captured = await runExtensionWithCommand(http, "/fence doctor");

			const listMessages = captured.sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);

			const details = listMessages[0].details as { lines: string[] };
			expect(details.lines.some((l) => l.startsWith("Config"))).toBe(true);
			expect(details.lines.some((l) => l.includes("global:"))).toBe(true);
			expect(details.lines.some((l) => l.includes("project:"))).toBe(true);
			// Default test shell has dot unavailable → graphviz-host issue.
			expect(details.lines).toContain("Issues");
			expect(
				details.lines.some((l) => l.includes("graphviz-host is unavailable")),
			).toBe(true);
		},
		20_000,
	);

	it(
		"does not report fully tag-blocked processors as unavailable",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					blocked: { tags: GRAPHVIZ_LOCAL_CANONICAL_TAGS, processors: [] },
					processorPrecedence: ["host"],
				}),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence doctor",
				new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 }),
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find(
				(m) => m.customType === "pi-fence:list",
			)?.details as { lines: string[] };
			expect(details.lines.some((line) => line.startsWith("graphviz-host [blocked]"))).toBe(true);
			expect(details.lines.some((line) => line.includes("graphviz-host is unavailable"))).toBe(false);
		},
		20_000,
	);

	it(
		"reports blocked policy in doctor output",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ blocked: { tags: ["mermaid"], processors: ["kroki-remote"] } }),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence doctor",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find(
				(m) => m.customType === "pi-fence:list",
			)?.details as { lines: string[] };
			expect(details.lines).toContain("Blocked tags");
			expect(details.lines).toContain("  mermaid");
			expect(details.lines).toContain("Issues");
			expect(details.lines.some((line) => line.startsWith("  - kroki-remote is blocked;"))).toBe(true);
			expect(details.lines).toContain("  - tag mermaid is blocked");
		},
		20_000,
	);

	it(
		"reports issues when kroki is blocked",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ blocked: { tags: [], processors: ["kroki-remote"] } }),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithCommand(
				http,
				"/fence doctor",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find(
				(m) => m.customType === "pi-fence:list",
			)?.details as { lines: string[] };
			expect(details.lines).toContain("Issues");
			expect(
				details.lines.some((l) => l.includes("kroki-remote is blocked")),
			).toBe(true);
		},
		20_000,
	);

	it(
		"surfaces placement binding issues in doctor output",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ bindings: { dot: { placement: "host" } } }),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence doctor",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find(
				(m) => m.customType === "pi-fence:list",
			)?.details as { lines: string[] };
			expect(details.lines).toContain("Binding issues");
			expect(details.lines).toContain(
				"  dot → placement:host (no matching processor in placement)",
			);
			expect(details.lines).toContain("Issues");
			expect(details.lines).toContain(
				"  - binding for dot has issue: placement no match",
			);
		},
		20_000,
	);
});

describe("pi-fence extension — error follow-up to LLM (CV1.E2.S2)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"sends a follow-up message to the LLM when a render fails",
		async () => {
			// Program Kroki to return a 400 for the mermaid block.
			const http = new FakeHttpClient();
			http.setResponse(
				"POST",
				"https://kroki.io/mermaid/png?theme=dark",
				{
					status: 400,
					headers: { "content-type": "text/plain" },
					body: Buffer.from("Syntax error at line 1", "utf8"),
				},
			);
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nbad syntax\n```",
			);

			// Error panel rendered to the user (E2.S1).
			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({ kind: "error" });

			// Follow-up sent to the LLM (E2.S2).
			const followUps = captured.sentCustomMessages.filter(
				(m) => m.options?.deliverAs === "followUp",
			);
			expect(followUps).toHaveLength(1);
			const followUpContent = followUps[0].content as Array<{ type: string; text: string }>;
			expect(followUpContent[0].text).toContain("mermaid");
			expect(followUpContent[0].text).toContain("Syntax error");
		},
		20_000,
	);

	it(
		"does NOT send a follow-up when the render succeeds",
		async () => {
			const http = makeKrokiHttp({ "https://kroki.io/mermaid/png?theme=dark": TINY_PNG });
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
			);

			const followUps = captured.sentCustomMessages.filter(
				(m) => m.options?.deliverAs === "followUp",
			);
			expect(followUps).toHaveLength(0);
		},
		20_000,
	);
});

describe("pi-fence extension — render resource limits (CV11.E5.S1)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"rejects oversized text output before building message content",
		async () => {
			const oversizedText = "é".repeat(5_242_881); // 10,485,762 UTF-8 bytes.
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "huge-text",
					placement: "embedded",
					tags: ["hugetext"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => ({ kind: "text", text: oversizedText }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const captured = await runExtensionWithAssistantText(
				new FakeHttpClient(),
				"```hugetext\nsmall\n```",
				undefined,
				undefined,
				[thirdPartyFactory],
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "hugetext",
				processor: "huge-text",
				kind: "error",
				outputKind: "error",
			});
			expect(outputs[0].content).toEqual([
				{
					type: "text",
					text: "Processor output is too large: 10485762 bytes exceeds limit of 10485760 bytes",
				},
			]);
		},
		20_000,
	);

	it(
		"rejects oversized error output before building message content",
		async () => {
			const oversizedError = "é".repeat(5_242_881); // 10,485,762 UTF-8 bytes.
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "huge-error",
					placement: "embedded",
					tags: ["hugeerror"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => ({ kind: "error", error: oversizedError }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const captured = await runExtensionWithAssistantText(
				new FakeHttpClient(),
				"```hugeerror\nsmall\n```",
				undefined,
				undefined,
				[thirdPartyFactory],
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "hugeerror",
				processor: "huge-error",
				kind: "error",
				outputKind: "error",
			});
			expect(outputs[0].content).toEqual([
				{
					type: "text",
					text: "Processor output is too large: 10485762 bytes exceeds limit of 10485760 bytes",
				},
			]);
		},
		20_000,
	);

	it(
		"records metrics and follow-up for oversized source rejection",
		async () => {
			const oversizedSource = "é".repeat(131_073); // 262,146 UTF-8 bytes.
			const { session, sentCustomMessages, model } = await buildSessionWithExtension(new FakeHttpClient());
			session.agent.streamFn = cannedAssistantStream(model, `\`\`\`mermaid\n${oversizedSource}\n\`\`\``);
			try {
				await session.prompt("render it");
				await new Promise((r) => setTimeout(r, 50));
				await session.prompt("/fence stats");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			const outputs = filterPiFenceOutputs(sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "mermaid",
				processor: "pi-fence",
				kind: "error",
				outputKind: "error",
			});
			const followUps = sentCustomMessages.filter((message) => message.options?.deliverAs === "followUp");
			expect(followUps).toHaveLength(1);
			expect((followUps[0].content as Array<{ text?: string }>)[0].text)
				.toContain("Fence source is too large: 262146 bytes exceeds limit of 262144 bytes");
			const stats = sentCustomMessages.find(
				(message) => message.customType === "pi-fence:list" &&
					(message.details as { lines?: string[] }).lines?.includes("Session metrics"),
			)?.details as { lines: string[] };
			expect(stats.lines).toContain("Total renders: 1 (0 ok, 1 errors)");
			expect(stats.lines).toContain("  pi-fence: 1 (0 ok, 1 errors)");
		},
		20_000,
	);

	it(
		"rejects oversized image output before base64 encoding",
		async () => {
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "huge-image",
					placement: "embedded",
					tags: ["hugeimage"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => ({ kind: "image", data: Buffer.alloc(10_485_761), mimeType: "image/png" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const captured = await runExtensionWithAssistantText(
				new FakeHttpClient(),
				"```hugeimage\nsmall\n```",
				undefined,
				undefined,
				[thirdPartyFactory],
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "hugeimage",
				processor: "huge-image",
				kind: "error",
				outputKind: "error",
			});
			expect(outputs[0].content).toEqual([
				{
					type: "text",
					text: "Processor output is too large: 10485761 bytes exceeds limit of 10485760 bytes",
				},
			]);
		},
		20_000,
	);

	it(
		"rejects oversized fence source before invoking a processor",
		async () => {
			let renderCalls = 0;
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "limit-probe",
					placement: "embedded",
					tags: ["limitprobe"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => {
						renderCalls += 1;
						return { kind: "text", text: "should not render" };
					},
				});
				await new Promise((r) => setTimeout(r, 50));
			};
			const oversizedSource = "é".repeat(131_073); // 262,146 UTF-8 bytes.

			const captured = await runExtensionWithAssistantText(
				new FakeHttpClient(),
				`\`\`\`limitprobe\n${oversizedSource}\n\`\`\``,
				undefined,
				undefined,
				[thirdPartyFactory],
			);

			expect(renderCalls).toBe(0);
			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "limitprobe",
				processor: "pi-fence",
				kind: "error",
				outputKind: "error",
			});
			expect(outputs[0].content).toEqual([
				{
					type: "text",
					text: "Fence source is too large: 262146 bytes exceeds limit of 262144 bytes",
				},
			]);
			const details = outputs[0].details as {
				source?: string;
				sourcePreview?: { text: string; truncated: boolean; omittedBytes?: number; omittedLines?: number };
			};
			expect(details.source).toBeUndefined();
			expect(Buffer.byteLength(details.sourcePreview?.text ?? "", "utf8")).toBeLessThanOrEqual(8192);
			expect(details.sourcePreview).toMatchObject({
				truncated: true,
				omittedBytes: 262_146 - 8192,
				omittedLines: 0,
			});
		},
		20_000,
	);
});

describe("pi-fence extension — third-party processor via event bus (CV4.E1.S1)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"renders a fenced block via a third-party processor registered through pi.events",
		async () => {
			const http = new FakeHttpClient();

			// A fake third-party extension that registers a processor via the event bus.
			// Registers in its factory function — pi-fence's factory runs first (first
			// in the extensionFactories array), so the listener is ready. The event bus
			// handler is async, so we need the factory to be async too to await.
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async (_tag: string, source: string) => ({
						ok: true,
						text: source.toUpperCase(),
					}),
				});
				// Allow async registration handler to complete.
				await new Promise((r) => setTimeout(r, 50));
			};

			const captured = await runExtensionWithAssistantText(
				http,
				"Result:\n\n```upper\nhello world\n```\n\nDone.",
				undefined,
				undefined,
				[thirdPartyFactory],
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "upper",
				processor: "custom-upper",
				kind: "ok",
			});

			const items = outputs[0].content as Array<{ type: string; text?: string }>;
			expect(items[0].type).toBe("text");
			expect(items[0].text).toBe("HELLO WORLD");

			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"rejects invalid third-party registration without mutating the registry",
		async () => {
			const registrationErrors: unknown[] = [];
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.on("pi-fence:register-error", (data) => {
					registrationErrors.push(data);
				});
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: { "bad/alias": "upper" },
					available: async () => ({ ok: true }),
					render: async () => ({ ok: true, text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session, sentCustomMessages, logger } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			try {
				await session.prompt("/fence list");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			expect(registrationErrors).toHaveLength(1);
			expect(registrationErrors[0]).toMatchObject({
				error: expect.stringContaining("processor.aliases"),
			});
			const details = sentCustomMessages.find((m) => m.customType === "pi-fence:list")
				?.details as { listings: Array<{ id: string }> };
			expect(details.listings.map((listing) => listing.id)).not.toContain("custom-upper");
			expect(
				logger.bySubsystem("pi-fence").some(
					(entry) => entry.level === "warn" && entry.message === "register rejected",
				),
			).toBe(true);
		},
		20_000,
	);

	it(
		"turns registration validation exceptions into register-error events",
		async () => {
			const registrationErrors: unknown[] = [];
			const throwingAliases = new Proxy({}, {
				ownKeys() {
					throw new Error("alias trap");
				},
			});
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.on("pi-fence:register-error", (data) => {
					registrationErrors.push(data);
				});
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: throwingAliases,
					available: async () => ({ ok: true }),
					render: async () => ({ ok: true, text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session, sentCustomMessages } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			try {
				await session.prompt("/fence list");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			expect(registrationErrors).toHaveLength(1);
			expect(registrationErrors[0]).toMatchObject({
				error: expect.stringContaining("alias trap"),
			});
			const details = sentCustomMessages.find((m) => m.customType === "pi-fence:list")
				?.details as { listings: Array<{ id: string }> };
			expect(details.listings.map((listing) => listing.id)).not.toContain("custom-upper");
		},
		20_000,
	);

	it(
		"turns unstringifiable registration exceptions into register-error events",
		async () => {
			const registrationErrors: unknown[] = [];
			const throwingAliases = new Proxy({}, {
				ownKeys() {
					throw Object.create(null);
				},
			});
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.on("pi-fence:register-error", (data) => {
					registrationErrors.push(data);
				});
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: throwingAliases,
					available: async () => ({ ok: true }),
					render: async () => ({ ok: true, text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			session.dispose();
			await new Promise((r) => setTimeout(r, 50));

			expect(registrationErrors).toHaveLength(1);
			expect(registrationErrors[0]).toMatchObject({
				error: expect.stringContaining("non-stringifiable"),
			});
		},
		20_000,
	);

	it(
		"turns Error objects with throwing message getters into register-error events",
		async () => {
			const registrationErrors: unknown[] = [];
			const error = new Error("placeholder");
			Object.defineProperty(error, "message", {
				get() {
					throw new Error("message trap");
				},
			});
			const throwingAliases = new Proxy({}, {
				ownKeys() {
					throw error;
				},
			});
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.on("pi-fence:register-error", (data) => {
					registrationErrors.push(data);
				});
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: throwingAliases,
					available: async () => ({ ok: true }),
					render: async () => ({ ok: true, text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			session.dispose();
			await new Promise((r) => setTimeout(r, 50));

			expect(registrationErrors).toHaveLength(1);
			expect(registrationErrors[0]).toMatchObject({
				error: expect.stringContaining("non-stringifiable"),
			});
		},
		20_000,
	);

	it(
		"lists a third-party processor with malformed availability as unavailable",
		async () => {
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: {},
					available: async () => ({ ok: false }),
					render: async () => ({ kind: "text", text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session, sentCustomMessages } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			try {
				await session.prompt("/fence list");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			const details = sentCustomMessages.find((m) => m.customType === "pi-fence:list")
				?.details as { listings: Array<{ id: string; status: string; unavailableReason?: string }> };
			expect(details.listings.find((listing) => listing.id === "custom-upper")).toMatchObject({
				status: "unavailable",
				unavailableReason: expect.stringContaining("malformed"),
			});
		},
		20_000,
	);

	it(
		"lists a third-party processor whose availability throws as unavailable",
		async () => {
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: {},
					available: async () => { throw new Error("probe boom"); },
					render: async () => ({ kind: "text", text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session, sentCustomMessages } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			try {
				await session.prompt("/fence list");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			const details = sentCustomMessages.find((m) => m.customType === "pi-fence:list")
				?.details as { listings: Array<{ id: string; status: string; unavailableReason?: string }> };
			expect(details.listings.find((listing) => listing.id === "custom-upper")).toMatchObject({
				status: "unavailable",
				unavailableReason: expect.stringContaining("available() threw: probe boom"),
			});
		},
		20_000,
	);

	it(
		"turns thrown third-party render into error output, follow-up, and error metrics",
		async () => {
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => { throw new Error("boom"); },
				});
				await new Promise((r) => setTimeout(r, 50));
			};
			const { session, sentCustomMessages, model } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			session.agent.streamFn = cannedAssistantStream(model, "```upper\nhello\n```");
			try {
				await session.prompt("render it");
				await new Promise((r) => setTimeout(r, 50));
				await session.prompt("/fence stats");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			const outputs = filterPiFenceOutputs(sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "upper",
				processor: "custom-upper",
				kind: "error",
				outputKind: "error",
			});
			expect((outputs[0].content as Array<{ text?: string }>)[0].text).toBe("render() threw");
			expect(sentCustomMessages.filter((message) => message.options?.deliverAs === "followUp"))
				.toHaveLength(1);
			const stats = sentCustomMessages.find(
				(message) => message.customType === "pi-fence:list" &&
					(message.details as { lines?: string[] }).lines?.includes("Session metrics"),
			)?.details as { lines: string[] };
			expect(stats.lines).toContain("Total renders: 1 (0 ok, 1 errors)");
			expect(stats.lines).toContain("  custom-upper: 1 (0 ok, 1 errors)");
		},
		20_000,
	);

	it(
		"turns malformed third-party render output into error output, follow-up, and error metrics",
		async () => {
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => undefined,
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session, sentCustomMessages, model } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				undefined,
				[thirdPartyFactory],
			);
			session.agent.streamFn = cannedAssistantStream(model, "```upper\nhello\n```");
			try {
				await session.prompt("render it");
				await new Promise((r) => setTimeout(r, 50));
				await session.prompt("/fence stats");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			const outputs = filterPiFenceOutputs(sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				processor: "custom-upper",
				kind: "error",
				outputKind: "error",
			});
			expect((outputs[0].content as Array<{ text?: string }>)[0].text)
				.toContain("render() returned malformed result");
			expect(sentCustomMessages.filter((message) => message.options?.deliverAs === "followUp"))
				.toHaveLength(1);
			const stats = sentCustomMessages.find(
				(message) => message.customType === "pi-fence:list" &&
					(message.details as { lines?: string[] }).lines?.includes("Session metrics"),
			)?.details as { lines: string[] };
			expect(stats.lines).toContain("Total renders: 1 (0 ok, 1 errors)");
			expect(stats.lines).toContain("  custom-upper: 1 (0 ok, 1 errors)");
		},
		20_000,
	);

	it(
		"does not probe a third-party processor whose tag family is blocked",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ blocked: { tags: ["upper"], processors: [] } }),
			);
			let probes = 0;
			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "host",
					tags: ["upper"],
					aliases: {},
					available: async () => {
						probes += 1;
						return { ok: true };
					},
					render: async () => ({ ok: true, text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				{ home, cwd: makeTempDir() },
				[thirdPartyFactory],
			);
			session.dispose();

			expect(probes).toBe(0);
		},
		20_000,
	);

	it(
		"/fence list resolves bindings against processors registered after startup",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ bindings: { upper: { processor: "custom-upper" } } }),
			);

			const thirdPartyFactory = async (pi: ExtensionAPI): Promise<void> => {
				pi.events.emit("pi-fence:register", {
					id: "custom-upper",
					placement: "embedded",
					tags: ["upper"],
					aliases: {},
					available: async () => ({ ok: true }),
					render: async () => ({ ok: true, text: "" }),
				});
				await new Promise((r) => setTimeout(r, 50));
			};

			const { session, sentCustomMessages, logger } = await buildSessionWithExtension(
				new FakeHttpClient(),
				undefined,
				{ home, cwd: makeTempDir() },
				[thirdPartyFactory],
			);
			try {
				await session.prompt("/fence list");
			} finally {
				session.dispose();
			}
			await new Promise((r) => setTimeout(r, 50));

			const details = sentCustomMessages.find((m) => m.customType === "pi-fence:list")
				?.details as { bindings: Array<{ status: string; tag: string; selector: string; processorId: string }> };
			expect(details.bindings).toEqual([
				{ status: "effective", tag: "upper", selector: "processor", processorId: "custom-upper" },
			]);
			expect(
				logger.bySubsystem("pi-fence").filter(
					(e) => e.level === "warn" && e.message === "binding issue",
				),
			).toEqual([]);
		},
		20_000,
	);
});

describe("pi-fence extension — /fence stats (CV4.E2.S2)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"shows render count after a block is rendered",
		async () => {
			const http = makeKrokiHttp({ "https://kroki.io/mermaid/png?theme=dark": TINY_PNG });
			const { session, sentCustomMessages, model } = await buildSessionWithExtension(http);

			// Render a block.
			session.agent.streamFn = cannedAssistantStream(model, "```mermaid\nflowchart LR\nA-->B\n```");
			try {
				await session.prompt("render it");
				await new Promise((r) => setTimeout(r, 50));

				// Now run /fence stats.
				await session.prompt("/fence stats");
				await new Promise((r) => setTimeout(r, 50));
			} finally {
				session.dispose();
			}

			const statsMessages = sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:list" && (m.details as { lines?: string[] })?.lines?.some((l: string) => l.includes("Session metrics")),
			);
			expect(statsMessages).toHaveLength(1);

			const lines = (statsMessages[0].details as { lines: string[] }).lines;
			expect(lines.some((l) => l.includes("1") && l.includes("ok"))).toBe(true);
		},
		20_000,
	);
});

describe("pi-fence extension — Kroki endpoint config (CV1.E1.S2)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"configured endpoint — Kroki requests hit the custom URL",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ kroki: { endpoint: "http://localhost:9999" } }),
			);

			const http = makeKrokiHttp({
				"http://localhost:9999/mermaid/png?theme=dark": TINY_PNG,
			});
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "mermaid",
				processor: "kroki-remote",
				kind: "ok",
			});

			// The HTTP request went to the custom endpoint, not kroki.io.
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe(
				"http://localhost:9999/mermaid/png?theme=dark",
			);
		},
		20_000,
	);

	it(
		"doctor warns when the active Kroki endpoint comes from project config",
		async () => {
			const home = makeTempDir();
			const cwd = makeTempDir();
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({ kroki: { endpoint: "http://project-kroki.local:8000" } }),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence doctor",
				new FakeShellRunner(),
				{ home, cwd },
			);

			const doctorMessages = captured.sentCustomMessages.filter(
				(message) => message.customType === "pi-fence:list",
			);
			expect(doctorMessages).toHaveLength(1);
			const details = doctorMessages[0].details as { lines: string[] };
			expect(details.lines.some((line) => line.includes("project config sets kroki.endpoint"))).toBe(true);
			expect(details.lines.some((line) => line.includes("http://project-kroki.local:8000"))).toBe(true);
		},
		20_000,
	);
});

describe("pi-fence extension — user-level per-tag bindings (CV0.E2.S2)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"global config binds graphviz to kroki-remote — dot block goes through kroki-remote even when dot is installed",
		async () => {
			// Shell: graphviz-host probes as available. Config: binds
			// graphviz → kroki-remote. Expect kroki-remote to serve the block despite
			// graphviz-host being available — the binding overrides
			// placement-policy resolution.
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			// No dot -Tpng programmed — if it's called, the shell throws,
			// which would surface as an error-kind output. The test asserts
			// kroki handled it so this shouldn't fire.

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			// Bind both canonical + alias tags — binding lookup is exact,
			// not alias-aware, per the S2 plan's scope decision. Users who
			// want to route `dot` through kroki list both `graphviz` and
			// `dot` in their config (the Epic README's example config
			// shows both exactly for this reason).
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: {
						graphviz: { processor: "kroki-remote" },
						dot: { processor: "kroki-remote" },
					},
				}),
			);

			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() /* no project config */ },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki-remote",
				kind: "ok",
			});

			// Kroki served it — one HTTP request.
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png?theme=dark");

			// graphviz-host got its wire-time probe and nothing else — the
			// binding steered around the render-time shell-out.
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(0);
		},
		20_000,
	);

	it(
		"project config overrides global config",
		async () => {
			// Global: graphviz → kroki-remote. Project: graphviz → graphviz-host.
			// Expect graphviz-host to win (project precedence).
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ bindings: { graphviz: { processor: "kroki-remote" } } }),
			);

			const cwd = makeTempDir();
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({ bindings: { graphviz: { processor: "graphviz-host" } } }),
			);

			const http = new FakeHttpClient(); // no Kroki response needed; project says local wins

			const captured = await runExtensionWithAssistantText(
				http,
				"```graphviz\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(1);
			expect(outputs[0].details).toMatchObject({
				tag: "graphviz",
				processor: "graphviz-host",
			});

			// graphviz-host served it — one probe + one render shell-out.
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(1);
			// No Kroki HTTP — project-level binding steered to local.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"binding to an unknown processor id selects no processor and logs a warn",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});
			shell.setResponse("dot", ["-Tpng"], {
				stdout: "",
				stdoutBuffer: TINY_PNG,
				stderr: "",
				exitCode: 0,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ bindings: { dot: { processor: "nonexistent" } } }),
			);

			const http = new FakeHttpClient();

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(0);
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(0);

			// Binding issue logged at warn level.
			const logger = captured.logger!;
			const warns = logger
				.bySubsystem("pi-fence")
				.filter((e) => e.level === "warn" && e.message === "binding issue");
			expect(warns).toHaveLength(1);
			expect(warns[0].meta).toMatchObject({
				tag: "dot",
				processorId: "nonexistent",
				reason: "unknown-processor",
			});
			expect(
				logger
					.bySubsystem("pi-fence")
					.some((e) => e.level === "warn" && e.message === "no available processor for tag"),
			).toBe(false);
		},
		20_000,
	);

	it(
		"binding to an unavailable processor selects no processor and logs a warn",
		async () => {
			// Default test shell: dot -V fails, so graphviz-host is unavailable.
			// Exact tag bindings are constraints; a bound `dot` block must not
			// fall back to another processor when graphviz-host cannot render it.
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ bindings: { dot: { processor: "graphviz-host" } } }),
			);

			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				undefined, // default shell — dot unavailable
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(0);
			expect(http.requests).toHaveLength(0);

			const logger = captured.logger!;
			const warns = logger
				.bySubsystem("pi-fence")
				.filter((e) => e.level === "warn" && e.message === "binding issue");
			expect(warns).toHaveLength(1);
			expect(warns[0].meta).toMatchObject({
				tag: "dot",
				processorId: "graphviz-host",
				reason: "processor-unavailable",
			});
		},
		20_000,
	);

	it(
		"/fence list surfaces placement selector rows and issue reasons",
		async () => {
			const shell = new FakeShellRunner();
			shell.setResponse("dot", ["-V"], {
				stdout: "",
				stderr: "dot - graphviz version 2.50.0",
				exitCode: 0,
			});

			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: {
						dot: { placement: "host" },
						mermaid: { placement: "host" },
					},
				}),
			);

			const captured = await runExtensionWithCommand(
				new FakeHttpClient(),
				"/fence list",
				shell,
				{ home, cwd: makeTempDir() },
			);

			const details = captured.sentCustomMessages.find((m) => m.customType === "pi-fence:list")
				?.details as { lines: string[] };
			expect(details.lines).toContain("Bindings");
			expect(details.lines).toContain("Binding issues");
			expect(details.lines).toContain("  dot → placement:host (graphviz-host)");
			expect(details.lines).toContain(
				"  mermaid → placement:host (no matching processor in placement)",
			);
		},
		20_000,
	);

	it(
		"/fence list surfaces the Bindings + Binding issues sections",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: {
						mermaid: { processor: "kroki-remote" },
						graphviz: { processor: "nonexistent" },
					},
				}),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithCommand(
				http,
				"/fence list",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			const listMessages = captured.sentCustomMessages.filter(
				(m) => m.customType === "pi-fence:list",
			);
			expect(listMessages).toHaveLength(1);

			const details = listMessages[0].details as {
				lines: string[];
				bindings: Array<{
					status: "effective" | "issue";
					tag: string;
					processorId: string;
					reason?: string;
				}>;
			};

			// bindings rows carried on the details payload.
			expect(details.bindings).toHaveLength(2);
			expect(details.bindings.find((b) => b.tag === "mermaid")).toMatchObject({
				status: "effective",
				processorId: "kroki-remote",
			});
			expect(details.bindings.find((b) => b.tag === "graphviz")).toMatchObject({
				status: "issue",
				processorId: "nonexistent",
				reason: "unknown-processor",
			});

			// lines array reflects the section structure.
			expect(details.lines).toContain("Bindings");
			expect(details.lines).toContain("Binding issues");
			expect(details.lines.some((l) => l.includes("mermaid → kroki-remote"))).toBe(true);
			expect(
				details.lines.some((l) =>
					l.includes("graphviz → nonexistent (unknown processor)"),
				),
			).toBe(true);
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
	options?: { triggerTurn?: boolean; deliverAs?: string };
}

type CapturedRenderer = (
	message: { customType: string; content: unknown; details: unknown },
	options: { expanded: boolean },
	theme: unknown,
) => Component | undefined;

interface Captured {
	sentCustomMessages: CapturedCustomMessage[];
	registeredRenderers: Map<string, CapturedRenderer>;
	logger?: FakeLogger;
}

function pngResponse(bytes: Buffer): HttpResponse {
	return { status: 200, headers: { "content-type": "image/png" }, body: bytes };
}

/**
 * Minimal theme shape the pi-fence renderers consume. Returns text
 * unchanged so viewport assertions match on plain strings; mirrors the
 * IDENTITY_THEME used by tests/unit/renderer.test.ts.
 */
const IDENTITY_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

/**
 * Paint the captured custom message through the extension's registered
 * renderer for `customType` into a LoggingVirtualTerminal, returning
 * the terminal for viewport / write-log assertions. The paint itself
 * is delegated to `paintComponent` so the test-terminal dimension
 * rationale lives in one place (tests/utilities/render.ts); this
 * wrapper's job is to look up the captured renderer, replay it
 * against the message with a neutral theme, and handle the
 * capability pin lifecycle.
 */
async function paintCustomMessage(
	captured: Captured,
	message: CapturedCustomMessage,
	customType: string,
): Promise<LoggingVirtualTerminal> {
	const renderer = captured.registeredRenderers.get(customType);
	if (!renderer) {
		throw new Error(`No renderer registered for customType='${customType}'`);
	}
	const component = renderer(
		{ customType, content: message.content, details: message.details },
		{ expanded: false },
		IDENTITY_THEME,
	);
	if (!component) {
		throw new Error(`Renderer for '${customType}' returned undefined`);
	}

	const resetCaps = forceCapabilities();
	try {
		return await paintComponent(component);
	} finally {
		resetCaps();
	}
}

/**
 * Extract the base64 payload from the first Kitty graphics sequence in
 * a write stream. Kitty's APC sequence is `\x1b_G<params>;<base64>\x1b\\`
 * for a single-chunk image, or `\x1b_G<params>,m=1;<chunk1>\x1b\\` +
 * continuation chunks for multi-chunk. Our fixture is tiny (< 4 KiB),
 * so it always emits a single chunk.
 */
function extractKittyBase64(writes: string): string {
	const start = writes.indexOf("\x1b_G");
	if (start < 0) return "";
	const payloadStart = writes.indexOf(";", start);
	const end = writes.indexOf("\x1b\\", payloadStart);
	if (payloadStart < 0 || end < 0) return "";
	return writes.slice(payloadStart + 1, end);
}

/** Build a FakeHttpClient pre-programmed with PNG responses for the given URLs. */
function makeKrokiHttp(urlToPng: Record<string, Buffer>): FakeHttpClient {
	const http = new FakeHttpClient();
	for (const [url, bytes] of Object.entries(urlToPng)) {
		http.setResponse("POST", url, pngResponse(bytes));
	}
	return http;
}

function programReadyKrokiSandbox(shell: FakeShellRunner): void {
	programReadyKrokiContainer(shell, "pi-fence-kroki", "yuzutech/kroki");
}

function programReadyKrokiComposeSandbox(shell: FakeShellRunner): void {
	programReadyKrokiContainer(shell, "pi-fence-kroki-core", "yuzutech/kroki");
	programReadyKrokiContainer(shell, "pi-fence-kroki-mermaid", "yuzutech/mermaid");
}

function programPartialKrokiComposeSandbox(shell: FakeShellRunner): void {
	programReadyKrokiContainer(shell, "pi-fence-kroki-core", "yuzutech/kroki");
	programStoppedKrokiContainer(shell, "pi-fence-kroki-mermaid", "yuzutech/mermaid");
}

function programReadyKrokiContainer(shell: FakeShellRunner, containerName: string, image: string): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", containerName], {
		stdout: "true\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", containerName], {
		stdout: `${image}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse(
		"docker",
		["inspect", "--format", `{{ index .Config.Labels "pi-fence.sandbox" }}`, containerName],
		{ stdout: "kroki\n", stderr: "", exitCode: 0 },
	);
	const portsResponse = image === "yuzutech/mermaid"
		? JSON.stringify({ "8002/tcp": null })
		: JSON.stringify({ "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "8000" }] });
	shell.setResponse("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", containerName], {
		stdout: `${portsResponse}\n`,
		stderr: "",
		exitCode: 0,
	});
}

function programStoppedKrokiContainer(shell: FakeShellRunner, containerName: string, image: string): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", containerName], {
		stdout: "false\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", containerName], {
		stdout: `${image}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse(
		"docker",
		["inspect", "--format", `{{ index .Config.Labels "pi-fence.sandbox" }}`, containerName],
		{ stdout: "kroki\n", stderr: "", exitCode: 0 },
	);
}

function programReadyBundleSandbox(shell: FakeShellRunner, options: { dotPng?: Buffer; mermaidPng?: Buffer } = {}): void {
	const image = "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0";
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-bundle"], {
		stdout: "true\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-bundle"], {
		stdout: `${image}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse(
		"docker",
		["inspect", "--format", `{{ index .Config.Labels "pi-fence.sandbox" }}`, "pi-fence-bundle"],
		{ stdout: "bundle\n", stderr: "", exitCode: 0 },
	);
	shell.setResponse("docker", ["inspect", "--format", "{{.HostConfig.NetworkMode}}", "pi-fence-bundle"], {
		stdout: "none\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", "pi-fence-bundle"], {
		stdout: "null\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .Mounts}}", "pi-fence-bundle"], {
		stdout: '[{"Type":"tmpfs","Destination":"/tmp"}]\n',
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .HostConfig.CapDrop}}", "pi-fence-bundle"], {
		stdout: '["ALL"]\n',
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .HostConfig.CapAdd}}", "pi-fence-bundle"], {
		stdout: "null\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.HostConfig.Privileged}}", "pi-fence-bundle"], {
		stdout: "false\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .HostConfig.SecurityOpt}}", "pi-fence-bundle"], {
		stdout: '["no-new-privileges"]\n',
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["exec", "pi-fence-bundle", "cat", BUNDLE_MANIFEST_PATH], {
		stdout: JSON.stringify({
			name: "pi-fence-bundle",
			version: "0.1.0",
			tools: {
				dot: { command: "dot", versionCommand: ["dot", "-V"] },
				mmdc: { command: "mmdc", versionCommand: ["mmdc", "--version"] },
			},
		}),
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["exec", "pi-fence-bundle", "dot", "-V"], {
		stdout: "",
		stderr: "dot - graphviz version 10.0.0",
		exitCode: 0,
	});
	shell.setResponse("docker", ["exec", "pi-fence-bundle", "mmdc", "--version"], {
		stdout: "11.0.0\n",
		stderr: "",
		exitCode: 0,
	});
	if (options.dotPng) {
		shell.setResponse("docker", ["exec", "-i", "pi-fence-bundle", "dot", "-Tpng"], {
			stdout: options.dotPng.toString("binary"),
			stdoutBuffer: options.dotPng,
			stderr: "",
			exitCode: 0,
		});
	}
	if (options.mermaidPng) {
		shell.setResponse("docker", ["exec", "pi-fence-bundle", "mktemp", "-d", "/tmp/pi-fence-XXXXXX"], {
			stdout: "/tmp/pi-fence-test\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse(
			"docker",
			["exec", "-i", "pi-fence-bundle", "sh", "-c", "cat > \"$1\"", "sh", "/tmp/pi-fence-test/input.mmd"],
			{ stdout: "", stderr: "", exitCode: 0 },
		);
		shell.setResponse(
			"docker",
			[
				"exec",
				"pi-fence-bundle",
				"mmdc",
				"-i",
				"/tmp/pi-fence-test/input.mmd",
				"-o",
				"/tmp/pi-fence-test/output.png",
				"-b",
				"transparent",
				"-p",
				"/opt/pi-fence-bundle/puppeteer-config.json",
			],
			{ stdout: "", stderr: "", exitCode: 0 },
		);
		shell.setResponse("docker", ["exec", "pi-fence-bundle", "cat", "/tmp/pi-fence-test/output.png"], {
			stdout: options.mermaidPng.toString("binary"),
			stdoutBuffer: options.mermaidPng,
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["exec", "pi-fence-bundle", "rm", "-rf", "--", "/tmp/pi-fence-test"], {
			stdout: "",
			stderr: "",
			exitCode: 0,
		});
	}
}

function filterPiFenceOutputs(messages: CapturedCustomMessage[]): CapturedCustomMessage[] {
	return messages.filter((m) => m.customType === "pi-fence:output");
}

function expectImageBytes(content: unknown, expectedBytes: Buffer): void {
	const items = content as Array<{ type: string; data?: string; mimeType?: string }>;
	const imageItem = items.find((c) => c.type === "image");
	expect(imageItem).toBeDefined();
	expect(imageItem?.mimeType).toBe("image/png");
	expect(imageItem?.data).toBeDefined();
	const decoded = Buffer.from(imageItem?.data ?? "", "base64");
	expect(Buffer.compare(decoded, expectedBytes)).toBe(0);
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
async function buildSessionWithExtension(
	http: FakeHttpClient,
	shell?: FakeShellRunner,
	configOptions?: LoadConfigOptions,
	extraExtensionFactories?: Array<(pi: ExtensionAPI) => void | Promise<void>>,
	runtimeDeps?: { gondolin?: GondolinVMFactory },
): Promise<{
	session: Awaited<ReturnType<typeof createAgentSession>>["session"];
	sentCustomMessages: CapturedCustomMessage[];
	registeredRenderers: Map<string, CapturedRenderer>;
	model: Model<any>;
	logger: FakeLogger;
}> {
	const logger = new FakeLogger();
	const sentCustomMessages: CapturedCustomMessage[] = [];
	const registeredRenderers = new Map<string, CapturedRenderer>();

	const agentDir = makeTempDir("pi-fence-ext-");
	const authStorage = AuthStorage.create(`${agentDir}/auth.json`);
	authStorage.setRuntimeApiKey("anthropic", "test-key-not-used");

	const model = getModel("anthropic", "claude-sonnet-4-5");
	if (!model) throw new Error("anthropic/claude-sonnet-4-5 model not found in built-in registry");

	const extensionFactory = async (pi: ExtensionAPI): Promise<void> => {
		const originalSendMessage = pi.sendMessage.bind(pi);
		pi.sendMessage = ((
			message: Parameters<ExtensionAPI["sendMessage"]>[0],
			options?: Parameters<ExtensionAPI["sendMessage"]>[1],
		) => {
			sentCustomMessages.push({
				customType: message.customType,
				content: message.content,
				details: message.details,
				options: options as CapturedCustomMessage["options"],
			});
			return originalSendMessage(message, options);
		}) as ExtensionAPI["sendMessage"];

		const originalRegisterMessageRenderer = pi.registerMessageRenderer.bind(pi);
		pi.registerMessageRenderer = ((customType: string, renderer: unknown) => {
			registeredRenderers.set(customType, renderer as CapturedRenderer);
			return originalRegisterMessageRenderer(
				customType,
				renderer as Parameters<ExtensionAPI["registerMessageRenderer"]>[1],
			);
		}) as ExtensionAPI["registerMessageRenderer"];

		// Default shell: `dot -V` fails with exit 127 so graphviz-host
		// probes as unavailable at wire time, leaving Kroki as the sole
		// processor for every tag — matches CV0.E1 behaviour for the
		// inherited test cases that don't specifically exercise
		// graphviz-host. Tests that need graphviz-host available pass
		// an explicit `shell` through `buildSessionWithExtension`.
		const shellToUse =
			shell ??
			new FakeShellRunner({
				stdout: "",
				stderr: "dot: not found",
				exitCode: 127,
			});
		await createPiFenceExtension(pi, {
			http,
			shell: shellToUse,
			logger,
			...(configOptions !== undefined ? { configOptions } : {}),
			...runtimeDeps,
		});
	};

	const settingsManager = SettingsManager.create(agentDir, agentDir);
	const resourceLoader = new DefaultResourceLoader({
		cwd: agentDir,
		agentDir,
		settingsManager,
		extensionFactories: [extensionFactory, ...(extraExtensionFactories ?? [])],
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

	return { session, sentCustomMessages, registeredRenderers, model, logger };
}

/**
 * Stand up a real AgentSession with pi-fence loaded as an inline factory,
 * run `assistantText` through a canned stream, and return captured custom
 * messages.
 */
async function runExtensionWithAssistantText(
	http: FakeHttpClient,
	assistantText: string,
	shell?: FakeShellRunner,
	configOptions?: LoadConfigOptions,
	extraExtensionFactories?: Array<(pi: ExtensionAPI) => void | Promise<void>>,
	runtimeDeps?: { gondolin?: GondolinVMFactory },
): Promise<Captured> {
	const { session, sentCustomMessages, registeredRenderers, model, logger } =
		await buildSessionWithExtension(http, shell, configOptions, extraExtensionFactories, runtimeDeps);

	session.agent.streamFn = cannedAssistantStream(model, assistantText);

	try {
		await session.prompt("render it");
	} finally {
		session.dispose();
	}

	// Wait a tick for any deferred sendMessage calls triggered by agent_end
	// to settle.
	await new Promise((r) => setTimeout(r, 50));

	return { sentCustomMessages, registeredRenderers, logger };
}

/**
 * Stand up a real AgentSession with pi-fence loaded and dispatch a slash
 * command through `session.prompt("/...")`. AgentSession routes commands
 * straight to the registered handler without involving the LLM, so no
 * stream is needed.
 */
async function runExtensionWithCommand(
	http: FakeHttpClient,
	command: string,
	shell?: FakeShellRunner,
	configOptions?: LoadConfigOptions,
	runtimeDeps?: { gondolin?: GondolinVMFactory },
): Promise<Captured> {
	const { session, sentCustomMessages, registeredRenderers, logger } = await buildSessionWithExtension(
		http,
		shell,
		configOptions,
		undefined,
		runtimeDeps,
	);

	try {
		await session.prompt(command);
	} finally {
		session.dispose();
	}

	await new Promise((r) => setTimeout(r, 50));

	return { sentCustomMessages, registeredRenderers, logger };
}

function cannedAssistantStream(_model: Model<any>, text: string) {
	return (
		activeModel: Model<any>,
		_context: unknown,
		_options?: unknown,
	) => {
		// Real providers construct an AssistantMessageEventStream (a class,
		// not a plain async iterable) and push events into it while mutating
		// `output.content[i]` in place. We mirror the minimum of that
		// protocol for a text-only response. The completion event is
		// `type: "done"`, after which `stream.end()` releases any waiting
		// consumers.
		const stream = createAssistantMessageEventStream();
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

		const push = (event: unknown) => {
			stream.push(event as Parameters<typeof stream.push>[0]);
		};
		push({ type: "start", partial: output });
		push({ type: "text_start", contentIndex: 0, partial: output });
		textBlock.text = text;
		push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
		push({ type: "text_end", contentIndex: 0, content: text, partial: output });
		push({ type: "done", reason: "stop", message: output });
		stream.end();

		return stream;
	};
}
