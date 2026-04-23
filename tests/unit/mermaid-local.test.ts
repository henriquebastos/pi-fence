/**
 * Unit tests for the mermaid-local processor.
 *
 * Exercises available() and render() through FakeShellRunner.
 * Live tests with real mmdc live in tests/integration/.
 */

import { describe, expect, it } from "vitest";

import { createMermaidLocalProcessor } from "../../extensions/pi-fence/mermaid-local.ts";
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
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/abort/i);
		}
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
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Parse error");
		}
	});
});

describe("mermaid-local — metadata", () => {
	it("exposes the expected id, tags, and aliases", () => {
		const shell = new FakeShellRunner();
		const proc = createMermaidLocalProcessor(shell);

		expect(proc.id).toBe("mermaid-local");
		expect(proc.tags).toEqual(["mermaid"]);
		expect(proc.aliases).toEqual({});
	});
});
