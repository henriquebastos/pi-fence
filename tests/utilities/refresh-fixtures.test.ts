/**
 * Self-test for the refresh-fixtures script exports.
 *
 * Verifies the script's public surface is importable and the CLI parser
 * rejects unknown fixture sets. Does not exercise live I/O — the refresh
 * functions need network/Docker which the fast suite must not require.
 */

import { describe, expect, it } from "vitest";

import {
	mergeManifest,
	processorIdsForCapturedEntries,
	refreshFixtures,
	type FixtureEntry,
	type Manifest,
} from "../../scripts/refresh-fixtures.ts";

const entry = (processor: string, tag: string): FixtureEntry => ({
	processor,
	tag,
	file: `${processor}/${tag}.png`,
	bytes: 1,
	sha256: `${processor}-${tag}`,
});

const manifest = (fixtures: FixtureEntry[]): Manifest => ({
	refreshedAt: "old",
	fixtures,
});

describe("refresh-fixtures CLI", () => {
	it("returns non-zero for an unknown fixture set", async () => {
		// Capture stderr to avoid noise; redirect is enough to verify exit code.
		const origWrite = process.stderr.write;
		process.stderr.write = (() => true) as typeof process.stderr.write;
		try {
			const code = await refreshFixtures(["unknown-set"]);
			expect(code).toBe(1);
		} finally {
			process.stderr.write = origWrite;
		}
	});
});

describe("refresh-fixtures manifest merge", () => {
	it("prunes legacy and current ids only for sets with captured entries", () => {
		const existing = manifest([
			entry("kroki", "mermaid"),
			entry("kroki-remote", "plantuml"),
			entry("graphviz", "graphviz"),
			entry("graphviz-host", "dot"),
		]);
		const refreshed = [entry("kroki-remote", "mermaid")];

		const merged = mergeManifest(
			existing,
			refreshed,
			processorIdsForCapturedEntries(refreshed),
		);

		expect(merged.fixtures.map((f) => `${f.processor}/${f.tag}`)).toEqual([
			"graphviz-host/dot",
			"graphviz/graphviz",
			"kroki-remote/mermaid",
		]);
	});

	it("keeps existing entries when a requested set captures no fixtures", () => {
		const existing = manifest([
			entry("kroki-remote", "mermaid"),
			entry("graphviz-host", "graphviz"),
		]);

		const merged = mergeManifest(existing, [], processorIdsForCapturedEntries([]));

		expect(merged.fixtures.map((f) => `${f.processor}/${f.tag}`)).toEqual([
			"graphviz-host/graphviz",
			"kroki-remote/mermaid",
		]);
	});
});
