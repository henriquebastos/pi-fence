import { posix as pathPosix } from "node:path";

import type { ShellRunner, ShellResult, ShellRunOptions } from "./io/shell-runner.ts";
import type { SandboxKind, SandboxRuntime } from "./config.ts";
import { KROKI_DOCKER_IMAGE, type KrokiDockerResult } from "./kroki-docker.ts";

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
	createWorkspace(options?: ExecSandboxRunOptions): Promise<ExecSandboxWorkspace>;
}

export interface ExecSandboxWorkspace {
	path(name: string): string;
	writeText(name: string, contents: string, options?: ExecSandboxRunOptions): Promise<void>;
	readBuffer(name: string, options?: ExecSandboxRunOptions): Promise<Buffer>;
	dispose(options?: ExecSandboxRunOptions): Promise<void>;
}

export interface DockerExecSandboxEnvironmentOptions {
	containerName: string;
	workspaceRoot?: string;
}

export function createDockerExecSandboxEnvironment(
	shell: ShellRunner,
	options: DockerExecSandboxEnvironmentOptions,
): ExecSandboxEnvironment {
	const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot ?? "/tmp");
	const runInContainer = (
		command: string,
		args: readonly string[],
		runOptions: ExecSandboxRunOptions = {},
	): Promise<ExecSandboxRunResult> => {
		const dockerArgs = dockerExecArgs(options.containerName, command, args, runOptions);
		return shell.run("docker", dockerArgs, {
			input: runOptions.input,
			signal: runOptions.signal,
		});
	};

	return {
		run: runInContainer,
		async createWorkspace(runOptions?: ExecSandboxRunOptions): Promise<ExecSandboxWorkspace> {
			const result = await runInContainer("mktemp", ["-d", `${workspaceRoot}/pi-fence-XXXXXX`], runOptions);
			assertShellSuccess("mktemp", result);
			const dir = result.stdout.trim();
			if (!isWorkspaceChildPath(workspaceRoot, dir)) {
				throw new Error(`mktemp returned path outside ${workspaceRoot}: ${dir || "<empty>"}`);
			}
			return createDockerExecSandboxWorkspace(runInContainer, pathPosix.normalize(dir));
		},
	};
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

const KROKI_SANDBOX_LABEL = "pi-fence.sandbox";
const KROKI_SANDBOX_LABELS = { [KROKI_SANDBOX_LABEL]: "kroki" };
const KROKI_MERMAID_IMAGE = "yuzutech/mermaid";
export const KROKI_COMPOSE_FILE = "docker/kroki/compose.yaml";
export const KROKI_COMPOSE_PROJECT_NAME = "pi-fence-kroki";

export function createKrokiDockerComposeSandboxController(
	shell: ShellRunner,
): SandboxController {
	return createDockerComposeSandboxController(shell, {
		id: "kroki",
		kind: "service",
		endpoint: "http://localhost:8000",
		composeFile: KROKI_COMPOSE_FILE,
		projectName: KROKI_COMPOSE_PROJECT_NAME,
		components: [
			{
				id: "core",
				containerName: "pi-fence-kroki-core",
				expectedImage: KROKI_DOCKER_IMAGE,
				expectedLabels: KROKI_SANDBOX_LABELS,
			},
			{
				id: "mermaid",
				containerName: "pi-fence-kroki-mermaid",
				expectedImage: KROKI_MERMAID_IMAGE,
				expectedLabels: KROKI_SANDBOX_LABELS,
			},
		],
	});
}

export interface DockerSandboxSecurityOptions {
	networkMode?: string;
	noPublishedPorts?: boolean;
	allowOnlyTmpfsMounts?: boolean;
	requiredTmpfsMounts?: readonly string[];
	capDropAll?: boolean;
	noAddedCapabilities?: boolean;
	notPrivileged?: boolean;
	noNewPrivileges?: boolean;
	forbidUnconfinedSeccomp?: boolean;
}

export interface DockerSandboxComponentOptions {
	id: string;
	containerName: string;
	expectedImage: string;
	expectedLabels: Readonly<Record<string, string>>;
	security?: DockerSandboxSecurityOptions;
}

export interface DockerContainerSandboxOptions {
	id: string;
	kind: SandboxKind;
	containerName: string;
	expectedImage: string;
	expectedLabels: Readonly<Record<string, string>>;
	security?: DockerSandboxSecurityOptions;
	endpoint?: string;
}

export interface DockerComposeSandboxOptions {
	id: string;
	kind: SandboxKind;
	components: readonly DockerSandboxComponentOptions[];
	endpoint?: string;
	composeFile?: string;
	projectName?: string;
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
			expectedLabels: options.expectedLabels,
			security: options.security,
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
		start: createDockerComposeStart(shell, options, status),
		stop: createDockerComposeStop(shell, options),
	};
}

async function unsupportedLifecycle(
	operation: "Start" | "Stop",
	id: string,
): Promise<SandboxStatus> {
	return { state: "error", message: `${operation} is not implemented for sandbox ${id}.` };
}

function createDockerComposeStart(
	shell: ShellRunner,
	options: DockerComposeSandboxOptions,
	status: () => Promise<SandboxStatus>,
): SandboxController["start"] {
	if (!hasComposeLifecycle(options)) return () => unsupportedLifecycle("Start", options.id);
	return async () => {
		const result = await runDockerCompose(shell, options, ["up", "-d"]);
		if (result.exitCode !== 0) return composeCommandFailure(options.id, "start", result);
		return status();
	};
}

function createDockerComposeStop(
	shell: ShellRunner,
	options: DockerComposeSandboxOptions,
): SandboxController["stop"] {
	if (!hasComposeLifecycle(options)) return () => unsupportedLifecycle("Stop", options.id);
	return async () => {
		const result = await runDockerCompose(shell, options, ["down"]);
		if (result.exitCode !== 0) return composeCommandFailure(options.id, "stop", result);
		return { state: "absent", message: `Stopped sandbox ${options.id}.` };
	};
}

function hasComposeLifecycle(
	options: DockerComposeSandboxOptions,
): options is DockerComposeSandboxOptions & { composeFile: string; projectName: string } {
	return options.composeFile !== undefined && options.projectName !== undefined;
}

function runDockerCompose(
	shell: ShellRunner,
	options: DockerComposeSandboxOptions & { composeFile: string; projectName: string },
	args: readonly string[],
): Promise<ShellResult> {
	return shell.run("docker", ["compose", "-f", options.composeFile, "-p", options.projectName, ...args]);
}

function composeCommandFailure(
	id: string,
	operation: "start" | "stop",
	result: ShellResult,
): SandboxStatus {
	const detail = result.stderr.trim() || result.stdout.trim() || `docker compose ${operation} failed`;
	return {
		state: "error",
		message: `Docker Compose ${operation} failed for sandbox ${id}: ${detail}`,
	};
}

function dockerExecArgs(
	containerName: string,
	command: string,
	args: readonly string[],
	options: ExecSandboxRunOptions,
): string[] {
	const dockerArgs = ["exec"];
	if (options.input !== undefined) dockerArgs.push("-i");
	if (options.cwd !== undefined) dockerArgs.push("-w", options.cwd);
	dockerArgs.push(containerName, command, ...args);
	return dockerArgs;
}

function createDockerExecSandboxWorkspace(
	runInContainer: ExecSandboxEnvironment["run"],
	dir: string,
): ExecSandboxWorkspace {
	let disposed = false;
	const path = (name: string): string => workspacePath(dir, name);
	return {
		path,
		async writeText(name, contents, options): Promise<void> {
			const result = await runInContainer(
				"sh",
				["-c", "cat > \"$1\"", "sh", path(name)],
				{ input: contents, signal: options?.signal },
			);
			assertShellSuccess(`write ${name}`, result);
		},
		async readBuffer(name, options): Promise<Buffer> {
			const result = await runInContainer("cat", [path(name)], options);
			assertShellSuccess(`read ${name}`, result);
			return result.stdoutBuffer ?? Buffer.from(result.stdout, "utf8");
		},
		async dispose(options): Promise<void> {
			if (disposed) return;
			const result = await runInContainer("rm", ["-rf", "--", dir], options);
			assertShellSuccess(`dispose ${dir}`, result);
			disposed = true;
		},
	};
}

function workspacePath(dir: string, name: string): string {
	if (name.length === 0 || pathPosix.isAbsolute(name)) {
		throw new Error("workspace path must be relative and stay inside workspace");
	}
	const normalized = pathPosix.normalize(name);
	if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
		throw new Error("workspace path must be relative and stay inside workspace");
	}
	return pathPosix.join(dir, normalized);
}

function normalizeWorkspaceRoot(root: string): string {
	if (!pathPosix.isAbsolute(root)) {
		throw new Error("workspace root must be an absolute container path");
	}
	return root.replace(/\/+$/, "") || "/";
}

function isWorkspaceChildPath(root: string, rawPath: string): boolean {
	if (!pathPosix.isAbsolute(rawPath)) return false;
	const normalized = pathPosix.normalize(rawPath);
	const relative = pathPosix.relative(root, normalized);
	return relative.length > 0 && !relative.startsWith("..") && !pathPosix.isAbsolute(relative);
}

function assertShellSuccess(operation: string, result: ShellResult): void {
	if (result.exitCode === 0) return;
	const detail = result.stderr.trim() || `exit ${result.exitCode}`;
	throw new Error(`${operation} failed: ${detail}`);
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
		const imageStatus = await inspectContainerImage(shell, component);
		if (imageStatus) return imageStatus;
		const labelStatus = await inspectContainerLabels(shell, component);
		if (labelStatus) return labelStatus;
		if (running && component.security) {
			const securityStatus = await inspectContainerSecurity(shell, component);
			if (securityStatus) return securityStatus;
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
	if (stderr.includes("No such object") || stderr.includes("No such container")) {
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

async function inspectContainerLabels(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
): Promise<SandboxComponentStatus | undefined> {
	for (const [name, expectedValue] of Object.entries(component.expectedLabels)) {
		const result = await shell.run("docker", [
			"inspect",
			"--format",
			`{{ index .Config.Labels "${name}" }}`,
			component.containerName,
		]);
		if (result.exitCode !== 0) {
			return inspectFailureStatus(component, result.stderr);
		}
		const actualValue = result.stdout.trim() || "<none>";
		if (actualValue !== expectedValue) {
			return {
				id: component.id,
				state: "error",
				message: `Container ${component.containerName} label mismatch: expected ${name}=${expectedValue}, got ${actualValue}.`,
			};
		}
	}
	return undefined;
}

async function inspectContainerSecurity(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
): Promise<SandboxComponentStatus | undefined> {
	const security = component.security;
	if (!security) return undefined;
	for (const check of [
		inspectNetworkMode,
		inspectPublishedPorts,
		inspectMounts,
		inspectDroppedCapabilities,
		inspectAddedCapabilities,
		inspectPrivilegedMode,
		inspectSecurityOptions,
	]) {
		const status = await check(shell, component, security);
		if (status) return status;
	}
	return undefined;
}

async function inspectNetworkMode(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (security.networkMode === undefined) return undefined;
	const network = await inspectFormat(shell, component, "{{.HostConfig.NetworkMode}}");
	if (isInspectStatus(network)) return network;
	if (network.trim() === security.networkMode) return undefined;
	return securityError(component, `network mode ${network.trim() || "<none>"}; expected ${security.networkMode}.`);
}

async function inspectPublishedPorts(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (!security.noPublishedPorts) return undefined;
	const ports = await inspectFormat(shell, component, "{{json .NetworkSettings.Ports}}");
	if (isInspectStatus(ports)) return ports;
	return isEmptyDockerJsonObject(ports)
		? undefined
		: securityError(component, "exposes ports; expected no published or exposed ports.");
}

async function inspectMounts(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (!security.allowOnlyTmpfsMounts && !security.requiredTmpfsMounts) return undefined;
	const mounts = await inspectFormat(shell, component, "{{json .Mounts}}");
	if (isInspectStatus(mounts)) return mounts;
	const parsedMounts = dockerMounts(mounts);
	if (hasNonTmpfsMount(parsedMounts)) {
		return securityError(component, "has non-tmpfs mounts; expected no host mounts.");
	}
	for (const destination of security.requiredTmpfsMounts ?? []) {
		if (!hasTmpfsMountAt(parsedMounts, destination)) {
			return securityError(component, `missing tmpfs mount at ${destination}.`);
		}
	}
	return undefined;
}

async function inspectDroppedCapabilities(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (!security.capDropAll) return undefined;
	const capDrop = await inspectFormat(shell, component, "{{json .HostConfig.CapDrop}}");
	if (isInspectStatus(capDrop)) return capDrop;
	return jsonStringArray(capDrop).includes("ALL")
		? undefined
		: securityError(component, "does not drop all capabilities.");
}

async function inspectAddedCapabilities(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (!security.noAddedCapabilities) return undefined;
	const capAdd = await inspectFormat(shell, component, "{{json .HostConfig.CapAdd}}");
	if (isInspectStatus(capAdd)) return capAdd;
	const added = jsonStringArray(capAdd);
	return added.length === 0
		? undefined
		: securityError(component, `adds capabilities ${added.join(", ")}; expected none.`);
}

async function inspectPrivilegedMode(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (!security.notPrivileged) return undefined;
	const privileged = await inspectFormat(shell, component, "{{.HostConfig.Privileged}}");
	if (isInspectStatus(privileged)) return privileged;
	return privileged.trim() === "true"
		? securityError(component, "is privileged; expected non-privileged.")
		: undefined;
}

async function inspectSecurityOptions(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	security: DockerSandboxSecurityOptions,
): Promise<SandboxComponentStatus | undefined> {
	if (!security.noNewPrivileges && !security.forbidUnconfinedSeccomp) return undefined;
	const securityOpt = await inspectFormat(shell, component, "{{json .HostConfig.SecurityOpt}}");
	if (isInspectStatus(securityOpt)) return securityOpt;
	const options = jsonStringArray(securityOpt);
	const hasNoNewPrivileges = options.includes("no-new-privileges") || options.includes("no-new-privileges=true");
	if (security.noNewPrivileges && !hasNoNewPrivileges) {
		return securityError(component, "does not set no-new-privileges.");
	}
	if (security.forbidUnconfinedSeccomp && options.includes("seccomp=unconfined")) {
		return securityError(component, "uses unconfined seccomp; expected confined seccomp.");
	}
	return undefined;
}

async function inspectFormat(
	shell: ShellRunner,
	component: DockerSandboxComponentOptions,
	format: string,
): Promise<string | SandboxComponentStatus> {
	const result = await shell.run("docker", ["inspect", "--format", format, component.containerName]);
	return result.exitCode === 0 ? result.stdout.trim() : inspectFailureStatus(component, result.stderr);
}

function isInspectStatus(value: string | SandboxComponentStatus): value is SandboxComponentStatus {
	return typeof value !== "string";
}

function securityError(component: DockerSandboxComponentOptions, detail: string): SandboxComponentStatus {
	return { id: component.id, state: "error", message: `Container ${component.containerName} ${detail}` };
}

function isEmptyDockerJsonObject(raw: string): boolean {
	const trimmed = raw.trim();
	return trimmed === "" || trimmed === "null" || trimmed === "{}";
}

function dockerMounts(raw: string): unknown[] {
	const parsed = parseJson(raw);
	return Array.isArray(parsed) ? parsed : [{}];
}

function hasNonTmpfsMount(mounts: readonly unknown[]): boolean {
	return mounts.some((entry) => !isRecord(entry) || entry.Type !== "tmpfs");
}

function hasTmpfsMountAt(mounts: readonly unknown[], destination: string): boolean {
	return mounts.some(
		(entry) => isRecord(entry) && entry.Type === "tmpfs" && entry.Destination === destination,
	);
}

function jsonStringArray(raw: string): string[] {
	const parsed = parseJson(raw);
	return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
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
