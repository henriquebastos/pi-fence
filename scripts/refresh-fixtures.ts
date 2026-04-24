#!/usr/bin/env tsx
/**
 * refresh-fixtures — capture real responses from live services and commit
 * them as fixture files for the fast-suite fixture-replay tests.
 *
 * Usage:
 *   pnpm refresh-fixtures                # refresh all fixture sets
 *   pnpm refresh-fixtures kroki          # refresh only kroki fixtures
 *   pnpm refresh-fixtures graphviz       # refresh only graphviz fixtures
 *
 * Prerequisites:
 *   - kroki: network access to https://kroki.io
 *   - graphviz: pi-fence-live-deps container running (pnpm live:up)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(SCRIPT_DIR, "../tests/fixtures/live");
const MANIFEST_PATH = resolve(FIXTURES_DIR, "manifest.json");

export interface FixtureEntry {
	processor: string;
	tag: string;
	file: string;
	bytes: number;
	sha256: string;
}

export interface Manifest {
	refreshedAt: string;
	fixtures: FixtureEntry[];
}

function sha256(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeFixture(relPath: string, data: Buffer): FixtureEntry & { relPath: string } {
	const absPath = resolve(FIXTURES_DIR, relPath);
	ensureDir(dirname(absPath));
	writeFileSync(absPath, data);
	return {
		processor: relPath.split("/")[0],
		tag: relPath.split("/")[1].replace(/\.png$/, ""),
		file: relPath,
		bytes: data.length,
		sha256: sha256(data),
		relPath,
	};
}

// ---------------------------------------------------------------------------
// Kroki fixtures
// ---------------------------------------------------------------------------

async function refreshKroki(): Promise<FixtureEntry[]> {
	const { KROKI_TEXT_LANGUAGES } = await import(
		"../tests/fixtures/kroki/canonical-sources.ts"
	);
	const { NodeHttpClient } = await import(
		"../extensions/pi-fence/io/http-client.ts"
	);

	const http = new NodeHttpClient();
	const endpoint = "https://kroki.io";
	const entries: FixtureEntry[] = [];
	const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	for (const spec of KROKI_TEXT_LANGUAGES) {
		const url = `${endpoint}/${spec.tag}/png`;
		process.stderr.write(`  kroki/${spec.tag} ... `);

		try {
			const resp = await http.request({
				method: "POST",
				url,
				headers: { "content-type": "text/plain" },
				body: spec.source,
			});

			if (resp.status !== 200) {
				process.stderr.write(`SKIP (HTTP ${resp.status})\n`);
				continue;
			}

			const body = Buffer.isBuffer(resp.body) ? resp.body : Buffer.from(resp.body);
			if (body.length < 8 || Buffer.compare(body.subarray(0, 8), PNG_MAGIC) !== 0) {
				process.stderr.write(`SKIP (not PNG)\n`);
				continue;
			}

			const entry = writeFixture(`kroki/${spec.tag}.png`, body);
			entries.push(entry);
			process.stderr.write(`${body.length} bytes\n`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`SKIP (${msg})\n`);
		}
	}

	return entries;
}

// ---------------------------------------------------------------------------
// Graphviz fixtures
// ---------------------------------------------------------------------------

async function refreshGraphviz(): Promise<FixtureEntry[]> {
	const { hasContainer } = await import("../tests/utilities/live-deps.ts");
	const { DockerExecShellRunner } = await import("../tests/utilities/shell-runner.ts");

	const CONTAINER = "pi-fence-live-deps";
	const containerRunning = await hasContainer(CONTAINER);

	if (!containerRunning) {
		process.stderr.write("  graphviz: SKIP (container not running)\n");
		return [];
	}

	const shell = new DockerExecShellRunner(CONTAINER);
	const source = "digraph { A -> B -> C }";
	const entries: FixtureEntry[] = [];

	process.stderr.write("  graphviz/graphviz ... ");

	const result = await shell.run("dot", ["-Tpng"], { input: source });
	if (result.exitCode !== 0 || !result.stdoutBuffer || result.stdoutBuffer.length === 0) {
		process.stderr.write(`SKIP (exit ${result.exitCode})\n`);
		return entries;
	}

	const entry = writeFixture("graphviz/graphviz.png", result.stdoutBuffer);
	entries.push(entry);
	process.stderr.write(`${result.stdoutBuffer.length} bytes\n`);

	return entries;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function loadExistingManifest(): Manifest | null {
	if (!existsSync(MANIFEST_PATH)) return null;
	try {
		return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
	} catch {
		return null;
	}
}

function mergeManifest(
	existing: Manifest | null,
	newEntries: FixtureEntry[],
	refreshedSets: Set<string>,
): Manifest {
	// Keep entries from sets we didn't refresh; replace entries from sets we did.
	const kept = existing?.fixtures.filter((e) => !refreshedSets.has(e.processor)) ?? [];
	return {
		refreshedAt: new Date().toISOString(),
		fixtures: [...kept, ...newEntries].sort((a, b) =>
			`${a.processor}/${a.tag}`.localeCompare(`${b.processor}/${b.tag}`),
		),
	};
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type FixtureSet = "kroki" | "graphviz";
const KNOWN_SETS: readonly FixtureSet[] = ["kroki", "graphviz"];

async function main(argv: readonly string[]): Promise<number> {
	const requestedSets: FixtureSet[] =
		argv.length === 0
			? [...KNOWN_SETS]
			: argv.filter((a): a is FixtureSet => (KNOWN_SETS as readonly string[]).includes(a));

	if (requestedSets.length === 0) {
		process.stderr.write(`Unknown fixture set(s): ${argv.join(", ")}\n`);
		process.stderr.write(`Known sets: ${KNOWN_SETS.join(", ")}\n`);
		return 1;
	}

	process.stderr.write(`[refresh-fixtures] refreshing: ${requestedSets.join(", ")}\n`);

	const allEntries: FixtureEntry[] = [];
	const refreshedSets = new Set<string>();

	for (const set of requestedSets) {
		refreshedSets.add(set);
		if (set === "kroki") {
			allEntries.push(...(await refreshKroki()));
		} else if (set === "graphviz") {
			allEntries.push(...(await refreshGraphviz()));
		}
	}

	if (allEntries.length === 0) {
		process.stderr.write("[refresh-fixtures] no fixtures captured — prerequisites missing?\n");
		return 0;
	}

	const existing = loadExistingManifest();
	const manifest = mergeManifest(existing, allEntries, refreshedSets);
	ensureDir(FIXTURES_DIR);
	writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
	process.stderr.write(
		`[refresh-fixtures] wrote ${allEntries.length} fixture(s) + manifest.json\n`,
	);

	return 0;
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}

export { main as refreshFixtures, refreshKroki, refreshGraphviz };
