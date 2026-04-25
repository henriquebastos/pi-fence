import { describe, expect, it } from "vitest";

import {
	mergeSignals,
	withRenderGuards,
	withSignalGuard,
	type FenceResult,
} from "../../extensions/pi-fence/processor.ts";

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
		const render = withSignalGuard(async (): Promise<FenceResult> => {
			calls++;
			return { ok: true, text: "rendered" };
		});
		const controller = new AbortController();
		controller.abort();

		const result = await render("csv", "a,b", controller.signal);

		expect(result).toEqual({ ok: false, error: "Aborted before render" });
		expect(calls).toBe(0);
	});

	it("withSignalGuard delegates when the signal is not aborted", async () => {
		const render = withSignalGuard(async (tag, source, signal): Promise<FenceResult> => {
			expect(tag).toBe("csv");
			expect(source).toBe("a,b");
			expect(signal?.aborted).toBe(false);
			return { ok: true, text: "rendered" };
		});
		const controller = new AbortController();

		await expect(render("csv", "a,b", controller.signal)).resolves.toEqual({
			ok: true,
			text: "rendered",
		});
	});

	it("withRenderGuards rejects empty input without delegating", async () => {
		let calls = 0;
		const render = withRenderGuards(async (): Promise<FenceResult> => {
			calls++;
			return { ok: true, text: "rendered" };
		});

		const result = await render("csv", "  \n\t  ");

		expect(result).toEqual({ ok: false, error: "csv: empty input" });
		expect(calls).toBe(0);
	});

	it("withRenderGuards composes the signal guard", async () => {
		let calls = 0;
		const render = withRenderGuards(async (): Promise<FenceResult> => {
			calls++;
			return { ok: true, text: "rendered" };
		});
		const controller = new AbortController();
		controller.abort();

		const result = await render("csv", "a,b", controller.signal);

		expect(result).toEqual({ ok: false, error: "Aborted before render" });
		expect(calls).toBe(0);
	});

	it("withRenderGuards delegates with trimmed source", async () => {
		const render = withRenderGuards(async (tag, source): Promise<FenceResult> => {
			expect(tag).toBe("csv");
			expect(source).toBe("a,b");
			return { ok: true, text: source };
		});

		await expect(render("csv", "\n  a,b  \t")).resolves.toEqual({
			ok: true,
			text: "a,b",
		});
	});
});
