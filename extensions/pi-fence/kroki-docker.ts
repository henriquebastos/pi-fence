/**
 * Docker Kroki lifecycle manager.
 *
 * Pure shell-out orchestration via the `ShellRunner` DI seam.
 * No pi-SDK, no pi-tui — trivially unit-testable with FakeShellRunner.
 *
 * Container name: `pi-fence-kroki`. Image: `yuzutech/kroki`.
 * Port: 8000 host → 8000 container.
 */

import type { ShellResult, ShellRunner } from "./io/shell-runner.ts";
import { NULL_LOGGER, type Logger } from "./io/logger.ts";

const CONTAINER_NAME = "pi-fence-kroki";
export const KROKI_DOCKER_IMAGE = "yuzutech/kroki";
const IMAGE = KROKI_DOCKER_IMAGE;
const LABEL_NAME = "pi-fence.sandbox";
const LABEL_VALUE = "kroki";
const HOST_PORT = 8000;
const CONTAINER_PORT = 8000;

export type KrokiDockerStatus = "running" | "stopped" | "absent";

export interface KrokiDockerResult {
	ok: boolean;
	status: KrokiDockerStatus;
	message: string;
	endpoint?: string;
}



export function createKrokiDockerManager(
	shell: ShellRunner,
	logger: Logger = NULL_LOGGER,
) {
	async function status(): Promise<KrokiDockerResult> {
		try {
			const result = await shell.run("docker", [
				"inspect",
				"--format",
				"{{.State.Running}}",
				CONTAINER_NAME,
			]);
			if (result.exitCode !== 0) {
				return inspectFailureResult(result.stderr);
			}
			const running = result.stdout.trim() === "true";
			const identityStatus = await verifyKrokiContainerIdentity(shell);
			if (identityStatus) return identityStatus;
			return {
				ok: true,
				status: running ? "running" : "stopped",
				message: running
					? `Container ${CONTAINER_NAME} is running on port ${HOST_PORT}.`
					: `Container ${CONTAINER_NAME} exists but is stopped.`,
				...(running ? { endpoint: `http://localhost:${HOST_PORT}` } : {}),
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.warn("kroki-docker", "docker inspect failed", { error: message });
			return { ok: false, status: "absent", message: `Docker not available: ${message}` };
		}
	}

	async function start(): Promise<KrokiDockerResult> {
		// Check if already running.
		const current = await status();
		if (!current.ok) return current;
		if (current.status === "running") {
			return {
				ok: true,
				status: "running",
				message: `Container ${CONTAINER_NAME} is already running.`,
				endpoint: `http://localhost:${HOST_PORT}`,
			};
		}

		// If stopped, remove and re-create (simplest approach).
		if (current.status === "stopped") {
			await shell.run("docker", ["rm", CONTAINER_NAME]).catch(() => {});
		}

		try {
			const result = await shell.run("docker", [
				"run", "-d",
				"--name", CONTAINER_NAME,
				"--label", `${LABEL_NAME}=${LABEL_VALUE}`,
				"-p", `${HOST_PORT}:${CONTAINER_PORT}`,
				IMAGE,
			]);
			if (result.exitCode !== 0) {
				const error = result.stderr.trim().slice(0, 200) || `docker run exited ${result.exitCode}`;
				logger.error("kroki-docker", "start failed", { error });
				return { ok: false, status: "absent", message: `Failed to start: ${error}` };
			}
			logger.info("kroki-docker", "started", { container: CONTAINER_NAME });
			return {
				ok: true,
				status: "running",
				message: `Started ${CONTAINER_NAME} on port ${HOST_PORT}.`,
				endpoint: `http://localhost:${HOST_PORT}`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("kroki-docker", "start failed", { error: message });
			return { ok: false, status: "absent", message: `Failed to start: ${message}` };
		}
	}

	async function stop(): Promise<KrokiDockerResult> {
		const current = await status();
		if (!current.ok || current.status === "absent") return current;
		try {
			const stopResult = await shell.run("docker", ["stop", CONTAINER_NAME]);
			if (stopResult.exitCode !== 0) {
				return dockerCommandFailure("stop", stopResult, current.status);
			}
			const rmResult = await shell.run("docker", ["rm", CONTAINER_NAME]);
			if (rmResult.exitCode !== 0) {
				return dockerCommandFailure("rm", rmResult, "stopped");
			}
			logger.info("kroki-docker", "stopped", { container: CONTAINER_NAME });
			return { ok: true, status: "absent", message: `Stopped and removed ${CONTAINER_NAME}.` };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.warn("kroki-docker", "stop failed", { error: message });
			return { ok: false, status: current.status, message: `Failed to stop: ${message}` };
		}
	}

	return { start, stop, status };
}

function dockerCommandFailure(
	action: "stop" | "rm",
	result: ShellResult,
	status: KrokiDockerStatus,
): KrokiDockerResult {
	const detail = result.stderr.trim() || result.stdout.trim() || `docker ${action} failed`;
	return {
		ok: false,
		status,
		message: `docker ${action} exited ${result.exitCode}: ${detail}`,
	};
}

function inspectFailureResult(stderr: string): KrokiDockerResult {
	if (stderr.includes("No such object") || stderr.includes("No such container")) {
		return { ok: true, status: "absent", message: `Container ${CONTAINER_NAME} not found.` };
	}
	const detail = stderr.trim() || "docker inspect failed";
	return { ok: false, status: "absent", message: `Docker inspect failed: ${detail}` };
}

async function verifyKrokiContainerIdentity(
	shell: ShellRunner,
): Promise<KrokiDockerResult | undefined> {
	const imageStatus = await verifyKrokiContainerImage(shell);
	if (imageStatus) return imageStatus;
	return verifyKrokiContainerLabel(shell);
}

async function verifyKrokiContainerImage(
	shell: ShellRunner,
): Promise<KrokiDockerResult | undefined> {
	const result = await shell.run("docker", [
		"inspect",
		"--format",
		"{{.Config.Image}}",
		CONTAINER_NAME,
	]);
	if (result.exitCode !== 0) return inspectFailureResult(result.stderr);
	const actualImage = result.stdout.trim();
	if (actualImage === IMAGE) return undefined;
	return {
		ok: false,
		status: "absent",
		message: `Container ${CONTAINER_NAME} image mismatch: expected ${IMAGE}, got ${actualImage}.`,
	};
}

async function verifyKrokiContainerLabel(
	shell: ShellRunner,
): Promise<KrokiDockerResult | undefined> {
	const result = await shell.run("docker", [
		"inspect",
		"--format",
		`{{ index .Config.Labels "${LABEL_NAME}" }}`,
		CONTAINER_NAME,
	]);
	if (result.exitCode !== 0) return inspectFailureResult(result.stderr);
	const actualLabel = result.stdout.trim() || "<none>";
	if (actualLabel === LABEL_VALUE) return undefined;
	return {
		ok: false,
		status: "absent",
		message: `Container ${CONTAINER_NAME} label mismatch: expected ${LABEL_NAME}=${LABEL_VALUE}, got ${actualLabel}.`,
	};
}
