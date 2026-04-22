import type { Summary } from "./types.ts";

export function renderSummaryMarkdown(summary: Summary): string {
	return [
		"# SonarQube summary",
		"",
		...renderSummaryFacts(summary),
		"",
		renderTableSection("Issues by severity", ["Severity", "Count"], summary.issuesBySeverity.map((row) => [row.severity, String(row.count)])),
		"",
		renderTableSection("Issues by lane", ["Lane", "Count"], summary.issuesByLane.map((row) => [row.lane, String(row.count)])),
		"",
		renderTableSection("Top files", ["File", "Count"], summary.topFiles.map((row) => [row.component, String(row.count)])),
		"",
		renderMeasures(summary),
		"",
		renderTableSection("Top rules", ["Rule", "Count"], summary.issuesByRule.slice(0, 10).map((row) => [row.rule, String(row.count)])),
		"",
	].join("\n");
}

function renderSummaryFacts(summary: Summary): string[] {
	return [
		`- Project: \`${summary.projectKey}\``,
		`- CE task: \`${summary.ceTaskId}\` (${summary.ceTaskStatus})`,
		`- Quality gate: ${summary.qualityGateStatus ?? "unknown"}`,
		`- Dashboard: ${dashboardUrlFor(summary.dashboardUrl, summary.serverUrl, summary.projectKey)}`,
		`- Issues: ${summary.issuesTotal}`,
	];
}

function dashboardUrlFor(
	dashboardUrl: string | undefined,
	serverUrl: string,
	projectKey: string,
): string {
	return dashboardUrl ?? `${serverUrl}/dashboard?id=${projectKey}`;
}

function renderMeasures(summary: Summary): string {
	return [
		"## Key measures",
		"",
		...Object.entries(summary.measures).map(([metric, value]) => `- ${metric}: ${value}`),
	].join("\n");
}

function renderTableSection(
	title: string,
	headers: [string, string],
	rows: Array<[string, string]>,
): string {
	return [
		`## ${title}`,
		"",
		`| ${headers[0]} | ${headers[1]} |`,
		`|${"-".repeat(headers[0].length + 2)}|${"-".repeat(headers[1].length + 2)}|`,
		...rows.map(([left, right]) => `| ${left} | ${right} |`),
	].join("\n");
}
