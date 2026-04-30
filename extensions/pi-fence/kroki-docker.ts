/**
 * Docker Kroki lifecycle manager.
 *
 * Pure shell-out orchestration via the `ShellRunner` DI seam.
 * No pi-SDK, no pi-tui — trivially unit-testable with FakeShellRunner.
 *
 * Container name: `pi-fence-kroki`. Image: `yuzutech/kroki`.
 * Port: 127.0.0.1:8000 host → 8000 container.
 */

import type { ShellResult, ShellRunner } from "./io/shell-runner.ts";
import { NULL_LOGGER, type Logger } from "./io/logger.ts";

const CONTAINER_NAME = "pi-fence-kroki";
export const KROKI_DOCKER_IMAGE = "yuzutech/kroki";
const LABEL_NAME = "pi-fence.sandbox";
const LABEL_VALUE = "kroki";
const HOST_BIND_ADDRESS = "127.0.0.1";
const HOST_PORT = 8000;
const CONTAINER_PORT = 8000;
export const KROKI_DOCKER_ENDPOINT = `http://${HOST_BIND_ADDRESS}:${HOST_PORT}`;
const PORT_BINDINGS_FORMAT = "{{json .NetworkSettings.Ports}}";

export type KrokiDockerStatus = "running" | "stopped" | "absent";

/**
 * Result of a Kroki Docker lifecycle call.
 *
 * Verifier convention used by `stop()`:
 *
 * - `ok: true` always means the call succeeded against the managed container.
 * - `ok: false, status: "absent"` means a verifier rejected ownership (image
 *   mismatch, label mismatch, or `docker inspect` could not run). `stop()`
 *   short-circuits on these results so an unowned same-named container is
 *   never stopped or removed.
 * - `ok: false, status: "running"` means the container is owned but its
 *   runtime configuration is wrong (today: a non-loopback `8000/tcp` host
 *   binding). `stop()` lets these results fall through so the user can clean
 *   up an owned-but-misconfigured managed container through `/fence kroki
 *   stop`.
 *
 * New verifiers must keep this contract: ownership-failure → `absent`,
 * configuration-failure on an owned container → `running`.
 */
export interface KrokiDockerResult {
	ok: boolean;
	status: KrokiDockerStatus;
	message: string;
	endpoint?: string;
}

export interface KrokiDockerManagerOptions {
	image?: string;
}

export function createKrokiDockerManager(
	shell: ShellRunner,
	logger: Logger = NULL_LOGGER,
	options: KrokiDockerManagerOptions = {},
) {
	const image = options.image ?? KROKI_DOCKER_IMAGE;
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
			const identityStatus = await verifyKrokiContainerIdentity(shell, image);
			if (identityStatus) return identityStatus;
			if (running) {
				const portStatus = await verifyKrokiPortBinding(shell);
				if (portStatus) return portStatus;
			}
			return {
				ok: true,
				status: running ? "running" : "stopped",
				message: running
					? `Container ${CONTAINER_NAME} is running on port ${HOST_PORT}.`
					: `Container ${CONTAINER_NAME} exists but is stopped.`,
				...(running ? { endpoint: KROKI_DOCKER_ENDPOINT } : {}),
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
				endpoint: KROKI_DOCKER_ENDPOINT,
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
				"-p", `${HOST_BIND_ADDRESS}:${HOST_PORT}:${CONTAINER_PORT}`,
				image,
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
				endpoint: KROKI_DOCKER_ENDPOINT,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("kroki-docker", "start failed", { error: message });
			return { ok: false, status: "absent", message: `Failed to start: ${message}` };
		}
	}

	async function stop(): Promise<KrokiDockerResult> {
		const current = await status();
		// Per the KrokiDockerResult convention: ok:false with status "absent"
		// means an ownership-verifier rejected the container. Bail out without
		// stopping. ok:false with status "running" means the container is owned
		// but misconfigured (e.g. broad port binding); fall through so the
		// lifecycle can clean it up.
		if (current.status === "absent") return current;
		let failureStatus = current.status;
		try {
			const stopResult = await shell.run("docker", ["stop", CONTAINER_NAME]);
			if (stopResult.exitCode !== 0) {
				return dockerCommandFailure("stop", stopResult, current.status);
			}
			failureStatus = "stopped";
			const rmResult = await shell.run("docker", ["rm", CONTAINER_NAME]);
			if (rmResult.exitCode !== 0) {
				return dockerCommandFailure("rm", rmResult, "stopped");
			}
			logger.info("kroki-docker", "stopped", { container: CONTAINER_NAME });
			return { ok: true, status: "absent", message: `Stopped and removed ${CONTAINER_NAME}.` };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.warn("kroki-docker", "stop failed", { error: message });
			return { ok: false, status: failureStatus, message: `Failed to stop: ${message}` };
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
	const normalized = stderr.toLowerCase();
	if (normalized.includes("no such object") || normalized.includes("no such container")) {
		return { ok: true, status: "absent", message: `Container ${CONTAINER_NAME} not found.` };
	}
	const detail = stderr.trim() || "docker inspect failed";
	return { ok: false, status: "absent", message: `Docker inspect failed: ${detail}` };
}

async function verifyKrokiContainerIdentity(
	shell: ShellRunner,
	expectedImage: string,
): Promise<KrokiDockerResult | undefined> {
	const imageStatus = await verifyKrokiContainerImage(shell, expectedImage);
	if (imageStatus) return imageStatus;
	return verifyKrokiContainerLabel(shell);
}

async function verifyKrokiPortBinding(shell: ShellRunner): Promise<KrokiDockerResult | undefined> {
	const result = await shell.run("docker", ["inspect", "--format", PORT_BINDINGS_FORMAT, CONTAINER_NAME]);
	if (result.exitCode !== 0) return inspectFailureResult(result.stderr);
	const issue = krokiPortBindingIssue(result.stdout);
	if (!issue) return undefined;
	return {
		ok: false,
		status: "running",
		message: `Container ${CONTAINER_NAME} ${issue}`,
	};
}

function krokiPortBindingIssue(rawPorts: string): string | undefined {
	const parsed = parseJson(rawPorts);
	if (!isRecord(parsed)) {
		return `has invalid port bindings; expected ${HOST_BIND_ADDRESS}:${HOST_PORT}.`;
	}
	const bindings = parsed[`${CONTAINER_PORT}/tcp`];
	if (!Array.isArray(bindings) || bindings.length === 0) {
		return `does not publish ${CONTAINER_PORT}/tcp; expected ${HOST_BIND_ADDRESS}:${HOST_PORT}.`;
	}
	const unexpected = bindings.find((binding) => !isExpectedKrokiPortBinding(binding));
	if (!unexpected) return undefined;
	return `publishes ${CONTAINER_PORT}/tcp on ${formatPortBinding(unexpected)}; expected ${HOST_BIND_ADDRESS}:${HOST_PORT}.`;
}

function isExpectedKrokiPortBinding(binding: unknown): boolean {
	return isRecord(binding) && binding.HostIp === HOST_BIND_ADDRESS && binding.HostPort === String(HOST_PORT);
}

function formatPortBinding(binding: unknown): string {
	if (!isRecord(binding)) return "<invalid>";
	const hostIp = typeof binding.HostIp === "string" && binding.HostIp.length > 0 ? binding.HostIp : "<all interfaces>";
	const hostPort = typeof binding.HostPort === "string" && binding.HostPort.length > 0 ? binding.HostPort : "<unknown>";
	return `${hostIp}:${hostPort}`;
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function verifyKrokiContainerImage(
	shell: ShellRunner,
	expectedImage: string,
): Promise<KrokiDockerResult | undefined> {
	const result = await shell.run("docker", [
		"inspect",
		"--format",
		"{{.Config.Image}}",
		CONTAINER_NAME,
	]);
	if (result.exitCode !== 0) return inspectFailureResult(result.stderr);
	const actualImage = result.stdout.trim();
	if (actualImage === expectedImage) return undefined;
	return {
		ok: false,
		status: "absent",
		message: `Container ${CONTAINER_NAME} image mismatch: expected ${expectedImage}, got ${actualImage}.`,
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
