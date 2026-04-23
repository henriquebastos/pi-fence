/**
 * Unit tests for `extensions/pi-fence/list.ts`.
 *
 * Two pure functions:
 *
 *   - `listProcessors(processors, availability)` turns a
 *     `FenceProcessor[]` + availability map into `ProcessorListing[]`.
 *     Status is `"registered"` when availability is ok,
 *     `"unavailable"` otherwise. CV0.E2.S1 widened the status union
 *     so the second-processor scenario (graphviz-local alongside
 *     Kroki) can surface which processor actually serves a given tag.
 *
 *   - `formatProcessorLines(listings)` turns listings into readable
 *     lines. One line per registered processor; two (header +
 *     indented detail) per unavailable processor.
 *
 * Both are pure functions, so the tests construct lightweight
 * processor objects inline rather than standing up Kroki.
 */

import { describe, expect, it } from "vitest";

import type { Availability, FenceProcessor } from "../../extensions/pi-fence/processor.ts";
import { formatProcessorLines, listProcessors } from "../../extensions/pi-fence/list.ts";

// A minimal processor stub for test use — implements the interface
// without hitting any real renderer. Not exported; tests that need a
// processor stub outside list tests construct their own.
function stubProcessor(
	id: string,
	tags: readonly string[],
	aliases: Readonly<Record<string, string>> = {},
): FenceProcessor {
	return {
		id,
		tags,
		aliases,
		async available(): Promise<Availability> {
			// list tests never invoke available() — the availability map
			// is passed explicitly to listProcessors. The method exists
			// only so the stub satisfies the FenceProcessor interface.
			return { ok: true };
		},
		async render() {
			return { ok: false, error: "stub processor — render() is not exercised in list tests" };
		},
	};
}

const allOk = (ids: readonly string[]): Map<string, Availability> =>
	new Map(ids.map((id) => [id, { ok: true } as Availability]));

describe("listProcessors", () => {
	it("returns a row per processor with status 'registered' when availability is ok", () => {
		const kroki = stubProcessor("kroki", ["mermaid", "graphviz", "plantuml", "d2"], {
			dot: "graphviz",
			puml: "plantuml",
		});

		const listings = listProcessors([kroki], allOk(["kroki"]));

		expect(listings).toHaveLength(1);
		expect(listings[0]).toEqual({
			id: "kroki",
			status: "registered",
			tags: ["mermaid", "graphviz", "plantuml", "d2"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});
	});

	it("returns status 'unavailable' with reason + installHint when availability is not ok", () => {
		const local = stubProcessor("graphviz-local", ["graphviz"], { dot: "graphviz" });
		const availability = new Map<string, Availability>([
			[
				"graphviz-local",
				{
					ok: false,
					reason: "dot binary not found on PATH",
					installHint: "apt install graphviz",
				},
			],
		]);

		const listings = listProcessors([local], availability);

		expect(listings).toHaveLength(1);
		expect(listings[0]).toEqual({
			id: "graphviz-local",
			status: "unavailable",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
			unavailableReason: "dot binary not found on PATH",
			installHint: "apt install graphviz",
		});
	});

	it("returns status 'disabled' when the processor id is in the disabled set", () => {
		const kroki = stubProcessor("kroki", ["mermaid"]);
		const listings = listProcessors(
			[kroki],
			allOk(["kroki"]),
			new Set(["kroki"]),
		);

		expect(listings).toHaveLength(1);
		expect(listings[0]).toMatchObject({
			id: "kroki",
			status: "disabled",
		});
	});

	it("omits installHint from the listing when the processor did not provide one", () => {
		const broken = stubProcessor("broken", ["x"]);
		const availability = new Map<string, Availability>([
			["broken", { ok: false, reason: "some reason" }],
		]);

		const listings = listProcessors([broken], availability);

		expect(listings[0].unavailableReason).toBe("some reason");
		expect(listings[0].installHint).toBeUndefined();
	});

	it("treats a processor whose id is missing from the availability map as unavailable (defensive)", () => {
		// Shouldn't happen in production — probeAvailability populates
		// every processor — but a partial map in tests or future code
		// should degrade gracefully rather than throw.
		const a = stubProcessor("a", ["x"]);

		const listings = listProcessors([a], new Map());

		expect(listings[0].status).toBe("unavailable");
		expect(listings[0].unavailableReason).toBeDefined();
	});

	it("returns an empty array for an empty processor list", () => {
		expect(listProcessors([], new Map())).toEqual([]);
	});

	it("preserves order and does not mutate processor fields", () => {
		const a = stubProcessor("alpha", ["a1", "a2"], { ax: "a1" });
		const b = stubProcessor("beta", ["b1"], {});

		const listings = listProcessors([a, b], allOk(["alpha", "beta"]));

		expect(listings.map((l) => l.id)).toEqual(["alpha", "beta"]);
		expect(a.tags).toEqual(["a1", "a2"]);
		expect(a.aliases).toEqual({ ax: "a1" });
	});

	it("mixes registered + unavailable rows in the CV0.E2 two-processor scenario", () => {
		const local = stubProcessor("graphviz-local", ["graphviz"], { dot: "graphviz" });
		const kroki = stubProcessor("kroki", ["mermaid", "graphviz"], { dot: "graphviz" });
		const availability = new Map<string, Availability>([
			[
				"graphviz-local",
				{ ok: false, reason: "dot not found", installHint: "apt install graphviz" },
			],
			["kroki", { ok: true }],
		]);

		const listings = listProcessors([local, kroki], availability);

		expect(listings.map((l) => l.status)).toEqual(["unavailable", "registered"]);
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

	it("renders a disabled processor with [disabled] badge", () => {
		const lines = formatProcessorLines([
			{
				id: "kroki",
				status: "disabled",
				tags: ["mermaid"],
				aliases: {},
			},
		]);

		expect(lines).toEqual(["kroki [disabled] \u2014 mermaid"]);
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

	it("renders an unavailable processor as two lines: header + indented reason + installHint", () => {
		const lines = formatProcessorLines([
			{
				id: "graphviz-local",
				status: "unavailable",
				tags: ["graphviz"],
				aliases: { dot: "graphviz" },
				unavailableReason: "dot binary not found on PATH",
				installHint: "apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS)",
			},
		]);

		expect(lines).toEqual([
			"graphviz-local [unavailable] — graphviz (dot)",
			"    dot binary not found on PATH. apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS)",
		]);
	});

	it("renders an unavailable processor without installHint as two lines: header + indented reason only", () => {
		const lines = formatProcessorLines([
			{
				id: "broken",
				status: "unavailable",
				tags: ["x"],
				aliases: {},
				unavailableReason: "availability unknown",
			},
		]);

		expect(lines).toEqual([
			"broken [unavailable] — x",
			"    availability unknown",
		]);
	});

	it("interleaves registered + unavailable lines for the CV0.E2 two-processor scenario", () => {
		const lines = formatProcessorLines([
			{
				id: "graphviz-local",
				status: "unavailable",
				tags: ["graphviz"],
				aliases: { dot: "graphviz" },
				unavailableReason: "dot not found",
				installHint: "apt install graphviz",
			},
			{
				id: "kroki",
				status: "registered",
				tags: ["mermaid", "graphviz"],
				aliases: { dot: "graphviz" },
			},
		]);

		expect(lines).toEqual([
			"graphviz-local [unavailable] — graphviz (dot)",
			"    dot not found. apt install graphviz",
			"kroki [registered] — mermaid, graphviz (dot)",
		]);
	});

	it("falls back to a defensive line for an empty listing", () => {
		expect(formatProcessorLines([])).toEqual(["(no processors registered)"]);
	});

	it("ignores aliases whose target is not a canonical tag", () => {
		// Defensive: the FenceProcessor contract forbids this shape, but
		// the formatter should not crash if a malformed listing reaches it.
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

describe("formatProcessorLines — bindings (CV0.E2.S2)", () => {
	const kroki = {
		id: "kroki" as const,
		status: "registered" as const,
		tags: ["mermaid", "graphviz"],
		aliases: { dot: "graphviz" },
	};
	const local = {
		id: "graphviz-local" as const,
		status: "registered" as const,
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	};

	it("emits the Bindings section for effective rows", () => {
		const lines = formatProcessorLines(
			[local, kroki],
			[
				{ status: "effective", tag: "graphviz", processorId: "kroki" },
				{ status: "effective", tag: "dot", processorId: "kroki" },
			],
		);

		expect(lines).toEqual([
			"graphviz-local [registered] — graphviz (dot)",
			"kroki [registered] — mermaid, graphviz (dot)",
			"",
			"Bindings",
			"  graphviz → kroki",
			"  dot → kroki",
		]);
	});

	it("emits the Ignored bindings section with per-row reasons", () => {
		const lines = formatProcessorLines(
			[kroki],
			[
				{
					status: "ignored",
					tag: "graphviz",
					processorId: "graphviz-local",
					reason: "processor-unavailable",
				},
				{
					status: "ignored",
					tag: "mermaid",
					processorId: "nonexistent",
					reason: "unknown-processor",
				},
			],
		);

		expect(lines).toEqual([
			"kroki [registered] — mermaid, graphviz (dot)",
			"",
			"Ignored bindings",
			"  graphviz → graphviz-local (processor unavailable)",
			"  mermaid → nonexistent (unknown processor)",
		]);
	});

	it("emits both sections together when bindings split across buckets", () => {
		const lines = formatProcessorLines(
			[local, kroki],
			[
				{ status: "effective", tag: "graphviz", processorId: "kroki" },
				{
					status: "ignored",
					tag: "mermaid",
					processorId: "nonexistent",
					reason: "unknown-processor",
				},
			],
		);

		expect(lines).toEqual([
			"graphviz-local [registered] — graphviz (dot)",
			"kroki [registered] — mermaid, graphviz (dot)",
			"",
			"Bindings",
			"  graphviz → kroki",
			"",
			"Ignored bindings",
			"  mermaid → nonexistent (unknown processor)",
		]);
	});

	it("hides both sections when bindings is undefined", () => {
		const lines = formatProcessorLines([local]);

		expect(lines).toEqual(["graphviz-local [registered] — graphviz (dot)"]);
	});

	it("hides both sections when bindings is an empty array", () => {
		const lines = formatProcessorLines([local], []);

		expect(lines).toEqual(["graphviz-local [registered] — graphviz (dot)"]);
	});

	it("handles bindings-only with no processors (defensive)", () => {
		// Shouldn't happen in production but shouldn't crash either.
		const lines = formatProcessorLines(
			[],
			[{ status: "effective", tag: "graphviz", processorId: "kroki" }],
		);

		expect(lines).toEqual([
			"(no processors registered)",
			"",
			"Bindings",
			"  graphviz → kroki",
		]);
	});
});
