/**
 * Unit tests for `register.ts` — processor validation and registration.
 *
 * Covers: validateProcessor shape checks, registerProcessor push + probe,
 * duplicate id rejection.
 */

import { describe, expect, it } from "vitest";

import {
	validateProcessor,
	registerProcessor,
	type ProcessorRegistry,
} from "../../extensions/pi-fence/register.ts";
import type { FenceProcessor, Availability } from "../../extensions/pi-fence/processor.ts";

function makeValidProcessor(overrides?: Partial<FenceProcessor>): FenceProcessor {
	return {
		id: "test-proc",
		placement: "embedded",
		tags: ["test"],
		aliases: {},
		available: async () => ({ ok: true }),
		render: async () => ({ kind: "text", text: "ok" }),
		...overrides,
	};
}

describe("validateProcessor", () => {
	it("accepts a valid processor shape", () => {
		const result = validateProcessor(makeValidProcessor());
		expect(result.ok).toBe(true);
	});

	it("rejects null/undefined", () => {
		expect(validateProcessor(null).ok).toBe(false);
		expect(validateProcessor(undefined).ok).toBe(false);
	});

	it("rejects non-object", () => {
		expect(validateProcessor("string").ok).toBe(false);
		expect(validateProcessor(42).ok).toBe(false);
	});

	it("rejects missing id", () => {
		const result = validateProcessor({ tags: ["t"], aliases: {}, available: async () => ({ ok: true }), render: async () => ({ kind: "text", text: "" }) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("id");
	});

	it("rejects non-string id", () => {
		const result = validateProcessor({ id: 42, tags: ["t"], aliases: {}, available: async () => ({ ok: true }), render: async () => ({ kind: "text", text: "" }) });
		expect(result.ok).toBe(false);
	});

	it("rejects empty id", () => {
		const result = validateProcessor(makeValidProcessor({ id: "" }));
		expect(result.ok).toBe(false);
	});

	it("rejects unsafe processor ids", () => {
		const unsafeIds = [
			" custom-upper",
			"custom-upper ",
			"custom/upper",
			"custom\\upper",
			".",
			"..",
			"CustomUpper",
			"custom\nupper",
			"__proto__",
			"constructor",
			"a".repeat(65),
		];

		for (const id of unsafeIds) {
			const result = validateProcessor(makeValidProcessor({ id }));
			expect(result, id).toMatchObject({ ok: false });
		}
	});

	it("accepts safe maximum-length processor ids", () => {
		const id = "a".repeat(64);
		const result = validateProcessor(makeValidProcessor({ id }));
		expect(result.ok).toBe(true);
	});

	it("rejects forbidden processor precedence metadata", () => {
		for (const field of ["order", "priority", "processorPrecedence"] as const) {
			const result = validateProcessor({ ...makeValidProcessor(), [field]: 1 });
			expect(result, field).toMatchObject({ ok: false });
			if (!result.ok) expect(result.error).toContain(field);
		}
	});

	it("rejects missing placement", () => {
		const proc = makeValidProcessor();
		const { placement: _, ...rest } = proc as unknown as Record<string, unknown>;
		const result = validateProcessor(rest);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("placement");
	});

	it("rejects invalid placement", () => {
		const result = validateProcessor({ ...makeValidProcessor(), placement: "local" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("embedded, host, sandbox, remote");
	});

	it("preserves accepted placement", () => {
		const result = validateProcessor(makeValidProcessor({ placement: "remote" }));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.processor.placement).toBe("remote");
	});

	it("rejects missing tags", () => {
		const proc = makeValidProcessor();
		const { tags: _, ...rest } = proc as unknown as Record<string, unknown>;
		const result = validateProcessor(rest);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("tags");
	});

	it("rejects empty tags array", () => {
		const result = validateProcessor(makeValidProcessor({ tags: [] }));
		expect(result.ok).toBe(false);
	});

	it("rejects non-array tags", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: "mermaid", aliases: {}, available: async () => ({ ok: true }), render: async () => ({ kind: "text", text: "" }) });
		expect(result.ok).toBe(false);
	});

	it("rejects unsafe tags", () => {
		const unsafeTags = [
			" custom",
			"custom ",
			"custom/tag",
			"custom\\tag",
			".",
			"..",
			"CustomTag",
			"custom\ttag",
			"__proto__",
			"prototype",
			"a".repeat(65),
		];

		for (const tag of unsafeTags) {
			const result = validateProcessor(makeValidProcessor({ tags: [tag] }));
			expect(result, tag).toMatchObject({ ok: false });
		}
	});

	it("accepts safe maximum-length tags", () => {
		const tag = "a".repeat(64);
		const result = validateProcessor(makeValidProcessor({ tags: [tag] }));
		expect(result.ok).toBe(true);
	});

	it("rejects missing render function", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: ["t"], aliases: {}, available: async () => ({ ok: true }) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("render");
	});

	it("rejects missing available function", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: ["t"], aliases: {}, render: async () => ({ kind: "text", text: "" }) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("available");
	});

	it("accepts aliases whose safe targets exist in canonical tags", () => {
		const aliases = { "test-alias": "test" };
		const result = validateProcessor(makeValidProcessor({ aliases }));

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(Object.entries(result.processor.aliases)).toEqual([["test-alias", "test"]]);
			expect(Object.getPrototypeOf(result.processor.aliases)).toBe(null);
			expect(result.processor.aliases).not.toBe(aliases);
		}
	});

	it("rejects invalid alias maps", () => {
		for (const aliases of [[], "dot"] as const) {
			const result = validateProcessor({ ...makeValidProcessor(), aliases });
			expect(result).toMatchObject({ ok: false });
		}
	});

	it("rejects inherited alias keys", () => {
		const aliases = Object.create({ inherited: "test" }) as Record<string, string>;
		aliases["test-alias"] = "test";

		const result = validateProcessor({ ...makeValidProcessor(), aliases });

		expect(result).toMatchObject({ ok: false });
	});

	it("rejects unsafe alias keys", () => {
		const aliases = Object.create(null) as Record<string, string>;
		Object.defineProperty(aliases, "__proto__", {
			enumerable: true,
			value: "test",
		});

		for (const aliasKey of ["bad/alias", "bad alias", "prototype"]) {
			aliases[aliasKey] = "test";
			const result = validateProcessor({ ...makeValidProcessor(), aliases });
			expect(result, aliasKey).toMatchObject({ ok: false });
			delete aliases[aliasKey];
		}
	});

	it("rejects aliases with non-string targets", () => {
		const result = validateProcessor({
			...makeValidProcessor(),
			aliases: { "test-alias": 42 },
		});

		expect(result).toMatchObject({ ok: false });
	});

	it("rejects aliases targeting missing canonical tags", () => {
		const result = validateProcessor(makeValidProcessor({
			aliases: { "test-alias": "missing" },
		}));

		expect(result).toMatchObject({ ok: false });
	});

	it("accepts processor without aliases (defaults to {})", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: ["t"], available: async () => ({ ok: true }), render: async () => ({ kind: "text", text: "" }) });
		expect(result.ok).toBe(true);
		if (result.ok) expect(Object.getPrototypeOf(result.processor.aliases)).toBe(null);
	});
});

describe("registerProcessor", () => {
	function makeRegistry(): ProcessorRegistry {
		return {
			processors: [],
			availability: new Map<string, Availability>(),
		};
	}

	it("adds a processor and probes its availability", async () => {
		const registry = makeRegistry();
		const proc = makeValidProcessor();

		const result = await registerProcessor(registry, proc);

		expect(result.ok).toBe(true);
		expect(registry.processors).toHaveLength(1);
		expect(registry.processors[0].id).toBe("test-proc");
		expect(registry.availability.get("test-proc")).toEqual({ ok: true });
	});

	it("rejects duplicate processor id", async () => {
		const registry = makeRegistry();
		registry.processors.push(makeValidProcessor());

		const result = await registerProcessor(registry, makeValidProcessor());

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("duplicate");
	});

	it("handles availability probe failure gracefully", async () => {
		const registry = makeRegistry();
		const proc = makeValidProcessor({
			available: async () => { throw new Error("boom"); },
		});

		const result = await registerProcessor(registry, proc);

		expect(result.ok).toBe(true);
		expect(registry.availability.get("test-proc")?.ok).toBe(false);
	});

	it("does not probe a processor whose placement is disabled by policy", async () => {
		const registry = makeRegistry();
		let probes = 0;
		const proc = makeValidProcessor({
			placement: "host",
			available: async () => {
				probes += 1;
				return { ok: true };
			},
		});

		const result = await registerProcessor(registry, proc, {
			processorPrecedence: ["embedded", "remote"],
		});

		expect(result.ok).toBe(true);
		expect(probes).toBe(0);
		expect(registry.availability.get("test-proc")).toEqual({
			ok: false,
			reason: "processor placement disabled by config",
		});
	});

	it("does not probe a blocked processor", async () => {
		const registry = makeRegistry();
		let probes = 0;
		const proc = makeValidProcessor({
			available: async () => {
				probes += 1;
				return { ok: true };
			},
		});

		const result = await registerProcessor(registry, proc, {
			blockedProcessors: new Set(["test-proc"]),
		});

		expect(result.ok).toBe(true);
		expect(probes).toBe(0);
		expect(registry.availability.get("test-proc")).toEqual({
			ok: false,
			reason: "processor blocked by config",
		});
	});

	it("inserts before kroki (last position for built-ins)", async () => {
		const registry = makeRegistry();
		const kroki = makeValidProcessor({ id: "kroki-remote", tags: ["mermaid"] });
		registry.processors.push(kroki);
		registry.availability.set("kroki-remote", { ok: true });

		const thirdParty = makeValidProcessor({ id: "custom", tags: ["custom-tag"] });
		await registerProcessor(registry, thirdParty);

		// Custom should be before kroki in the array.
		expect(registry.processors[0].id).toBe("custom");
		expect(registry.processors[1].id).toBe("kroki-remote");
	});
});
