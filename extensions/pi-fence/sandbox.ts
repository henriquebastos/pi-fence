import type { ShellRunner, ShellResult, ShellRunOptions } from "./io/shell-runner.ts";
import type { SandboxKind, SandboxRuntime } from "./config.ts";
import type { KrokiDockerResult } from "./kroki-docker.ts";

export type SandboxState = "ready" | "partial" | "stopped" | "absent" | "error";

export interface SandboxComponentStatus {
	id: string;
	state: SandboxState;
	message?: string;
}

export interface SandboxStatus {
	state: SandboxState;
	endpoint?: string;
	message: string;
	components?: readonly SandboxComponentStatus[];
}

export type SandboxStartResult = SandboxStatus;

export type SandboxStopResult = SandboxStatus;

export interface SandboxController {
	readonly id: string;
	readonly kind: SandboxKind;
	readonly runtime: SandboxRuntime;
	status(): Promise<SandboxStatus>;
	start(): Promise<SandboxStartResult>;
	stop(): Promise<SandboxStopResult>;
}

export type ExecSandboxRunOptions = ShellRunOptions;

export type ExecSandboxRunResult = ShellResult;

export interface ExecSandboxEnvironment {
	run(
		command: string,
		args: readonly string[],
		options?: ExecSandboxRunOptions,
	): Promise<ExecSandboxRunResult>;
	createWorkspace(): Promise<ExecSandboxWorkspace>;
}

export interface ExecSandboxWorkspace {
	path(name: string): string;
	writeText(name: string, contents: string): Promise<void>;
	readBuffer(name: string): Promise<Buffer>;
	dispose(): Promise<void>;
}

export interface KrokiDockerManagerLike {
	status(): Promise<KrokiDockerResult>;
	start(): Promise<KrokiDockerResult>;
	stop(): Promise<KrokiDockerResult>;
}

export function createKrokiDockerSandboxController(
	manager: KrokiDockerManagerLike,
): SandboxController {
	return {
		id: "kroki",
		kind: "service",
		runtime: "docker-container",
		status: async () => normalizeKrokiDockerResult(await manager.status()),
		start: async () => normalizeKrokiDockerResult(await manager.start()),
		stop: async () => normalizeKrokiDockerResult(await manager.stop()),
	};
}

export interface DockerSandboxComponentOptions {
	id: string;
	containerName: string;
	expectedImage?: string;
}

export interface DockerContainerSandboxOptions {
	id: string;
	kind: SandboxKind;
	containerName: string;
	expectedImage?: string;
	endpoint?: string;
}

export interface DockerComposeSandboxOptions {
	id: string;
	kind: SandboxKind;
	components: readonly DockerSandboxComponentOptions[];
	endpoint?: string;
}

export function createDockerContainerSandboxController(
	shell: ShellRunner,
	options: DockerContainerSandboxOptions,
): SandboxController {
	async function status(): Promise<SandboxStatus> {
		const component = await inspectDockerContainer(shell, {
			id: options.id,
			containerName: options.containerName,
			expectedImage: options.expectedImage,
		});
		return {
			state: component.state,
			message: component.message ?? "",
			...(component.state === "ready" && options.endpoint ? { endpoint: options.endpoint } : {}),
		};
	}

	return {
		id: options.id,
		kind: options.kind,
		runtime: "docker-container",
		status,
		start: () => unsupportedLifecycle("Start", options.id),
		stop: () => unsupportedLifecycle("Stop", options.id),
	};
}

export function createDockerComposeSandboxController(
	shell: ShellRunner,
	options: DockerComposeSandboxOptions,
): SandboxController {
	async function status(): Promise<SandboxStatus> {
		const components: SandboxComponentStatus[] = [];
		for (const component of options.components) {
			components.push(await inspectDockerContainer(shell, component));
		}
		return summarizeComponents(options.id, components, options.endpoint);
	}

	return {
		id: options.id,
		kind: options.kind,
		runtime: "docker-compose",
		status,
		start: () => unsupportedLifecycle("Start", options.id),
		stop: () => unsupportedLifecycle("Stop", options.id),
	};
}

async function unsupportedLifecycle(
	operation: "Start" | "Stop",
	id: string,
): Promise<SandboxStatus> {
	return { state: "error", message: `${operation} is not implemented for sandbox ${id}.` };
}

function normalizeKrokiDockerResult(result: KrokiDockerResult): SandboxStatus {
	if (!result.ok) {
		return {
			state: "error",
			message: result.message,
			...(result.endpoint ? { endpoint: result.endpoint } : {}),
		};
	}
	const state = result.status === "running" ? "ready" : result.status;
	return {
		state,
		message: result.message,
		...(result.endpoint ? { endpoint: result.endpoint } : {}),
	};
}

async function inspectDockerContainer(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
): Promise<SandboxComponentStatus> {
	try {
		const result = await shell.run("docker", [
			"inspect",
			"--format",
			"{{.State.Running}}",
			component.containerName,
		]);
		if (result.exitCode !== 0) {
			return inspectFailureStatus(component, result.stderr);
		}
		const running = result.stdout.trim() === "true";
		if (running && component.expectedImage !== undefined) {
			const imageStatus = await inspectContainerImage(shell, component);
			if (imageStatus) return imageStatus;
		}
		return {
			id: component.id,
			state: running ? "ready" : "stopped",
			message: running
				? `Container ${component.containerName} is running.`
				: `Container ${component.containerName} exists but is stopped.`,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			id: component.id,
			state: "error",
			message: `Docker not available: ${message}`,
		};
	}
}

function inspectFailureStatus(
	component: DockerSandboxComponentOptions,
	stderr: string,
): SandboxComponentStatus {
	if (stderr.includes("No such object")) {
		return {
			id: component.id,
			state: "absent",
			message: `Container ${component.containerName} not found.`,
		};
	}
	const detail = stderr.trim() || "docker inspect failed";
	return {
		id: component.id,
		state: "error",
		message: `Docker inspect failed for ${component.containerName}: ${detail}`,
	};
}

async function inspectContainerImage(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
): Promise<SandboxComponentStatus | undefined> {
	const result = await shell.run("docker", [
		"inspect",
		"--format",
		"{{.Config.Image}}",
		component.containerName,
	]);
	if (result.exitCode !== 0) {
		return inspectFailureStatus(component, result.stderr);
	}
	const actualImage = result.stdout.trim();
	if (actualImage === component.expectedImage) return undefined;
	return {
		id: component.id,
		state: "error",
		message: `Container ${component.containerName} image mismatch: expected ${component.expectedImage}, got ${actualImage}.`,
	};
}

function summarizeComponents(
	id: string,
	components: readonly SandboxComponentStatus[],
	endpoint?: string,
): SandboxStatus {
	if (components.length === 0) {
		return { state: "error", message: `Sandbox ${id} has no configured components.` };
	}
	const readyCount = components.filter((component) => component.state === "ready").length;
	if (components.some((component) => component.state === "error")) {
		return { state: "error", message: `Sandbox ${id} status failed.`, components };
	}
	if (readyCount === components.length) {
		return {
			state: "ready",
			message: `Sandbox ${id} is ready.`,
			...(endpoint ? { endpoint } : {}),
			components,
		};
	}
	if (readyCount > 0) {
		return {
			state: "partial",
			message: `Sandbox ${id} has ${readyCount} of ${components.length} component(s) ready.`,
			components,
		};
	}
	if (components.every((component) => component.state === "absent")) {
		return { state: "absent", message: `Sandbox ${id} is absent.`, components };
	}
	if (components.every((component) => component.state === "stopped")) {
		return { state: "stopped", message: `Sandbox ${id} is stopped.`, components };
	}
	return {
		state: "partial",
		message: `Sandbox ${id} has ${readyCount} of ${components.length} component(s) ready.`,
		components,
	};
}
