/**
 * Self-test for `temp-dir.ts`.
 *
 * The helper guarantees two properties we depend on across the whole test suite:
 *
 *   1. `makeTempDir()` creates a real directory under `os.tmpdir()`, not under
 *      the user's home and not elsewhere.
 *   2. `cleanupTempDirs()` removes everything it created so nothing leaks.
 *
 * These are load-bearing — principles.md forbids tests from touching
 * `~/.pi/agent/` or anywhere outside `os.tmpdir()`. If this helper drifts,
 * every downstream test's filesystem guarantees drift with it.
 */

import { existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDirs, makeTempDir } from "./temp-dir.ts";

describe("makeTempDir", () => {
	afterEach(() => {
		cleanupTempDirs();
	});

	it("creates a directory under os.tmpdir()", () => {
		const dir = makeTempDir();
		expect(existsSync(dir)).toBe(true);
		expect(statSync(dir).isDirectory()).toBe(true);
		// The parent must be tmpdir; not someone's home, not repo root.
		expect(dirname(dir)).toBe(tmpdir());
	});

	it("returns a path containing the provided prefix", () => {
		const dir = makeTempDir("pi-fence-testcase-");
		expect(dir).toMatch(/pi-fence-testcase-/);
	});

	it("returns a unique path on each call", () => {
		const a = makeTempDir();
		const b = makeTempDir();
		expect(a).not.toBe(b);
		expect(existsSync(a)).toBe(true);
		expect(existsSync(b)).toBe(true);
	});

	it("keeps the directory writable for the caller", () => {
		const dir = makeTempDir();
		const file = `${dir}/probe.txt`;
		writeFileSync(file, "hello");
		expect(existsSync(file)).toBe(true);
	});
});

describe("cleanupTempDirs", () => {
	it("removes every directory created since the previous cleanup", () => {
		const a = makeTempDir();
		const b = makeTempDir();

		cleanupTempDirs();

		expect(existsSync(a)).toBe(false);
		expect(existsSync(b)).toBe(false);
	});

	it("is safe to call twice", () => {
		const dir = makeTempDir();
		cleanupTempDirs();
		// Second call with nothing to do must not throw.
		expect(() => cleanupTempDirs()).not.toThrow();
		expect(existsSync(dir)).toBe(false);
	});

	it("is safe to call when no dirs were created", () => {
		expect(() => cleanupTempDirs()).not.toThrow();
	});

	it("handles directories that have already been deleted manually", () => {
		const dir = makeTempDir();
		// Simulate test cleaning up its own directory before teardown.
		// cleanupTempDirs should treat the missing dir as a no-op, not an error.
		const { rmSync } = require("node:fs");
		rmSync(dir, { recursive: true, force: true });

		expect(() => cleanupTempDirs()).not.toThrow();
	});
});
