import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReportTask } from "./types.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPORT_TASK_PATH = join(REPO_ROOT, ".scannerwork", "report-task.txt");

export function readReportTask(
	reportTaskPath = REPORT_TASK_PATH,
	fallbackServerUrl = process.env.SONAR_HOST_URL,
): ReportTask {
	if (!existsSync(reportTaskPath)) {
		throw new Error(`Missing ${reportTaskPath}. Run 'pnpm run sonar:scan' first.`);
	}

	const entries = parseReportTaskEntries(readFileSync(reportTaskPath, "utf8"));
	const serverUrl = entries.get("serverUrl") ?? fallbackServerUrl;
	const projectKey = entries.get("projectKey");
	const ceTaskId = entries.get("ceTaskId");
	if (!serverUrl || !projectKey || !ceTaskId) {
		throw new Error(`Incomplete report-task.txt at ${reportTaskPath}.`);
	}

	return {
		serverUrl,
		projectKey,
		ceTaskId,
		dashboardUrl: entries.get("dashboardUrl"),
	};
}

function parseReportTaskEntries(raw: string): Map<string, string> {
	const entries = new Map<string, string>();
	for (const line of raw.split(/\r?\n/)) {
		if (!line || line.startsWith("#")) {
			continue;
		}
		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}
		entries.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
	}
	return entries;
}
