/**
 * `/fence doctor` diagnostic logic.
 *
 * Pure functions that compute a diagnostic summary from the extension's
 * runtime state: config file statuses, processor listings, bindings,
 * and issues. No pi-SDK, no I/O, no pi-tui — trivially unit-testable.
 */

import type { ConfigFileStatus } from "./io/config-loader.ts";
import type { ProcessorListing } from "./list.ts";
import type { BindingResolution } from "./resolve.ts";

export interface DoctorInput {
	globalPath: string;
	globalStatus: ConfigFileStatus;
	projectPath: string;
	projectStatus: ConfigFileStatus;
	listings: readonly ProcessorListing[];
	bindingRows: readonly BindingResolution[];
	/** All tags any registered processor claims (canonical + aliases). */
	allTags: readonly string[];
}

export interface DoctorIssue {
	message: string;
}

function formatConfigStatus(status: ConfigFileStatus): string {
	if (status === "loaded") return "loaded";
	if (status === "not-found") return "not found";
	if (status === "malformed-json") return "malformed JSON — using defaults";
	return "read error — using defaults";
}

/**
 * Compute actionable issues from the extension's runtime state.
 */
export function computeDoctorIssues(input: DoctorInput): DoctorIssue[] {
	const issues: DoctorIssue[] = [];

	// Config file problems.
	if (input.globalStatus === "malformed-json") {
		issues.push({ message: `global config is malformed JSON (${input.globalPath})` });
	}
	if (input.globalStatus === "read-error") {
		issues.push({ message: `global config could not be read (${input.globalPath})` });
	}
	if (input.projectStatus === "malformed-json") {
		issues.push({ message: `project config is malformed JSON (${input.projectPath})` });
	}
	if (input.projectStatus === "read-error") {
		issues.push({ message: `project config could not be read (${input.projectPath})` });
	}

	// Processor problems.
	for (const listing of input.listings) {
		if (listing.status === "unavailable") {
			const hint = listing.installHint ? `: ${listing.installHint}` : "";
			issues.push({
				message: `${listing.id} is unavailable${hint}`,
			});
		}
		if (listing.status === "disabled") {
			// Count how many tags lose their only processor.
			const otherActive = input.listings.filter(
				(l) => l.id !== listing.id && l.status === "registered",
			);
			const orphanedTags = [...listing.tags].filter(
				(tag) => !otherActive.some((l) => l.tags.includes(tag)),
			);
			if (orphanedTags.length > 0) {
				issues.push({
					message: `${listing.id} is disabled; ${orphanedTags.length} tag(s) have no available processor`,
				});
			}
		}
	}

	return issues;
}

/**
 * Format the full `/fence doctor` output as an array of lines.
 */
export function formatDoctorLines(
	input: DoctorInput,
	processorLines: readonly string[],
): string[] {
	const lines: string[] = [];

	// Config section.
	lines.push("Config");
	lines.push(`  global: ${input.globalPath} (${formatConfigStatus(input.globalStatus)})`);
	lines.push(`  project: ${input.projectPath} (${formatConfigStatus(input.projectStatus)})`);
	lines.push("");

	// Processors + bindings (reuse formatProcessorLines output).
	for (const line of processorLines) {
		lines.push(line);
	}
	lines.push("");

	// Issues section.
	const issues = computeDoctorIssues(input);
	if (issues.length === 0) {
		lines.push("No issues found.");
	} else {
		lines.push("Issues");
		for (const issue of issues) {
			lines.push(`  - ${issue.message}`);
		}
	}

	return lines;
}
