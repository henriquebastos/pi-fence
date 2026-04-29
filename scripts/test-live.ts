#!/usr/bin/env tsx
/**
 * Live test runner.
 *
 * Defaults PI_FENCE_CONFIG to the checked-in Kroki sandbox fixture, starts the
 * managed single-container Kroki sandbox when that config needs it, runs the
 * live Vitest lanes, then stops the sandbox only if this process started it.
 */

import { spawn } from "node:child_process";

import { DEFAULT_PROCESSOR_PRECEDENCE, type PiFenceConfig } from "../extensions/pi-fence/config.ts";
import { loadPiFenceConfig, PI_FENCE_CONFIG_ENV } from "../extensions/pi-fence/io/config-loader.ts";
import { NULL_LOGGER } from "../extensions/pi-fence/io/logger.ts";
import { NodeShellRunner } from "../extensions/pi-fence/io/shell-runner.ts";
import { createKrokiDockerManager } from "../extensions/pi-fence/kroki-docker.ts";

const DEFAULT_LIVE_CONFIG = "tests/fixtures/live-config/kroki-sandbox.json";
const DEFAULT_VITEST_ARGS = ["tests/integration", "tests/render-image"];

async function main(argv: readonly string[]): Promise<number> {
	const env = liveEnv(process.env);
	const sandbox = await maybeStartKrokiSandbox(env);
	try {
		return await runVitest(argv, env);
	} finally {
		if (sandbox.started) await stopKrokiSandbox();
	}
}

function liveEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return {
		...env,
		[PI_FENCE_CONFIG_ENV]: env[PI_FENCE_CONFIG_ENV] || DEFAULT_LIVE_CONFIG,
	};
}

async function maybeStartKrokiSandbox(env: NodeJS.ProcessEnv): Promise<{ started: boolean }> {
	const config = (await loadPiFenceConfig({ env, logger: NULL_LOGGER })).config;
	if (!shouldManageSingleContainerKroki(config)) return { started: false };

	const manager = createKrokiDockerManager(new NodeShellRunner(), NULL_LOGGER);
	const status = await manager.status();
	if (status.ok && status.status === "running") {
		console.error("[test:live] pi-fence-kroki already running; leaving it running after tests.");
		return { started: false };
	}
	if (!status.ok) {
		console.error(`[test:live] pi-fence-kroki not started: ${status.message}`);
		return { started: false };
	}

	const start = await manager.start();
	if (!start.ok || start.status !== "running") {
		console.error(`[test:live] pi-fence-kroki start skipped/failed: ${start.message}`);
		return { started: false };
	}
	const startedByThisRun = start.message.startsWith("Started pi-fence-kroki ");
	console.error(`[test:live] ${start.message}`);
	return { started: startedByThisRun };
}

function shouldManageSingleContainerKroki(config: PiFenceConfig): boolean {
	const kroki = config.sandboxes?.kroki;
	const precedence = config.processorPrecedence ?? DEFAULT_PROCESSOR_PRECEDENCE;
	return kroki?.kind === "service" &&
		kroki.runtime === "docker-container" &&
		precedence.includes("sandbox") &&
		!(config.blocked?.processors ?? []).includes("kroki-sandbox");
}

async function runVitest(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
	const args = ["exec", "vitest", "run", ...(argv.length > 0 ? argv : DEFAULT_VITEST_ARGS)];
	return run("pnpm", args, env);
}

async function stopKrokiSandbox(): Promise<void> {
	const result = await createKrokiDockerManager(new NodeShellRunner(), NULL_LOGGER).stop();
	if (result.ok) {
		console.error(`[test:live] ${result.message}`);
		return;
	}
	console.error(`[test:live] pi-fence-kroki cleanup failed: ${result.message}`);
	process.exitCode = 1;
}

function run(cmd: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			env,
			stdio: "inherit",
		});
		child.on("exit", (code, signal) => {
			if (typeof code === "number") {
				resolve(code);
				return;
			}
			resolve(signal ? 1 : 0);
		});
		child.on("error", (error) => {
			console.error(`[test:live] failed to start ${cmd}: ${error.message}`);
			resolve(1);
		});
	});
}

process.exitCode = await main(process.argv.slice(2));
