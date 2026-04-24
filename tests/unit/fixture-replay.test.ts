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
import { createKrokiProcessor } from "../../extensions/pi-fence/kroki.ts";
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

function loadManifest(): Manifest {
	return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

function loadFixture(entry: FixtureEntry): Buffer {
	return readFileSync(resolve(FIXTURES_DIR, entry.file));
}

describe.skipIf(!manifestExists)("fixture replay — live-derived fixtures", () => {
	const manifest = manifestExists ? loadManifest() : { refreshedAt: "", fixtures: [] };

	describe("manifest integrity", () => {
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
		const krokiFixtures = manifest.fixtures.filter((f) => f.processor === "kroki");

		for (const entry of krokiFixtures) {
			it(`replays ${entry.tag} through FakeHttpClient → kroki processor`, async () => {
				const pngBytes = loadFixture(entry);
				const spec = KROKI_TEXT_LANGUAGES.find((l) => l.tag === entry.tag);
				expect(spec).toBeDefined();

				const http = new FakeHttpClient();
				http.setResponse("POST", `https://kroki.io/${entry.tag}/png`, {
					status: 200,
					headers: { "content-type": "image/png" },
					body: pngBytes,
				});

				const kroki = createKrokiProcessor(http, undefined, new FakeLogger());
				const result = await kroki.render(entry.tag, spec!.source);

				expect(result.ok).toBe(true);
				if (!result.ok || !("png" in result)) return;
				expect(Buffer.compare(result.png, pngBytes)).toBe(0);
			});
		}
	});

	describe("graphviz fixture replay", () => {
		const gvFixtures = manifest.fixtures.filter((f) => f.processor === "graphviz");

		for (const entry of gvFixtures) {
			it(`replays ${entry.tag} through FakeShellRunner → graphviz-local processor`, async () => {
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
