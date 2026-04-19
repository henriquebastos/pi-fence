/**
 * Self-test for the refresh-fixtures skeleton.
 *
 * The refresh function is intentionally a not-yet-implemented entry point.
 * S1 fills it in to refresh Kroki PNG fixtures; future stories extend it
 * for other processors. The skeleton lives in this commit so:
 *
 *   1. The CLI path (pnpm run refresh-fixtures) exists and wires through
 *      to a typed function.
 *   2. The error shape on invocation is predictable — a caller who asks
 *      for an unknown fixture set or an unimplemented tag gets a clear
 *      error, not silence or a mystery stack trace.
 */

import { describe, expect, it } from "vitest";

import { refresh } from "../../scripts/refresh-fixtures.ts";

describe("refresh-fixtures skeleton", () => {
	it("throws with a clear error for any tag until fixtures are wired up", async () => {
		await expect(refresh("mermaid")).rejects.toThrow(/not yet implemented/i);
	});

	it("mentions the tag in the error so the caller knows what was refused", async () => {
		await expect(refresh("some-future-tag")).rejects.toThrow(/some-future-tag/);
	});
});
