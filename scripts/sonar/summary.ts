import type {
	CountByLane,
	CountByRule,
	CountBySeverity,
	SonarReportBundle,
	Summary,
	TopFileCount,
	ReportTask,
} from "./types.ts";

export function buildSummary(
	reportTask: ReportTask,
	reportBundle: SonarReportBundle,
): Summary {
	const issues = reportBundle.issues.issues;

	return {
		projectKey: reportTask.projectKey,
		serverUrl: reportTask.serverUrl,
		dashboardUrl: reportTask.dashboardUrl,
		ceTaskId: reportTask.ceTaskId,
		ceTaskStatus: reportBundle.ceTask.task.status,
		qualityGateStatus: reportBundle.qualityGate.projectStatus?.status ?? null,
		issuesTotal: issues.length,
		issuesBySeverity: countBySeverity(issues),
		issuesByRule: countByRule(issues),
		issuesByLane: countByLane(issues),
		topFiles: topFiles(issues),
		measures: summarizeMeasures(reportBundle),
	};
}

function summarizeMeasures(reportBundle: SonarReportBundle): Record<string, string> {
	return Object.fromEntries(
		(reportBundle.measures.component?.measures ?? []).map((measure) => [
			measure.metric,
			measure.value ?? "",
		]),
	);
}

function countBySeverity(reportBundleIssues: SonarReportBundle["issues"]["issues"]): CountBySeverity[] {
	return countBy(reportBundleIssues, (issue) => issue.severity, "severity");
}

function countByRule(reportBundleIssues: SonarReportBundle["issues"]["issues"]): CountByRule[] {
	return countBy(reportBundleIssues, (issue) => issue.rule, "rule");
}

function countByLane(reportBundleIssues: SonarReportBundle["issues"]["issues"]): CountByLane[] {
	return countBy(reportBundleIssues, (issue) => laneFor(issue.component), "lane");
}

function countBy<K extends string>(
	issues: SonarReportBundle["issues"]["issues"],
	keyFor: (issue: SonarReportBundle["issues"]["issues"][number]) => string,
	keyName: K,
): Array<Record<K, string> & { count: number }> {
	const counts = new Map<string, number>();
	for (const issue of issues) {
		const key = keyFor(issue);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return [...counts.entries()]
		.map(([key, count]) => ({ [keyName]: key, count }) as Record<K, string> & { count: number })
		.sort((left, right) => right.count - left.count || left[keyName].localeCompare(right[keyName]));
}

function topFiles(reportBundleIssues: SonarReportBundle["issues"]["issues"]): TopFileCount[] {
	const counts = new Map<string, number>();
	for (const issue of reportBundleIssues) {
		counts.set(issue.component, (counts.get(issue.component) ?? 0) + 1);
	}

	return [...counts.entries()]
		.map(([component, count]) => ({ component, count }))
		.sort((left, right) => right.count - left.count || left.component.localeCompare(right.component))
		.slice(0, 10);
}

function laneFor(component: string): string {
	const normalized = component.replace(/^pi-fence:/, "");
	if (normalized.startsWith("extensions/")) {
		return "runtime";
	}
	if (normalized.startsWith("scripts/")) {
		return "tooling";
	}
	if (normalized.startsWith("tests/")) {
		return "tests";
	}
	return "other";
}
