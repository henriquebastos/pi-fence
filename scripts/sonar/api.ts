import type {
	CeTaskResponse,
	IssuesResponse,
	MeasuresResponse,
	QualityGateResponse,
	ReportTask,
	SonarIssue,
	SonarReportBundle,
} from "./types.ts";

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 120_000;
const PAGE_SIZE = 500;
const MEASURE_KEYS = [
	"bugs",
	"vulnerabilities",
	"code_smells",
	"coverage",
	"duplicated_lines_density",
	"ncloc",
	"complexity",
	"reliability_rating",
	"security_rating",
	"sqale_rating",
].join(",");

export function createSonarAuthHeader(token: string): string {
	const encodedToken = Buffer.from(`${token}:`).toString("base64");
	return `Basic ${encodedToken}`;
}

export async function fetchSonarReportBundle(
	reportTask: ReportTask,
	authHeader: string,
): Promise<SonarReportBundle> {
	const ceTask = await waitForCeTask(reportTask, authHeader);
	const [qualityGate, measures, issues] = await Promise.all([
		fetchQualityGate(reportTask, authHeader),
		fetchMeasures(reportTask, authHeader),
		fetchAllIssues(reportTask, authHeader),
	]);

	return { ceTask, qualityGate, measures, issues };
}

async function fetchQualityGate(
	reportTask: ReportTask,
	authHeader: string,
): Promise<QualityGateResponse> {
	return fetchJson<QualityGateResponse>(
		`${reportTask.serverUrl}/api/qualitygates/project_status?projectKey=${encodeURIComponent(reportTask.projectKey)}`,
		authHeader,
	);
}

async function fetchMeasures(
	reportTask: ReportTask,
	authHeader: string,
): Promise<MeasuresResponse> {
	return fetchJson<MeasuresResponse>(
		`${reportTask.serverUrl}/api/measures/component?component=${encodeURIComponent(reportTask.projectKey)}&metricKeys=${encodeURIComponent(MEASURE_KEYS)}`,
		authHeader,
	);
}

async function waitForCeTask(
	reportTask: ReportTask,
	authHeader: string,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
): Promise<CeTaskResponse> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < pollTimeoutMs) {
		const payload = await fetchJson<CeTaskResponse>(
			`${reportTask.serverUrl}/api/ce/task?id=${encodeURIComponent(reportTask.ceTaskId)}`,
			authHeader,
		);
		if (payload.task.status === "SUCCESS") {
			return payload;
		}
		if (payload.task.status === "FAILED" || payload.task.status === "CANCELED") {
			throw new Error(`SonarQube CE task ended with status ${payload.task.status}.`);
		}
		await sleep(pollIntervalMs);
	}
	throw new Error(`Timed out waiting for SonarQube CE task ${reportTask.ceTaskId}.`);
}

async function fetchAllIssues(
	reportTask: ReportTask,
	authHeader: string,
): Promise<IssuesResponse> {
	const issues: SonarIssue[] = [];
	let page = 1;
	while (true) {
		const payload = await fetchJson<IssuesResponse>(
			`${reportTask.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(reportTask.projectKey)}&resolved=false&ps=${PAGE_SIZE}&p=${page}`,
			authHeader,
		);
		issues.push(...payload.issues);
		if (issues.length >= payload.total) {
			return { total: payload.total, issues };
		}
		page += 1;
	}
}

async function fetchJson<T>(url: string, authHeader: string): Promise<T> {
	const response = await fetch(url, {
		headers: {
			authorization: authHeader,
			accept: "application/json",
		},
	});
	if (!response.ok) {
		throw new Error(`SonarQube API ${url} failed with ${response.status} ${response.statusText}.`);
	}
	return (await response.json()) as T;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
