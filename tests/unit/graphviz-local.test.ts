/**
 * Unit tests for the graphviz-local processor.
 *
 * Exercises the `ShellRunner` seam through `FakeShellRunner`. The
 * production impl uses `NodeShellRunner` against the real `dot` binary;
 * that path is covered by `tests/integration/graphviz-local.live.test.ts`
 * (CV0.E2.S1 step 8).
 *
 * Contract captured here:
 *   - `available()`:
 *       * exit 0 → { ok: true }
 *       * non-zero exit → { ok: false, reason, installHint }
 *       * shell-runner throw → { ok: false, reason, installHint }
 *       * never throws
 *   - `render()`:
 *       * shells out `dot -Tpng` with source on stdin
 *       * resolves the `dot` alias by passing through — command is the
 *         same regardless of which tag the caller wrote
 *       * exit 0 → { ok: true, png: Buffer } where png reads from
 *         stdoutBuffer (binary-safe) with UTF-8 fallback for fakes
 *       * non-zero exit → { ok: false, error: stderr or fallback },
 *         truncated to 500 chars
 *       * shell-runner throw → { ok: false, error: exception message }
 *       * pre-aborted signal → { ok: false, error: "Aborted..." } with
 *         no shell-out
 */

import { describe, expect, it } from "vitest";

import { FakeShellRunner } from "../utilities/shell-runner.ts";
import { FakeLogger } from "../utilities/logger.ts";
import {
	createGraphvizLocalProcessor,
	GRAPHVIZ_LOCAL_ALIASES,
	GRAPHVIZ_LOCAL_CANONICAL_TAGS,
} from "../../extensions/pi-fence/graphviz-local.ts";

const TINY_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
]);

describe("graphviz-local — shape", () => {
	it("declares `graphviz` as the only canonical tag", () => {
		expect(GRAPHVIZ_LOCAL_CANONICAL_TAGS).toEqual(["graphviz"]);
	});

	it("declares `dot` as an alias for `graphviz`", () => {
		expect(GRAPHVIZ_LOCAL_ALIASES).toEqual({ dot: "graphviz" });
	});

	it("exposes id, tags, aliases on the factory output", () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const processor = createGraphvizLocalProcessor(shell);

		expect(processor.id).toBe("graphviz-local");
		expect(processor.tags).toEqual(["graphviz"]);
		expect(processor.aliases).toEqual({ dot: "graphviz" });
	});
});

describe("createGraphvizLocalProcessor — available()", () => {
	it("returns ok when `dot -V` exits 0", async () => {
		// graphviz prints its version on stderr and exits 0.
		const shell = new FakeShellRunner();
		shell.setResponse("dot", ["-V"], {
			stdout: "",
			stderr: "dot - graphviz version 2.50.0 (0)",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.available();

		expect(result.ok).toBe(true);
	});

	it("returns ok:false with reason + installHint when `dot -V` exits non-zero", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: "some broken dot install",
			exitCode: 127,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.available();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason.length).toBeGreaterThan(0);
			expect(result.reason).toContain("127");
			expect(result.installHint).toBeDefined();
			expect(result.installHint).toContain("graphviz");
		}
	});

	it("returns ok:false with reason + installHint when the shell runner throws (ENOENT)", async () => {
		// FakeShellRunner with no programmed response and no default
		// throws on any call — simulates execFile's ENOENT when `dot`
		// isn't installed at all.
		const shell = new FakeShellRunner();
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.available();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason.length).toBeGreaterThan(0);
			expect(result.reason).toContain("not found on PATH");
			expect(result.installHint).toBeDefined();
		}
	});

	it("never throws from available() — propagation would crash the extension's wire-time probe loop", async () => {
		// Defensive: even if a future ShellRunner impl throws a weird
		// non-Error value (string, null, symbol), available() must
		// resolve to an Availability — never reject.
		class ThrowingShellRunner {
			async run(): Promise<never> {
				throw "string thrown as non-Error";
			}
		}
		const processor = createGraphvizLocalProcessor(new ThrowingShellRunner());

		await expect(processor.available()).resolves.toBeDefined();
		const result = await processor.available();
		expect(result.ok).toBe(false);
	});
});

describe("createGraphvizLocalProcessor — render()", () => {
	it("shells out to `dot -Tpng` with the source on stdin", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stdoutBuffer: TINY_PNG,
			stderr: "",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);

		await processor.render("graphviz", "digraph { A -> B }");

		expect(shell.calls).toHaveLength(1);
		expect(shell.calls[0].cmd).toBe("dot");
		expect(shell.calls[0].args).toEqual(["-Tpng"]);
		expect(shell.calls[0].input).toBe("digraph { A -> B }");
	});

	it("accepts the `dot` alias and shells out the same way", async () => {
		// Alias resolution is not meaningful internally — the command
		// line is identical regardless of which tag the caller wrote.
		// The alias is advertised so `/fence list` and the extension's
		// resolve(tag) can match against it.
		const shell = new FakeShellRunner({
			stdout: "",
			stdoutBuffer: TINY_PNG,
			stderr: "",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);

		await processor.render("dot", "digraph { A -> B }");

		expect(shell.calls).toHaveLength(1);
		expect(shell.calls[0].cmd).toBe("dot");
		expect(shell.calls[0].args).toEqual(["-Tpng"]);
	});

	it("returns ok:true with png reading from stdoutBuffer on exit 0", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stdoutBuffer: TINY_PNG,
			stderr: "",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "digraph {}");

		expect(result.ok).toBe(true);
		if (result.ok && "png" in result) {
			expect(Buffer.compare(result.png, TINY_PNG)).toBe(0);
		}
	});

	it("falls back to encoding stdout as UTF-8 when stdoutBuffer is absent", async () => {
		// Tests that don't care about PNG fidelity — most of the
		// extension-layer cases — pass only `stdout` in their fake
		// ShellResults. graphviz-local's fallback encodes stdout via
		// UTF-8 so `result.png` is defined (lossy for binary, fine for
		// assertions that never inspect bytes).
		const shell = new FakeShellRunner({
			stdout: "ascii only",
			stderr: "",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "digraph {}");

		expect(result.ok).toBe(true);
		if (result.ok && "png" in result) {
			expect(result.png.toString("utf8")).toBe("ascii only");
		}
	});

	it("returns ok:false with stderr body on non-zero exit", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: "Error: <stdin>:1: syntax error near '->'",
			exitCode: 1,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "digraph { A -> }");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("syntax error");
		}
	});

	it("falls back to `dot exited N` when stderr is empty and exit is non-zero", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: "",
			exitCode: 5,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "digraph {}");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("5");
		}
	});

	it("truncates very long error bodies to at most 500 characters", async () => {
		const longErr = "x".repeat(5000);
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: longErr,
			exitCode: 1,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "oops");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.length).toBeLessThanOrEqual(500);
		}
	});

	it("returns ok:false with err.message when the shell runner throws", async () => {
		// Unprogrammed command, no default → FakeShellRunner throws.
		// graphviz-local must catch and map to ok:false rather than
		// propagate — the extension's per-block render loop relies on
		// processors honouring this contract.
		const shell = new FakeShellRunner();
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "digraph {}");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.length).toBeGreaterThan(0);
		}
	});

	it("yields ok:false and does not shell out when the caller's signal is already aborted", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stdoutBuffer: TINY_PNG,
			stderr: "",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);
		const controller = new AbortController();
		controller.abort();

		const result = await processor.render("graphviz", "digraph {}", controller.signal);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/abort/i);
		}
		expect(shell.calls).toHaveLength(0);
	});
});

describe("createGraphvizLocalProcessor — logging", () => {
	it("logs debug on request and info on success", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stdoutBuffer: TINY_PNG,
			stderr: "",
			exitCode: 0,
		});
		const logger = new FakeLogger();
		const processor = createGraphvizLocalProcessor(shell, logger);

		await processor.render("graphviz", "digraph {}");

		const entries = logger.bySubsystem("graphviz-local");
		expect(entries.some((e) => e.level === "debug")).toBe(true);
		expect(entries.some((e) => e.level === "info")).toBe(true);
	});

	it("logs warn on non-zero exit", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: "oops",
			exitCode: 1,
		});
		const logger = new FakeLogger();
		const processor = createGraphvizLocalProcessor(shell, logger);

		await processor.render("graphviz", "digraph {}");

		const entries = logger.bySubsystem("graphviz-local");
		expect(entries.some((e) => e.level === "warn")).toBe(true);
	});

	it("logs error on shell-runner throw", async () => {
		const shell = new FakeShellRunner();
		const logger = new FakeLogger();
		const processor = createGraphvizLocalProcessor(shell, logger);

		await processor.render("graphviz", "digraph {}");

		const entries = logger.bySubsystem("graphviz-local");
		expect(entries.some((e) => e.level === "error")).toBe(true);
	});

	it("works without a logger (factory's logger arg is optional)", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stdoutBuffer: TINY_PNG,
			stderr: "",
			exitCode: 0,
		});
		const processor = createGraphvizLocalProcessor(shell);

		const result = await processor.render("graphviz", "digraph {}");

		expect(result.ok).toBe(true);
	});
});
