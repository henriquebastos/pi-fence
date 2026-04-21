/**
 * Unit tests for the resolve module — processor resolution (registry
 * rule) and the wire-time availability probe.
 *
 * Uses tiny hand-rolled fake processors with scripted responses. No
 * promotion to `tests/utilities/` until a second consumer appears
 * (principles: no premature abstraction).
 */

import { describe, expect, it } from "vitest";

import type { Availability, FenceProcessor, FenceResult } from "../../extensions/pi-fence/processor.ts";
import {
	collectSupportedTags,
	probeAvailability,
	resolveProcessor,
} from "../../extensions/pi-fence/resolve.ts";

interface FakeProcessorOptions {
	id: string;
	tags?: readonly string[];
	aliases?: Record<string, string>;
	availability?: Availability;
	availableThrows?: unknown;
}

function makeFakeProcessor(opts: FakeProcessorOptions): FenceProcessor {
	return {
		id: opts.id,
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

describe("resolveProcessor", () => {
	it("returns the first available processor whose canonical tags include the tag", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const b = makeFakeProcessor({ id: "b", tags: ["mermaid"] });
		const availability = new Map<string, Availability>([
			["a", { ok: true }],
			["b", { ok: true }],
		]);

		expect(resolveProcessor([a, b], availability, "graphviz")?.id).toBe("a");
		expect(resolveProcessor([a, b], availability, "mermaid")?.id).toBe("b");
	});

	it("returns the first available processor whose aliases include the tag", () => {
		const a = makeFakeProcessor({
			id: "a",
			tags: ["graphviz"],
			aliases: { dot: "graphviz" },
		});
		const availability = new Map<string, Availability>([["a", { ok: true }]]);

		expect(resolveProcessor([a], availability, "dot")?.id).toBe("a");
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

		expect(resolveProcessor([local, kroki], availability, "graphviz")?.id).toBe("kroki");
		expect(resolveProcessor([local, kroki], availability, "dot")?.id).toBe("kroki");
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

		expect(resolveProcessor([local, kroki], availability, "graphviz")?.id).toBe(
			"graphviz-local",
		);
		expect(resolveProcessor([local, kroki], availability, "dot")?.id).toBe(
			"graphviz-local",
		);
	});

	it("returns null when no registered processor claims the tag", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["mermaid"] });
		const availability = new Map<string, Availability>([["a", { ok: true }]]);

		expect(resolveProcessor([a], availability, "graphviz")).toBeNull();
	});

	it("returns null when every claimer is unavailable", () => {
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const availability = new Map<string, Availability>([
			["a", { ok: false, reason: "broken" }],
		]);

		expect(resolveProcessor([a], availability, "graphviz")).toBeNull();
	});

	it("returns null when a processor id is missing from the availability map", () => {
		// Shouldn't happen in production (probeAvailability populates
		// every processor), but belt-and-braces: treat missing as not-ok
		// rather than throwing on `.get(undefined)`.
		const a = makeFakeProcessor({ id: "a", tags: ["graphviz"] });
		const availability = new Map<string, Availability>();

		expect(resolveProcessor([a], availability, "graphviz")).toBeNull();
	});

	it("returns null when the processor array is empty", () => {
		expect(resolveProcessor([], new Map(), "graphviz")).toBeNull();
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
