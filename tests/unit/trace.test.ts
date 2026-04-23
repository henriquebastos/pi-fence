/**
 * Unit tests for `trace.ts` — resolution trace for a given tag.
 */

import { describe, expect, it } from "vitest";

import { traceResolution, formatTraceLines, type TraceStep } from "../../extensions/pi-fence/trace.ts";
import type { Availability, FenceProcessor } from "../../extensions/pi-fence/processor.ts";

function proc(id: string, tags: string[], aliases: Record<string, string> = {}): FenceProcessor {
	return {
		id,
		tags,
		aliases,
		available: async () => ({ ok: true }),
		render: async () => ({ ok: true, text: "ok" }),
	};
}

function avail(...ids: string[]): Map<string, Availability> {
	const map = new Map<string, Availability>();
	for (const id of ids) map.set(id, { ok: true });
	return map;
}

function unavail(id: string, reason: string, base?: Map<string, Availability>): Map<string, Availability> {
	const map = new Map(base ?? []);
	map.set(id, { ok: false, reason });
	return map;
}

describe("traceResolution", () => {
	it("selects the first available processor that claims the tag", () => {
		const processors = [proc("a", ["mermaid"]), proc("b", ["mermaid"])];
		const availability = avail("a", "b");

		const trace = traceResolution(processors, availability, "mermaid");

		expect(trace).toHaveLength(2);
		expect(trace[0]).toMatchObject({ id: "a", claimsTag: true, available: true, outcome: "selected" });
		expect(trace[1]).toMatchObject({ id: "b", claimsTag: true, available: true, outcome: "skipped" });
	});

	it("skips unavailable processors", () => {
		const processors = [proc("a", ["dot"]), proc("b", ["dot"])];
		const availability = unavail("a", "not found", avail("b"));

		const trace = traceResolution(processors, availability, "dot");

		expect(trace[0]).toMatchObject({ id: "a", claimsTag: true, available: false, outcome: "skipped" });
		expect(trace[1]).toMatchObject({ id: "b", claimsTag: true, available: true, outcome: "selected" });
	});

	it("skips processors that don't claim the tag", () => {
		const processors = [proc("a", ["csv"]), proc("b", ["mermaid"])];
		const availability = avail("a", "b");

		const trace = traceResolution(processors, availability, "mermaid");

		expect(trace[0]).toMatchObject({ id: "a", claimsTag: false, outcome: "skipped" });
		expect(trace[1]).toMatchObject({ id: "b", claimsTag: true, outcome: "selected" });
	});

	it("resolves aliases", () => {
		const processors = [proc("a", ["graphviz"], { dot: "graphviz" })];
		const availability = avail("a");

		const trace = traceResolution(processors, availability, "dot");

		expect(trace[0]).toMatchObject({ id: "a", claimsTag: true, outcome: "selected" });
	});

	it("respects bindings", () => {
		const processors = [proc("a", ["mermaid"]), proc("b", ["mermaid"])];
		const availability = avail("a", "b");

		const trace = traceResolution(processors, availability, "mermaid", { mermaid: "b" });

		const selected = trace.find((s) => s.outcome === "selected");
		expect(selected?.id).toBe("b");
		expect(selected?.boundByConfig).toBe(true);
	});

	it("skips disabled processors", () => {
		const processors = [proc("a", ["mermaid"]), proc("b", ["mermaid"])];
		const availability = avail("a", "b");

		const trace = traceResolution(processors, availability, "mermaid", {}, new Set(["a"]));

		expect(trace[0]).toMatchObject({ id: "a", disabled: true, outcome: "skipped" });
		expect(trace[1]).toMatchObject({ id: "b", outcome: "selected" });
	});

	it("returns all-skipped trace for unknown tag", () => {
		const processors = [proc("a", ["csv"])];
		const availability = avail("a");

		const trace = traceResolution(processors, availability, "unknown");

		expect(trace).toHaveLength(1);
		expect(trace[0]).toMatchObject({ claimsTag: false, outcome: "skipped" });
	});
});

describe("formatTraceLines", () => {
	it("formats a trace into human-readable lines", () => {
		const trace: TraceStep[] = [
			{ id: "a", claimsTag: true, available: true, disabled: false, boundByConfig: false, outcome: "selected", reason: "first available" },
			{ id: "b", claimsTag: true, available: true, disabled: false, boundByConfig: false, outcome: "skipped", reason: "already resolved" },
		];

		const lines = formatTraceLines("mermaid", trace);

		expect(lines.length).toBeGreaterThan(0);
		expect(lines.some((l) => l.includes("mermaid"))).toBe(true);
		expect(lines.some((l) => l.includes("a") && l.includes("selected"))).toBe(true);
		expect(lines.some((l) => l.includes("b") && l.includes("skipped"))).toBe(true);
	});

	it("shows 'no match' when no processor selected", () => {
		const trace: TraceStep[] = [
			{ id: "a", claimsTag: false, available: true, disabled: false, boundByConfig: false, outcome: "skipped", reason: "does not claim tag" },
		];

		const lines = formatTraceLines("unknown", trace);

		expect(lines.some((l) => l.toLowerCase().includes("no processor"))).toBe(true);
	});
});
