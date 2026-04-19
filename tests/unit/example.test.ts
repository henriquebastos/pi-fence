/**
 * Placeholder unit test.
 *
 * Exists only to prove vitest runs and that the `tests/unit/` layer is wired
 * up. Gets deleted by S1 when `tests/unit/parser.test.ts` takes its place.
 * See the S1 plan (`cv0-e1-s1-mermaid-via-kroki/plan.md`), Key files →
 * Deleted.
 */

import { describe, expect, it } from "vitest";

describe("unit-layer sanity", () => {
	it("runs arithmetic correctly", () => {
		expect(2 + 2).toBe(4);
	});
});
