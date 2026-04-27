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
		placement: opts.placement ?? inferPlacementFromId(opts.id),
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

function inferPlacementFromId(id: string): ProcessorPlacement {
	if (id.endsWith("-embedded")) return "embedded";
	if (id.endsWith("-host")) return "host";
	if (id.endsWith("-sandbox")) return "sandbox";
	if (id.endsWith("-remote")) return "remote";
	return "remote";
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
	it("returns the available processor in the winning placement whose canonical tags include the tag", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const b = makeFakeProcessor({ id: "b", tags: ["mermaid"] });
		const availability = new Map<string, Availability>([
			["a", { ok: true }],
			["b", { ok: true }],
		]);

		expectResolution(resolveProcessor([a, b], availability, "graphviz"), "a", [
			{ id: "a", outcome: "selected-by-placement" },
			{ id: "b", outcome: "skipped-already-resolved" },
		]);
		expectResolution(resolveProcessor([a, b], availability, "mermaid"), "b", [
			{ id: "a", outcome: "skipped-no-claim" },
			{ id: "b", outcome: "selected-by-placement" },
		]);
	});

	it("does not claim inherited aliases", () => {
		const a = makeFakeProcessor({
			id: "a",
			tags: ["graphviz"],
			aliases: {},
		});
		const availability = new Map<string, Availability>([["a", { ok: true }]]);

		expectResolution(resolveProcessor([a], availability, "constructor"), null, [
			{ id: "a", outcome: "skipped-no-claim" },
		]);
	});

	it("returns the available processor in the winning placement whose aliases include the tag", () => {
		const a = makeFakeProcessor({
			id: "a",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([["a", { ok: true }]]);

		expectResolution(resolveProcessor([a], availability, "dot"), "a", [
			{ id: "a", outcome: "selected-by-placement" },
		]);
	});

	it("skips processors whose availability is not ok and returns the next match", () => {
		// Mirrors the production scenario: graphviz-host registered
		// first (but unavailable: dot not on PATH), krokiRemote registered
		// second (available). resolve('graphviz') must fall through to
		// kroki-remote.
		const local = makeFakeProcessor({
			id: "graphviz-host",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const krokiRemote = makeFakeProcessor({
			id: "kroki-remote",
			tags: ["graphviz", "mermaid"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: false, reason: "dot not found on PATH" }],
			["kroki-remote", { ok: true }],
		]);

		expectResolution(resolveProcessor([local, krokiRemote], availability, "graphviz"), "kroki-remote", [
			{ id: "graphviz-host", outcome: "skipped-unavailable" },
			{ id: "kroki-remote", outcome: "selected-by-placement" },
		]);
		expectResolution(resolveProcessor([local, krokiRemote], availability, "dot"), "kroki-remote", [
			{ id: "graphviz-host", outcome: "skipped-unavailable" },
			{ id: "kroki-remote", outcome: "selected-by-placement" },
		]);
	});

	it("uses placement precedence instead of registration order across placements", () => {
		const krokiRemote = makeFakeProcessor({
			id: "kroki-remote",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const local = makeFakeProcessor({
			id: "graphviz-host",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([
			["kroki-remote", { ok: true }],
			["graphviz-host", { ok: true }],
		]);

		expectResolution(
			resolveProcessor([krokiRemote, local], availability, "graphviz"),
			"graphviz-host",
			[
				{ id: "kroki-remote", outcome: "skipped-lower-precedence" },
				{ id: "graphviz-host", outcome: "selected-by-placement" },
			],
		);
		expectResolution(resolveProcessor([krokiRemote, local], availability, "dot"), "graphviz-host", [
			{ id: "kroki-remote", outcome: "skipped-lower-precedence" },
			{ id: "graphviz-host", outcome: "selected-by-placement" },
		]);
	});

	it("skips placements omitted from processorPrecedence", () => {
		const local = makeFakeProcessor({
			id: "graphviz-host",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const krokiRemote = makeFakeProcessor({
			id: "kroki-remote",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				availability,
				"graphviz",
				undefined,
				undefined,
				["remote"],
			),
			"kroki-remote",
			[
				{ id: "graphviz-host", outcome: "skipped-placement-disabled" },
				{ id: "kroki-remote", outcome: "selected-by-placement" },
			],
		);
	});

	it("uses processorPrecedence order when multiple placements are allowed", () => {
		const local = makeFakeProcessor({
			id: "graphviz-host",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const krokiRemote = makeFakeProcessor({
			id: "kroki-remote",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				availability,
				"graphviz",
				undefined,
				undefined,
				["remote", "host"],
			),
			"kroki-remote",
			[
				{ id: "graphviz-host", outcome: "skipped-lower-precedence" },
				{ id: "kroki-remote", outcome: "selected-by-placement" },
			],
		);
	});

	it("returns an ambiguity when multiple available candidates share the winning placement", () => {
		const a = makeFakeProcessor({ id: "a-host", tags: ["graphviz"] });
		const b = makeFakeProcessor({ id: "b-host", tags: ["graphviz"] });
		const fallback = makeFakeProcessor({ id: "kroki-remote", tags: ["graphviz"] });
		const availability = new Map<string, Availability>([
			["a-host", { ok: true }],
			["b-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const result = resolveProcessor([a, b, fallback], availability, "graphviz");

		expectResolution(result, null, [
			{ id: "a-host", outcome: "skipped-ambiguous-same-placement" },
			{ id: "b-host", outcome: "skipped-ambiguous-same-placement" },
			{ id: "kroki-remote", outcome: "skipped-lower-precedence" },
		]);
		expect(result.ambiguity).toEqual({
			placement: "host",
			processorIds: ["a-host", "b-host"],
		});
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
		id: "graphviz-host",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const krokiRemote = makeFakeProcessor({
		id: "kroki-remote",
		tags: ["graphviz", "mermaid", "plantuml"],
		aliases: { dot: "graphviz", puml: "plantuml" },
	});

	it("ignores inherited selector properties on binding values", () => {
		const availability = new Map<string, Availability>([["kroki-remote", { ok: true }]]);
		const binding = Object.create({ processor: "kroki-remote" });

		expectResolution(
			resolveProcessor(
				[krokiRemote],
				availability,
				"graphviz",
				{ graphviz: binding },
			),
			"kroki-remote",
			[{ id: "kroki-remote", outcome: "selected-by-placement" }],
		);
	});

	it("ignores inherited binding properties when resolving a tag", () => {
		const availability = new Map<string, Availability>([["kroki-remote", { ok: true }]]);
		const bindings = Object.create({ processor: "kroki-remote" }) as Record<
			string,
			{ processor: string }
		>;

		expect(() => resolveProcessor([krokiRemote], availability, "processor", bindings)).not.toThrow();
		expect(resolveProcessor([krokiRemote], availability, "processor", bindings).processor).toBeNull();
	});

	it("processor binding overrides placement policy when bound processor is available", () => {
		// Both processors available. Without a binding, placement policy
		// selects graphviz-host first for the 'graphviz' tag. With a
		// binding 'graphviz → kroki-remote', Kroki wins instead.
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { graphviz: { processor: "kroki-remote" } };

		expectResolution(
			resolveProcessor([local, krokiRemote], availability, "graphviz", bindings),
			"kroki-remote",
			[
				{ id: "graphviz-host", outcome: "skipped-binding-excluded" },
				{ id: "kroki-remote", outcome: "selected-by-binding" },
			],
		);
	});

	it("processor binding returns no processor when bound processor placement is omitted", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { graphviz: { processor: "kroki-remote" } };

		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				availability,
				"graphviz",
				bindings,
				undefined,
				["host"],
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-binding-excluded" },
				{ id: "kroki-remote", outcome: "skipped-placement-disabled" },
			],
		);
	});

	it("placement binding constrains resolution to that placement", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { graphviz: { placement: "host" as const } };

		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				availability,
				"graphviz",
				bindings,
				undefined,
				["remote", "host"],
			),
			"graphviz-host",
			[
				{ id: "graphviz-host", outcome: "selected-by-binding" },
				{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
			],
		);
	});

	it("placement binding returns no processor when no processor in that placement is eligible", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: false, reason: "dot not found" }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { graphviz: { placement: "host" as const } };

		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				availability,
				"graphviz",
				bindings,
				undefined,
				["host", "remote"],
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-unavailable" },
				{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
			],
		);
	});

	it("processor binding resolves same-placement ambiguity", () => {
		const a = makeFakeProcessor({ id: "a-host", tags: ["graphviz"] });
		const b = makeFakeProcessor({ id: "b-host", tags: ["graphviz"] });
		const fallback = makeFakeProcessor({ id: "kroki-remote", tags: ["graphviz"] });
		const availability = new Map<string, Availability>([
			["a-host", { ok: true }],
			["b-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		expectResolution(
			resolveProcessor(
				[a, b, fallback],
				availability,
				"graphviz",
				{ graphviz: { processor: "b-host" } },
			),
			"b-host",
			[
				{ id: "a-host", outcome: "skipped-binding-excluded" },
				{ id: "b-host", outcome: "selected-by-binding" },
				{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
			],
		);
	});

	it("placement binding preserves same-placement ambiguity", () => {
		const a = makeFakeProcessor({ id: "a-host", tags: ["graphviz"] });
		const b = makeFakeProcessor({ id: "b-host", tags: ["graphviz"] });
		const fallback = makeFakeProcessor({ id: "kroki-remote", tags: ["graphviz"] });
		const availability = new Map<string, Availability>([
			["a-host", { ok: true }],
			["b-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const result = resolveProcessor(
			[a, b, fallback],
			availability,
			"graphviz",
			{ graphviz: { placement: "host" } },
			undefined,
			["remote", "host"],
		);

		expectResolution(result, null, [
			{ id: "a-host", outcome: "skipped-ambiguous-same-placement" },
			{ id: "b-host", outcome: "skipped-ambiguous-same-placement" },
			{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
		]);
		expect(result.ambiguity).toEqual({
			placement: "host",
			processorIds: ["a-host", "b-host"],
		});
	});

	it("processor binding returns no processor when the bound processor is unavailable", () => {
		// User bound 'graphviz → graphviz-host' but dot is not installed.
		// Object bindings are constraints: do not fall through to Kroki.
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: false, reason: "dot not found" }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { graphviz: { processor: "graphviz-host" } };

		expectResolution(
			resolveProcessor([local, krokiRemote], availability, "graphviz", bindings),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-unavailable" },
				{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
			],
		);
	});

	it("processor binding to __proto__ returns no processor instead of falling back", () => {
		const availability = new Map<string, Availability>([["kroki-remote", { ok: true }]]);

		expectResolution(
			resolveProcessor(
				[krokiRemote],
				availability,
				"graphviz",
				{ graphviz: { processor: "__proto__" } },
			),
			null,
			[{ id: "kroki-remote", outcome: "skipped-binding-excluded" }],
		);
	});

	it("processor binding returns no processor when the processor id is unknown", () => {
		// Typo in the config. Object bindings are constraints, not preferences.
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { graphviz: { processor: "nonexistent-typo" } };

		expectResolution(
			resolveProcessor([local, krokiRemote], availability, "graphviz", bindings),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-binding-excluded" },
				{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
			],
		);
	});

	it("binding on an alias tag also honoured", () => {
		// Bindings key on tag names as-written. Users can bind either the
		// canonical tag (graphviz) or the alias (dot) — both map through
		// to the same processor at resolution time because `dot` is a key
		// on each processor's aliases map.
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { dot: { processor: "kroki-remote" } };

		expectResolution(resolveProcessor([local, krokiRemote], availability, "dot", bindings), "kroki-remote", [
			{ id: "graphviz-host", outcome: "skipped-binding-excluded" },
			{ id: "kroki-remote", outcome: "selected-by-binding" },
		]);
	});

	it("binding becomes an issue when the processor does not claim the tag", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);
		const bindings = { unknown: { processor: "kroki-remote" } };

		expectResolution(
			resolveProcessor([local, krokiRemote], availability, "unknown", bindings),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-no-claim" },
				{ id: "kroki-remote", outcome: "skipped-no-claim" },
			],
		);
	});

	it("behaves identically to S1 when bindings is undefined", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		expectResolution(
			resolveProcessor([local, krokiRemote], availability, "graphviz"),
			"graphviz-host",
			[
				{ id: "graphviz-host", outcome: "selected-by-placement" },
				{ id: "kroki-remote", outcome: "skipped-lower-precedence" },
			],
		);
	});

	it("behaves identically to S1 when bindings is an empty object", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		expectResolution(
			resolveProcessor([local, krokiRemote], availability, "graphviz", {}),
			"graphviz-host",
			[
				{ id: "graphviz-host", outcome: "selected-by-placement" },
				{ id: "kroki-remote", outcome: "skipped-lower-precedence" },
			],
		);
	});

	it("returns null when the binding cannot select a processor", () => {
		const availability = new Map<string, Availability>([
			["kroki-remote", { ok: true }],
		]);
		const solo = makeFakeProcessor({ id: "kroki-remote", tags: ["mermaid"] });
		const bindings = { mermaid: { processor: "nonexistent" } };

		// Bound to unknown → constrained to no processor.
		expectResolution(resolveProcessor([solo], availability, "mermaid", bindings), null, [
			{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
		]);

		// Now bind mermaid to kroki-remote and ask for graphviz — no claimer.
		expectResolution(
			resolveProcessor([solo], availability, "graphviz", { mermaid: { processor: "kroki-remote" } }),
			null,
			[{ id: "kroki-remote", outcome: "skipped-no-claim" }],
		);
	});
});

describe("resolveProcessor — blocked tag families", () => {
	const local = makeFakeProcessor({
		id: "graphviz-host",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const krokiRemote = makeFakeProcessor({
		id: "kroki-remote",
		tags: ["graphviz", "mermaid"],
		aliases: { dot: "graphviz" },
	});
	const bothAvailable = new Map<string, Availability>([
		["graphviz-host", { ok: true }],
		["kroki-remote", { ok: true }],
	]);

	it("blocks an alias request when the canonical tag family is blocked", () => {
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"dot",
				undefined,
				undefined,
				["host", "remote"],
				new Set(["graphviz"]),
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-tag-blocked" },
				{ id: "kroki-remote", outcome: "skipped-tag-blocked" },
			],
		);
	});

	it("blocks a canonical request when an alias tag family is blocked", () => {
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"graphviz",
				undefined,
				undefined,
				["host", "remote"],
				new Set(["dot"]),
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-tag-blocked" },
				{ id: "kroki-remote", outcome: "skipped-tag-blocked" },
			],
		);
	});

	it("blocks a tag family even when a processor binding names an eligible processor", () => {
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"dot",
				{ dot: { processor: "kroki-remote" } },
				undefined,
				["host", "remote"],
				new Set(["graphviz"]),
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-tag-blocked" },
				{ id: "kroki-remote", outcome: "skipped-tag-blocked" },
			],
		);
	});
});

describe("resolveProcessor — blocked processor set", () => {
	const local = makeFakeProcessor({
		id: "graphviz-host",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const krokiRemote = makeFakeProcessor({
		id: "kroki-remote",
		tags: ["graphviz", "mermaid"],
	});
	const bothAvailable = new Map<string, Availability>([
		["graphviz-host", { ok: true }],
		["kroki-remote", { ok: true }],
	]);

	it("skips a blocked processor in placement-policy resolution", () => {
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"graphviz",
				undefined,
				new Set(["graphviz-host"]),
			),
			"kroki-remote",
			[
				{ id: "graphviz-host", outcome: "skipped-processor-blocked" },
				{ id: "kroki-remote", outcome: "selected-by-placement" },
			],
		);
	});

	it("returns no processor when a blocked processor is the binding target", () => {
		// Binding target is blocked → constrained to no processor.
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"graphviz",
				{ graphviz: { processor: "graphviz-host" } },
				new Set(["graphviz-host"]),
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-processor-blocked" },
				{ id: "kroki-remote", outcome: "skipped-binding-excluded" },
			],
		);
	});

	it("returns null when all processors for a tag are blocked", () => {
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"graphviz",
				undefined,
				new Set(["graphviz-host", "kroki-remote"]),
			),
			null,
			[
				{ id: "graphviz-host", outcome: "skipped-processor-blocked" },
				{ id: "kroki-remote", outcome: "skipped-processor-blocked" },
			],
		);
	});

	it("empty blocked processor set has no effect", () => {
		expectResolution(
			resolveProcessor(
				[local, krokiRemote],
				bothAvailable,
				"graphviz",
				undefined,
				new Set(),
			),
			"graphviz-host",
			[
				{ id: "graphviz-host", outcome: "selected-by-placement" },
				{ id: "kroki-remote", outcome: "skipped-lower-precedence" },
			],
		);
	});
});

describe("resolveBindings", () => {
	const local = makeFakeProcessor({
		id: "graphviz-host",
		tags: ["graphviz"],
		aliases: { dot: "graphviz" },
	});
	const krokiRemote = makeFakeProcessor({
		id: "kroki-remote",
		tags: ["mermaid", "graphviz"],
	});

	it("categorises an effective binding (registered + available)", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings([local, krokiRemote], availability, {
			graphviz: { processor: "kroki-remote" },
		});

		expect(rows).toEqual([
			{
				status: "effective",
				tag: "graphviz",
				selector: "processor",
				processorId: "kroki-remote",
			},
		]);
	});

	it("categorises an effective placement binding", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings([local, krokiRemote], availability, {
			graphviz: { placement: "host" },
		});

		expect(rows).toEqual([
			{
				status: "effective",
				tag: "graphviz",
				selector: "placement",
				placement: "host",
				processorId: "graphviz-host",
			},
		]);
	});

	it("ignores inherited selector fields in binding diagnostics", () => {
		const availability = new Map<string, Availability>([["kroki-remote", { ok: true }]]);
		const binding = Object.create({ processor: "kroki-remote" });

		const rows = resolveBindings([krokiRemote], availability, {
			graphviz: binding,
		});

		expect(rows).toEqual([]);
	});

	it("categorises issue-unknown-processor", () => {
		const availability = new Map<string, Availability>([["kroki-remote", { ok: true }]]);

		const rows = resolveBindings([krokiRemote], availability, {
			graphviz: { processor: "nonexistent" },
		});

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "processor",
				processorId: "nonexistent",
				reason: "unknown-processor",
			},
		]);
	});

	it("categorises issue-processor-blocked", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings(
			[local, krokiRemote],
			availability,
			{ graphviz: { processor: "graphviz-host" } },
			new Set(["graphviz-host"]),
		);

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "processor",
				processorId: "graphviz-host",
				reason: "processor-blocked",
			},
		]);
	});

	it("categorises issue-processor-unavailable", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: false, reason: "dot not found" }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings([local, krokiRemote], availability, {
			graphviz: { processor: "graphviz-host" },
		});

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "processor",
				processorId: "graphviz-host",
				reason: "processor-unavailable",
			},
		]);
	});

	it("categorises issue-processor-placement-disabled", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings(
			[local, krokiRemote],
			availability,
			{ graphviz: { processor: "kroki-remote" } },
			undefined,
			["host"],
		);

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "processor",
				processorId: "kroki-remote",
				reason: "processor-placement-disabled",
			},
		]);
	});

	it("categorises issue-placement-disabled", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings(
			[local, krokiRemote],
			availability,
			{ graphviz: { placement: "host" } },
			undefined,
			["remote"],
		);

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "placement",
				placement: "host",
				reason: "placement-disabled",
			},
		]);
	});

	it("categorises issue-placement-no-match", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: false, reason: "dot missing" }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings(
			[local, krokiRemote],
			availability,
			{ graphviz: { placement: "host" } },
			undefined,
			["host", "remote"],
		);

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "placement",
				placement: "host",
				reason: "placement-no-match",
			},
		]);
	});

	it("categorises issue-placement-ambiguous", () => {
		const otherLocal = makeFakeProcessor({ id: "other-host", tags: ["graphviz"] });
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["other-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings(
			[local, otherLocal, krokiRemote],
			availability,
			{ graphviz: { placement: "host" } },
			undefined,
			["host", "remote"],
		);

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "graphviz",
				selector: "placement",
				placement: "host",
				reason: "placement-ambiguous",
				processorIds: ["graphviz-host", "other-host"],
			},
		]);
	});

	it("categorises issue-processor-does-not-claim-tag", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings([local, krokiRemote], availability, {
			csv: { processor: "kroki-remote" },
		});

		expect(rows).toEqual([
			{
				status: "issue",
				tag: "csv",
				selector: "processor",
				processorId: "kroki-remote",
				reason: "processor-does-not-claim-tag",
			},
		]);
	});

	it("preserves iteration order of bindings", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: true }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings([local, krokiRemote], availability, {
			mermaid: { processor: "kroki-remote" },
			graphviz: { processor: "kroki-remote" },
			dot: { processor: "kroki-remote" },
		});

		expect(rows.map((r) => r.tag)).toEqual(["mermaid", "graphviz", "dot"]);
	});

	it("returns an empty array for empty bindings", () => {
		expect(resolveBindings([local], new Map(), {})).toEqual([]);
	});

	it("mixes effective + issue rows in one call", () => {
		const availability = new Map<string, Availability>([
			["graphviz-host", { ok: false, reason: "nope" }],
			["kroki-remote", { ok: true }],
		]);

		const rows = resolveBindings([local, krokiRemote], availability, {
			graphviz: { processor: "graphviz-host" }, // issue: unavailable
			mermaid: { processor: "kroki-remote" }, // effective
			puml: { processor: "nonexistent" }, // issue: unknown
		});

		expect(rows.map((r) => r.status)).toEqual(["issue", "effective", "issue"]);
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
			id: "graphviz-host",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const krokiRemote = makeFakeProcessor({
			id: "kroki-remote",
			tags: ["graphviz", "mermaid", "plantuml"],
			aliases: { dot: "graphviz", puml: "plantuml" },
		});

		const tags = collectSupportedTags([local, krokiRemote]);

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
