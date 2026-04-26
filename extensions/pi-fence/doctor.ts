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
	if (status === "malformed-json") return "malformed JSON — using fail-closed defaults";
	if (status === "invalid-shape") return "invalid shape — using fail-closed defaults";
	return "read error — using fail-closed defaults";
}

/**
 * Compute actionable issues from the extension's runtime state.
 */
export function computeDoctorIssues(input: DoctorInput): DoctorIssue[] {
	return [
		...computeConfigIssues(input),
		...computeProcessorIssues(input.listings),
	];
}

function computeConfigIssues(input: DoctorInput): DoctorIssue[] {
	return [
		...configStatusIssue("global", input.globalStatus, input.globalPath),
		...configStatusIssue("project", input.projectStatus, input.projectPath),
	];
}

function configStatusIssue(
	label: "global" | "project",
	status: ConfigFileStatus,
	path: string,
): DoctorIssue[] {
	if (status === "malformed-json") {
		return [{ message: `${label} config is malformed JSON (${path})` }];
	}
	if (status === "read-error") {
		return [{ message: `${label} config could not be read (${path})` }];
	}
	if (status === "invalid-shape") {
		return [{ message: `${label} config has invalid shape (${path})` }];
	}
	return [];
}

function computeProcessorIssues(listings: readonly ProcessorListing[]): DoctorIssue[] {
	return listings.flatMap((listing) => processorIssue(listing, listings));
}

function processorIssue(
	listing: ProcessorListing,
	listings: readonly ProcessorListing[],
): DoctorIssue[] {
	if (listing.status === "unavailable") {
		const hint = listing.installHint ? `: ${listing.installHint}` : "";
		return [{ message: `${listing.id} is unavailable${hint}` }];
	}
	if (listing.status !== "disabled") return [];
	const orphanedCount = countOrphanedTags(listing, listings);
	return orphanedCount > 0
		? [{ message: `${listing.id} is disabled; ${orphanedCount} tag(s) have no available processor` }]
		: [];
}

function countOrphanedTags(
	listing: ProcessorListing,
	listings: readonly ProcessorListing[],
): number {
	const otherActive = listings.filter(
		(l) => l.id !== listing.id && l.status === "registered",
	);
	return [...listing.tags].filter(
		(tag) => !otherActive.some((l) => l.tags.includes(tag)),
	).length;
}

/**
 * Format the full `/fence doctor` output as an array of lines.
 */
export function formatDoctorLines(
	input: DoctorInput,
	processorLines: readonly string[],
): string[] {
	return [
		...formatDoctorConfigLines(input),
		...processorLines,
		"",
		...formatDoctorIssueLines(computeDoctorIssues(input)),
	];
}

function formatDoctorConfigLines(input: DoctorInput): string[] {
	return [
		"Config",
		`  global: ${input.globalPath} (${formatConfigStatus(input.globalStatus)})`,
		`  project: ${input.projectPath} (${formatConfigStatus(input.projectStatus)})`,
		"",
	];
}

function formatDoctorIssueLines(issues: readonly DoctorIssue[]): string[] {
	if (issues.length === 0) return ["No issues found."];
	return [
		"Issues",
		...issues.map((issue) => `  - ${issue.message}`),
	];
}
