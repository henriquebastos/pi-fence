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

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	buildSummary,
	createSonarAuthHeader,
	fetchSonarReportBundle,
	readReportTask,
	renderSummaryMarkdown,
} from "./sonar/index.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(REPO_ROOT, "scripts", "out", "sonar", "latest");

async function main(): Promise<void> {
	const token = readSonarToken();
	const reportTask = readReportTask();
	const reportBundle = await fetchSonarReportBundle(
		reportTask,
		createSonarAuthHeader(token),
	);
	const summary = buildSummary(reportTask, reportBundle);

	await mkdir(OUT_DIR, { recursive: true });
	await Promise.all([
		writeJson(join(OUT_DIR, "report-task.json"), reportTask),
		writeJson(join(OUT_DIR, "ce-task.json"), reportBundle.ceTask),
		writeJson(join(OUT_DIR, "quality-gate.json"), reportBundle.qualityGate),
		writeJson(join(OUT_DIR, "measures.json"), reportBundle.measures),
		writeJson(join(OUT_DIR, "issues.json"), reportBundle.issues),
		writeJson(join(OUT_DIR, "summary.json"), summary),
		writeFile(join(OUT_DIR, "summary.md"), renderSummaryMarkdown(summary), "utf8"),
	]);

	const dashboardUrl = reportTask.dashboardUrl ?? `${reportTask.serverUrl}/dashboard?id=${reportTask.projectKey}`;
	console.log(`[sonar:report] wrote report bundle to ${OUT_DIR}`);
	console.log(`[sonar:report] dashboard: ${dashboardUrl}`);
}

function readSonarToken(): string {
	const token = process.env.SONAR_TOKEN;
	if (!token) {
		throw new Error(
			"SONAR_TOKEN is not set. Run the scan from a shell that exports it before generating a report.",
		);
	}
	return token;
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

try {
	await main();
} catch (err) {
	process.stderr.write(`[sonar:report] ${err instanceof Error ? err.message : String(err)}\n`);
	if (err instanceof Error && err.stack) {
		process.stderr.write(`${err.stack}\n`);
	}
	process.exit(1);
}
