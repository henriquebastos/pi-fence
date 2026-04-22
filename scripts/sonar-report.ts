#!/usr/bin/env tsx
/**
 * SonarQube reporting helper.
 *
 * Reads `.scannerwork/report-task.txt`, waits for the submitted CE task to
 * finish, fetches the main SonarQube API payloads for the project, and writes
 * a reproducible report bundle under `scripts/out/sonar/latest/`.
 *
 * Required env:
 *   - SONAR_TOKEN
 *
 * Optional env:
 *   - SONAR_HOST_URL (used only as a fallback when report-task.txt is absent)
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_TASK_PATH = join(REPO_ROOT, ".scannerwork", "report-task.txt");
const OUT_DIR = join(REPO_ROOT, "scripts", "out", "sonar", "latest");
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 500;

interface ReportTask {
	serverUrl: string;
	projectKey: string;
	ceTaskId: string;
	dashboardUrl?: string;
}

interface SonarIssue {
	rule: string;
	severity: string;
	component: string;
	line?: number;
	message: string;
}

interface Summary {
	projectKey: string;
	serverUrl: string;
	dashboardUrl?: string;
	ceTaskId: string;
	ceTaskStatus: string;
	qualityGateStatus: string | null;
	issuesTotal: number;
	issuesBySeverity: Array<{ severity: string; count: number }>;
	issuesByRule: Array<{ rule: string; count: number }>;
	issuesByLane: Array<{ lane: string; count: number }>;
	topFiles: Array<{ component: string; count: number }>;
	measures: Record<string, string>;
}

async function main(): Promise<void> {
	const token = process.env.SONAR_TOKEN;
	if (!token) {
		throw new Error(
			"SONAR_TOKEN is not set. Run the scan from a shell that exports it before generating a report.",
		);
	}

	const reportTask = readReportTask();
	const authHeader = `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
	const ceTask = await waitForCeTask(reportTask, authHeader);
	const qualityGate = await fetchJson(
		`${reportTask.serverUrl}/api/qualitygates/project_status?projectKey=${encodeURIComponent(reportTask.projectKey)}`,
		authHeader,
	);
	const measures = await fetchJson(
		`${reportTask.serverUrl}/api/measures/component?component=${encodeURIComponent(reportTask.projectKey)}&metricKeys=${encodeURIComponent("bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,complexity,reliability_rating,security_rating,sqale_rating")}`,
		authHeader,
	);
	const issues = await fetchAllIssues(reportTask, authHeader);
	const summary = buildSummary(reportTask, ceTask, qualityGate, measures, issues);

	await mkdir(OUT_DIR, { recursive: true });
	await writeJson("report-task.json", reportTask);
	await writeJson("ce-task.json", ceTask);
	await writeJson("quality-gate.json", qualityGate);
	await writeJson("measures.json", measures);
	await writeJson("issues.json", issues);
	await writeJson("summary.json", summary);
	await writeFile(join(OUT_DIR, "summary.md"), renderSummaryMarkdown(summary), "utf8");

	console.log(`[sonar:report] wrote report bundle to ${OUT_DIR}`);
	console.log(`[sonar:report] dashboard: ${reportTask.dashboardUrl ?? `${reportTask.serverUrl}/dashboard?id=${reportTask.projectKey}`}`);
}

function readReportTask(): ReportTask {
	if (!existsSync(REPORT_TASK_PATH)) {
		throw new Error(
			`Missing ${REPORT_TASK_PATH}. Run 'pnpm run sonar:scan' first.`,
		);
	}
	const raw = readFileSync(REPORT_TASK_PATH, "utf8");
	const entries = new Map<string, string>();
	for (const line of raw.split(/\r?\n/)) {
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf("=");
		if (idx === -1) continue;
		entries.set(line.slice(0, idx), line.slice(idx + 1));
	}

	const serverUrl = entries.get("serverUrl") ?? process.env.SONAR_HOST_URL;
	const projectKey = entries.get("projectKey");
	const ceTaskId = entries.get("ceTaskId");
	if (!serverUrl || !projectKey || !ceTaskId) {
		throw new Error(`Incomplete report-task.txt at ${REPORT_TASK_PATH}.`);
	}
	return {
		serverUrl,
		projectKey,
		ceTaskId,
		dashboardUrl: entries.get("dashboardUrl"),
	};
}

async function waitForCeTask(reportTask: ReportTask, authHeader: string): Promise<unknown> {
	const started = Date.now();
	while (Date.now() - started < POLL_TIMEOUT_MS) {
		const payload = await fetchJson(
			`${reportTask.serverUrl}/api/ce/task?id=${encodeURIComponent(reportTask.ceTaskId)}`,
			authHeader,
		);
		const status = (payload as { task?: { status?: string } }).task?.status;
		if (status === "SUCCESS") return payload;
		if (status === "FAILED" || status === "CANCELED") {
			throw new Error(`SonarQube CE task ended with status ${status}.`);
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(`Timed out waiting for SonarQube CE task ${reportTask.ceTaskId}.`);
}

async function fetchAllIssues(reportTask: ReportTask, authHeader: string): Promise<unknown> {
	const pages: SonarIssue[] = [];
	let page = 1;
	let total = 0;
	while (true) {
		const payload = (await fetchJson(
			`${reportTask.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(reportTask.projectKey)}&ps=${PAGE_SIZE}&p=${page}`,
			authHeader,
		)) as { total: number; issues: SonarIssue[] };
		total = payload.total;
		pages.push(...payload.issues);
		if (pages.length >= total) {
			return { total, issues: pages };
		}
		page += 1;
	}
}

async function fetchJson(url: string, authHeader: string): Promise<unknown> {
	const response = await fetch(url, {
		headers: {
			authorization: authHeader,
			accept: "application/json",
		},
	});
	if (!response.ok) {
		throw new Error(`SonarQube API ${url} failed with ${response.status} ${response.statusText}.`);
	}
	return response.json();
}

function buildSummary(
	reportTask: ReportTask,
	ceTask: unknown,
	qualityGate: unknown,
	measures: unknown,
	issuesPayload: unknown,
): Summary {
	const issues = (issuesPayload as { issues: SonarIssue[] }).issues ?? [];
	const measureEntries = ((measures as { component?: { measures?: Array<{ metric: string; value?: string }> } }).component?.measures ?? [])
		.reduce<Record<string, string>>((acc, measure) => {
			acc[measure.metric] = measure.value ?? "";
			return acc;
		}, {});

	return {
		projectKey: reportTask.projectKey,
		serverUrl: reportTask.serverUrl,
		dashboardUrl: reportTask.dashboardUrl,
		ceTaskId: reportTask.ceTaskId,
		ceTaskStatus: ((ceTask as { task?: { status?: string } }).task?.status ?? "UNKNOWN"),
		qualityGateStatus: ((qualityGate as { projectStatus?: { status?: string } }).projectStatus?.status ?? null),
		issuesTotal: issues.length,
		issuesBySeverity: countBy(issues, (issue) => issue.severity, "severity"),
		issuesByRule: countBy(issues, (issue) => issue.rule, "rule"),
		issuesByLane: countBy(issues, (issue) => laneFor(issue.component), "lane"),
		topFiles: topFiles(issues),
		measures: measureEntries,
	};
}

function countBy<T, K extends string>(
	items: readonly T[],
	keyFn: (item: T) => string,
	keyName: K,
): Array<{ [P in K]: string } & { count: number }> {
	const counts = new Map<string, number>();
	for (const item of items) {
		const key = keyFn(item);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([key, count]) => ({ [keyName]: key, count }) as { [P in K]: string } & { count: number })
		.sort((a, b) => b.count - a.count || a[keyName].localeCompare(b[keyName]));
}

function topFiles(issues: readonly SonarIssue[]): Array<{ component: string; count: number }> {
	const counts = new Map<string, number>();
	for (const issue of issues) {
		counts.set(issue.component, (counts.get(issue.component) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([component, count]) => ({ component, count }))
		.sort((a, b) => b.count - a.count || a.component.localeCompare(b.component))
		.slice(0, 10);
}

function laneFor(component: string): string {
	const normalized = component.replace(/^pi-fence:/, "");
	if (normalized.startsWith("extensions/")) return "runtime";
	if (normalized.startsWith("scripts/")) return "tooling";
	if (normalized.startsWith("tests/")) return "tests";
	return "other";
}

function renderSummaryMarkdown(summary: Summary): string {
	const lines: string[] = [];
	lines.push("# SonarQube summary");
	lines.push("");
	lines.push(`- Project: \`${summary.projectKey}\``);
	lines.push(`- CE task: \`${summary.ceTaskId}\` (${summary.ceTaskStatus})`);
	lines.push(`- Quality gate: ${summary.qualityGateStatus ?? "unknown"}`);
	lines.push(`- Dashboard: ${summary.dashboardUrl ?? `${summary.serverUrl}/dashboard?id=${summary.projectKey}`}`);
	lines.push(`- Issues: ${summary.issuesTotal}`);
	lines.push("");
	lines.push("## Issues by severity");
	lines.push("");
	lines.push("| Severity | Count |");
	lines.push("|----------|-------|");
	for (const row of summary.issuesBySeverity) {
		lines.push(`| ${String(row.severity)} | ${row.count} |`);
	}
	lines.push("");
	lines.push("## Issues by lane");
	lines.push("");
	lines.push("| Lane | Count |");
	lines.push("|------|-------|");
	for (const row of summary.issuesByLane) {
		lines.push(`| ${String(row.lane)} | ${row.count} |`);
	}
	lines.push("");
	lines.push("## Top files");
	lines.push("");
	lines.push("| File | Count |");
	lines.push("|------|-------|");
	for (const row of summary.topFiles) {
		lines.push(`| ${row.component} | ${row.count} |`);
	}
	lines.push("");
	lines.push("## Key measures");
	lines.push("");
	for (const [metric, value] of Object.entries(summary.measures)) {
		lines.push(`- ${metric}: ${value}`);
	}
	lines.push("");
	lines.push("## Top rules");
	lines.push("");
	lines.push("| Rule | Count |");
	lines.push("|------|-------|");
	for (const row of summary.issuesByRule.slice(0, 10)) {
		lines.push(`| ${String(row.rule)} | ${row.count} |`);
	}
	lines.push("");
	return lines.join("\n");
}

async function writeJson(name: string, value: unknown): Promise<void> {
	await writeFile(join(OUT_DIR, name), `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
	process.stderr.write(`[sonar:report] ${err instanceof Error ? err.message : String(err)}\n`);
	if (err instanceof Error && err.stack) {
		process.stderr.write(`${err.stack}\n`);
	}
	process.exit(1);
});
