#!/usr/bin/env tsx
/**
 * inspect — broader completion-pass analyzers for pi-fence changes.
 *
 * Purpose:
 *   - Always run the broader non-live CRAP inspection path.
 *   - Run the SonarQube experiment too when the environment is configured.
 *   - Skip Sonar cleanly with a short explanation when it is not configured.
 *
 * This is intentionally outside the normal fast `feedback` loop. It is the
 * command to run when a change feels done and you want one more round of
 * refactor signal before calling it closed.
 *
 * Required env for the optional Sonar step:
 *   - SONAR_HOST_URL
 *   - SONAR_TOKEN
 */

import { spawn } from "node:child_process";

export interface InspectStep {
	script: "inspect:crap" | "inspect:sonar";
	requiredEnv?: readonly string[];
	skipReason?: string;
}

function printUsage(): void {
	process.stdout.write(
		[
			"Usage: pnpm run inspect",
			"",
			"Runs the broader completion-pass analyzers:",
			"  1. inspect:crap   — always",
			"  2. inspect:sonar  — only when SONAR_HOST_URL and SONAR_TOKEN are set",
		].join("\n") + "\n",
	);
}

export function getMissingSonarEnv(
	env: NodeJS.ProcessEnv = process.env,
): string[] {
	const required = ["SONAR_HOST_URL", "SONAR_TOKEN"] as const;
	return required.filter((name) => {
		const value = env[name];
		return value === undefined || value.trim().length === 0;
	});
}

export function buildInspectPlan(
	env: NodeJS.ProcessEnv = process.env,
): InspectStep[] {
	const missingSonar = getMissingSonarEnv(env);
	const plan: InspectStep[] = [{ script: "inspect:crap" }];

	if (missingSonar.length === 0) {
		plan.push({
			script: "inspect:sonar",
			requiredEnv: ["SONAR_HOST_URL", "SONAR_TOKEN"],
		});
		return plan;
	}

	plan.push({
		script: "inspect:sonar",
		requiredEnv: ["SONAR_HOST_URL", "SONAR_TOKEN"],
		skipReason: `missing ${missingSonar.join(", ")}`,
	});
	return plan;
}

async function main(argv: readonly string[]): Promise<number> {
	if (argv.includes("--help") || argv.includes("-h")) {
		printUsage();
		return 0;
	}
	if (argv.length > 0) {
		process.stderr.write(`[inspect] unknown argument: ${argv.join(" ")}\n`);
		printUsage();
		return 1;
	}

	for (const step of buildInspectPlan()) {
		if (step.skipReason) {
			process.stderr.write(`[inspect] skip ${step.script}: ${step.skipReason}\n`);
			continue;
		}

		process.stderr.write(`[inspect] run ${step.script}\n`);
		const code = await runPnpmScript(step.script);
		if (code !== 0) {
			return code;
		}
	}

	return 0;
}

function runPnpmScript(script: string): Promise<number> {
	return new Promise<number>((resolve) => {
		const child = spawn(getPnpmCommand(), ["run", script], {
			stdio: "inherit",
			env: process.env,
		});
		child.on("error", () => resolve(1));
		child.on("exit", (code) => resolve(code ?? 1));
	});
}

function getPnpmCommand(): string {
	return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
