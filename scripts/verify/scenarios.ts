/**
 * Scenario registry consumed by `pnpm render:verify` and by the
 * Render Image live-suite test (`tests/render-image/verify.test.ts`).
 *
 * A scenario is a named bundle of "what pi-fence render are we
 * verifying, at what dimensions." The registry only produces the
 * byte stream; painting it through xterm.js + `@xterm/addon-image`
 * in headless Chromium and screenshotting the result is the
 * pipeline's job (`./pipeline.ts`). Keeping the registry pipeline-
 * agnostic means a future variant that paints into wterm instead of
 * xterm.js (see the CVx.E2 a11y spike) can consume the same
 * scenarios unchanged.
 *
 * Adding a scenario:
 *   1. Commit any required fixture PNGs under `tests/fixtures/`.
 *   2. Write a `build()` function that captures the bytes via the
 *      render-layer harness shared with the fast suite
 *      (`tests/utilities/render.ts` → `paintComponent`).
 *   3. Append to `SCENARIOS`.
 *
 * Removing or renaming a scenario is a breaking change: the CLI,
 * the test file, and the committed golden PNG all key off the
 * scenario `name`.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
	AssistantMessageComponent,
	CustomMessageComponent,
	UserMessageComponent,
	initTheme,
} from "@mariozechner/pi-coding-agent";
import { Box, Container, Image, Spacer, Text, setCapabilities, truncateToWidth } from "@mariozechner/pi-tui";

import { createPiFenceMessageRenderer } from "../../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../../tests/utilities/render.ts";

export interface Variant {
	/** Unique within a Scenario; keys the golden file at
	 *  `tests/fixtures/golden/<scenario>/<variant>.png`. */
	readonly name: string;
	readonly cols: number;
	readonly rows: number;
}

export interface Scenario {
	/** Unique key. Used as `pnpm render:verify --scenario <name>` and
	 *  as the subdir of `scripts/out/render-verify/` + `tests/fixtures/golden/`. */
	readonly name: string;

	/** One-line human description. Printed by `--list`. */
	readonly description: string;

	/** At least one variant. The verifier iterates every variant; tests
	 *  pixel-diff each variant against its own committed golden. */
	readonly variants: readonly Variant[];

	/** Produce the byte stream for the given variant. Dimensions flow
	 *  from the variant into pi-fence's paintComponent so the emitted
	 *  bytes reflect the target viewport's layout. */
	build(variant: Variant): Promise<{ bytes: string }>;
}

export const DEFAULT_VARIANT: Variant = {
	name: "default",
	cols: 120,
	rows: 60,
};

/**
 * 80-column variant. Exercises pi-fence's layout at the narrower
 * terminal width many users actually run. paddingX=1 on the
 * pi-fence:output box plus the 60-cell image max-width still fits,
 * but the chrome lives in a tighter horizontal budget.
 */
export const NARROW_VARIANT: Variant = {
	name: "narrow",
	cols: 80,
	rows: 30,
};

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * A minimal `CustomMessage` shape for pi-fence's output — enough for
 * `CustomMessageComponent` to forward to `createPiFenceMessageRenderer`
 * without importing pi-coding-agent's `CustomMessage<T>` internal type.
 * Kept inline so the helper stays decoupled from pi's message-entry shape.
 */
export type PiFenceCustomMessage = {
	role: "custom";
	customType: string;
	content: Array<
		| { type: "image"; data: string; mimeType: string }
		| { type: "text"; text: string }
	>;
	display: boolean;
	details: {
		tag: string;
		processor: string;
		kind: "ok" | "error";
		source: string;
	};
	timestamp: number;
};

/**
 * Compose a full user → assistant → pi-fence:output byte stream through
 * pi-coding-agent's real interactive-mode components, the exact shape a
 * pi user sees in their terminal for a single turn.
 *
 * Previously only the `mermaid-user-agent-trail` scenario rendered at
 * this level; `mermaid-happy-path` and `mermaid-error-path` painted
 * pi-fence's renderer in isolation. Post CVx.E2.S4 close, all Render
 * Image scenarios standardise on the trail shape — the Render Image
 * layer's job is "what does a pi user actually see?" and the user
 * never sees our renderer standalone. Renderer-in-isolation coverage
 * lives at the faster Render layer (`tests/unit/renderer.test.ts`,
 * `tests/extension/pi-fence.test.ts`), which paints via
 * `VirtualTerminal` and asserts on byte-stream shape.
 *
 * Theme bootstrap: pi-coding-agent components read pi's runtime theme
 * singleton via a `Proxy` that throws `Theme not initialized.` if
 * never initialised. `initTheme("dark")` inside the helper mirrors the
 * `setCapabilities` pattern: scenario-local, idempotent across calls,
 * no hidden test-runner setup. The builtin `dark` theme loads by name
 * with no filesystem side-effect beyond pi-coding-agent's bundled
 * `dark.json`.
 *
 * Determinism pins: `timestamp: 0` and zero `usage` on the synthetic
 * `AssistantMessage` guard against drift if the component ever surfaces
 * those fields in chrome. Two consecutive renders on the calibration
 * machine produce byte-identical PNGs.
 */
export async function buildTrail(
	userText: string,
	assistantMarkdown: string,
	customMessage: PiFenceCustomMessage,
	variant: Variant,
): Promise<{ bytes: string }> {
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
	initTheme("dark");

	const userComponent = new UserMessageComponent(userText);

	const assistantMsg: AssistantMessage = {
		role: "assistant",
		content: [{ type: "text", text: assistantMarkdown }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp: 0,
	};
	const assistantComponent = new AssistantMessageComponent(assistantMsg);

	const renderer = createPiFenceMessageRenderer({
		Box,
		Text,
		Spacer,
		Image,
		truncateToWidth,
	});
	const customComponent = new CustomMessageComponent(customMessage, renderer);

	const root = new Container();
	root.addChild(userComponent);
	root.addChild(new Spacer(1));
	root.addChild(assistantComponent);
	root.addChild(new Spacer(1));
	root.addChild(customComponent);

	const terminal = await paintComponent(root, variant.cols, variant.rows);
	return { bytes: terminal.getWrites() };
}

/**
 * Happy-path: user asks for a mermaid flowchart, assistant replies
 * with a fenced mermaid block, pi-fence:output panel shows the
 * Kroki-rendered PNG. Emits the Kitty graphics APC.
 */
async function buildMermaidHappyPath(
	variant: Variant,
): Promise<{ bytes: string }> {
	const pngPath = join(REPO_ROOT, "tests/fixtures/mermaid-flowchart.png");
	const pngBase64 = (await readFile(pngPath)).toString("base64");

	return buildTrail(
		"Show me a mermaid flowchart of A → B → C.",
		"Here's the diagram:\n\n```mermaid\nflowchart LR\n  A --> B\n  B --> C\n```",
		{
			role: "custom",
			customType: "pi-fence:output",
			content: [{ type: "image", data: pngBase64, mimeType: "image/png" }],
			display: true,
			details: {
				tag: "mermaid",
				processor: "kroki-remote",
				kind: "ok",
				source: "flowchart LR\n  A --> B\n  B --> C",
			},
			timestamp: 0,
		},
		variant,
	);
}

/**
 * Tall-image: user asks for a wireviz connector harness, assistant
 * replies with the fenced `wireviz` YAML block, pi-fence:output shows
 * the Kroki-rendered PNG — visually the tallest of the Kroki text
 * languages. Pressure-tests the trail composition with much more
 * vertical content than the mermaid-happy-path PNG (which is nearly
 * square), so layout regressions that only manifest at larger image
 * heights have somewhere to surface.
 *
 * Kept as a separate scenario rather than a variant on
 * `mermaid-happy-path` because the WHOLE trail differs: user prompt,
 * assistant source, tag, processor — all of it is content the
 * pi-coding-agent bubbles paint. A variant is for "same content,
 * different viewport"; this is a different scenario entirely.
 */
async function buildKrokiTallImage(
	variant: Variant,
): Promise<{ bytes: string }> {
	const pngPath = join(REPO_ROOT, "tests/fixtures/wireviz-harness.png");
	const pngBase64 = (await readFile(pngPath)).toString("base64");

	const source =
		"connectors:\n" +
		"  X1:\n" +
		"    type: D-Sub\n" +
		"    subtype: female\n" +
		"    pinlabels: [DCD, RX, TX, DTR, GND]\n" +
		"\n" +
		"cables:\n" +
		"  W1:\n" +
		"    wirecount: 5\n" +
		"    length: 0.2\n" +
		"    color_code: DIN\n" +
		"\n" +
		"connections:\n" +
		"  -\n" +
		"    - X1: [1-5]\n" +
		"    - W1: [1-5]";

	return buildTrail(
		"Show me a wireviz harness diagram for a 5-pin D-Sub to a DIN cable.",
		"Here's the harness:\n\n```wireviz\n" + source + "\n```",
		{
			role: "custom",
			customType: "pi-fence:output",
			content: [{ type: "image", data: pngBase64, mimeType: "image/png" }],
			display: true,
			details: {
				tag: "wireviz",
				processor: "kroki-remote",
				kind: "ok",
				source,
			},
			timestamp: 0,
		},
		variant,
	);
}

/**
 * Error-path: user asks for a diagram, assistant replies with a
 * fenced mermaid block that has a typo (`flowchrt` instead of
 * `flowchart`), pi-fence:output surfaces Kroki's parse error.
 * Text content only — no image — so no Kitty APC emits.
 */
async function buildMermaidErrorPath(
	variant: Variant,
): Promise<{ bytes: string }> {
	return buildTrail(
		"Draw me a simple flowchart, please.",
		"Sure — here's the diagram:\n\n```mermaid\nflowchrt LR\n  A --> B\n```",
		{
			role: "custom",
			customType: "pi-fence:output",
			content: [
				// Just the raw upstream error body — the pi-fence renderer's
				// red header already labels this as "Error rendering mermaid
				// via kroki-remote" from `details`, so re-speaking that prefix in the
				// body produces a visible duplicate.
				{
					type: "text",
					text: "Parse error on line 1: unknown tag 'flowchrt'",
				},
			],
			display: true,
			details: {
				tag: "mermaid",
				processor: "kroki-remote",
				kind: "error",
				source: "flowchrt LR\n  A --> B",
			},
			timestamp: 0,
		},
		variant,
	);
}

export const SCENARIOS: readonly Scenario[] = [
	{
		name: "mermaid-happy-path",
		description:
			"Trail: user prompt → assistant reply with fenced mermaid block → pi-fence:output panel with the Kroki-rendered PNG.",
		variants: [DEFAULT_VARIANT, NARROW_VARIANT],
		build: buildMermaidHappyPath,
	},
	{
		name: "mermaid-error-path",
		description:
			"Trail: user prompt → assistant reply with a broken mermaid block → pi-fence:output panel showing Kroki's parse error (text content, no image).",
		variants: [DEFAULT_VARIANT, NARROW_VARIANT],
		build: buildMermaidErrorPath,
	},
	{
		name: "kroki-tall-image",
		description:
			"Trail with a visually-tall PNG (wireviz harness, ≥26 KB, one of the tallest Kroki languages). Pressure-tests pi-fence's layout for regressions that only surface at larger image extents.",
		variants: [DEFAULT_VARIANT],
		build: buildKrokiTallImage,
	},
];

export function listScenarios(): readonly Scenario[] {
	return SCENARIOS;
}

export function getScenario(name: string): Scenario {
	const found = SCENARIOS.find((s) => s.name === name);
	if (!found) {
		const registered = SCENARIOS.map((s) => s.name).join(", ") || "(none)";
		throw new Error(
			`Unknown scenario: ${name}. Registered scenarios: ${registered}.`,
		);
	}
	return found;
}
