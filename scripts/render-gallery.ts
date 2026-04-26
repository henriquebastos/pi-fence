/**
 * `pnpm render:gallery` entry point.
 *
 * Renders one composition-level tile per canonical text-body Kroki
 * language (17 as of CV0.E1.S4), fetches each language's PNG from
 * `https://kroki.io` at runtime, and emits a browsable HTML gallery
 * at `scripts/out/render-gallery/index.html`.
 *
 * Different from `pnpm render:verify`:
 *   - **No goldens, no pixel-diff.** This is a documentation /
 *     marketing artefact, not a test gate.
 *   - **Network required.** The gallery is explicitly an online
 *     snapshot of what Kroki renders today for each language.
 *     Offline runs exit cleanly with a clear message.
 *   - **Dynamically-constructed scenarios.** Each language gets one
 *     in-memory Scenario (single default variant, 120\u00d760) built
 *     around the fetched PNG. Not added to the static scenario
 *     registry consumed by the test suite.
 *
 * Motivation: CV0.E1.S4 closed with 17 text-body Kroki languages
 * advertised in pi-fence's allowlist. Screenshotting each one through
 * the real pi-coding-agent trail composition gives reviewers and
 * users a visible proof that they all work, without turning the
 * Render Image test layer into a 17-scenario pixel-diff monitor that
 * would mostly re-test Kroki's image bytes (see
 * `docs/process/worklog.md`'s CV0.E1.S4 close entry for the full
 * design discussion).
 *
 * Flags:
 *   --out <dir>  Override output directory (default:
 *                scripts/out/render-gallery).
 *   --help, -h   Print usage and exit.
 *
 * Exit codes:
 *   0  success
 *   1  argument parse error
 *   2  network unavailable or fetch failure across all languages
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import {
	KROKI_TEXT_LANGUAGES,
	type KrokiTextLanguageSpec,
} from "../tests/fixtures/kroki/canonical-sources.ts";

import { renderGalleryHtml, type GalleryCard } from "./verify/gallery.ts";
import { renderCombos, type Combo } from "./verify/pipeline.ts";
import {
	buildTrail,
	type Scenario,
	type Variant,
} from "./verify/scenarios.ts";

/**
 * Dedicated gallery viewport. Wider and much taller than
 * `DEFAULT_VARIANT` (120×60) — some Kroki languages (notably `ditaa`)
 * render to very tall PNGs whose content pushes the user prompt and
 * assistant header off the top of the default viewport. 120×140
 * comfortably fits every observed language in a single tile; tall
 * overhead on short languages looks like benign trailing whitespace.
 */
const GALLERY_VARIANT: Variant = {
	name: "default",
	cols: 120,
	rows: 140,
};

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(REPO_ROOT, "scripts/out/render-gallery");
const KROKI_ENDPOINT = "https://kroki.io";
const FETCH_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 30_000;

interface CliArgs {
	outDir: string;
}

function usage(): string {
	return [
		"Usage: pnpm render:gallery [--out <dir>]",
		"",
		"Renders one tile per Kroki canonical text language through the full",
		"user \u2192 assistant \u2192 pi-fence:output trail composition. Fetches each",
		"PNG from kroki.io at runtime. Emits an HTML gallery at",
		"<outDir>/index.html (default: scripts/out/render-gallery).",
		"",
		"Not a test gate: no goldens, no pixel-diff. Re-run whenever you want",
		"a fresh showcase (README screenshots, PR previews, design review).",
	].join("\n");
}

function parseArgs(argv: string[]): CliArgs | { help: true } | { error: string } {
	const args: CliArgs = { outDir: DEFAULT_OUT };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") return { help: true };
		if (arg === "--out") {
			const value = argv[++i];
			if (!value) return { error: "--out requires a directory path" };
			args.outDir = value;
			continue;
		}
		return { error: `unknown argument: ${arg}` };
	}
	return args;
}

interface FetchedLanguage {
	spec: KrokiTextLanguageSpec;
	pngBase64: string;
	fetchMs: number;
}

interface FetchFailure {
	spec: KrokiTextLanguageSpec;
	reason: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function fetchOne(
	spec: KrokiTextLanguageSpec,
): Promise<FetchedLanguage | FetchFailure> {
	const start = performance.now();
	try {
		const res = await fetch(`${KROKI_ENDPOINT}/${spec.tag}/png`, {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: spec.source,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		const buf = Buffer.from(await res.arrayBuffer());
		if (!res.ok) {
			return {
				spec,
				reason: `HTTP ${res.status}: ${buf.toString("utf8", 0, 200).trim()}`,
			};
		}
		if (!buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
			return { spec, reason: "response missing PNG magic bytes" };
		}
		return {
			spec,
			pngBase64: buf.toString("base64"),
			fetchMs: Math.round(performance.now() - start),
		};
	} catch (err) {
		return {
			spec,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Fetch every language's PNG with a bounded concurrency. Avoids
 * hammering Kroki with 17 simultaneous requests (it's a shared
 * public instance) while still amortising round-trip time.
 */
async function fetchAll(
	specs: readonly KrokiTextLanguageSpec[],
): Promise<{ ok: FetchedLanguage[]; failed: FetchFailure[] }> {
	const ok: FetchedLanguage[] = [];
	const failed: FetchFailure[] = [];

	let cursor = 0;
	async function worker() {
		for (;;) {
			const i = cursor++;
			if (i >= specs.length) return;
			const spec = specs[i];
			if (spec === undefined) return;
			process.stderr.write(`  [${i + 1}/${specs.length}] fetching ${spec.tag}... `);
			const result = await fetchOne(spec);
			if ("pngBase64" in result) {
				process.stderr.write(`\u2713 ${result.fetchMs}ms\n`);
				ok.push(result);
			} else {
				process.stderr.write(`\u2717 ${result.reason}\n`);
				failed.push(result);
			}
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(FETCH_CONCURRENCY, specs.length) }, () =>
			worker(),
		),
	);
	// Preserve the original spec order for deterministic gallery layout.
	ok.sort(
		(a, b) =>
			specs.findIndex((s) => s.tag === a.spec.tag) -
			specs.findIndex((s) => s.tag === b.spec.tag),
	);
	return { ok, failed };
}

/**
 * Build an in-memory scenario that paints the full trail for one
 * language. Not registered in the static test registry; this is a
 * one-off per gallery run.
 */
function scenarioForLanguage(fetched: FetchedLanguage): Scenario {
	const { spec, pngBase64 } = fetched;
	return {
		name: spec.tag,
		description: `Gallery tile for the \`${spec.tag}\` Kroki canonical source.`,
		variants: [GALLERY_VARIANT],
		build: (variant) =>
			buildTrail(
				`Show me an example \`${spec.tag}\` diagram.`,
				`Here you go:\n\n\`\`\`${spec.tag}\n${spec.source}\n\`\`\``,
				{
					role: "custom",
					customType: "pi-fence:output",
					content: [
						{ type: "image", data: pngBase64, mimeType: "image/png" },
					],
					display: true,
					details: {
						tag: spec.tag,
						processor: "kroki-remote",
						kind: "ok",
						source: spec.source,
					},
					timestamp: 0,
				},
				variant,
			),
	};
}

async function main(): Promise<number> {
	const parsed = parseArgs(process.argv.slice(2));
	if ("help" in parsed) {
		console.log(usage());
		return 0;
	}
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage());
		return 1;
	}
	const { outDir } = parsed;

	console.error(
		`[render:gallery] fetching ${KROKI_TEXT_LANGUAGES.length} canonical sources from ${KROKI_ENDPOINT} (concurrency ${FETCH_CONCURRENCY})...`,
	);
	const { ok, failed } = await fetchAll(KROKI_TEXT_LANGUAGES);

	if (ok.length === 0) {
		console.error(
			`[render:gallery] no languages fetched successfully. Network unavailable or Kroki down. First failure: ${failed[0]?.reason ?? "(unknown)"}`,
		);
		return 2;
	}

	console.error(
		`[render:gallery] ${ok.length}/${KROKI_TEXT_LANGUAGES.length} PNGs in hand` +
			(failed.length > 0
				? ` (${failed.length} failed: ${failed.map((f) => f.spec.tag).join(", ")})`
				: ""),
	);

	const scenarios = ok.map(scenarioForLanguage);
	const combos: Combo[] = scenarios.map((scenario) => ({
		scenario,
		variant: GALLERY_VARIANT,
	}));

	console.error(
		`[render:gallery] rendering ${combos.length} Chromium tiles (serialised in one browser)...`,
	);
	const results = await renderCombos(combos, outDir);

	// Tall viewport means short languages render with most of their
	// tile as trailing black background. Crop each PNG to its last
	// non-empty row + a small bottom margin so the gallery grid shows
	// compact tiles without the black padding.
	console.error(`[render:gallery] cropping trailing whitespace on ${results.length} tiles...`);
	for (const result of results) {
		const cropped = await cropTrailingBlack(result.pngPath);
		if (cropped) {
			process.stderr.write(
				`  ${result.scenarioName}: ${cropped.before}px → ${cropped.after}px\n`,
			);
		}
	}

	const cards: GalleryCard[] = results.map((result) => ({
		scenarioName: result.scenarioName,
		variantName: result.variantName,
		pngRelativePath: relative(outDir, result.pngPath),
		cols: result.cols,
		rows: result.rows,
	}));

	await mkdir(outDir, { recursive: true });
	const html = renderGalleryHtml(cards, {
		title: "pi-fence \u2014 Kroki language gallery",
		emptyHint:
			"No tiles rendered. Invoke <code>pnpm render:gallery</code> with network access to kroki.io.",
	});
	const htmlPath = join(outDir, "index.html");
	await writeFile(htmlPath, html, "utf8");

	console.error(
		`[render:gallery] wrote ${cards.length} tiles to ${outDir}, gallery at ${htmlPath}`,
	);
	if (failed.length > 0) {
		console.error(
			`[render:gallery] ${failed.length} language(s) skipped due to fetch failure:`,
		);
		for (const f of failed) {
			console.error(`  - ${f.spec.tag}: ${f.reason}`);
		}
	}
	return 0;
}

/**
 * Crop trailing near-black rows from a rendered PNG, keeping a small
 * bottom margin. Returns { before, after } pixel heights when cropped,
 * or null when no trailing black was found (already tight).
 *
 * Threshold chosen empirically: near-black-but-not-pure pixels in
 * anti-aliased text / box borders have RGB sums well above 48;
 * backdrop-black (xterm theme bg = #000000) has RGB sums below that.
 */
async function cropTrailingBlack(
	pngPath: string,
): Promise<{ before: number; after: number } | null> {
	const buf = await readFile(pngPath);
	const png = PNG.sync.read(buf);
	const { width, height, data } = png;
	const NEAR_BLACK_RGB_SUM = 48;
	const BOTTOM_MARGIN_PX = 40;

	function rowHasContent(y: number): boolean {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (data[i] + data[i + 1] + data[i + 2] > NEAR_BLACK_RGB_SUM) {
				return true;
			}
		}
		return false;
	}

	let lastNonEmpty = height - 1;
	while (lastNonEmpty > 0 && !rowHasContent(lastNonEmpty)) {
		lastNonEmpty--;
	}
	const targetHeight = Math.min(
		height,
		lastNonEmpty + BOTTOM_MARGIN_PX + 1,
	);
	if (targetHeight >= height) return null;

	const cropped = new PNG({ width, height: targetHeight });
	PNG.bitblt(png, cropped, 0, 0, width, targetHeight, 0, 0);
	await writeFile(pngPath, PNG.sync.write(cropped));
	return { before: height, after: targetHeight };
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
	try {
		process.exitCode = await main();
	} catch (err) {
		console.error(err instanceof Error ? err.stack ?? err.message : String(err));
		process.exitCode = 2;
	}
}
