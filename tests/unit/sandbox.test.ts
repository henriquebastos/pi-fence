import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createKrokiDockerManager } from "../../extensions/pi-fence/kroki-docker.ts";
import {
	createDockerComposeSandboxController,
	createDockerContainerSandboxController,
	createGondolinBundleSandboxController,
	createGondolinVMOptions,
	createKrokiDockerComposeSandboxController,
	createKrokiDockerSandboxController,
	type GondolinVMFactory,
	type GondolinVMHandle,
} from "../../extensions/pi-fence/sandbox.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

const KROKI_IMAGE = "yuzutech/kroki";
const MERMAID_IMAGE = "yuzutech/mermaid";
const SANDBOX_LABEL = "pi-fence.sandbox";
const KROKI_LABELS = { [SANDBOX_LABEL]: "kroki" };

function setRunning(
	shell: FakeShellRunner,
	containerName: string,
	image: string,
	labels = KROKI_LABELS,
): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", containerName], {
		stdout: "true\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", containerName], {
		stdout: `${image}\n`,
		stderr: "",
		exitCode: 0,
	});
	setLabels(shell, containerName, labels);
}

function setStopped(
	shell: FakeShellRunner,
	containerName: string,
	image = KROKI_IMAGE,
	labels = KROKI_LABELS,
): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", containerName], {
		stdout: "false\n",
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", containerName], {
		stdout: `${image}\n`,
		stderr: "",
		exitCode: 0,
	});
	setLabels(shell, containerName, labels);
}

function setLabels(
	shell: FakeShellRunner,
	containerName: string,
	labels: Readonly<Record<string, string>>,
): void {
	for (const [name, value] of Object.entries(labels)) {
		shell.setResponse("docker", ["inspect", "--format", `{{ index .Config.Labels "${name}" }}`, containerName], {
			stdout: `${value}\n`,
			stderr: "",
			exitCode: 0,
		});
	}
}

function setAbsent(shell: FakeShellRunner, containerName: string): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", containerName], {
		stdout: "",
		stderr: "No such object",
		exitCode: 1,
	});
}

function krokiContainerOptions() {
	return {
		id: "kroki",
		kind: "service" as const,
		containerName: "pi-fence-kroki",
		expectedImage: KROKI_IMAGE,
		expectedLabels: KROKI_LABELS,
	};
}

class FakeGondolinVM implements GondolinVMHandle {
	readonly fs = {
		writeFile: async (): Promise<void> => {},
		readFile: async (): Promise<Buffer> => Buffer.alloc(0),
		deleteFile: async (): Promise<void> => {},
	};
	startCalls = 0;
	closeCalls = 0;
	startError?: Error;

	async exec(): Promise<{ stdout: string; stdoutBuffer: Buffer; stderr: string; exitCode: number }> {
		return { stdout: "", stdoutBuffer: Buffer.alloc(0), stderr: "", exitCode: 0 };
	}

	async start(): Promise<void> {
		this.startCalls += 1;
		if (this.startError) throw this.startError;
	}

	async close(): Promise<void> {
		this.closeCalls += 1;
	}
}

class FakeGondolinVMFactory implements GondolinVMFactory {
	readonly creates: Array<{ image?: string }> = [];
	readonly vm = new FakeGondolinVM();
	createWaiter?: Promise<void>;

	async create(options: { image?: string }): Promise<GondolinVMHandle> {
		this.creates.push(options);
		await this.createWaiter;
		return this.vm;
	}
}

function bundleContainerOptions() {
	return {
		id: "bundle",
		kind: "exec" as const,
		containerName: "pi-fence-bundle",
		expectedImage: "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0",
		expectedLabels: { [SANDBOX_LABEL]: "bundle" },
		security: {
			networkMode: "none",
			noPublishedPorts: true,
			allowOnlyTmpfsMounts: true,
			requiredTmpfsMounts: ["/tmp"],
			capDropAll: true,
			noAddedCapabilities: true,
			notPrivileged: true,
			noNewPrivileges: true,
			forbidUnconfinedSeccomp: true,
		},
	};
}

function setBundleSecurity(
	shell: FakeShellRunner,
	overrides: {
		networkMode?: string;
		ports?: string;
		mounts?: string;
		capDrop?: string;
		capAdd?: string;
		privileged?: string;
		securityOpt?: string;
	} = {},
): void {
	const containerName = "pi-fence-bundle";
	shell.setResponse("docker", ["inspect", "--format", "{{.HostConfig.NetworkMode}}", containerName], {
		stdout: `${overrides.networkMode ?? "none"}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", containerName], {
		stdout: `${overrides.ports ?? "null"}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .Mounts}}", containerName], {
		stdout: `${overrides.mounts ?? '[{"Type":"tmpfs","Destination":"/tmp"}]'}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .HostConfig.CapDrop}}", containerName], {
		stdout: `${overrides.capDrop ?? '["ALL"]'}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .HostConfig.CapAdd}}", containerName], {
		stdout: `${overrides.capAdd ?? "null"}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{.HostConfig.Privileged}}", containerName], {
		stdout: `${overrides.privileged ?? "false"}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", "{{json .HostConfig.SecurityOpt}}", containerName], {
		stdout: `${overrides.securityOpt ?? '["no-new-privileges"]'}\n`,
		stderr: "",
		exitCode: 0,
	});
}

function composeComponents() {
	return [
		{ id: "core", containerName: "kroki-core", expectedImage: KROKI_IMAGE, expectedLabels: KROKI_LABELS },
		{ id: "mermaid", containerName: "kroki-mermaid", expectedImage: MERMAID_IMAGE, expectedLabels: KROKI_LABELS },
	];
}

function expectedKrokiComposeFilePath(): string {
	return fileURLToPath(new URL("../../docker/kroki/compose.yaml", import.meta.url));
}

describe("sandbox controller contract — Gondolin bundle VM status", () => {
	it("reports stopped before creating a VM", async () => {
		const factory = new FakeGondolinVMFactory();
		const controller = createGondolinBundleSandboxController(factory, { image: "pi-fence-bundle:0.1.0" });

		expect(controller).toMatchObject({ id: "bundle", kind: "exec", runtime: "gondolin-vm" });
		expect(await controller.status()).toEqual({
			state: "stopped",
			message: "Gondolin VM for sandbox bundle is stopped.",
		});
		expect(factory.creates).toEqual([]);
	});

	it("starts a VM with the configured image", async () => {
		const factory = new FakeGondolinVMFactory();
		const controller = createGondolinBundleSandboxController(factory, { image: "pi-fence-bundle:0.1.0" });

		expect(await controller.start()).toEqual({
			state: "ready",
			message: "Gondolin VM for sandbox bundle is ready.",
		});
		expect(factory.creates).toEqual([{ image: "pi-fence-bundle:0.1.0" }]);
		expect(factory.vm.startCalls).toBe(1);
		expect(await controller.status()).toEqual({
			state: "ready",
			message: "Gondolin VM for sandbox bundle is ready.",
		});
	});

	it("stops a started VM", async () => {
		const factory = new FakeGondolinVMFactory();
		const controller = createGondolinBundleSandboxController(factory);

		await controller.start();

		expect(await controller.stop()).toEqual({
			state: "stopped",
			message: "Gondolin VM for sandbox bundle is stopped.",
		});
		expect(factory.vm.closeCalls).toBe(1);
		expect(await controller.status()).toEqual({
			state: "stopped",
			message: "Gondolin VM for sandbox bundle is stopped.",
		});
	});

	it("reports VM start failures as controller errors", async () => {
		const factory = new FakeGondolinVMFactory();
		factory.vm.startError = new Error("qemu missing");
		const controller = createGondolinBundleSandboxController(factory);

		expect(await controller.start()).toEqual({
			state: "error",
			message: "Gondolin VM for sandbox bundle failed to start: qemu missing",
		});
		expect(await controller.status()).toEqual({
			state: "error",
			message: "Gondolin VM for sandbox bundle failed to start: qemu missing",
		});
	});

	it("clears a failed start error when stopped", async () => {
		const factory = new FakeGondolinVMFactory();
		factory.vm.startError = new Error("qemu missing");
		const controller = createGondolinBundleSandboxController(factory);

		await controller.start();

		expect(await controller.stop()).toEqual({
			state: "stopped",
			message: "Gondolin VM for sandbox bundle is stopped.",
		});
		expect(await controller.status()).toEqual({
			state: "stopped",
			message: "Gondolin VM for sandbox bundle is stopped.",
		});
	});

	it("single-flights concurrent starts", async () => {
		const factory = new FakeGondolinVMFactory();
		let releaseCreate!: () => void;
		factory.createWaiter = new Promise<void>((resolve) => {
			releaseCreate = resolve;
		});
		const controller = createGondolinBundleSandboxController(factory, { image: "pi-fence-bundle:0.1.0" });

		const first = controller.start();
		const second = controller.start();
		await Promise.resolve();

		expect(factory.creates).toEqual([{ image: "pi-fence-bundle:0.1.0" }]);

		releaseCreate();
		await expect(Promise.all([first, second])).resolves.toEqual([
			{ state: "ready", message: "Gondolin VM for sandbox bundle is ready." },
			{ state: "ready", message: "Gondolin VM for sandbox bundle is ready." },
		]);
		expect(factory.vm.startCalls).toBe(1);
	});

	it("builds VM options without host mounts or generic networking", () => {
		expect(createGondolinVMOptions({ image: "pi-fence-bundle:0.1.0" })).toEqual({
			env: {},
			vfs: null,
			sandbox: {
				imagePath: "pi-fence-bundle:0.1.0",
				netEnabled: false,
			},
		});
	});
});

describe("sandbox controller contract — Docker container status", () => {
	it("reports ready when docker inspect says the expected container is running", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-kroki", KROKI_IMAGE);

		const controller = createDockerContainerSandboxController(shell, {
			...krokiContainerOptions(),
			endpoint: "http://localhost:8000",
		});

		expect(controller.id).toBe("kroki");
		expect(controller.kind).toBe("service");
		expect(controller.runtime).toBe("docker-container");
		expect(await controller.status()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Container pi-fence-kroki is running.",
		});
	});

	it("reports error when a running container image does not match the expected sandbox image", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-kroki", "attacker/kroki");

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-kroki image mismatch: expected yuzutech/kroki, got attacker/kroki.",
		});
	});

	it("reports error when a running container label does not match the expected sandbox owner", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-kroki", KROKI_IMAGE, { [SANDBOX_LABEL]: "other" });

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-kroki label mismatch: expected pi-fence.sandbox=kroki, got other.",
		});
	});

	it("reports ready for a bundle container that satisfies the exec sandbox contract", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell);

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "ready",
			message: "Container pi-fence-bundle is running.",
		});
	});

	it("reports error when a bundle container publishes ports", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { ports: '{"8000/tcp":[{"HostPort":"8000"}]}' });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle exposes ports; expected no published or exposed ports.",
		});
	});

	it("reports error when a bundle container does not use network none", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { networkMode: "bridge" });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle network mode bridge; expected none.",
		});
	});

	it("reports error when a bundle container has a host mount", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { mounts: '[{"Type":"bind","Source":"/Users/me","Destination":"/host"}]' });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle has non-tmpfs mounts; expected no host mounts.",
		});
	});

	it("reports error when a bundle container does not mount tmpfs at /tmp", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { mounts: "[]" });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle missing tmpfs mount at /tmp.",
		});
	});

	it("reports error when a bundle container keeps Linux capabilities", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { capDrop: "[]" });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle does not drop all capabilities.",
		});
	});

	it("reports error when a bundle container adds Linux capabilities back", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { capAdd: '["SYS_ADMIN"]' });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle adds capabilities SYS_ADMIN; expected none.",
		});
	});

	it("reports error when a bundle container is privileged", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { privileged: "true" });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle is privileged; expected non-privileged.",
		});
	});

	it("reports error when a bundle container disables no-new-privileges", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { securityOpt: '["no-new-privileges=false"]' });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle does not set no-new-privileges.",
		});
	});

	it("reports error when a bundle container omits no-new-privileges", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { securityOpt: "[]" });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle does not set no-new-privileges.",
		});
	});

	it("reports error when a bundle container disables seccomp", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-bundle", "ghcr.io/henriquebastos/pi-fence-bundle:0.1.0", {
			[SANDBOX_LABEL]: "bundle",
		});
		setBundleSecurity(shell, { securityOpt: '["no-new-privileges","seccomp=unconfined"]' });

		const controller = createDockerContainerSandboxController(shell, bundleContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-bundle uses unconfined seccomp; expected confined seccomp.",
		});
	});

	it("reports stopped when docker inspect says the expected container exists but is not running", async () => {
		const shell = new FakeShellRunner();
		setStopped(shell, "pi-fence-kroki");

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "stopped",
			message: "Container pi-fence-kroki exists but is stopped.",
		});
	});

	it("reports error when a stopped container image does not match", async () => {
		const shell = new FakeShellRunner();
		setStopped(shell, "pi-fence-kroki", "attacker/kroki");

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-kroki image mismatch: expected yuzutech/kroki, got attacker/kroki.",
		});
	});

	it("reports absent when docker inspect cannot find the container", async () => {
		const shell = new FakeShellRunner();
		setAbsent(shell, "pi-fence-kroki");

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "absent",
			message: "Container pi-fence-kroki not found.",
		});
	});

	it("reports absent for Docker's No such container wording", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "",
			stderr: "No such container",
			exitCode: 1,
		});

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "absent",
			message: "Container pi-fence-kroki not found.",
		});
	});

	it("reports error when docker inspect returns a daemon or permission failure", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "",
			stderr: "permission denied while trying to connect to the Docker daemon socket",
			exitCode: 1,
		});

		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Docker inspect failed for pi-fence-kroki: permission denied while trying to connect to the Docker daemon socket",
		});
	});

	it("reports error when docker inspect cannot run", async () => {
		const shell = new FakeShellRunner();
		const controller = createDockerContainerSandboxController(shell, krokiContainerOptions());

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Docker not available: FakeShellRunner: no programmed response for docker inspect --format {{.State.Running}} pi-fence-kroki and no default set",
		});
	});

	it("reports unsupported lifecycle operations explicitly", async () => {
		const controller = createDockerContainerSandboxController(new FakeShellRunner(), krokiContainerOptions());

		expect(await controller.start()).toEqual({
			state: "error",
			message: "Start is not implemented for sandbox kroki.",
		});
		expect(await controller.stop()).toEqual({
			state: "error",
			message: "Stop is not implemented for sandbox kroki.",
		});
	});
});

describe("sandbox controller contract — Kroki Docker adapter", () => {
	it("represents the existing Kroki Docker lifecycle behind a sandbox controller", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-kroki", KROKI_IMAGE);

		const controller = createKrokiDockerSandboxController(createKrokiDockerManager(shell));

		expect(controller.id).toBe("kroki");
		expect(controller.kind).toBe("service");
		expect(controller.runtime).toBe("docker-container");
		expect(await controller.status()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Container pi-fence-kroki is running on port 8000.",
		});
	});

	it("normalizes start() through the existing Kroki Docker manager", async () => {
		const shell = new FakeShellRunner();
		setAbsent(shell, "pi-fence-kroki");
		shell.setResponse(
			"docker",
			[
				"run", "-d",
				"--name", "pi-fence-kroki",
				"--label", "pi-fence.sandbox=kroki",
				"-p", "127.0.0.1:8000:8000",
				KROKI_IMAGE,
			],
			{ stdout: "abc123\n", stderr: "", exitCode: 0 },
		);
		const controller = createKrokiDockerSandboxController(createKrokiDockerManager(shell));

		expect(await controller.start()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Started pi-fence-kroki on port 8000.",
		});
	});

	it("normalizes stop() through the existing Kroki Docker manager", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-kroki", KROKI_IMAGE);
		shell.setResponse("docker", ["stop", "pi-fence-kroki"], {
			stdout: "pi-fence-kroki\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["rm", "pi-fence-kroki"], {
			stdout: "pi-fence-kroki\n",
			stderr: "",
			exitCode: 0,
		});
		const controller = createKrokiDockerSandboxController(createKrokiDockerManager(shell));

		expect(await controller.stop()).toEqual({
			state: "absent",
			message: "Stopped and removed pi-fence-kroki.",
		});
	});
});

describe("sandbox controller contract — Docker Compose status", () => {
	it("starts the fixed Kroki Compose service with a package-resolved compose file", async () => {
		const shell = new FakeShellRunner();
		const composeFile = expectedKrokiComposeFilePath();
		setRunning(shell, "pi-fence-kroki-core", KROKI_IMAGE);
		setRunning(shell, "pi-fence-kroki-mermaid", MERMAID_IMAGE);
		shell.setResponse(
			"docker",
			["compose", "-f", composeFile, "-p", "pi-fence-kroki", "up", "-d"],
			{ stdout: "", stderr: "", exitCode: 0 },
		);
		const controller = createKrokiDockerComposeSandboxController(shell);

		expect(isAbsolute(composeFile)).toBe(true);
		expect(await controller.start()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Sandbox kroki is ready.",
			components: [
				{ id: "core", state: "ready", message: "Container pi-fence-kroki-core is running." },
				{ id: "mermaid", state: "ready", message: "Container pi-fence-kroki-mermaid is running." },
			],
		});
		expect(shell.calls.some((call) => call.args.join(" ") === `compose -f ${composeFile} -p pi-fence-kroki up -d`)).toBe(true);
	});

	it("builds the fixed Kroki Compose service controller", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "pi-fence-kroki-core", KROKI_IMAGE);
		setRunning(shell, "pi-fence-kroki-mermaid", MERMAID_IMAGE);

		const controller = createKrokiDockerComposeSandboxController(shell);

		expect(controller.id).toBe("kroki");
		expect(controller.kind).toBe("service");
		expect(controller.runtime).toBe("docker-compose");
		expect(await controller.status()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Sandbox kroki is ready.",
			components: [
				{ id: "core", state: "ready", message: "Container pi-fence-kroki-core is running." },
				{ id: "mermaid", state: "ready", message: "Container pi-fence-kroki-mermaid is running." },
			],
		});
	});

	it("starts and stops a configured Compose stack", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "kroki-core", KROKI_IMAGE);
		setRunning(shell, "kroki-mermaid", MERMAID_IMAGE);
		shell.setResponse(
			"docker",
			["compose", "-f", "docker/kroki/compose.yaml", "-p", "pi-fence-kroki", "up", "-d"],
			{ stdout: "", stderr: "", exitCode: 0 },
		);
		shell.setResponse(
			"docker",
			["compose", "-f", "docker/kroki/compose.yaml", "-p", "pi-fence-kroki", "down"],
			{ stdout: "", stderr: "", exitCode: 0 },
		);
		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			endpoint: "http://localhost:8000",
			composeFile: "docker/kroki/compose.yaml",
			projectName: "pi-fence-kroki",
			components: composeComponents(),
		});

		expect(await controller.start()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Sandbox kroki is ready.",
			components: [
				{ id: "core", state: "ready", message: "Container kroki-core is running." },
				{ id: "mermaid", state: "ready", message: "Container kroki-mermaid is running." },
			],
		});
		expect(await controller.stop()).toEqual({
			state: "absent",
			message: "Stopped sandbox kroki.",
		});
		expect(shell.calls.some((call) => call.args.join(" ") === "compose -f docker/kroki/compose.yaml -p pi-fence-kroki up -d")).toBe(true);
		expect(shell.calls.some((call) => call.args.join(" ") === "compose -f docker/kroki/compose.yaml -p pi-fence-kroki down")).toBe(true);
	});
	it("reports error when no components are configured", async () => {
		const controller = createDockerComposeSandboxController(new FakeShellRunner(), {
			id: "kroki",
			kind: "service",
			components: [],
		});

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Sandbox kroki has no configured components.",
		});
	});

	it("reports ready with endpoint when all components are ready", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "kroki-core", KROKI_IMAGE);
		setRunning(shell, "kroki-mermaid", MERMAID_IMAGE);

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			endpoint: "http://localhost:8000",
			components: composeComponents(),
		});

		expect(await controller.status()).toEqual({
			state: "ready",
			endpoint: "http://localhost:8000",
			message: "Sandbox kroki is ready.",
			components: [
				{ id: "core", state: "ready", message: "Container kroki-core is running." },
				{ id: "mermaid", state: "ready", message: "Container kroki-mermaid is running." },
			],
		});
	});

	it("reports partial when only some components are ready", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "kroki-core", KROKI_IMAGE);
		setStopped(shell, "kroki-mermaid", MERMAID_IMAGE);

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			endpoint: "http://localhost:8000",
			components: composeComponents(),
		});

		expect(controller.runtime).toBe("docker-compose");
		expect(await controller.status()).toEqual({
			state: "partial",
			message: "Sandbox kroki has 1 of 2 component(s) ready.",
			components: [
				{ id: "core", state: "ready", message: "Container kroki-core is running." },
				{ id: "mermaid", state: "stopped", message: "Container kroki-mermaid exists but is stopped." },
			],
		});
	});

	it("reports absent when all components are absent", async () => {
		const shell = new FakeShellRunner();
		setAbsent(shell, "kroki-core");
		setAbsent(shell, "kroki-mermaid");

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			components: composeComponents(),
		});

		expect(await controller.status()).toEqual({
			state: "absent",
			message: "Sandbox kroki is absent.",
			components: [
				{ id: "core", state: "absent", message: "Container kroki-core not found." },
				{ id: "mermaid", state: "absent", message: "Container kroki-mermaid not found." },
			],
		});
	});

	it("reports stopped when all components are stopped", async () => {
		const shell = new FakeShellRunner();
		setStopped(shell, "kroki-core", KROKI_IMAGE);
		setStopped(shell, "kroki-mermaid", MERMAID_IMAGE);

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			components: composeComponents(),
		});

		expect(await controller.status()).toEqual({
			state: "stopped",
			message: "Sandbox kroki is stopped.",
			components: [
				{ id: "core", state: "stopped", message: "Container kroki-core exists but is stopped." },
				{ id: "mermaid", state: "stopped", message: "Container kroki-mermaid exists but is stopped." },
			],
		});
	});

	it("reports error when any component status is an error", async () => {
		const shell = new FakeShellRunner();
		setRunning(shell, "kroki-core", KROKI_IMAGE);

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			components: composeComponents(),
		});

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Sandbox kroki status failed.",
			components: [
				{ id: "core", state: "ready", message: "Container kroki-core is running." },
				{
					id: "mermaid",
					state: "error",
					message: "Docker not available: FakeShellRunner: no programmed response for docker inspect --format {{.State.Running}} kroki-mermaid and no default set",
				},
			],
		});
	});
});
