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
});
