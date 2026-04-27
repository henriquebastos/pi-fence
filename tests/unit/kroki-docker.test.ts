/**
 * Unit tests for Docker Kroki lifecycle manager.
 */

import { describe, expect, it } from "vitest";

import { createKrokiDockerManager } from "../../extensions/pi-fence/kroki-docker.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

function makeShell() {
	return new FakeShellRunner();
}

describe("kroki-docker — status()", () => {
	it("reports running when docker inspect returns true", async () => {
		const shell = makeShell();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"], {
			stdout: "yuzutech/kroki\n",
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.status).toBe("running");
		expect(result.endpoint).toBe("http://localhost:8000");
	});

	it("reports error when the running container image is not the managed Kroki image", async () => {
		const shell = makeShell();
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
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.ok).toBe(false);
		expect(result.status).toBe("absent");
		expect(result.message).toBe("Container pi-fence-kroki image mismatch: expected yuzutech/kroki, got attacker/kroki.");
	});

	it("reports stopped when docker inspect returns false for the managed image", async () => {
		const shell = makeShell();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "false\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"], {
			stdout: "yuzutech/kroki\n",
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.status).toBe("stopped");
		expect(result.endpoint).toBeUndefined();
	});

	it("reports absent when docker inspect exits non-zero", async () => {
		const shell = makeShell();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "",
			stderr: "No such container",
			exitCode: 1,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.status();
		expect(result.status).toBe("absent");
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
	it("returns already-running when container is up", async () => {
		const shell = makeShell();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"], {
			stdout: "yuzutech/kroki\n",
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("running");
		expect(result.message).toContain("already running");
		expect(result.endpoint).toBe("http://localhost:8000");
	});

	it("does not start over a running wrong-image container", async () => {
		const shell = makeShell();
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
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(false);
		expect(result.message).toContain("image mismatch");
		expect(shell.calls.some((call) => call.args[0] === "run")).toBe(false);
	});

	it("runs docker run and returns endpoint on success", async () => {
		const shell = makeShell();
		// inspect → absent
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "",
			stderr: "No such container",
			exitCode: 1,
		});
		// docker run succeeds
		shell.setResponse("docker", ["run", "-d", "--name", "pi-fence-kroki", "-p", "8000:8000", "yuzutech/kroki"], {
			stdout: "abc123\n",
			stderr: "",
			exitCode: 0,
		});
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.start();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("running");
		expect(result.endpoint).toBe("http://localhost:8000");
	});
});

describe("kroki-docker — stop()", () => {
	it("stops and removes the managed container", async () => {
		const shell = makeShell();
		shell.setResponse("docker", ["inspect", "--format", "{{.State.Running}}", "pi-fence-kroki"], {
			stdout: "true\n",
			stderr: "",
			exitCode: 0,
		});
		shell.setResponse("docker", ["inspect", "--format", "{{.Config.Image}}", "pi-fence-kroki"], {
			stdout: "yuzutech/kroki\n",
			stderr: "",
			exitCode: 0,
		});
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
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(true);
		expect(result.status).toBe("absent");
		expect(result.message).toContain("Stopped");
	});

	it("does not stop a running wrong-image container", async () => {
		const shell = makeShell();
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
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
		expect(result.message).toContain("image mismatch");
		expect(shell.calls.some((call) => call.args[0] === "stop")).toBe(false);
	});

	it("returns ok:false when docker is not available", async () => {
		const shell = makeShell(); // no responses → throws
		const mgr = createKrokiDockerManager(shell);

		const result = await mgr.stop();
		expect(result.ok).toBe(false);
	});
});
