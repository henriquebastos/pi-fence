import { describe, expect, it } from "vitest";

import { createKrokiDockerManager } from "../../extensions/pi-fence/kroki-docker.ts";
import {
	createDockerComposeSandboxController,
	createDockerContainerSandboxController,
	createKrokiDockerSandboxController,
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

function composeComponents() {
	return [
		{ id: "core", containerName: "kroki-core", expectedImage: KROKI_IMAGE, expectedLabels: KROKI_LABELS },
		{ id: "mermaid", containerName: "kroki-mermaid", expectedImage: MERMAID_IMAGE, expectedLabels: KROKI_LABELS },
	];
}

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
				"-p", "8000:8000",
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
