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
		render: async () => ({ ok: true, text: "ok" }),
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
		const result = validateProcessor({ tags: ["t"], aliases: {}, available: async () => ({ ok: true }), render: async () => ({ ok: true, text: "" }) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("id");
	});

	it("rejects non-string id", () => {
		const result = validateProcessor({ id: 42, tags: ["t"], aliases: {}, available: async () => ({ ok: true }), render: async () => ({ ok: true, text: "" }) });
		expect(result.ok).toBe(false);
	});

	it("rejects empty id", () => {
		const result = validateProcessor(makeValidProcessor({ id: "" }));
		expect(result.ok).toBe(false);
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
		const result = validateProcessor({ id: "x", placement: "remote", tags: "mermaid", aliases: {}, available: async () => ({ ok: true }), render: async () => ({ ok: true, text: "" }) });
		expect(result.ok).toBe(false);
	});

	it("rejects missing render function", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: ["t"], aliases: {}, available: async () => ({ ok: true }) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("render");
	});

	it("rejects missing available function", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: ["t"], aliases: {}, render: async () => ({ ok: true, text: "" }) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("available");
	});

	it("accepts processor without aliases (defaults to {})", () => {
		const result = validateProcessor({ id: "x", placement: "remote", tags: ["t"], available: async () => ({ ok: true }), render: async () => ({ ok: true, text: "" }) });
		expect(result.ok).toBe(true);
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

	it("inserts before kroki (last position for built-ins)", async () => {
		const registry = makeRegistry();
		const kroki = makeValidProcessor({ id: "kroki", tags: ["mermaid"] });
		registry.processors.push(kroki);
		registry.availability.set("kroki", { ok: true });

		const thirdParty = makeValidProcessor({ id: "custom", tags: ["custom-tag"] });
		await registerProcessor(registry, thirdParty);

		// Custom should be before kroki in the array.
		expect(registry.processors[0].id).toBe("custom");
		expect(registry.processors[1].id).toBe("kroki");
	});
});
