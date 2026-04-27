/**
 * Unit tests for `/fence doctor` diagnostic logic.
 */

import { describe, expect, it } from "vitest";

import {
	computeDoctorIssues,
	formatDoctorLines,
	type DoctorInput,
} from "../../extensions/pi-fence/doctor.ts";

function makeInput(overrides: Partial<DoctorInput> = {}): DoctorInput {
	return {
		globalPath: "/home/user/.pi/agent/pi-fence.config.json",
		globalStatus: "not-found",
		projectPath: "/project/.pi/pi-fence.config.json",
		projectStatus: "not-found",
		listings: [],
		bindingRows: [],
		allTags: [],
		...overrides,
	};
}

describe("computeDoctorIssues", () => {
	it("returns no issues when everything is healthy", () => {
		const input = makeInput({
			listings: [
				{ id: "kroki-remote", status: "registered", tags: ["mermaid"], aliases: {} },
			],
		});

		expect(computeDoctorIssues(input)).toEqual([]);
	});

	it("reports malformed global config", () => {
		const input = makeInput({ globalStatus: "malformed-json" });
		const issues = computeDoctorIssues(input);

		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain("global config is malformed JSON");
	});

	it("reports malformed project config", () => {
		const input = makeInput({ projectStatus: "malformed-json" });
		const issues = computeDoctorIssues(input);

		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain("project config is malformed JSON");
	});

	it("reports invalid-shape config", () => {
		const input = makeInput({ globalStatus: "invalid-shape" });
		const issues = computeDoctorIssues(input);

		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain("global config has invalid shape");
	});

	it("reports binding issue rows", () => {
		const input = makeInput({
			bindingRows: [
				{
					status: "issue",
					tag: "graphviz",
					selector: "processor",
					processorId: "missing",
					reason: "unknown-processor",
				},
			],
		});

		const issues = computeDoctorIssues(input);
		expect(issues).toEqual([
			{ message: "binding for graphviz has issue: unknown processor" },
		]);
	});

	it("reports unavailable processor with install hint", () => {
		const input = makeInput({
			listings: [
				{
					id: "graphviz-host",
					status: "unavailable",
					tags: ["graphviz"],
					aliases: {},
					unavailableReason: "dot not found",
					installHint: "brew install graphviz",
				},
			],
		});

		const issues = computeDoctorIssues(input);
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain("graphviz-host is unavailable");
		expect(issues[0].message).toContain("brew install graphviz");
	});

	it("reports disabled processor when tags lose their only processor", () => {
		const input = makeInput({
			listings: [
				{ id: "kroki-remote", status: "disabled", tags: ["mermaid", "graphviz"], aliases: {} },
			],
		});

		const issues = computeDoctorIssues(input);
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain("kroki-remote is disabled");
		expect(issues[0].message).toContain("2 tag(s)");
	});

	it("does not report disabled processor when another processor covers the tags", () => {
		const input = makeInput({
			listings: [
				{ id: "graphviz-host", status: "registered", tags: ["graphviz"], aliases: {} },
				{ id: "kroki-remote", status: "disabled", tags: ["graphviz", "mermaid"], aliases: {} },
			],
		});

		const issues = computeDoctorIssues(input);
		// graphviz is covered by graphviz-host; only mermaid is orphaned.
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain("1 tag(s)");
	});
});

describe("formatDoctorLines", () => {
	it("formats a healthy doctor output", () => {
		const input = makeInput({
			globalStatus: "loaded",
			listings: [
				{ id: "kroki-remote", status: "registered", tags: ["mermaid"], aliases: {} },
			],
		});

		const lines = formatDoctorLines(input, [
			"kroki-remote [registered] — mermaid",
		]);

		expect(lines).toContain("Config");
		expect(lines.some((l) => l.includes("global:") && l.includes("loaded"))).toBe(true);
		expect(lines.some((l) => l.includes("project:") && l.includes("not found"))).toBe(true);
		expect(lines).toContain("No issues found.");
	});

	it("includes Issues section when problems exist", () => {
		const input = makeInput({
			globalStatus: "malformed-json",
		});

		const lines = formatDoctorLines(input, []);

		expect(lines).toContain("Issues");
		expect(lines.some((l) => l.includes("malformed JSON"))).toBe(true);
	});
});
