/**
 * Self-test for the refresh-fixtures script exports.
 *
 * Verifies the script's public surface is importable and the CLI parser
 * rejects unknown fixture sets. Does not exercise live I/O — the refresh
 * functions need network/Docker which the fast suite must not require.
 */

import { describe, expect, it } from "vitest";

import { refreshFixtures } from "../../scripts/refresh-fixtures.ts";

describe("refresh-fixtures CLI", () => {
	it("returns non-zero for an unknown fixture set", async () => {
		// Capture stderr to avoid noise; redirect is enough to verify exit code.
		const origWrite = process.stderr.write;
		process.stderr.write = (() => true) as typeof process.stderr.write;
		try {
			const code = await refreshFixtures(["unknown-set"]);
			expect(code).toBe(1);
		} finally {
			process.stderr.write = origWrite;
		}
	});
});
