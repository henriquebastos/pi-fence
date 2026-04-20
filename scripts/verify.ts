/**
 * `pnpm render:verify` entry point.
 *
 * Drives `scripts/verify/pipeline.ts` against `scripts/verify/scenarios.ts`,
 * writes the resulting PNG(s) under
 * `<outDir>/<scenario>/<variant>/render.png`, emits a per-run
 * gallery at `<outDir>/index.html`, and optionally updates the
 * committed golden(s) at `tests/fixtures/golden/<scenario>/<variant>.png`
 * when invoked with `--update`.
 *
 * Flags:
 *   --list                     Print the registered scenarios and variants, exit.
 *   --scenario <name>          Restrict to one scenario (default: all registered).
 *   --variant <name>           Restrict to one variant; requires --scenario.
 *   --update                   Copy each rendered PNG over its golden slot.
 *   --out <dir>                Override output directory (default: scripts/out/render-verify).
 *   --help, -h                 Print usage and exit.
 *
 * Exit codes:
 *   0   success / --list / --help
 *   1   argument parse error / unknown scenario or variant / --variant without --scenario
 *   2   pipeline failure (browser launch, etc.)
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { renderGalleryHtml, type GalleryCard } from "./verify/gallery.ts";
import {
	expandCombos,
	renderCombos,
	type Combo,
} from "./verify/pipeline.ts";
import { getScenario, listScenarios, type Scenario, type Variant } from "./verify/scenarios.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(REPO_ROOT, "scripts/out/render-verify");
const GOLDEN_DIR = join(REPO_ROOT, "tests/fixtures/golden");

interface Args {
	scenario?: string;
	variant?: string;
	out: string;
	update: boolean;
	list: boolean;
	help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
	const args: Args = {
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
			case "--variant": {
				const value = argv[++i];
				if (!value) throw new Error("--variant requires a value");
				args.variant = value;
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
			"  --scenario <name>   Restrict to one scenario (default: all)\n" +
			"  --variant <name>    Restrict to one variant; requires --scenario\n" +
			"  --list              Print registered scenarios + variants and exit\n" +
			"  --update            Overwrite the committed golden(s) with this run's PNG(s)\n" +
			"  --out <dir>         Output directory (default: scripts/out/render-verify)\n" +
			"  -h, --help          Print this help and exit\n",
	);
}

function selectCombos(args: Args): Combo[] {
	if (!args.scenario && !args.variant) {
		return expandCombos(listScenarios());
	}

	if (args.variant && !args.scenario) {
		throw new Error(
			`--variant requires --scenario. Use '--list' to see scenarios and their variants.`,
		);
	}

	const scenario: Scenario = getScenario(args.scenario as string);
	if (!args.variant) {
		return scenario.variants.map((variant) => ({ scenario, variant }));
	}

	const variant: Variant | undefined = scenario.variants.find(
		(v) => v.name === args.variant,
	);
	if (!variant) {
		const names = scenario.variants.map((v) => v.name).join(", ") || "(none)";
		throw new Error(
			`Unknown variant '${args.variant}' on scenario '${scenario.name}'. Registered variants: ${names}.`,
		);
	}
	return [{ scenario, variant }];
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
			const variantNames = scenario.variants.map((v) => v.name).join(", ");
			process.stdout.write(`    variants: ${variantNames}\n`);
		}
		return;
	}

	let combos: Combo[];
	try {
		combos = selectCombos(args);
	} catch (err) {
		process.stderr.write(
			`[render:verify] ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	process.stderr.write(
		`[render:verify] rendering ${combos.length} combo${combos.length === 1 ? "" : "s"}:\n`,
	);
	for (const { scenario, variant } of combos) {
		process.stderr.write(`[render:verify]   ${scenario.name} / ${variant.name}\n`);
	}

	let results;
	try {
		results = await renderCombos(combos, args.out);
	} catch (err) {
		process.stderr.write(
			`[render:verify] pipeline error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		if (err instanceof Error && err.stack) {
			process.stderr.write(`${err.stack}\n`);
		}
		process.exit(2);
	}

	let totalMs = 0;
	for (const result of results) {
		totalMs += result.durationMs;
		process.stderr.write(
			`[render:verify] ${result.scenarioName} / ${result.variantName} rendered in ${result.durationMs}ms\n`,
		);
		process.stderr.write(
			`[render:verify]   wrote ${result.pngPath} (${result.cols}x${result.rows})\n`,
		);
	}
	process.stderr.write(
		`[render:verify] total: ${results.length} combo${results.length === 1 ? "" : "s"} in ${totalMs}ms\n`,
	);

	// Write the gallery. Paths inside index.html are relative to
	// args.out so the document travels cleanly (e.g. if someone
	// copies `scripts/out/render-verify/` into a review folder).
	// When a committed golden exists for a combo, surface its path
	// too so the gallery can show the rendered/golden toggle.
	const cards: GalleryCard[] = results.map((r) => {
		const goldenPath = join(
			GOLDEN_DIR,
			r.scenarioName,
			`${r.variantName}.png`,
		);
		return {
			scenarioName: r.scenarioName,
			variantName: r.variantName,
			pngRelativePath: relative(args.out, r.pngPath),
			goldenRelativePath: existsSync(goldenPath)
				? relative(args.out, goldenPath)
				: undefined,
			cols: r.cols,
			rows: r.rows,
		};
	});
	const galleryPath = join(args.out, "index.html");
	await mkdir(args.out, { recursive: true });
	await writeFile(galleryPath, renderGalleryHtml(cards), "utf8");
	process.stderr.write(`[render:verify] wrote gallery: ${galleryPath}\n`);

	if (args.update) {
		for (const result of results) {
			const scenarioGoldenDir = join(GOLDEN_DIR, result.scenarioName);
			await mkdir(scenarioGoldenDir, { recursive: true });
			const goldenPath = join(scenarioGoldenDir, `${result.variantName}.png`);
			await copyFile(result.pngPath, goldenPath);
			process.stderr.write(`[render:verify] updated golden: ${goldenPath}\n`);
		}
	}
}

main().catch((err) => {
	process.stderr.write(
		`[render:verify] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
	process.exit(2);
});
