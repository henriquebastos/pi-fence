#!/usr/bin/env tsx
/**
 * live — lifecycle CLI for the pi-fence-live-deps Docker container.
 *
 * Subcommands:
 *   up        docker pull + docker run -d --name pi-fence-live-deps <image>
 *             Idempotent: running against an already-up container is a no-op.
 *   down      docker stop + docker rm. Silent success if not running.
 *   status    Prints running | stopped | absent to stdout.
 *   exec      Shortcut for docker exec pi-fence-live-deps <cmd> [args...]
 *   build     docker build -t <pinned-tag> docker/
 *
 * Exit codes:
 *   0 — success (or acceptable no-op).
 *   1 — docker not available, or a command failed for a real reason.
 *
 * The image tag is pinned here. Bumping it is a deliberate act: update the
 * constant, run `pnpm live:build` + `pnpm live:down && pnpm live:up`, and
 * commit the change with its motivation.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const IMAGE = "ghcr.io/henriquebastos/pi-fence-live-deps:0.1.0";
const CONTAINER = "pi-fence-live-deps";

async function main(argv: string[]): Promise<number> {
	const sub = argv[0];
	if (!sub) return printUsage(1);

	switch (sub) {
		case "up":
			return await cmdUp();
		case "down":
			return await cmdDown();
		case "status":
			return await cmdStatus();
		case "exec":
			return await cmdExec(argv.slice(1));
		case "build":
			return await cmdBuild();
		case "--help":
		case "-h":
		case "help":
			return printUsage(0);
		default:
			console.error(`live: unknown subcommand '${sub}'`);
			return printUsage(1);
	}
}

function printUsage(code: number): number {
	console.error(
		[
			"Usage: pnpm live:<subcommand>",
			"",
			"Subcommands:",
			"  live:up             Pull/start the pi-fence-live-deps container",
			"  live:down           Stop and remove the container",
			"  live:status         Print running | stopped | absent",
			"  live:exec -- <cmd>  Run a command inside the container",
			"  live:build          docker build -t <pinned-tag> docker/",
			"",
			`Container name:  ${CONTAINER}`,
			`Image:           ${IMAGE}`,
		].join("\n"),
	);
	return code;
}

// ---------------------------------------------------------------------------
// status (used by several subcommands as well as the CLI itself)
// ---------------------------------------------------------------------------

type ContainerState = "running" | "stopped" | "absent";

async function containerState(): Promise<ContainerState> {
	try {
		const { stdout } = await execFileAsync(
			"docker",
			[
				"ps",
				"--all",
				"--filter",
				`name=^${CONTAINER}$`,
				"--format",
				"{{.Names}}\t{{.State}}",
			],
			{ timeout: 5000 },
		);
		const line = stdout.split(/\r?\n/).find((l) => l.startsWith(`${CONTAINER}\t`));
		if (!line) return "absent";
		const state = line.split("\t")[1];
		return state === "running" ? "running" : "stopped";
	} catch {
		return "absent";
	}
}

async function cmdStatus(): Promise<number> {
	if (!(await dockerReachable())) {
		console.error("docker: not available (binary missing or daemon not running)");
		return 1;
	}
	console.log(await containerState());
	return 0;
}

// ---------------------------------------------------------------------------
// up
// ---------------------------------------------------------------------------

async function cmdUp(): Promise<number> {
	if (!(await dockerReachable())) return reportMissingDocker();

	const state = await containerState();
	if (state === "running") {
		console.log(`${CONTAINER}: already running`);
		return 0;
	}
	if (state === "stopped") {
		await runStreaming("docker", ["start", CONTAINER]);
		console.log(`${CONTAINER}: started (was stopped)`);
		return 0;
	}

	// absent — need to run. Prefer a locally-built image; fall back to pulling.
	const imageLocal = await hasLocalImage(IMAGE);
	if (!imageLocal) {
		const pullCode = await runStreamingAllowFail("docker", ["pull", IMAGE]);
		if (pullCode !== 0) {
			console.error(
				`docker pull failed and no local image '${IMAGE}' was found. ` +
					`If this image has not been published yet, run 'pnpm live:build' first.`,
			);
			return pullCode;
		}
	}
	await runStreaming("docker", ["run", "-d", "--name", CONTAINER, IMAGE]);
	console.log(`${CONTAINER}: started${imageLocal ? " (from local image)" : ""}`);
	return 0;
}

// ---------------------------------------------------------------------------
// down
// ---------------------------------------------------------------------------

async function cmdDown(): Promise<number> {
	if (!(await dockerReachable())) return reportMissingDocker();

	const state = await containerState();
	if (state === "absent") {
		console.log(`${CONTAINER}: already absent`);
		return 0;
	}

	if (state === "running") {
		await runStreaming("docker", ["stop", CONTAINER]);
	}
	await runStreaming("docker", ["rm", CONTAINER]);
	console.log(`${CONTAINER}: removed`);
	return 0;
}

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------

async function cmdExec(rest: string[]): Promise<number> {
	if (!(await dockerReachable())) return reportMissingDocker();

	// Allow both `live:exec cmd args...` and `live:exec -- cmd args...`. The
	// `--` form is conventional for "stop parsing flags" but we don't have
	// flags, so just drop it if it appears first.
	const userArgs = rest[0] === "--" ? rest.slice(1) : rest;

	if (userArgs.length === 0) {
		console.error("live:exec requires a command. Usage: pnpm live:exec -- <cmd> [args...]");
		return 1;
	}
	const state = await containerState();
	if (state !== "running") {
		console.error(`${CONTAINER} is '${state}'. Start it with 'pnpm live:up' first.`);
		return 1;
	}
	return await runStreamingAllowFail("docker", ["exec", CONTAINER, ...userArgs]);
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

async function cmdBuild(): Promise<number> {
	if (!(await dockerReachable())) return reportMissingDocker();
	await runStreaming("docker", ["build", "-t", IMAGE, "docker/"]);
	console.log(`${IMAGE}: built`);
	return 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function dockerReachable(): Promise<boolean> {
	try {
		await execFileAsync("docker", ["info"], { timeout: 2000 });
		return true;
	} catch {
		return false;
	}
}

async function hasLocalImage(imageRef: string): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("docker", ["images", "-q", imageRef], {
			timeout: 5000,
		});
		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

function reportMissingDocker(): number {
	console.error(
		"docker: not available.\n" +
			"  - Install Docker Desktop (macOS/Windows) or the docker package (Linux).\n" +
			"  - Make sure the daemon is running.\n" +
			"  - See docs/getting-started.md for details.",
	);
	return 1;
}

function runStreaming(cmd: string, args: string[]): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
		});
	});
}

function runStreamingAllowFail(cmd: string, args: string[]): Promise<number> {
	return new Promise<number>((resolve) => {
		const child = spawn(cmd, args, { stdio: "inherit" });
		child.on("error", () => resolve(1));
		child.on("exit", (code) => resolve(code ?? 1));
	});
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

try {
	process.exit(await main(process.argv.slice(2)));
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
}
