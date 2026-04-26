/**
 * Fixture-replay tests — live-derived fixtures replayed through fakes.
 *
 * Committed PNGs under `tests/fixtures/live/` were captured from real
 * Kroki HTTP responses and real `dot -Tpng` output by `pnpm refresh-fixtures`.
 * This test replays each fixture through the appropriate fake seam and
 * asserts the processor passes the bytes through correctly.
 *
 * Skips cleanly when the manifest doesn't exist (fixtures not yet captured).
 * Run `pnpm refresh-fixtures` to bootstrap, then `pnpm test` includes these.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { FakeHttpClient } from "../utilities/http-client.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { createKrokiProcessor, KROKI_SVG_ONLY_TAGS } from "../../extensions/pi-fence/kroki.ts";
import { createGraphvizLocalProcessor } from "../../extensions/pi-fence/graphviz-local.ts";
import { KROKI_TEXT_LANGUAGES } from "../fixtures/kroki/canonical-sources.ts";

interface FixtureEntry {
	processor: string;
	tag: string;
	file: string;
	bytes: number;
	sha256: string;
}

interface Manifest {
	refreshedAt: string;
	fixtures: FixtureEntry[];
}

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/live");
const MANIFEST_PATH = resolve(FIXTURES_DIR, "manifest.json");
const manifestExists = existsSync(MANIFEST_PATH);
const MANIFEST_PROCESSOR_IDS = new Set(["kroki-remote", "graphviz-host"]);

function loadManifest(): Manifest {
	return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

function loadFixture(entry: FixtureEntry): Buffer {
	return readFileSync(resolve(FIXTURES_DIR, entry.file));
}

describe.skipIf(!manifestExists)("fixture replay — live-derived fixtures", () => {
	const manifest = manifestExists ? loadManifest() : { refreshedAt: "", fixtures: [] };

	describe("manifest integrity", () => {
		it("uses only current processor ids", () => {
			expect(new Set(manifest.fixtures.map((entry) => entry.processor))).toEqual(
				MANIFEST_PROCESSOR_IDS,
			);
		});

		for (const entry of manifest.fixtures) {
			it(`${entry.processor}/${entry.tag} — bytes and SHA-256 match`, () => {
				const bytes = loadFixture(entry);
				expect(bytes.length).toBe(entry.bytes);
				const sha256 = createHash("sha256").update(bytes).digest("hex");
				expect(sha256).toBe(entry.sha256);
			});
		}
	});

	describe("kroki fixture replay", () => {
		const krokiFixtures = manifest.fixtures.filter((f) => f.processor === "kroki-remote");
		const pngDirectFixtures = krokiFixtures.filter((f) => !KROKI_SVG_ONLY_TAGS.has(f.tag));
		const svgOnlyFixtures = krokiFixtures.filter((f) => KROKI_SVG_ONLY_TAGS.has(f.tag));

		it("has kroki-remote fixtures", () => {
			expect(krokiFixtures.length).toBeGreaterThan(0);
		});

		for (const entry of pngDirectFixtures) {
			it(`replays ${entry.tag} through FakeHttpClient → kroki-remote processor (PNG-direct)`, async () => {
				const pngBytes = loadFixture(entry);
				const spec = KROKI_TEXT_LANGUAGES.find((l) => l.tag === entry.tag);
				expect(spec).toBeDefined();

				const http = new FakeHttpClient();
				http.setResponse("POST", `https://kroki.io/${entry.tag}/png`, {
					status: 200,
					headers: { "content-type": "image/png" },
					body: pngBytes,
				});

				const krokiRemote = createKrokiProcessor(http, undefined, new FakeLogger());
				const result = await krokiRemote.render(entry.tag, spec!.source);

				expect(result.ok).toBe(true);
				if (!result.ok || !("png" in result)) return;
				expect(Buffer.compare(result.png, pngBytes)).toBe(0);
			});
		}

		for (const entry of svgOnlyFixtures) {
			it(`replays ${entry.tag} through FakeHttpClient → kroki-remote processor (SVG→PNG)`, async () => {
				const expectedPng = loadFixture(entry);
				const spec = KROKI_TEXT_LANGUAGES.find((l) => l.tag === entry.tag);
				expect(spec).toBeDefined();

				// For SVG-only tags, the fixture is the rasterized PNG.
				// The processor requests SVG and rasterizes locally, so we
				// verify the result is a valid PNG with correct magic bytes.
				// Exact byte match is not guaranteed because resvg may produce
				// slightly different output across versions.
				const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

				// Provide a minimal valid SVG so the processor can rasterize.
				const fakeSvg =
					'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
					'<rect width="10" height="10" fill="red"/></svg>';

				const http = new FakeHttpClient();
				http.setResponse("POST", `https://kroki.io/${entry.tag}/svg`, {
					status: 200,
					headers: { "content-type": "image/svg+xml" },
					body: Buffer.from(fakeSvg),
				});

				const krokiRemote = createKrokiProcessor(http, undefined, new FakeLogger());
				const result = await krokiRemote.render(entry.tag, spec!.source);

				expect(result.ok).toBe(true);
				if (!result.ok || !("png" in result)) return;
				expect(Buffer.compare(result.png.subarray(0, 8), PNG_MAGIC)).toBe(0);
				// Verify fixture is also a valid PNG (manifest integrity covers bytes/sha)
				expect(Buffer.compare(expectedPng.subarray(0, 8), PNG_MAGIC)).toBe(0);
			});
		}
	});

	describe("graphviz fixture replay", () => {
		const gvFixtures = manifest.fixtures.filter((f) => f.processor === "graphviz-host");

		it("has graphviz-host fixtures", () => {
			expect(gvFixtures.length).toBeGreaterThan(0);
		});

		for (const entry of gvFixtures) {
			it(`replays ${entry.tag} through FakeShellRunner → graphviz-host processor`, async () => {
				const pngBytes = loadFixture(entry);

				const shell = new FakeShellRunner();
				shell.setResponse("dot", ["-V"], {
					exitCode: 0,
					stdout: "",
					stdoutBuffer: Buffer.alloc(0),
					stderr: "dot - graphviz version 12.0.0",
				});
				shell.setResponse("dot", ["-Tpng"], {
					exitCode: 0,
					stdout: "",
					stdoutBuffer: pngBytes,
					stderr: "",
				});

				const gv = createGraphvizLocalProcessor(shell);
				const result = await gv.render("graphviz", "digraph { A -> B -> C }");

				expect(result.ok).toBe(true);
				if (!result.ok || !("png" in result)) return;
				expect(Buffer.compare(result.png, pngBytes)).toBe(0);
			});
		}
	});
});
