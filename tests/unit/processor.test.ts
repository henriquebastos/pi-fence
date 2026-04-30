import { describe, expect, it } from "vitest";

import {
	mergeSignals,
	normalizeAvailabilityResult,
	normalizeFenceOutput,
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
		for (const result of [
			undefined,
			null,
			"ok",
			{ ok: false },
			{ ok: true, reason: "extra" },
			{ ok: true, installHint: "extra" },
			{ ok: false, reason: "" },
			{ ok: false, reason: "missing", installHint: 42 },
		]) {
			expect(normalizeAvailabilityResult(result), String(result)).toMatchObject({
				ok: false,
				reason: expect.stringContaining("malformed"),
			});
		}
	});
});

describe("processor output normalization", () => {
	it("accepts explicit and legacy text output", () => {
		expect(normalizeFenceOutput({ kind: "text", text: "ok" })).toEqual({ kind: "text", text: "ok" });
		expect(normalizeFenceOutput({ ok: true, text: "ok" })).toEqual({ kind: "text", text: "ok" });
	});

	it("accepts explicit and legacy image output", () => {
		const png = Buffer.from([0x89, 0x50]);
		expect(normalizeFenceOutput({ kind: "image", data: png, mimeType: "image/png" })).toEqual({
			kind: "image",
			data: png,
			mimeType: "image/png",
		});
		expect(normalizeFenceOutput({ ok: true, png })).toEqual({
			kind: "image",
			data: png,
			mimeType: "image/png",
		});
	});

	it("accepts explicit and legacy error output", () => {
		expect(normalizeFenceOutput({ kind: "error", error: "bad" })).toEqual({ kind: "error", error: "bad" });
		expect(normalizeFenceOutput({ ok: false, error: "bad" })).toEqual({ kind: "error", error: "bad" });
	});

	it("returns error output for malformed render results", () => {
		const png = Buffer.from([0x89, 0x50]);
		for (const result of [
			undefined,
			null,
			{ kind: "text" },
			{ kind: "image", data: "not-buffer", mimeType: "image/png" },
			{ kind: "image", data: png, mimeType: "image/svg+xml" },
			{ kind: "error", error: "" },
			{ ok: true },
			{ ok: true, png: "not-buffer" },
			{ ok: true, text: 42 },
			{ ok: true, text: "ok", png },
			{ ok: false },
		]) {
			expect(normalizeFenceOutput(result)).toEqual({
				kind: "error",
				error: "render() returned malformed result",
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
