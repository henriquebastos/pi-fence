import { describe, expect, it } from "vitest";

import { createKrokiDockerManager } from "../../extensions/pi-fence/kroki-docker.ts";
import {
	createDockerComposeSandboxController,
	createDockerContainerSandboxController,
	createKrokiDockerSandboxController,
} from "../../extensions/pi-fence/sandbox.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

describe("sandbox controller contract — Docker container status", () => {
	it("reports ready when docker inspect says the container is running", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerContainerSandboxController(shell, {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"], {
			stdout: "attacker/kroki\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerContainerSandboxController(shell, {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
			expectedImage: "yuzutech/kroki",
		});

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Container pi-fence-kroki image mismatch: expected yuzutech/kroki, got attacker/kroki.",
		});
	});

	it("reports stopped when docker inspect says the container exists but is not running", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "false\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerContainerSandboxController(shell, {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
		});

		expect(await controller.status()).toEqual({
			state: "stopped",
			message: "Container pi-fence-kroki exists but is stopped.",
		});
	});

	it("reports absent when docker inspect cannot find the container", async () => {
		const shell = new FakeShellRunner();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "",
			stderr: "No such object",
			exitCode: 1,
		});

		const controller = createDockerContainerSandboxController(shell, {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
		});

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

		const controller = createDockerContainerSandboxController(shell, {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
		});

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Docker inspect failed for pi-fence-kroki: permission denied while trying to connect to the Docker daemon socket",
		});
	});

	it("reports error when docker inspect cannot run", async () => {
		const shell = new FakeShellRunner();
		const controller = createDockerContainerSandboxController(shell, {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
		});

		expect(await controller.status()).toEqual({
			state: "error",
			message: "Docker not available: FakeShellRunner: no programmed response for docker inspect --format {{.State.Running}} pi-fence-kroki and no default set",
		});
	});

	it("reports unsupported lifecycle operations explicitly", async () => {
		const controller = createDockerContainerSandboxController(new FakeShellRunner(), {
			id: "kroki",
			kind: "service",
			containerName: "pi-fence-kroki",
		});

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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});

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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-core"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-mermaid"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			endpoint: "http://localhost:8000",
			components: [
				{ id: "core", containerName: "kroki-core" },
				{ id: "mermaid", containerName: "kroki-mermaid" },
			],
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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-core"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-mermaid"], {
			stdout: "false\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			endpoint: "http://localhost:8000",
			components: [
				{ id: "core", containerName: "kroki-core" },
				{ id: "mermaid", containerName: "kroki-mermaid" },
			],
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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-core"], {
			stdout: "",
			stderr: "No such object",
			exitCode: 1,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-mermaid"], {
			stdout: "",
			stderr: "No such object",
			exitCode: 1,
		});

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			components: [
				{ id: "core", containerName: "kroki-core" },
				{ id: "mermaid", containerName: "kroki-mermaid" },
			],
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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-core"], {
			stdout: "false\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-mermaid"], {
			stdout: "false\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			components: [
				{ id: "core", containerName: "kroki-core" },
				{ id: "mermaid", containerName: "kroki-mermaid" },
			],
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
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "kroki-core"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});

		const controller = createDockerComposeSandboxController(shell, {
			id: "kroki",
			kind: "service",
			components: [
				{ id: "core", containerName: "kroki-core" },
				{ id: "mermaid", containerName: "kroki-mermaid" },
			],
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
