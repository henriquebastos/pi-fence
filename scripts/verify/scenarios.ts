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

import { Box, Image, Spacer, Text, setCapabilities, truncateToWidth } from "@mariozechner/pi-tui";

import { createPiFenceMessageRenderer } from "../../extensions/pi-fence/renderer.ts";
import { paintComponent } from "../../tests/utilities/render.ts";

export interface Scenario {
	/** Unique key. Used as `pnpm render:verify --scenario <name>` and
	 *  as the subdir of `scripts/out/render-verify/` + `tests/fixtures/golden/`. */
	readonly name: string;

	/** One-line human description. Printed by `--list`. */
	readonly description: string;

	/** Produce the byte stream and the terminal dimensions this scenario
	 *  should render at. */
	build(): Promise<{ bytes: string; cols: number; rows: number }>;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const IDENTITY_THEME = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
	bg: (_color: string, text: string) => text,
};

/**
 * Build a `pi-fence:output` byte stream for a canned happy-path
 * mermaid render. Mirrors the shape `tests/unit/renderer.test.ts`
 * and `tests/extension/pi-fence.test.ts` produce in the fast suite,
 * so the bytes verifier and tests see are identical.
 */
async function buildMermaidHappyPath(): Promise<{
	bytes: string;
	cols: number;
	rows: number;
}> {
	// Pin capabilities so the Kitty graphics path emits deterministically
	// (matches the render-layer tests' forceCapabilities behaviour).
	setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });

	const pngPath = join(REPO_ROOT, "tests/fixtures/mermaid-flowchart.png");
	const pngBase64 = (await readFile(pngPath)).toString("base64");

	const renderer = createPiFenceMessageRenderer({
		Box,
		Text,
		Spacer,
		Image,
		truncateToWidth,
	});

	const component = renderer(
		{
			content: [{ type: "image", data: pngBase64, mimeType: "image/png" }],
			details: {
				tag: "mermaid",
				processor: "kroki",
				kind: "ok",
				source: "flowchart LR\n  A --> B\n  B --> C",
			},
		},
		{ expanded: false },
		IDENTITY_THEME,
	);

	const terminal = await paintComponent(component);
	return { bytes: terminal.getWrites(), cols: 120, rows: 60 };
}

export const SCENARIOS: readonly Scenario[] = [
	{
		name: "mermaid-happy-path",
		description:
			"pi-fence:output panel with a Kroki-rendered mermaid flowchart (A → B → C).",
		build: buildMermaidHappyPath,
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
