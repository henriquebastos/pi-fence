/**
 * Placeholder integration-layer test.
 *
 * Exists to prove the integration-layer pattern end-to-end: a live
 * dependency (the pi-fence-live-deps Docker container) is detected,
 * the test either runs against it or skips cleanly, and the skip
 * path is deterministic across machines that do or don't have
 * Docker available.
 *
 * No pi-fence code is involved. S1 replaces this file with
 * `tests/integration/kroki.live.test.ts` which drives `NodeHttpClient`
 * against real kroki.io. The container-based live-test pattern
 * exemplified here kicks in later, when CV0.E2's graphviz-local
 * processor lands and needs `dot` inside the container.
 *
 * See `cv0-e1-s1-mermaid-via-kroki/plan.md`, Key files → Deleted.
 */

import { describe, expect, it } from "vitest";

import { hasContainer } from "../utilities/live-deps.ts";
import { DockerExecShellRunner } from "../utilities/shell-runner.ts";

const CONTAINER = "pi-fence-live-deps";
const containerRunning = await hasContainer(CONTAINER);

describe.skipIf(!containerRunning)("integration-layer sanity — docker exec", () => {
	it("runs `echo hello` inside the container and captures stdout", async () => {
		const shell = new DockerExecShellRunner(CONTAINER);
		const result = await shell.run("echo", ["hello"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("hello\n");
	});
});
