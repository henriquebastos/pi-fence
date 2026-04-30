/**
 * Unit tests for Docker Kroki lifecycle manager.
 */

import { describe, expect, it } from "vitest";

import { createKrokiDockerManager } from "../../extensions/pi-fence/kroki-docker.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

const CONTAINER = "pi-fence-kroki";
const IMAGE = "yuzutech/kroki";
const LABEL_NAME = "pi-fence.sandbox";
const LABEL_VALUE = "kroki";
const PORTS_FORMAT = "{{json .NetworkSettings.Ports}}";

function makeShell() {
	return new FakeShellRunner();
}

function setRunning(shell: FakeShellRunner, image = IMAGE, label = LABEL_VALUE): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", CONTAINER], {
		stdout: "true\n",
		stderr: "",
		exitCode: 0,
	});
	setIdentity(shell, image, label);
	setPortBinding(shell);
}

function setStopped(shell: FakeShellRunner, image = IMAGE, label = LABEL_VALUE): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", CONTAINER], {
		stdout: "false\n",
		stderr: "",
		exitCode: 0,
	});
	setIdentity(shell, image, label);
}

function setAbsent(shell: FakeShellRunner, stderr = "No such container"): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", CONTAINER], {
		stdout: "",
		stderr,
		exitCode: 1,
	});
}

function setIdentity(shell: FakeShellRunner, image = IMAGE, label = LABEL_VALUE): void {
	shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", CONTAINER], {
		stdout: `${image}\n`,
		stderr: "",
		exitCode: 0,
	});
	shell.setResponse("docker", ["inspect", "--format", `{{ index .Config.Labels "${LABEL_NAME}" }}`, CONTAINER], {
		stdout: `${label}\n`,
		stderr: "",
		exitCode: 0,
	});
}

function setPortBinding(shell: FakeShellRunner, hostIp = "127.0.0.1"): void {
	shell.setResponse("docker", ["inspect", "--format", PORTS_FORMAT, CONTAINER], {
		stdout: JSON.stringify({ "8000/tcp": [{ HostIp: hostIp, HostPort: "8000" }] }) + "\n",
		stderr: "",
		exitCode: 0,
	});
}

function setPortsRaw(shell: FakeShellRunner, raw: string): void {
	shell.setResponse("docker", ["inspect", "--format", PORTS_FORMAT, CONTAINER], {
		stdout: `${raw}\n`,
		stderr: "",
		exitCode: 0,
	});
}

describe("kroki-docker — status()", () => {
	it("reports running when docker inspect returns true for the managed container", async () => {
		const shell = makeShell();
		setRunning(shell);
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.status).toBe("running");
		expect(result.endpoint).toBe("http://127.0.0.1:8000");
	});

	it("checks container identity against the configured image", async () => {
		const shell = makeShell();
		setRunning(shell, "registry.example/kroki:test");
		const mgr = createKrokiDockerManager(shell, undefined, { image: "registry.example/kroki:test" });

		const result = await mgr.status();
		expect(result.status).toBe("running");
		expect(result.endpoint).toBe("http://127.0.0.1:8000");
	});

	it("reports error when the running container image is not the managed Kroki image", async () => {
		const shell = makeShell();
		setRunning(shell, "attacker/kroki");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("absent");
		expect(result.message).toBe("Container pi-fence-kroki image mismatch: expected yuzutech/kroki, got attacker/kroki.");
	});

	it("reports error when the running container ownership label is wrong", async () => {
		const shell = makeShell();
		setRunning(shell, IMAGE, "other");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.message).toBe("Container pi-fence-kroki label mismatch: expected pi-fence.sandbox=kroki, got other.");
	});

	it("reports error when the managed container publishes Kroki on all interfaces", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortBinding(shell, "0.0.0.0");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki publishes 8000/tcp on 0.0.0.0:8000; expected 127.0.0.1:8000.");
	});

	it("reports error when the managed container publishes Kroki on the wrong host port", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortsRaw(shell, JSON.stringify({ "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "18000" }] }));
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki publishes 8000/tcp on 127.0.0.1:18000; expected 127.0.0.1:8000.");
	});

	it("reports error when the managed container does not publish 8000/tcp", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortsRaw(shell, "{}");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki does not publish 8000/tcp; expected 127.0.0.1:8000.");
	});

	it("reports error when the managed container has null port bindings", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortsRaw(shell, "null");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki has invalid port bindings; expected 127.0.0.1:8000.");
	});

	it("reports error when port bindings include a null entry", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortsRaw(shell, JSON.stringify({ "8000/tcp": [null] }));
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki publishes 8000/tcp on <invalid>; expected 127.0.0.1:8000.");
	});

	it("reports error when the managed container returns malformed port JSON", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortsRaw(shell, "not-json");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki has invalid port bindings; expected 127.0.0.1:8000.");
	});

	it("reports the all-interfaces diagnostic when HostIp is empty", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortsRaw(shell, JSON.stringify({ "8000/tcp": [{ HostIp: "", HostPort: "8000" }] }));
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toBe("Container pi-fence-kroki publishes 8000/tcp on <all interfaces>:8000; expected 127.0.0.1:8000.");
	});

	it("reports absent when docker inspect on port bindings reports no such container", async () => {
		const shell = makeShell();
		setRunning(shell);
		shell.setResponse("docker", ["inspect", "--format", PORTS_FORMAT, CONTAINER], {
			stdout: "",
			stderr: "Error: No such object: pi-fence-kroki",
			exitCode: 1,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("absent");
		expect(result.message).toBe("Container pi-fence-kroki not found.");
	});

	it("reports error when docker inspect on port bindings fails for daemon reasons", async () => {
		const shell = makeShell();
		setRunning(shell);
		shell.setResponse("docker", ["inspect", "--format", PORTS_FORMAT, CONTAINER], {
			stdout: "",
			stderr: "permission denied while trying to connect to the Docker daemon socket",
			exitCode: 1,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("absent");
		expect(result.message).toContain("permission denied");
	});

	it("reports stopped when docker inspect returns false for the managed image", async () => {
		const shell = makeShell();
		setStopped(shell);
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.status).toBe("stopped");
		expect(result.endpoint).toBeUndefined();
	});

	it("reports absent when docker inspect exits non-zero with not-found wording", async () => {
		const shell = makeShell();
		setAbsent(shell);
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("absent");
	});

	it("reports absent when Docker uses lowercase no-such-object wording", async () => {
		const shell = makeShell();
		setAbsent(shell, "error: no such object: pi-fence-kroki");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("absent");
	});

	it("reports error when docker inspect exits non-zero for daemon failures", async () => {
		const shell = makeShell();
		setAbsent(shell, "permission denied while trying to connect to the Docker daemon socket");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("absent");
		expect(result.message).toContain("permission denied");
	});

	it("reports absent when docker is not installed (shell throws)", async () => {
		const shell = makeShell(); // no response → throws
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("absent");
		expect(result.message).toContain("Docker not available");
	});
});

describe("kroki-docker — start()", () => {
	it("returns already-running when the managed container is up", async () => {
		const shell = makeShell();
		setRunning(shell);
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("running");
		expect(result.message).toContain("already running");
		expect(result.endpoint).toBe("http://127.0.0.1:8000");
	});

	it("does not start over a running wrong-image container", async () => {
		const shell = makeShell();
		setRunning(shell, "attacker/kroki");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(false);
		expect(result.message).toContain("image mismatch");
		expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
	});

	it("does not remove a stopped wrong-image container", async () => {
		const shell = makeShell();
		setStopped(shell, "attacker/kroki");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(false);
		expect(result.message).toContain("image mismatch");
		expect(shell.calls.some((call) => call.args[0] === "rm")).toBe(false);
		expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
	});

	it("does not run docker run over a running broad-bound managed container", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortBinding(shell, "0.0.0.0");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toContain("publishes 8000/tcp on 0.0.0.0:8000");
		expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
	});

	it("runs docker run with ownership labels and returns endpoint on success", async () => {
		const shell = makeShell();
		setAbsent(shell);
		shell.setResponse(
			"docker",
			["run", "-d", "--name", CONTAINER, "--label", `${LABEL_NAME}=${LABEL_VALUE}`, "-p", "127.0.0.1:8000:8000", IMAGE],
			{ stdout: "abc123\n", stderr: "", exitCode: 0 },
		);
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("running");
		expect(result.endpoint).toBe("http://127.0.0.1:8000");
	});
});

describe("kroki-docker — stop()", () => {
	it("stops and removes the managed container", async () => {
		const shell = makeShell();
		setRunning(shell);
		shell.setResponse("docker", ["stop", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["rm", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("absent");
		expect(result.message).toContain("Stopped");
	});

	it("stops a managed container even when its port binding is too broad", async () => {
		const shell = makeShell();
		setRunning(shell);
		setPortBinding(shell, "0.0.0.0");
		shell.setResponse("docker", ["stop", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["rm", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("absent");
		expect(result.message).toContain("Stopped");
	});

	it("returns ok:false when docker stop exits non-zero", async () => {
		const shell = makeShell();
		setRunning(shell);
		shell.setResponse("docker", ["stop", CONTAINER], {
			stdout: "",
			stderr: "permission denied",
			exitCode: 1,
		});
		shell.setResponse("docker", ["rm", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toContain("docker stop exited 1");
		expect(result.message).toContain("permission denied");
		expect(shell.calls.some((call) => call.args[0] === "rm")).toBe(false);
	});

	it("returns ok:false when docker rm exits non-zero", async () => {
		const shell = makeShell();
		setRunning(shell);
		shell.setResponse("docker", ["stop", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["rm", CONTAINER], {
			stdout: "",
			stderr: "removal denied",
			exitCode: 1,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("stopped");
		expect(result.message).toContain("docker rm exited 1");
		expect(result.message).toContain("removal denied");
	});

	it("returns ok:false with current status when docker stop throws", async () => {
		const shell = makeShell();
		setRunning(shell);
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("running");
		expect(result.message).toContain("no programmed response");
	});

	it("returns ok:false with stopped status when docker rm throws after stop succeeds", async () => {
		const shell = makeShell();
		setRunning(shell);
		shell.setResponse("docker", ["stop", CONTAINER], {
			stdout: `${CONTAINER}\n`,
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("stopped");
		expect(result.message).toContain("no programmed response");
	});

	it("does not stop a running wrong-image container", async () => {
		const shell = makeShell();
		setRunning(shell, "attacker/kroki");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.message).toContain("image mismatch");
		expect(shell.calls.some((call) => call.args[0] === "stop")).toBe(false);
	});

	it("does not stop a running wrong-label container", async () => {
		const shell = makeShell();
		setRunning(shell, IMAGE, "other");
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.message).toContain("label mismatch");
		expect(shell.calls.some((call) => call.args[0] === "stop")).toBe(false);
	});

	it("returns ok:false when docker is not available", async () => {
		const shell = makeShell(); // no responses → throws
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
	});
});
