/**
 * Unit tests for the mermaid-local processor.
 *
 * Exercises available() and render() through FakeShellRunner.
 * Live tests with real mmdc live in tests/integration/.
 */

import { promises as fs } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createMermaidLocalProcessor } from "../../extensions/pi-fence/mermaid-local.ts";
import { DEFAULT_FENCE_SOURCE_MAX_BYTES, DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES } from "../../extensions/pi-fence/policy.ts";
import { DEFAULT_RENDER_TIMEOUT_MS } from "../../extensions/pi-fence/processor.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

describe("mermaid-local — available()", () => {
	it("returns ok when mmdc --version exits 0", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("mmdc", ["--version"], {
			stdout: "11.4.0",
			stderr: "",
			exitCode: 0,
		});
		const proc = createMermaidLocalProcessor(shell);

		const result = await proc.available();
		expect(result.ok).toBe(true);
	});

	it("returns unavailable with install hint when mmdc is not found", async () => {
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: "mmdc: not found",
			exitCode: 127,
		});
		const proc = createMermaidLocalProcessor(shell);

		const result = await proc.available();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain("mmdc");
			expect(result.installHint).toContain("mermaid-cli");
		}
	});

	it("returns unavailable when mmdc is not found (spawn failure)", async () => {
		// No response programmed + no default → FakeShellRunner throws.
		const shell = new FakeShellRunner();
		const proc = createMermaidLocalProcessor(shell);

		const result = await proc.available();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain("mmdc");
			expect(result.installHint).toContain("mermaid-cli");
		}
	});
});

describe("mermaid-local — render()", () => {
	it("returns ok:false with error message when pre-aborted", async () => {
		const shell = new FakeShellRunner();
		const proc = createMermaidLocalProcessor(shell);

		const controller = new AbortController();
		controller.abort();

		const result = await proc.render("mermaid", "flowchart LR\nA --> B", controller.signal);
		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toMatch(/abort/i);
		}
	});

	it("rejects oversized source before writing temp files or shelling out", async () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const proc = createMermaidLocalProcessor(shell);

		const result = await proc.render("mermaid", "x".repeat(DEFAULT_FENCE_SOURCE_MAX_BYTES + 1));

		expect(result.kind).toBe("error");
		if (result.kind === "error") expect(result.error).toContain("Fence source is too large");
		expect(shell.calls).toHaveLength(0);
	});

	it("returns ok:false when mmdc exits non-zero", async () => {
		// Default response simulates mmdc failure for any arg combination.
		const shell = new FakeShellRunner({
			stdout: "",
			stderr: "Parse error on line 1",
			exitCode: 1,
		});
		// Program the version probe so available() would pass (not called here).
		shell.setResponse("mmdc", ["--version"], {
			stdout: "11.4.0",
			stderr: "",
			exitCode: 0,
		});
		const proc = createMermaidLocalProcessor(shell);

		const result = await proc.render("mermaid", "bad syntax");
		expect(result.kind).toBe("error");
		if (result.kind === "error") {
			expect(result.error).toContain("Parse error");
		}
	});

	it("rejects oversized PNG output before reading it", async () => {
		class OutputWritingShellRunner {
			readonly calls: string[][] = [];
			async run(_cmd: string, args: string[]) {
				this.calls.push(args);
				const outPath = args[args.indexOf("-o") + 1];
				await fs.writeFile(outPath, Buffer.alloc(DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES + 1));
				return { stdout: "", stderr: "", exitCode: 0 };
			}
		}
		const shell = new OutputWritingShellRunner();
		const proc = createMermaidLocalProcessor(shell);
		const readSpy = vi.spyOn(fs, "readFile");
		try {
			const result = await proc.render("mermaid", "flowchart LR\nA --> B");

			expect(result.kind).toBe("error");
			if (result.kind === "error") expect(result.error).toContain("Processor output is too large");
			expect(readSpy).not.toHaveBeenCalled();
			expect(shell.calls).toHaveLength(1);
		} finally {
			readSpy.mockRestore();
		}
	});

	it("aborts a hanging render after the default timeout", async () => {
		const timeoutController = new AbortController();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(timeoutController.signal);
		try {
			class HangingShellRunner {
				calls = 0;
				async run(_cmd: string, _args: string[], opts?: { signal?: AbortSignal }) {
					this.calls++;
					return new Promise<never>((_resolve, reject) => {
						opts?.signal?.addEventListener(
							"abort",
							() => reject(new Error("render timed out")),
							{ once: true },
						);
					});
				}
			}
			const shell = new HangingShellRunner();
			const proc = createMermaidLocalProcessor(shell);

			const render = proc.render("mermaid", "flowchart LR\nA --> B");
			expect(timeoutSpy).toHaveBeenCalledWith(DEFAULT_RENDER_TIMEOUT_MS);
			await vi.waitFor(() => expect(shell.calls).toBe(1));
			timeoutController.abort();
			const result = await Promise.race([
				render,
				new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 10)),
			]);

			expect(result).not.toBe("pending");
			if (result !== "pending") {
				expect(result.kind).toBe("error");
				if (result.kind === "error") expect(result.error).toMatch(/timed out|abort/i);
			}
			expect(shell.calls).toBe(1);
		} finally {
			timeoutSpy.mockRestore();
		}
	});
});

describe("mermaid-local — metadata", () => {
	it("exposes the expected id, placement, tags, and aliases", () => {
		const shell = new FakeShellRunner();
		const proc = createMermaidLocalProcessor(shell);

		expect(proc.id).toBe("mermaid-host");
		expect(proc.placement).toBe("host");
		expect(proc.tags).toEqual(["mermaid"]);
		expect(proc.aliases).toEqual({});
	});
});
