/**
 * Contract test for `FenceProcessor`.
 *
 * Any processor implementation — today Kroki, tomorrow graphviz-local,
 * mermaid-local, third-party — imports `runFenceProcessorContract` and
 * calls it with a factory. The factory produces a `FenceProcessor` whose
 * behaviour must satisfy the contract for the (tag, known-good-source)
 * pair passed in. All processors share one contract so the behavioural
 * guarantees callers rely on (non-throwing error path, Buffer on success,
 * stable `id`) never drift across implementations.
 *
 * Usage, typically from `tests/contract/kroki.contract.test.ts` (lands
 * with step 7):
 *
 *     runFenceProcessorContract("kroki", () => createKrokiRenderer(http), {
 *       tag: "mermaid",
 *       goodSource: "flowchart LR\\nA --> B",
 *       badSource: "not actually mermaid",
 *     });
 *
 * The helper uses `FakeHttpClient` and hand-programmed responses so it
 * runs at unit-test speed with zero I/O. Live conformance is a separate
 * concern and lives under `tests/integration/`.
 */

import { describe, expect, it } from "vitest";

import type { FenceProcessor } from "../../extensions/pi-fence/processor.ts";

export interface FenceProcessorContractCases {
	/** A tag the processor advertises support for. */
	tag: string;
	/** A source string the processor should render successfully in the happy path. */
	goodSource: string;
	/** A source string we use to exercise the error path. */
	badSource: string;
}

/**
 * Register a describe-block that asserts a processor factory produces
 * something conforming to the `FenceProcessor` interface.
 *
 * Implementations pass a factory, not an instance, so the helper can make
 * a fresh processor per test case. That keeps captured state (the fake
 * HttpClient's calls array, for example) from bleeding across cases.
 */
export function runFenceProcessorContract(
	label: string,
	factory: () => FenceProcessor,
	cases: FenceProcessorContractCases,
): void {
	describe(`FenceProcessor contract — ${label}`, () => {
		it("exposes a non-empty string id", () => {
			const processor = factory();
			expect(typeof processor.id).toBe("string");
			expect(processor.id.length).toBeGreaterThan(0);
		});

		it("returns a Promise from render()", () => {
			const processor = factory();
			const promise = processor.render(cases.tag, cases.goodSource);
			expect(promise).toBeInstanceOf(Promise);
			// Consume the promise so the test doesn't leak an unhandled rejection
			// on processors that reject synchronously.
			return promise.catch(() => {});
		});

		it("returns { ok: true, png } for a good source", async () => {
			const processor = factory();
			const result = await processor.render(cases.tag, cases.goodSource);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(Buffer.isBuffer(result.png)).toBe(true);
			}
		});

		it("returns { ok: false, error } for a bad source — does not throw", async () => {
			const processor = factory();
			const result = await processor.render(cases.tag, cases.badSource);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(typeof result.error).toBe("string");
				expect(result.error.length).toBeGreaterThan(0);
			}
		});

		it("honours a pre-aborted signal without throwing", async () => {
			const processor = factory();
			const controller = new AbortController();
			controller.abort();
			const result = await processor.render(cases.tag, cases.goodSource, controller.signal);
			expect(result.ok).toBe(false);
		});
	});
}
