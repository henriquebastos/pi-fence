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

import type { HttpClient, HttpResponse } from "../extensions/pi-fence/io/http-client.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(SCRIPT_DIR, "../tests/fixtures/live");
const MANIFEST_PATH = resolve(FIXTURES_DIR, "manifest.json");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

function writeFixture(
	relPath: string,
	data: Buffer,
	processor: string,
): FixtureEntry & { relPath: string } {
	const absPath = resolve(FIXTURES_DIR, relPath);
	ensureDir(dirname(absPath));
	writeFileSync(absPath, data);
	return {
		processor,
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

interface KrokiFixtureSpec {
	tag: string;
	source: string;
}

interface KrokiFixtureRequest {
	format: "png" | "svg";
	isSvgOnly: boolean;
	url: string;
}

interface KrokiFixtureDeps {
	http: HttpClient;
	svgOnlyTags: ReadonlySet<string>;
	svgToPng: (svg: Buffer) => Promise<Buffer>;
}

async function refreshKroki(): Promise<FixtureEntry[]> {
	const { KROKI_TEXT_LANGUAGES } = await import(
		"../tests/fixtures/kroki/canonical-sources.ts"
	);
	const { NodeHttpClient } = await import(
		"../extensions/pi-fence/io/http-client.ts"
	);
	const { KROKI_SVG_ONLY_TAGS } = await import(
		"../extensions/pi-fence/kroki.ts"
	);
	const { svgToPng } = await import(
		"../extensions/pi-fence/svg-to-png.ts"
	);

	const deps: KrokiFixtureDeps = {
		http: new NodeHttpClient(),
		svgOnlyTags: KROKI_SVG_ONLY_TAGS,
		svgToPng,
	};
	return collectKrokiFixtures(KROKI_TEXT_LANGUAGES, deps);
}

async function collectKrokiFixtures(
	specs: readonly KrokiFixtureSpec[],
	deps: KrokiFixtureDeps,
): Promise<FixtureEntry[]> {
	const entries: FixtureEntry[] = [];
	for (const spec of specs) {
		const entry = await refreshKrokiFixture(spec, deps);
		if (entry) entries.push(entry);
	}
	return entries;
}

async function refreshKrokiFixture(
	spec: KrokiFixtureSpec,
	deps: KrokiFixtureDeps,
): Promise<FixtureEntry | null> {
	const request = createKrokiFixtureRequest(spec.tag, deps.svgOnlyTags);
	process.stderr.write(`  kroki/${spec.tag} (${request.format}) ... `);

	try {
		const response = await requestKrokiFixture(deps.http, request.url, spec.source);
		const png = await krokiResponseToPng(response, request, deps.svgToPng);
		return writeKrokiFixture(spec.tag, png);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		process.stderr.write(`SKIP (${msg})\n`);
		return null;
	}
}

function createKrokiFixtureRequest(
	tag: string,
	svgOnlyTags: ReadonlySet<string>,
): KrokiFixtureRequest {
	const isSvgOnly = svgOnlyTags.has(tag);
	const format = isSvgOnly ? "svg" : "png";
	return {
		format,
		isSvgOnly,
		url: `https://kroki.io/${tag}/${format}`,
	};
}

async function requestKrokiFixture(
	http: HttpClient,
	url: string,
	source: string,
): Promise<HttpResponse> {
	const response = await http.request({
		method: "POST",
		url,
		headers: { "content-type": "text/plain" },
		body: source,
	});
	if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
	return response;
}

async function krokiResponseToPng(
	response: HttpResponse,
	request: KrokiFixtureRequest,
	svgToPng: (svg: Buffer) => Promise<Buffer>,
): Promise<Buffer> {
	const png = request.isSvgOnly ? await svgToPng(response.body) : response.body;
	if (png.length < PNG_MAGIC.length || Buffer.compare(png.subarray(0, PNG_MAGIC.length), PNG_MAGIC) !== 0) {
		throw new Error("not PNG");
	}
	return png;
}

function writeKrokiFixture(tag: string, png: Buffer): FixtureEntry {
	const entry = writeFixture(`kroki/${tag}.png`, png, "kroki-remote");
	process.stderr.write(`${png.length} bytes\n`);
	return entry;
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

	const entry = writeFixture("graphviz/graphviz.png", result.stdoutBuffer, "graphviz-host");
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
	refreshedProcessors: ReadonlySet<string>,
): Manifest {
	// Keep entries from sets we didn't refresh; replace entries from sets we did.
	const kept = existing?.fixtures.filter((e) => !refreshedProcessors.has(e.processor)) ?? [];
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

function processorIdsForFixtureSet(set: FixtureSet): readonly string[] {
	return set === "kroki" ? ["kroki-remote", "kroki"] : ["graphviz-host", "graphviz"];
}

function fixtureSetForProcessor(processorId: string): FixtureSet | null {
	if (processorId === "kroki-remote" || processorId === "kroki") return "kroki";
	if (processorId === "graphviz-host" || processorId === "graphviz") return "graphviz";
	return null;
}

function processorIdsForCapturedEntries(entries: readonly FixtureEntry[]): Set<string> {
	const out = new Set<string>();
	for (const entry of entries) {
		const set = fixtureSetForProcessor(entry.processor);
		if (!set) continue;
		for (const processorId of processorIdsForFixtureSet(set)) {
			out.add(processorId);
		}
	}
	return out;
}

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
	const refreshedProcessors = new Set<string>();

	for (const set of requestedSets) {
		const entries = set === "kroki" ? await refreshKroki() : await refreshGraphviz();
		allEntries.push(...entries);
		if (entries.length > 0) {
			for (const processorId of processorIdsForFixtureSet(set)) {
				refreshedProcessors.add(processorId);
			}
		}
	}

	if (allEntries.length === 0) {
		process.stderr.write("[refresh-fixtures] no fixtures captured — prerequisites missing?\n");
		return 0;
	}

	const existing = loadExistingManifest();
	const manifest = mergeManifest(existing, allEntries, refreshedProcessors);
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

export {
	main as refreshFixtures,
	refreshKroki,
	refreshGraphviz,
	mergeManifest,
	processorIdsForCapturedEntries,
};
