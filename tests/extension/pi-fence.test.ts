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
import {
	GRAPHVIZ_LOCAL_ALIASES,
	GRAPHVIZ_LOCAL_CANONICAL_TAGS,
} from "../../extensions/pi-fence/graphviz-local.ts";
import { KROKI_ALIASES, KROKI_CANONICAL_TAGS } from "../../extensions/pi-fence/kroki.ts";
import { formatProcessorLines } from "../../extensions/pi-fence/list.ts";

import { createPiFenceExtension } from "../../extensions/pi-fence/index.ts";
import { forceCapabilities } from "../utilities/force-capabilities.ts";
import { FakeHttpClient, type HttpResponse } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

// Node std imports for the bindings fixtures (temp-dir config files).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { paintComponent } from "../utilities/render.ts";
import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";
import { LoggingVirtualTerminal } from "../utilities/virtual-terminal.ts";

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
				processor: "kroki",
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
					line.includes("Rendered mermaid via kroki"),
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
				processor: "kroki",
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
			expect(fenceEntries.find((e) => e.message.includes("rendering block"))).toBeDefined();
			expect(
				fenceEntries.find((e) => e.level === "info" && e.message.includes("block rendered")),
			).toBeDefined();

			// Kroki processor traced request + response.
			const krokiEntries = logger.bySubsystem("kroki");
			expect(krokiEntries.filter((e) => e.level === "debug").length).toBeGreaterThanOrEqual(2);
		},
		20_000,
	);
});

describe("pi-fence extension — /fence list command through AgentSession", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"emits a pi-fence:list custom message describing both processors — graphviz-local unavailable + kroki registered",
		async () => {
			// Default test shell has `dot -V` failing with exit 127 so
			// graphviz-local probes as unavailable and Kroki still serves
			// every tag. Asserts the full CV0.E2 two-processor shape:
			// graphviz-local first with [unavailable] status + reason +
			// installHint; kroki second with [registered].
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

			expect(details.listings).toHaveLength(2);
			expect(details.listings[0]).toMatchObject({
				id: "graphviz-local",
				status: "unavailable",
				tags: GRAPHVIZ_LOCAL_CANONICAL_TAGS,
				aliases: GRAPHVIZ_LOCAL_ALIASES,
			});
			expect(details.listings[0].unavailableReason).toBeDefined();
			expect(details.listings[0].installHint).toContain("graphviz");
			expect(details.listings[1]).toMatchObject({
				id: "kroki",
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

describe("pi-fence extension — graphviz-local vs kroki resolution", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"renders a `dot` block via graphviz-local when `dot` is on PATH — zero HTTP traffic",
		async () => {
			// Shell programmed so:
			//   - `dot -V` exits 0 (graphviz-local probes as available).
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
				processor: "graphviz-local",
				kind: "ok",
			});
			expectImageBytes(outputs[0].content, TINY_PNG);

			// Privacy/offline claim: no HTTP left the host for this tag.
			expect(http.requests).toHaveLength(0);

			// Shell-out shape: one probe (`dot -V`) + one render (`dot -Tpng`).
			expect(shell.calls).toHaveLength(2);
			expect(shell.calls[0]).toMatchObject({ cmd: "dot", args: ["-V"] });
			expect(shell.calls[1]).toMatchObject({
				cmd: "dot",
				args: ["-Tpng"],
				input: "digraph { web -> api; api -> db }",
			});
		},
		20_000,
	);

	it(
		"falls through to Kroki for a `dot` block when graphviz-local is unavailable",
		async () => {
			// Default test shell reports `dot` as not-found — graphviz-local
			// probes as unavailable and Kroki serves the graphviz tag per
			// the registration-order fallback rule. HTTP is programmed with
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
				processor: "kroki",
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
		"leaves mermaid blocks to Kroki regardless of graphviz-local availability",
		async () => {
			// Mermaid is a Kroki-only tag. Whether or not graphviz-local is
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
				processor: "kroki",
			});

			// Only the wire-time `dot -V` probe shelled out; no render-time
			// shell call because mermaid is not graphviz-local's tag.
			expect(shell.calls).toHaveLength(1);
			expect(shell.calls[0].args).toEqual(["-V"]);
		},
		20_000,
	);
});

describe("pi-fence extension — disabled processors (CV1.E1.S1)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"disabled kroki — mermaid block produces no pi-fence:output",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ disabled: ["kroki"] }),
			);

			const http = new FakeHttpClient();
			const captured = await runExtensionWithAssistantText(
				http,
				"```mermaid\nflowchart LR\nA --> B\n```",
				undefined,
				{ home, cwd: makeTempDir() },
			);

			// Kroki is the only processor for mermaid. Disabled → no output.
			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs).toHaveLength(0);
			// No HTTP — kroki was never called.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"/fence list shows disabled kroki as [disabled]",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ disabled: ["kroki"] }),
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

			const krokiListing = details.listings.find((l) => l.id === "kroki");
			expect(krokiListing?.status).toBe("disabled");
			expect(details.lines.some((l) => l.includes("[disabled]"))).toBe(true);
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
				processor: "kroki",
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
});

describe("pi-fence extension — user-level per-tag bindings (CV0.E2.S2)", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it(
		"global config binds graphviz to kroki — dot block goes through kroki even when dot is installed",
		async () => {
			// Shell: graphviz-local probes as available. Config: binds
			// graphviz → kroki. Expect kroki to serve the block despite
			// graphviz-local being available — the binding overrides
			// capability-based resolution.
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
				JSON.stringify({ bindings: { graphviz: "kroki", dot: "kroki" } }),
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
				processor: "kroki",
				kind: "ok",
			});

			// Kroki served it — one HTTP request.
			expect(http.requests).toHaveLength(1);
			expect(http.requests[0].url).toBe("https://kroki.io/graphviz/png?theme=dark");

			// graphviz-local got its wire-time probe and nothing else — the
			// binding steered around the render-time shell-out.
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(0);
		},
		20_000,
	);

	it(
		"project config overrides global config",
		async () => {
			// Global: graphviz → kroki. Project: graphviz → graphviz-local.
			// Expect graphviz-local to win (project precedence).
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
				JSON.stringify({ bindings: { graphviz: "kroki" } }),
			);

			const cwd = makeTempDir();
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(
				join(cwd, ".pi", "pi-fence.config.json"),
				JSON.stringify({ bindings: { graphviz: "graphviz-local" } }),
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
				processor: "graphviz-local",
			});

			// graphviz-local served it — one probe + one render shell-out.
			expect(shell.calls.filter((c) => c.args.includes("-Tpng"))).toHaveLength(1);
			// No Kroki HTTP — project-level binding steered to local.
			expect(http.requests).toHaveLength(0);
		},
		20_000,
	);

	it(
		"binding to an unknown processor id is ignored and logs a warn — capability-based resolution applies",
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
				JSON.stringify({ bindings: { dot: "nonexistent" } }),
			);

			const http = new FakeHttpClient();

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				shell,
				{ home, cwd: makeTempDir() },
			);

			// Capability-based fallback: graphviz-local is first registered
			// + available, so it wins.
			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "graphviz-local",
			});

			// Ignored-binding logged at warn level.
			const logger = captured.logger!;
			const warns = logger
				.bySubsystem("pi-fence")
				.filter((e) => e.level === "warn" && e.message === "binding ignored");
			expect(warns).toHaveLength(1);
			expect(warns[0].meta).toMatchObject({
				tag: "dot",
				processorId: "nonexistent",
				reason: "unknown-processor",
			});
		},
		20_000,
	);

	it(
		"binding to an unavailable processor falls through to capability — logs ignore-reason",
		async () => {
			// Default test shell: dot -V fails. graphviz-local is
			// unavailable. Config binds graphviz to graphviz-local anyway.
			// Expect the binding to be ignored (bindings are preferences,
			// not hard requirements) and Kroki to serve via capability.
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({ bindings: { graphviz: "graphviz-local" } }),
			);

			const http = makeKrokiHttp({ "https://kroki.io/graphviz/png?theme=dark": TINY_PNG });

			const captured = await runExtensionWithAssistantText(
				http,
				"```dot\ndigraph { A -> B }\n```",
				undefined, // default shell — dot unavailable
				{ home, cwd: makeTempDir() },
			);

			const outputs = filterPiFenceOutputs(captured.sentCustomMessages);
			expect(outputs[0].details).toMatchObject({
				tag: "dot",
				processor: "kroki",
			});

			// Kroki served it via capability fallback.
			expect(http.requests).toHaveLength(1);

			// Ignored-binding warn recorded.
			const logger = captured.logger!;
			const warns = logger
				.bySubsystem("pi-fence")
				.filter((e) => e.level === "warn" && e.message === "binding ignored");
			expect(warns).toHaveLength(1);
			expect(warns[0].meta).toMatchObject({
				tag: "graphviz",
				processorId: "graphviz-local",
				reason: "processor-unavailable",
			});
		},
		20_000,
	);

	it(
		"/fence list surfaces the Bindings + Ignored bindings sections",
		async () => {
			const home = makeTempDir();
			mkdirSync(join(home, ".pi", "agent"), { recursive: true });
			writeFileSync(
				join(home, ".pi", "agent", "pi-fence.config.json"),
				JSON.stringify({
					bindings: {
						mermaid: "kroki",
						graphviz: "nonexistent",
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
					status: "effective" | "ignored";
					tag: string;
					processorId: string;
					reason?: string;
				}>;
			};

			// bindings rows carried on the details payload.
			expect(details.bindings).toHaveLength(2);
			expect(details.bindings.find((b) => b.tag === "mermaid")).toMatchObject({
				status: "effective",
				processorId: "kroki",
			});
			expect(details.bindings.find((b) => b.tag === "graphviz")).toMatchObject({
				status: "ignored",
				processorId: "nonexistent",
				reason: "unknown-processor",
			});

			// lines array reflects the section structure.
			expect(details.lines).toContain("Bindings");
			expect(details.lines).toContain("Ignored bindings");
			expect(details.lines.some((l) => l.includes("mermaid → kroki"))).toBe(true);
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
async function buildSessionWithExtension(
	http: FakeHttpClient,
	shell?: FakeShellRunner,
	configOptions?: LoadConfigOptions,
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

		// Default shell: `dot -V` fails with exit 127 so graphviz-local
		// probes as unavailable at wire time, leaving Kroki as the sole
		// processor for every tag — matches CV0.E1 behaviour for the
		// inherited test cases that don't specifically exercise
		// graphviz-local. Tests that need graphviz-local available pass
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
		});
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
): Promise<Captured> {
	const { session, sentCustomMessages, registeredRenderers, model, logger } =
		await buildSessionWithExtension(http, shell, configOptions);

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
): Promise<Captured> {
	const { session, sentCustomMessages, registeredRenderers } = await buildSessionWithExtension(
		http,
		shell,
		configOptions,
	);

	try {
		await session.prompt(command);
	} finally {
		session.dispose();
	}

	await new Promise((r) => setTimeout(r, 50));

	return { sentCustomMessages, registeredRenderers };
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
