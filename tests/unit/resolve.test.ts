/**
 * Unit tests for the resolve module — processor resolution (registry
 * rule) and the wire-time availability probe.
 *
 * Uses tiny hand-rolled fake processors with scripted responses. No
 * promotion to `tests/utilities/` until a second consumer appears
 * (principles: no premature abstraction).
 */

import { describe, expect, it } from "vitest";

import type {
	Availability,
	FenceProcessor,
	FenceResult,
	ProcessorPlacement,
} from "../../extensions/pi-fence/processor.ts";
import {
	collectSupportedTags,
	probeAvailability,
	resolveBindings,
	resolveProcessor,
	type TraceStep,
} from "../../extensions/pi-fence/resolve.ts";

interface FakeProcessorOptions {
	id: string;
	tags?: readonly string[];
	aliases?: Record<string, string>;
	placement?: ProcessorPlacement;
	availability?: Availability;
	availableThrows?: unknown;
}

function makeFakeProcessor(opts: FakeProcessorOptions): FenceProcessor {
	return {
		id: opts.id,
		placement: opts.placement ?? "remote",
		tags: opts.tags ?? [],
		aliases: opts.aliases ?? {},
		async available(): Promise<Availability> {
			if (opts.availableThrows !== undefined) {
				throw opts.availableThrows;
			}
			return opts.availability ?? { ok: true };
		},
		async render(): Promise<FenceResult> {
			return { ok: true, png: Buffer.alloc(0) };
		},
	};
}

function expectResolution(
	result: ReturnType<typeof resolveProcessor>,
	processorId: string | null,
	steps: readonly TraceStep[],
): void {
	expect(result.processor?.id ?? null).toBe(processorId);
	expect(result.steps).toEqual(steps);
}

describe("resolveProcessor", () => {
	it("returns the first available processor whose canonical tags include the tag", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const b = makeFakeProcessor({ id: "b", tags: ["mermaid"] });
		const availability = new Map<string, Availability>([
			["a", { ok: true }],
			["b", { ok: true }],
		]);

		expectResolution(resolveProcessor([a, b], availability, "graphviz"), "a", [
			{ id: "a", outcome: "selected-first-available" },
			{ id: "b", outcome: "skipped-already-resolved" },
		]);
		expectResolution(resolveProcessor([a, b], availability, "mermaid"), "b", [
			{ id: "a", outcome: "skipped-no-claim" },
			{ id: "b", outcome: "selected-first-available" },
		]);
	});

	it("returns the first available processor whose aliases include the tag", () => {
		const a = makeFakeProcessor({
			id: "a",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([["a", { ok: true }]]);

		expectResolution(resolveProcessor([a], availability, "dot"), "a", [
			{ id: "a", outcome: "selected-first-available" },
		]);
	});

	it("skips processors whose availability is not ok and returns the next match", () => {
		// Mirrors the production scenario: graphviz-local registered
		// first (but unavailable: dot not on PATH), kroki registered
		// second (available). resolve('graphviz') must fall through to
		// kroki.
		const local = makeFakeProcessor({
			id: "graphviz-local",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const kroki = makeFakeProcessor({
			id: "kroki",
			tags: ["graphviz", "mermaid"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: false, reason: "dot not found on PATH" }],
			["kroki", { ok: true }],
		]);

		expectResolution(resolveProcessor([local, kroki], availability, "graphviz"), "kroki", [
			{ id: "graphviz-local", outcome: "skipped-unavailable" },
			{ id: "kroki", outcome: "selected-first-available" },
		]);
		expectResolution(resolveProcessor([local, kroki], availability, "dot"), "kroki", [
			{ id: "graphviz-local", outcome: "skipped-unavailable" },
			{ id: "kroki", outcome: "selected-first-available" },
		]);
	});

	it("preserves registration order: first available match wins", () => {
		// Both processors available, both claim graphviz → the first
		// registered one wins. This is the one piece of precedence
		// CV0.E2 commits to (explicit user binding defers to S2).
		const local = makeFakeProcessor({
			id: "graphviz-local",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const kroki = makeFakeProcessor({
			id: "kroki",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);

		expectResolution(
			resolveProcessor([local, kroki], availability, "graphviz"),
			"graphviz-local",
			[
				{ id: "graphviz-local", outcome: "selected-first-available" },
				{ id: "kroki", outcome: "skipped-already-resolved" },
			],
		);
		expectResolution(resolveProcessor([local, kroki], availability, "dot"), "graphviz-local", [
			{ id: "graphviz-local", outcome: "selected-first-available" },
			{ id: "kroki", outcome: "skipped-already-resolved" },
		]);
	});

	it("returns null when no registered processor claims the tag", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["mermaid"] });
		const availability = new Map<string, Availability>([["a", { ok: true }]]);

		expectResolution(resolveProcessor([a], availability, "graphviz"), null, [
			{ id: "a", outcome: "skipped-no-claim" },
		]);
	});

	it("returns null when every claimer is unavailable", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const availability = new Map<string, Availability>([
			["a", { ok: false, reason: "broken" }],
		]);

		expectResolution(resolveProcessor([a], availability, "graphviz"), null, [
			{ id: "a", outcome: "skipped-unavailable" },
		]);
	});

	it("returns null when a processor id is missing from the availability map", () => {
		// Shouldn't happen in production (probeAvailability populates
		// every processor), but belt-and-braces: treat missing as not-ok
		// rather than throwing on `.get(undefined)`.
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const availability = new Map<string, Availability>();

		expectResolution(resolveProcessor([a], availability, "graphviz"), null, [
			{ id: "a", outcome: "skipped-unavailable" },
		]);
	});

	it("returns null when the processor array is empty", () => {
		expectResolution(resolveProcessor([], new Map(), "graphviz"), null, []);
	});
});

describe("resolveProcessor — bindings branch (CV0.E2.S2)", () => {
	const local = makeFakeProcessor({
		id: "graphviz-local",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const kroki = makeFakeProcessor({
		id: "kroki",
		tags: ["graphviz", "mermaid", "plantuml"],
		aliases: { dot: "graphviz", puml: "plantuml" },
	});

	it("binding wins over capability order when bound processor is available", () => {
		// Both processors available. Without a binding, registration order
		// (graphviz-local first) wins for the 'graphviz' tag. With a
		// binding 'graphviz → kroki', Kroki wins instead.
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);
		const bindings = { graphviz: "kroki" };

		expectResolution(
			resolveProcessor([local, kroki], availability, "graphviz", bindings),
			"kroki",
			[
				{ id: "graphviz-local", outcome: "skipped-binding-prefers-other" },
				{ id: "kroki", outcome: "selected-by-binding" },
			],
		);
	});

	it("binding falls through when bound processor is unavailable", () => {
		// User bound 'graphviz → graphviz-local' but dot is not installed.
		// Bindings are preferences, not hard requirements: fall back to
		// capability-based rule (Kroki wins).
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: false, reason: "dot not found" }],
			["kroki", { ok: true }],
		]);
		const bindings = { graphviz: "graphviz-local" };

		expectResolution(
			resolveProcessor([local, kroki], availability, "graphviz", bindings),
			"kroki",
			[
				{ id: "graphviz-local", outcome: "skipped-unavailable" },
				{ id: "kroki", outcome: "selected-first-available" },
			],
		);
	});

	it("binding falls through when the processor id is unknown", () => {
		// Typo in the config. Capability-based rule still applies.
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);
		const bindings = { graphviz: "nonexistent-typo" };

		expectResolution(
			resolveProcessor([local, kroki], availability, "graphviz", bindings),
			"graphviz-local",
			[
				{ id: "graphviz-local", outcome: "selected-first-available" },
				{ id: "kroki", outcome: "skipped-already-resolved" },
			],
		);
	});

	it("binding on an alias tag also honoured", () => {
		// Bindings key on tag names as-written. Users can bind either the
		// canonical tag (graphviz) or the alias (dot) — both map through
		// to the same processor at resolution time because `dot` is a key
		// on each processor's aliases map.
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);
		const bindings = { dot: "kroki" };

		expectResolution(resolveProcessor([local, kroki], availability, "dot", bindings), "kroki", [
			{ id: "graphviz-local", outcome: "skipped-binding-prefers-other" },
			{ id: "kroki", outcome: "selected-by-binding" },
		]);
	});

	it("binding can select a processor that does not claim the tag", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);
		const bindings = { unknown: "kroki" };

		expectResolution(
			resolveProcessor([local, kroki], availability, "unknown", bindings),
			"kroki",
			[
				{ id: "graphviz-local", outcome: "skipped-no-claim" },
				{ id: "kroki", outcome: "selected-by-binding" },
			],
		);
	});

	it("behaves identically to S1 when bindings is undefined", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);

		expectResolution(
			resolveProcessor([local, kroki], availability, "graphviz"),
			"graphviz-local",
			[
				{ id: "graphviz-local", outcome: "selected-first-available" },
				{ id: "kroki", outcome: "skipped-already-resolved" },
			],
		);
	});

	it("behaves identically to S1 when bindings is an empty object", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);

		expectResolution(
			resolveProcessor([local, kroki], availability, "graphviz", {}),
			"graphviz-local",
			[
				{ id: "graphviz-local", outcome: "selected-first-available" },
				{ id: "kroki", outcome: "skipped-already-resolved" },
			],
		);
	});

	it("returns null when the binding + capability both fail to produce a match", () => {
		const availability = new Map<string, Availability>([
			["kroki", { ok: true }],
		]);
		const solo = makeFakeProcessor({ id: "kroki", tags: ["mermaid"] });
		const bindings = { mermaid: "nonexistent" };

		// Bound to unknown → fall through. Capability sees Kroki claims
		// mermaid and is available → returns Kroki.
		expectResolution(resolveProcessor([solo], availability, "mermaid", bindings), "kroki", [
			{ id: "kroki", outcome: "selected-first-available" },
		]);

		// Now bind mermaid to kroki and ask for graphviz — no claimer.
		expectResolution(
			resolveProcessor([solo], availability, "graphviz", { mermaid: "kroki" }),
			null,
			[{ id: "kroki", outcome: "skipped-no-claim" }],
		);
	});
});

describe("resolveProcessor — disabled set", () => {
	const local = makeFakeProcessor({
		id: "graphviz-local",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const kroki = makeFakeProcessor({
		id: "kroki",
		tags: ["graphviz", "mermaid"],
	});
	const bothAvailable = new Map<string, Availability>([
		["graphviz-local", { ok: true }],
		["kroki", { ok: true }],
	]);

	it("skips a disabled processor in capability-based resolution", () => {
		expectResolution(
			resolveProcessor(
				[local, kroki],
				bothAvailable,
				"graphviz",
				undefined,
				new Set(["graphviz-local"]),
			),
			"kroki",
			[
				{ id: "graphviz-local", outcome: "skipped-disabled" },
				{ id: "kroki", outcome: "selected-first-available" },
			],
		);
	});

	it("skips a disabled processor even when it is the binding target", () => {
		// Binding target is disabled → falls through to capability.
		expectResolution(
			resolveProcessor(
				[local, kroki],
				bothAvailable,
				"graphviz",
				{ graphviz: "graphviz-local" },
				new Set(["graphviz-local"]),
			),
			"kroki",
			[
				{ id: "graphviz-local", outcome: "skipped-disabled" },
				{ id: "kroki", outcome: "selected-first-available" },
			],
		);
	});

	it("returns null when all processors for a tag are disabled", () => {
		expectResolution(
			resolveProcessor(
				[local, kroki],
				bothAvailable,
				"graphviz",
				undefined,
				new Set(["graphviz-local", "kroki"]),
			),
			null,
			[
				{ id: "graphviz-local", outcome: "skipped-disabled" },
				{ id: "kroki", outcome: "skipped-disabled" },
			],
		);
	});

	it("empty disabled set has no effect", () => {
		expectResolution(
			resolveProcessor(
				[local, kroki],
				bothAvailable,
				"graphviz",
				undefined,
				new Set(),
			),
			"graphviz-local",
			[
				{ id: "graphviz-local", outcome: "selected-first-available" },
				{ id: "kroki", outcome: "skipped-already-resolved" },
			],
		);
	});
});

describe("resolveBindings", () => {
	const local = makeFakeProcessor({
		id: "graphviz-local",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const kroki = makeFakeProcessor({
		id: "kroki",
		tags: ["mermaid", "graphviz"],
	});

	it("categorises an effective binding (registered + available)", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);

		const rows = resolveBindings([local, kroki], availability, {
			graphviz: "kroki",
		});

		expect(rows).toEqual([
			{ status: "effective", tag: "graphviz", processorId: "kroki" },
		]);
	});

	it("categorises ignored-unknown-processor", () => {
		const availability = new Map<string, Availability>([["kroki", { ok: true }]]);

		const rows = resolveBindings([kroki], availability, {
			graphviz: "nonexistent",
		});

		expect(rows).toEqual([
			{
				status: "ignored",
				tag: "graphviz",
				processorId: "nonexistent",
				reason: "unknown-processor",
			},
		]);
	});

	it("categorises ignored-processor-disabled", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);

		const rows = resolveBindings(
			[local, kroki],
			availability,
			{ graphviz: "graphviz-local" },
			new Set(["graphviz-local"]),
		);

		expect(rows).toEqual([
			{
				status: "ignored",
				tag: "graphviz",
				processorId: "graphviz-local",
				reason: "processor-disabled",
			},
		]);
	});

	it("categorises ignored-processor-unavailable", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: false, reason: "dot not found" }],
			["kroki", { ok: true }],
		]);

		const rows = resolveBindings([local, kroki], availability, {
			graphviz: "graphviz-local",
		});

		expect(rows).toEqual([
			{
				status: "ignored",
				tag: "graphviz",
				processorId: "graphviz-local",
				reason: "processor-unavailable",
			},
		]);
	});

	it("preserves iteration order of bindings", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: true }],
			["kroki", { ok: true }],
		]);

		const rows = resolveBindings([local, kroki], availability, {
			mermaid: "kroki",
			graphviz: "kroki",
			dot: "kroki",
		});

		expect(rows.map((r) => r.tag)).toEqual(["mermaid", "graphviz", "dot"]);
	});

	it("returns an empty array for empty bindings", () => {
		expect(resolveBindings([local], new Map(), {})).toEqual([]);
	});

	it("mixes effective + ignored rows in one call", () => {
		const availability = new Map<string, Availability>([
			["graphviz-local", { ok: false, reason: "nope" }],
			["kroki", { ok: true }],
		]);

		const rows = resolveBindings([local, kroki], availability, {
			graphviz: "graphviz-local", // ignored: unavailable
			mermaid: "kroki", // effective
			puml: "nonexistent", // ignored: unknown
		});

		expect(rows.map((r) => r.status)).toEqual(["ignored", "effective", "ignored"]);
	});
});

describe("probeAvailability", () => {
	it("populates the map in processor-registration order", async () => {
		const a = makeFakeProcessor({ id: "a", availability: { ok: true } });
		const b = makeFakeProcessor({
			id: "b",
			availability: { ok: false, reason: "nope" },
		});

		const map = await probeAvailability([a, b]);

		expect([...map.keys()]).toEqual(["a", "b"]);
		expect(map.get("a")).toEqual({ ok: true });
		expect(map.get("b")).toEqual({ ok: false, reason: "nope" });
	});

	it("catches a thrown Error from a processor's available() and records it as unavailable", async () => {
		// Defensive: the FenceProcessor contract says available() must
		// not throw. If a future processor author forgets, a thrown
		// probe would propagate out of the extension's wire-time init
		// loop and crash the extension. probeAvailability wraps each
		// call to prevent that.
		const ok = makeFakeProcessor({ id: "ok" });
		const broken = makeFakeProcessor({
			id: "broken",
			availableThrows: new Error("sudden death"),
		});

		const map = await probeAvailability([ok, broken]);

		expect(map.get("ok")).toEqual({ ok: true });
		const brokenResult = map.get("broken");
		expect(brokenResult?.ok).toBe(false);
		if (brokenResult?.ok === false) {
			expect(brokenResult.reason).toContain("sudden death");
		}
	});

	it("catches a non-Error thrown value", async () => {
		const weird = makeFakeProcessor({
			id: "weird",
			availableThrows: "string-thrown-as-non-Error",
		});

		const map = await probeAvailability([weird]);

		const result = map.get("weird");
		expect(result?.ok).toBe(false);
		if (result?.ok === false) {
			expect(result.reason).toContain("string-thrown-as-non-Error");
		}
	});

	it("is a no-op for an empty processor array", async () => {
		const map = await probeAvailability([]);
		expect(map.size).toBe(0);
	});
});

describe("collectSupportedTags", () => {
	it("returns the union of canonical tags and alias keys across processors", () => {
		const local = makeFakeProcessor({
			id: "graphviz-local",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const kroki = makeFakeProcessor({
			id: "kroki",
			tags: ["graphviz", "mermaid", "plantuml"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});

		const tags = collectSupportedTags([local, kroki]);

		// The parser's allowlist — order doesn't matter, membership does.
		expect(new Set(tags)).toEqual(
			new Set(["graphviz", "dot", "mermaid", "plantuml", "puml"]),
		);
	});

	it("deduplicates tags claimed by multiple processors", () => {
		const a = makeFakeProcessor({
			id: "a",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const b = makeFakeProcessor({
			id: "b",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});

		const tags = collectSupportedTags([a, b]);

		expect(tags.filter((t) => t === "graphviz")).toHaveLength(1);
		expect(tags.filter((t) => t === "dot")).toHaveLength(1);
	});

	it("returns an empty array for zero processors", () => {
		expect(collectSupportedTags([])).toEqual([]);
	});
});
