/**
 * Unit tests for `extensions/pi-fence/list.ts`.
 *
 * Two pure functions:
 *
 *   - `listProcessors(processors)` — turns a `FenceProcessor[]` into
 *     `ProcessorListing[]`. Status today is always `"registered"` since
 *     pi-fence wires every processor it advertises. `/fence doctor` will
 *     widen that union later.
 *
 *   - `formatProcessorLines(listings)` — turns listings into one readable
 *     line per processor. No column alignment (see S3 README); the format
 *     is prose, not a table.
 *
 * Both are pure functions, so the tests construct lightweight processor
 * objects inline rather than standing up Kroki. The shape we want for
 * future processors (graphviz-local, mermaid-local) is the `FenceProcessor`
 * interface, not any specific implementation.
 */

import { describe, expect, it } from "vitest";

import type { FenceProcessor } from "../../extensions/pi-fence/processor.ts";
import { formatProcessorLines, listProcessors } from "../../extensions/pi-fence/list.ts";

// A minimal processor stub for test use — implements the interface without
// hitting any real renderer. Not exported; tests that need a processor
// stub outside list tests construct their own.
function stubProcessor(
	id: string,
	tags: readonly string[],
	aliases: Readonly<Record<string, string>> = {},
): FenceProcessor {
	return {
		id,
		tags,
		aliases,
		async render() {
			return { ok: false, error: "stub processor — render() is not exercised in list tests" };
		},
	};
}

describe("listProcessors", () => {
	it("returns a row per processor with status 'registered'", () => {
		const kroki = stubProcessor("kroki", ["mermaid", "graphviz", "plantuml", "d2"], {
			dot: "graphviz",
			puml: "plantuml",
		});

		const listings = listProcessors([kroki]);

		expect(listings).toHaveLength(1);
		expect(listings[0]).toEqual({
			id: "kroki",
			status: "registered",
			tags: ["mermaid", "graphviz", "plantuml", "d2"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});
	});

	it("returns an empty array for an empty processor list", () => {
		expect(listProcessors([])).toEqual([]);
	});

	it("preserves order and does not mutate processor fields", () => {
		const a = stubProcessor("alpha", ["a1", "a2"], { ax: "a1" });
		const b = stubProcessor("beta", ["b1"], {});

		const listings = listProcessors([a, b]);

		expect(listings.map((l) => l.id)).toEqual(["alpha", "beta"]);
		// The listing tags point to the same readonly slice; the test asserts
		// they don't get rewritten by the listing builder.
		expect(a.tags).toEqual(["a1", "a2"]);
		expect(a.aliases).toEqual({ ax: "a1" });
	});
});

describe("formatProcessorLines", () => {
	it("renders a single-processor listing with canonical tags and aliases", () => {
		const lines = formatProcessorLines([
			{
				id: "kroki",
				status: "registered",
				tags: ["mermaid", "graphviz", "plantuml", "d2"],
				aliases: { dot: "graphviz", puml: "plantuml" },
			},
		]);

		expect(lines).toEqual([
			"kroki [registered] — mermaid, graphviz (dot), plantuml (puml), d2",
		]);
	});

	it("renders a processor with no aliases as plain comma-separated tags", () => {
		const lines = formatProcessorLines([
			{
				id: "graphviz-local",
				status: "registered",
				tags: ["graphviz"],
				aliases: {},
			},
		]);

		expect(lines).toEqual(["graphviz-local [registered] — graphviz"]);
	});

	it("groups multiple aliases for the same canonical tag in one parenthesis", () => {
		const lines = formatProcessorLines([
			{
				id: "multi",
				status: "registered",
				tags: ["graphviz"],
				aliases: { dot: "graphviz", gv: "graphviz" },
			},
		]);

		expect(lines).toEqual(["multi [registered] — graphviz (dot, gv)"]);
	});

	it("renders multiple processors in order, one line each", () => {
		const lines = formatProcessorLines([
			{
				id: "kroki",
				status: "registered",
				tags: ["mermaid"],
				aliases: {},
			},
			{
				id: "graphviz-local",
				status: "registered",
				tags: ["graphviz"],
				aliases: { dot: "graphviz" },
			},
		]);

		expect(lines).toEqual([
			"kroki [registered] — mermaid",
			"graphviz-local [registered] — graphviz (dot)",
		]);
	});

	it("falls back to a defensive line for an empty listing", () => {
		expect(formatProcessorLines([])).toEqual(["(no processors registered)"]);
	});

	it("ignores aliases whose target is not a canonical tag", () => {
		// Defensive: the FenceProcessor contract forbids this shape, but the
		// formatter should not crash if a malformed listing reaches it.
		const lines = formatProcessorLines([
			{
				id: "broken",
				status: "registered",
				tags: ["a"],
				aliases: { bogus: "not-canonical" },
			},
		]);

		expect(lines).toEqual(["broken [registered] — a"]);
	});
});
