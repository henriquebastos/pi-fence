import { describe, expect, it } from "vitest";

import {
	mergeSignals,
	normalizeAvailabilityResult,
	withRenderGuards,
	withSignalGuard,
	type FenceOutput,
} from "../../extensions/pi-fence/processor.ts";

describe("processor availability normalization", () => {
	it("accepts ok availability", () => {
		expect(normalizeAvailabilityResult({ ok: true })).toEqual({ ok: true });
	});

	it("accepts unavailable availability with optional install hint", () => {
		expect(normalizeAvailabilityResult({ ok: false, reason: "missing", installHint: "install it" }))
			.toEqual({ ok: false, reason: "missing", installHint: "install it" });
	});

	it("rejects malformed availability results", () => {
		for (const result of [undefined, null, "ok", { ok: false }, { ok: true, reason: "extra" }, { ok: false, reason: "" }]) {
			expect(normalizeAvailabilityResult(result), String(result)).toMatchObject({
				ok: false,
				reason: expect.stringContaining("malformed"),
			});
		}
	});
});

describe("processor signal helpers", () => {
	it("mergeSignals returns undefined when there are no real signals", () => {
		expect(mergeSignals([undefined])).toBeUndefined();
	});

	it("mergeSignals returns the only real signal unchanged", () => {
		const controller = new AbortController();
		expect(mergeSignals([undefined, controller.signal])).toBe(controller.signal);
	});

	it("mergeSignals aborts when any input signal aborts", () => {
		const first = new AbortController();
		const second = new AbortController();
		const merged = mergeSignals([first.signal, second.signal]);

		second.abort();

		expect(merged?.aborted).toBe(true);
	});
});

describe("processor render guards", () => {
	it("withSignalGuard returns an abort error without delegating", async () => {
		let calls = 0;
		const render = withSignalGuard(async (): Promise<FenceOutput> => {
			calls++;
			return { kind: "text", text: "rendered" };
		});
		const controller = new AbortController();
		controller.abort();

		const result = await render("csv", "a,b", controller.signal);

		expect(result).toEqual({ kind: "error", error: "Aborted before render" });
		expect(calls).toBe(0);
	});

	it("withSignalGuard delegates when the signal is not aborted", async () => {
		const render = withSignalGuard(async (tag, source, signal): Promise<FenceOutput> => {
			expect(tag).toBe("csv");
			expect(source).toBe("a,b");
			expect(signal?.aborted).toBe(false);
			return { kind: "text", text: "rendered" };
		});
		const controller = new AbortController();

		await expect(render("csv", "a,b", controller.signal)).resolves.toEqual({
			kind: "text",
			text: "rendered",
		});
	});

	it("withRenderGuards rejects empty input without delegating", async () => {
		let calls = 0;
		const render = withRenderGuards(async (): Promise<FenceOutput> => {
			calls++;
			return { kind: "text", text: "rendered" };
		});

		const result = await render("csv", "  \n\t  ");

		expect(result).toEqual({ kind: "error", error: "csv: empty input" });
		expect(calls).toBe(0);
	});

	it("withRenderGuards composes the signal guard", async () => {
		let calls = 0;
		const render = withRenderGuards(async (): Promise<FenceOutput> => {
			calls++;
			return { kind: "text", text: "rendered" };
		});
		const controller = new AbortController();
		controller.abort();

		const result = await render("csv", "a,b", controller.signal);

		expect(result).toEqual({ kind: "error", error: "Aborted before render" });
		expect(calls).toBe(0);
	});

	it("withRenderGuards delegates with trimmed source", async () => {
		const render = withRenderGuards(async (tag, source): Promise<FenceOutput> => {
			expect(tag).toBe("csv");
			expect(source).toBe("a,b");
			return { kind: "text", text: source };
		});

		await expect(render("csv", "\n  a,b  \t")).resolves.toEqual({
			kind: "text",
			text: "a,b",
		});
	});
});
