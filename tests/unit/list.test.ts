/**
 * Unit tests for `extensions/pi-fence/list.ts`.
 *
 * Two pure functions:
 *
 *   - `listProcessors(processors, availability)` turns a
 *     `FenceProcessor[]` + availability map into `ProcessorListing[]`.
 *     Status is `"registered"` when availability is ok,
 *     `"unavailable"` otherwise. CV0.E2.S1 widened the status union
 *     so the second-processor scenario (graphviz-host alongside
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

import type {
	Availability,
	FenceProcessor,
	ProcessorPlacement,
} from "../../extensions/pi-fence/processor.ts";
import { formatProcessorLines, listProcessors } from "../../extensions/pi-fence/list.ts";

// A minimal processor stub for test use — implements the interface
// without hitting any real renderer. Not exported; tests that need a
// processor stub outside list tests construct their own.
function stubProcessor(
	id: string,
	tags: readonly string[],
	aliases: Readonly<Record<string, string>> = {},
	placement: ProcessorPlacement = "remote",
): FenceProcessor {
	return {
		id,
		placement,
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
		const krokiRemote = stubProcessor("kroki-remote", ["mermaid", "graphviz", "plantuml", "d2"], {
			dot: "graphviz",
			puml: "plantuml",
		});

		const listings = listProcessors([krokiRemote], allOk(["kroki-remote"]));

		expect(listings).toHaveLength(1);
		expect(listings[0]).toEqual({
			id: "kroki-remote",
			status: "registered",
			tags: ["mermaid", "graphviz", "plantuml", "d2"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});
	});

	it("returns status 'unavailable' with reason + installHint when availability is not ok", () => {
		const local = stubProcessor("graphviz-host", ["graphviz"], { dot: "graphviz" });
		const availability = new Map<string, Availability>([
			[
				"graphviz-host",
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
			id: "graphviz-host",
			status: "unavailable",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
			unavailableReason: "dot binary not found on PATH",
			installHint: "apt install graphviz",
		});
	});

	it("returns status 'disabled' when the processor id is in the disabled set", () => {
		const krokiRemote = stubProcessor("kroki-remote", ["mermaid"]);
		const listings = listProcessors(
			[krokiRemote],
			allOk(["kroki-remote"]),
			{ disabled: new Set(["kroki-remote"]) },
		);

		expect(listings).toHaveLength(1);
		expect(listings[0]).toMatchObject({
			id: "kroki-remote",
			status: "disabled",
		});
	});

	it("returns status 'disabled' when the processor placement is omitted from precedence", () => {
		const local = stubProcessor("graphviz-host", ["graphviz"], { dot: "graphviz" }, "host");
		const krokiRemote = stubProcessor("kroki-remote", ["graphviz"], { dot: "graphviz" }, "remote");

		const listings = listProcessors(
			[local, krokiRemote],
			allOk(["graphviz-host", "kroki-remote"]),
			{ processorPrecedence: ["remote"] },
		);

		expect(listings.map((listing) => [listing.id, listing.status])).toEqual([
			["graphviz-host", "disabled"],
			["kroki-remote", "registered"],
		]);
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
		const local = stubProcessor("graphviz-host", ["graphviz"], { dot: "graphviz" });
		const krokiRemote = stubProcessor("kroki-remote", ["mermaid", "graphviz"], { dot: "graphviz" });
		const availability = new Map<string, Availability>([
			[
				"graphviz-host",
				{ ok: false, reason: "dot not found", installHint: "apt install graphviz" },
			],
			["kroki-remote", { ok: true }],
		]);

		const listings = listProcessors([local, krokiRemote], availability);

		expect(listings.map((l) => l.status)).toEqual(["unavailable", "registered"]);
	});
});

describe("formatProcessorLines", () => {
	it("renders a single-processor listing with canonical tags and aliases", () => {
		const lines = formatProcessorLines([
			{
				id: "kroki-remote",
				status: "registered",
				tags: ["mermaid", "graphviz", "plantuml", "d2"],
				aliases: { dot: "graphviz", puml: "plantuml" },
			},
		]);

		expect(lines).toEqual([
			"kroki-remote [registered] — mermaid, graphviz (dot), plantuml (puml), d2",
		]);
	});

	it("includes endpoint in parentheses for kroki-remote when non-default", () => {
		const lines = formatProcessorLines(
			[
				{
					id: "kroki-remote",
					status: "registered",
					tags: ["mermaid"],
					aliases: {},
					endpoint: "http://localhost:8000",
				},
			],
		);

		expect(lines).toEqual([
			"kroki-remote [registered] (http://localhost:8000) \u2014 mermaid",
		]);
	});

	it("omits endpoint when it is the default kroki.io", () => {
		const lines = formatProcessorLines([
			{
				id: "kroki-remote",
				status: "registered",
				tags: ["mermaid"],
				aliases: {},
			},
		]);

		// No parenthetical endpoint.
		expect(lines[0]).not.toContain("(");
	});

	it("renders a disabled processor with [disabled] badge", () => {
		const lines = formatProcessorLines([
			{
				id: "kroki-remote",
				status: "disabled",
				tags: ["mermaid"],
				aliases: {},
			},
		]);

		expect(lines).toEqual(["kroki-remote [disabled] \u2014 mermaid"]);
	});

	it("renders a processor with no aliases as plain comma-separated tags", () => {
		const lines = formatProcessorLines([
			{
				id: "graphviz-host",
				status: "registered",
				tags: ["graphviz"],
				aliases: {},
			},
		]);

		expect(lines).toEqual(["graphviz-host [registered] — graphviz"]);
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
				id: "kroki-remote",
				status: "registered",
				tags: ["mermaid"],
				aliases: {},
			},
			{
				id: "graphviz-host",
				status: "registered",
				tags: ["graphviz"],
				aliases: { dot: "graphviz" },
			},
		]);

		expect(lines).toEqual([
			"kroki-remote [registered] — mermaid",
			"graphviz-host [registered] — graphviz (dot)",
		]);
	});

	it("renders an unavailable processor as two lines: header + indented reason + installHint", () => {
		const lines = formatProcessorLines([
			{
				id: "graphviz-host",
				status: "unavailable",
				tags: ["graphviz"],
				aliases: { dot: "graphviz" },
				unavailableReason: "dot binary not found on PATH",
				installHint: "apt install graphviz (Debian/Ubuntu) · brew install graphviz (macOS)",
			},
		]);

		expect(lines).toEqual([
			"graphviz-host [unavailable] — graphviz (dot)",
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
				id: "graphviz-host",
				status: "unavailable",
				tags: ["graphviz"],
				aliases: { dot: "graphviz" },
				unavailableReason: "dot not found",
				installHint: "apt install graphviz",
			},
			{
				id: "kroki-remote",
				status: "registered",
				tags: ["mermaid", "graphviz"],
				aliases: { dot: "graphviz" },
			},
		]);

		expect(lines).toEqual([
			"graphviz-host [unavailable] — graphviz (dot)",
			"    dot not found. apt install graphviz",
			"kroki-remote [registered] — mermaid, graphviz (dot)",
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
	const krokiRemote = {
		id: "kroki-remote" as const,
		status: "registered" as const,
		tags: ["mermaid", "graphviz"],
		aliases: { dot: "graphviz" },
	};
	const local = {
		id: "graphviz-host" as const,
		status: "registered" as const,
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	};

	it("emits the Bindings section for effective rows", () => {
		const lines = formatProcessorLines(
			[local, krokiRemote],
			[
				{ status: "effective", tag: "graphviz", selector: "processor", processorId: "kroki-remote" },
				{ status: "effective", tag: "dot", selector: "processor", processorId: "kroki-remote" },
			],
		);

		expect(lines).toEqual([
			"graphviz-host [registered] — graphviz (dot)",
			"kroki-remote [registered] — mermaid, graphviz (dot)",
			"",
			"Bindings",
			"  graphviz → kroki-remote",
			"  dot → kroki-remote",
		]);
	});

	it("formats effective placement bindings", () => {
		const lines = formatProcessorLines(
			[local, krokiRemote],
			[
				{
					status: "effective",
					tag: "graphviz",
					selector: "placement",
					placement: "host",
					processorId: "graphviz-host",
				},
			],
		);

		expect(lines).toContain("  graphviz → placement:host (graphviz-host)");
	});

	it("emits the Binding issues section with per-row reasons", () => {
		const lines = formatProcessorLines(
			[krokiRemote],
			[
				{
					status: "issue",
					tag: "graphviz",
					selector: "processor",
					processorId: "graphviz-host",
					reason: "processor-unavailable",
				},
				{
					status: "issue",
					tag: "mermaid",
					selector: "processor",
					processorId: "nonexistent",
					reason: "unknown-processor",
				},
			],
		);

		expect(lines).toEqual([
			"kroki-remote [registered] — mermaid, graphviz (dot)",
			"",
			"Binding issues",
			"  graphviz → graphviz-host (processor unavailable)",
			"  mermaid → nonexistent (unknown processor)",
		]);
	});

	it("renders placement-disabled issue bindings", () => {
		const lines = formatProcessorLines(
			[local, krokiRemote],
			[
				{
					status: "issue",
					tag: "graphviz",
					selector: "processor",
					processorId: "kroki-remote",
					reason: "processor-placement-disabled",
				},
			],
		);

		expect(lines).toContain("  graphviz → kroki-remote (processor placement disabled)");
	});

	it("renders placement selector issue bindings", () => {
		const lines = formatProcessorLines(
			[local, krokiRemote],
			[
				{
					status: "issue",
					tag: "graphviz",
					selector: "placement",
					placement: "host",
					reason: "placement-disabled",
				},
				{
					status: "issue",
					tag: "mermaid",
					selector: "placement",
					placement: "host",
					reason: "placement-no-match",
				},
				{
					status: "issue",
					tag: "dot",
					selector: "placement",
					placement: "host",
					reason: "placement-ambiguous",
					processorIds: ["graphviz-host", "other-host"],
				},
			],
		);

		expect(lines).toContain("  graphviz → placement:host (placement disabled)");
		expect(lines).toContain("  mermaid → placement:host (no matching processor in placement)");
		expect(lines).toContain(
			"  dot → placement:host (ambiguous: graphviz-host, other-host)",
		);
	});

	it("renders does-not-claim-tag issue bindings", () => {
		const lines = formatProcessorLines(
			[local, krokiRemote],
			[
				{
					status: "issue",
					tag: "csv",
					selector: "processor",
					processorId: "kroki-remote",
					reason: "processor-does-not-claim-tag",
				},
			],
		);

		expect(lines).toContain("  csv → kroki-remote (processor does not claim tag)");
	});

	it("emits both sections together when bindings split across buckets", () => {
		const lines = formatProcessorLines(
			[local, krokiRemote],
			[
				{ status: "effective", tag: "graphviz", selector: "processor", processorId: "kroki-remote" },
				{
					status: "issue",
					tag: "mermaid",
					selector: "processor",
					processorId: "nonexistent",
					reason: "unknown-processor",
				},
			],
		);

		expect(lines).toEqual([
			"graphviz-host [registered] — graphviz (dot)",
			"kroki-remote [registered] — mermaid, graphviz (dot)",
			"",
			"Bindings",
			"  graphviz → kroki-remote",
			"",
			"Binding issues",
			"  mermaid → nonexistent (unknown processor)",
		]);
	});

	it("hides both sections when bindings is undefined", () => {
		const lines = formatProcessorLines([local]);

		expect(lines).toEqual(["graphviz-host [registered] — graphviz (dot)"]);
	});

	it("hides both sections when bindings is an empty array", () => {
		const lines = formatProcessorLines([local], []);

		expect(lines).toEqual(["graphviz-host [registered] — graphviz (dot)"]);
	});

	it("handles bindings-only with no processors (defensive)", () => {
		// Shouldn't happen in production but shouldn't crash either.
		const lines = formatProcessorLines(
			[],
			[{ status: "effective", tag: "graphviz", selector: "processor", processorId: "kroki-remote" }],
		);

		expect(lines).toEqual([
			"(no processors registered)",
			"",
			"Bindings",
			"  graphviz → kroki-remote",
		]);
	});
});
