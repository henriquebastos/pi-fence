/**
 * Tempdir helper for tests.
 *
 * Every test that touches the filesystem must go through `makeTempDir()` and
 * rely on `cleanupTempDirs()` in its `afterEach` hook. This centralises the
 * invariant that no test writes outside `os.tmpdir()` and that nothing
 * survives a completed test.
 *
 * Usage:
 *
 *   import { afterEach, describe, it } from "vitest";
 *   import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";
 *
 *   describe("something", () => {
 *     afterEach(() => cleanupTempDirs());
 *
 *     it("works", () => {
 *       const dir = makeTempDir();
 *       // ... use dir
 *     });
 *   });
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_PREFIX = "pi-fence-";

// Module-local registry of dirs created since the last cleanup. Tests reset it
// via `cleanupTempDirs()`; the registry is never exposed to callers.
let tracked: string[] = [];

/**
 * Create a fresh temp directory under `os.tmpdir()`.
 *
 * @param prefix - optional filename prefix; helpful for scanning stale state.
 *                 Defaults to `pi-fence-`.
 * @returns absolute path of the newly created directory.
 */
export function makeTempDir(prefix: string = DEFAULT_PREFIX): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tracked.push(dir);
	return dir;
}

/**
 * Remove every directory returned by `makeTempDir()` since the last cleanup.
 *
 * Missing directories are ignored (a test may have removed its own dir before
 * teardown — that's fine). Never throws on individual failures; leaves the
 * registry empty regardless of what happened on disk.
 */
export function cleanupTempDirs(): void {
	const toRemove = tracked;
	tracked = [];
	for (const dir of toRemove) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// Ignore: the dir may have been deleted already, or the filesystem
			// may be flaky. We don't leak by retaining the entry — tracked is
			// already cleared.
		}
	}
}
