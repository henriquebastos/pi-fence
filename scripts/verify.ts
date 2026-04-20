/**
 * `pnpm render:verify` entry point.
 *
 * Drives `scripts/verify/pipeline.ts` against `scripts/verify/scenarios.ts`,
 * writes the resulting PNG to `scripts/out/render-verify/<scenario>/render.png`,
 * and optionally updates the committed golden at
 * `tests/fixtures/golden/<scenario>.png` when invoked with `--update`.
 *
 * Flags:
 *   --list                     Print the registered scenarios and exit.
 *   --scenario <name>          Render the named scenario (default: mermaid-happy-path).
 *   --update                   After rendering, copy the PNG over the golden.
 *   --out <dir>                Override output directory (default: scripts/out/render-verify).
 *   --help, -h                 Print usage and exit.
 *
 * Exit codes:
 *   0   success
 *   1   unknown scenario / bad argument
 *   2   pipeline failure (browser launch, etc.)
 */

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderScenario } from "./verify/pipeline.ts";
import { getScenario, listScenarios } from "./verify/scenarios.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(REPO_ROOT, "scripts/out/render-verify");
const GOLDEN_DIR = join(REPO_ROOT, "tests/fixtures/golden");
const DEFAULT_SCENARIO = "mermaid-happy-path";

interface Args {
	scenario: string;
	out: string;
	update: boolean;
	list: boolean;
	help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
	const args: Args = {
		scenario: DEFAULT_SCENARIO,
		out: DEFAULT_OUT,
		update: false,
		list: false,
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		switch (flag) {
			case "--help":
			case "-h":
				args.help = true;
				break;
			case "--list":
				args.list = true;
				break;
			case "--update":
				args.update = true;
				break;
			case "--scenario": {
				const value = argv[++i];
				if (!value) throw new Error("--scenario requires a value");
				args.scenario = value;
				break;
			}
			case "--out": {
				const value = argv[++i];
				if (!value) throw new Error("--out requires a value");
				args.out = value;
				break;
			}
			default:
				throw new Error(`Unknown argument: ${flag}`);
		}
	}
	return args;
}

function printUsage(): void {
	process.stdout.write(
		"Usage: pnpm render:verify [options]\n\n" +
			"Options:\n" +
			"  --scenario <name>   Scenario to render (default: mermaid-happy-path)\n" +
			"  --list              Print registered scenarios and exit\n" +
			"  --update            Overwrite the committed golden PNG with the new render\n" +
			"  --out <dir>         Output directory (default: scripts/out/render-verify)\n" +
			"  -h, --help          Print this help and exit\n",
	);
}

async function main(): Promise<void> {
	let args: Args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (err) {
		process.stderr.write(
			`[render:verify] ${err instanceof Error ? err.message : String(err)}\n`,
		);
		printUsage();
		process.exit(1);
	}

	if (args.help) {
		printUsage();
		return;
	}

	if (args.list) {
		const scenarios = listScenarios();
		process.stdout.write("Registered scenarios:\n");
		for (const scenario of scenarios) {
			process.stdout.write(`  ${scenario.name} — ${scenario.description}\n`);
		}
		return;
	}

	let scenario;
	try {
		scenario = getScenario(args.scenario);
	} catch (err) {
		process.stderr.write(
			`[render:verify] ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	process.stderr.write(
		`[render:verify] rendering scenario: ${scenario.name}\n`,
	);

	let result;
	try {
		result = await renderScenario(scenario, args.out);
	} catch (err) {
		process.stderr.write(
			`[render:verify] pipeline error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		if (err instanceof Error && err.stack) {
			process.stderr.write(`${err.stack}\n`);
		}
		process.exit(2);
	}

	process.stderr.write(
		`[render:verify] wrote ${result.pngPath}\n` +
			`[render:verify] captured bytes: ${result.bytesPath}\n` +
			`[render:verify] dimensions: ${result.cols}x${result.rows}\n`,
	);

	if (args.update) {
		await mkdir(GOLDEN_DIR, { recursive: true });
		const goldenPath = join(GOLDEN_DIR, `${scenario.name}.png`);
		await copyFile(result.pngPath, goldenPath);
		process.stderr.write(`[render:verify] updated golden: ${goldenPath}\n`);
	}
}

main().catch((err) => {
	process.stderr.write(
		`[render:verify] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
	process.exit(2);
});
