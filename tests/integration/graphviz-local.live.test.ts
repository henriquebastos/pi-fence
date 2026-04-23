/**
 * Live integration tests for the graphviz-local processor.
 *
 * Runs `dot` via `DockerExecShellRunner` against the
 * `pi-fence-live-deps` container (which ships `graphviz` from S0). No
 * host-side `dot` install needed. Skipped cleanly when the container
 * isn't running; start it with `pnpm live:build && pnpm live:up`
 * before `pnpm test:live`.
 *
 * Covers the four shapes the unit tests programmed with FakeShellRunner:
 *   1. `available()` returns ok inside the container.
 *   2. Happy-path PNG round-trip — stdoutBuffer carries real binary
 *      PNG bytes out of `dot -Tpng`, starts with PNG magic, exceeds a
 *      small size floor.
 *   3. Error path — malformed DOT source returns { ok: false, error }
 *      with a non-empty truncated stderr body.
 *   4. Pre-aborted signal — early ok:false without shelling out.
 *
 * No byte-comparison against a committed PNG: graphviz's `dot -Tpng`
 * output is not bit-stable across graphviz versions (font metrics,
 * layout algorithm evolution, libcairo version). Magic + size floor
 * are the honest assertions — same shape the Kroki live suite uses.
 */

import { describe, expect, it } from "vitest";

import { createGraphvizLocalProcessor } from "../../extensions/pi-fence/graphviz-local.ts";
import { hasContainer } from "../utilities/live-deps.ts";
import { DockerExecShellRunner } from "../utilities/shell-runner.ts";

const CONTAINER = "pi-fence-live-deps";
const containerRunning = await hasContainer(CONTAINER);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Minimal canonical DOT source — graphviz's render of this produces a
// PNG in the ~1–2 KB range on graphviz 2.x/10.x. The size floor below
// is calibrated with headroom for font-metric variance across graphviz
// versions; catches the "error PNG" regression (graphviz sometimes emits
// a tiny ~200-byte PNG on bad input) without being tight enough to flap
// on minor binary updates.
const GOOD_SOURCE = "digraph { A -> B -> C }";
const BAD_SOURCE = "digraph { A ->";

const HAPPY_SIZE_FLOOR_BYTES = 500;

describe.skipIf(!containerRunning)("graphviz-local — live", () => {
	const shell = new DockerExecShellRunner(CONTAINER);
	const graphvizLocal = createGraphvizLocalProcessor(shell);

	it("available() returns ok inside the container", async () => {
		const result = await graphvizLocal.available();
		expect(result.ok).toBe(true);
	});

	it("renders a good DOT source into a real PNG", async () => {
		const result = await graphvizLocal.render("graphviz", GOOD_SOURCE);

		expect(result.ok).toBe(true);
		if (!result.ok || !("png" in result)) return;

		// Magic bytes: the response is a real PNG, not HTML, not an
		// error text, not a zero-length buffer.
		expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);

		// Size floor: catches the "tiny error PNG" regression without
		// being sensitive to graphviz version drift.
		expect(result.png.length).toBeGreaterThan(HAPPY_SIZE_FLOOR_BYTES);
	}, 15_000);

	it("renders via the `dot` alias the same way as the canonical tag", async () => {
		// graphviz-local's aliases map is advertised for the extension's
		// resolve(tag) and /fence list; the render() path does not branch
		// on which tag the caller wrote (the shell command is identical).
		// Asserted here against the live binary to prove the alias
		// round-trip end-to-end.
		const result = await graphvizLocal.render("dot", GOOD_SOURCE);

		expect(result.ok).toBe(true);
		if (!result.ok || !("png" in result)) return;
		expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
	}, 15_000);

	it("returns ok:false with a non-empty error body for malformed DOT", async () => {
		const result = await graphvizLocal.render("graphviz", BAD_SOURCE);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.length).toBeGreaterThan(0);
		// graphviz's parser emits its diagnostic on stderr. The message
		// content is version-dependent; asserting non-empty is enough.
		// The 500-char truncation is a unit-test assertion (no live
		// error body exceeds 500 chars in practice).
	}, 15_000);

	it("yields ok:false when the caller's signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await graphvizLocal.render("graphviz", GOOD_SOURCE, controller.signal);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/abort/i);
		}
	}, 5000);
});
