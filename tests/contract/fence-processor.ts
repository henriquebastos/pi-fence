/**
 * Contract test for `FenceProcessor`.
 *
 * Any processor implementation — built-in or third-party — imports
 * `runFenceProcessorContract` and
 * calls it with a factory. The factory produces a `FenceProcessor` whose
 * behaviour must satisfy the contract for the (tag, known-good-source)
 * pair passed in. All processors share one contract so the behavioural
 * guarantees callers rely on (non-throwing error path, Buffer on success,
 * stable `id`) never drift across implementations.
 *
 * Usage, typically from `tests/contract/kroki.contract.test.ts` (lands
 * with step 7):
 *
 *     runFenceProcessorContract("kroki-remote", () => createKrokiProcessor(http), {
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

import { PROCESSOR_PLACEMENTS, type FenceProcessor } from "../../extensions/pi-fence/processor.ts";

export interface FenceProcessorContractCases {
	/** A tag the processor advertises support for. */
	tag: string;
	/** A source string the processor should render successfully in the happy path. */
	goodSource: string;
	/** A source string we use to exercise the error path. */
	badSource: string;
	/**
	 * Expected output kind on the happy path. `"image"` (default) asserts
	 * `Buffer.isBuffer(result.png)`; `"text"` asserts `typeof result.text === "string"`.
	 * Added in CV3.E1.S1 for the first non-image processor.
	 */
	outputKind?: "image" | "text";
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

		it("exposes a valid placement", () => {
			const processor = factory();
			expect(PROCESSOR_PLACEMENTS).toContain(processor.placement);
		});

		it("exposes a non-empty tags array of strings", () => {
			const processor = factory();
			expect(Array.isArray(processor.tags)).toBe(true);
			expect(processor.tags.length).toBeGreaterThan(0);
			for (const tag of processor.tags) {
				expect(typeof tag).toBe("string");
				expect(tag.length).toBeGreaterThan(0);
			}
		});

		it("exposes an aliases record whose values are canonical tags", () => {
			const processor = factory();
			expect(processor.aliases).toBeTypeOf("object");
			expect(processor.aliases).not.toBeNull();
			const canonical = new Set(processor.tags);
			for (const [alias, target] of Object.entries(processor.aliases)) {
				expect(typeof alias).toBe("string");
				expect(alias.length).toBeGreaterThan(0);
				expect(typeof target).toBe("string");
				expect(canonical.has(target)).toBe(true);
			}
		});

		it("exposes an available() probe returning an Availability shape", async () => {
			// Shape-only. The contract helper does not know whether this
			// processor *should* be available on the test machine — the Kroki
			// contract test wires a processor whose probe always returns ok;
			// the graphviz-host contract test (CV0.E2.S1 step 4) wires one
			// against a canned-good FakeShellRunner so its probe also returns
			// ok. Live availability (unavailable reason + install hint) is
			// asserted in per-processor live tests, not here.
			const processor = factory();
			const availability = await processor.available();
			expect(availability).toBeTypeOf("object");
			expect(availability).not.toBeNull();
			expect(typeof availability.ok).toBe("boolean");
			if (!availability.ok) {
				expect(typeof availability.reason).toBe("string");
				expect(availability.reason.length).toBeGreaterThan(0);
				if (availability.installHint !== undefined) {
					expect(typeof availability.installHint).toBe("string");
				}
			}
		});

		it("never throws from available()", async () => {
			// A probe that crashes is strictly worse than one that returns
			// `{ ok: false }` — crashes propagate out of the wire-time loop
			// and take the whole extension down. Assert the contract
			// explicitly so a future processor author can't regress this by
			// forgetting to wrap their probe in a try/catch.
			const processor = factory();
			await expect(processor.available()).resolves.toBeDefined();
		});

		it("returns a Promise from render()", () => {
			const processor = factory();
			const promise = processor.render(cases.tag, cases.goodSource);
			expect(promise).toBeInstanceOf(Promise);
			// Consume the promise so the test doesn't leak an unhandled rejection
			// on processors that reject synchronously.
			return promise.catch(() => {});
		});

		it("returns a successful explicit output for a good source", async () => {
			const processor = factory();
			const result = await processor.render(cases.tag, cases.goodSource);
			if ((cases.outputKind ?? "image") === "image") {
				expect(result.kind).toBe("image");
				if (result.kind === "image") {
					expect(Buffer.isBuffer(result.data)).toBe(true);
					expect(result.mimeType).toBe("image/png");
				}
			} else {
				expect(result.kind).toBe("text");
				if (result.kind === "text") expect(typeof result.text).toBe("string");
			}
		});

		it("returns an explicit error output for a bad source — does not throw", async () => {
			const processor = factory();
			const result = await processor.render(cases.tag, cases.badSource);
			expect(result.kind).toBe("error");
			if (result.kind === "error") {
				expect(typeof result.error).toBe("string");
				expect(result.error.length).toBeGreaterThan(0);
			}
		});

		it("honours a pre-aborted signal without throwing", async () => {
			const processor = factory();
			const controller = new AbortController();
			controller.abort();
			const result = await processor.render(cases.tag, cases.goodSource, controller.signal);
			expect(result.kind).toBe("error");
		});
	});
}
