import { describe, expect, it } from "vitest";

import { runFenceProcessorContract } from "./fence-processor.ts";

import { createBundleSandboxProcessor } from "../../extensions/pi-fence/bundle-sandbox.ts";
import type {
	ExecSandboxEnvironment,
	ExecSandboxRunOptions,
	ExecSandboxRunResult,
	ExecSandboxWorkspace,
	SandboxController,
} from "../../extensions/pi-fence/sandbox.ts";
import { sandboxStatus } from "../utilities/sandbox-status.ts";

const GOOD_DOT = "digraph { A -> B }";
const BAD_DOT = "digraph { A ->";
const GOOD_MERMAID = "flowchart LR\nA --> B";
const BAD_MERMAID = "flowchart LR\nA -->";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const MANIFEST = JSON.stringify({
	name: "pi-fence-bundle",
	version: "0.1.0",
	tools: {
		dot: { command: "dot", versionCommand: ["dot", "-V"] },
		mmdc: { command: "mmdc", versionCommand: ["mmdc", "--version"] },
	},
});

describe("bundle-sandbox contract fixtures", () => {
	it("covers the Graphviz and Mermaid bundle tools", () => {
		expect(GOOD_DOT).toContain("digraph");
		expect(GOOD_MERMAID).toContain("flowchart");
		expect(BAD_DOT).not.toBe(GOOD_DOT);
		expect(BAD_MERMAID).not.toBe(GOOD_MERMAID);
	});
});

class ContractWorkspace implements ExecSandboxWorkspace {
	source = "";

	path(name: string): string {
		return `/tmp/pi-fence-contract/${name}`;
	}

	async writeText(_name: string, contents: string): Promise<void> {
		this.source = contents;
	}

	async readBuffer(): Promise<Buffer> {
		return PNG;
	}

	async dispose(): Promise<void> {}
}

class ContractExecSandboxEnvironment implements ExecSandboxEnvironment {
	private workspace?: ContractWorkspace;

	async run(
		command: string,
		args: readonly string[],
		options: ExecSandboxRunOptions = {},
	): Promise<ExecSandboxRunResult> {
		if (options.signal?.aborted) throw new Error("aborted");
		if (command === "cat" && args[0] === "/opt/pi-fence-bundle/manifest.json") {
			return { stdout: MANIFEST, stderr: "", exitCode: 0 };
		}
		if (command === "dot" && args.join(" ") === "-V") {
			return { stdout: "", stderr: "dot - graphviz version 10.0.0", exitCode: 0 };
		}
		if (command === "mmdc" && args.join(" ") === "--version") {
			return { stdout: "11.0.0", stderr: "", exitCode: 0 };
		}
		if (command === "dot" && this.workspace?.source === GOOD_DOT) {
			return { stdout: "", stderr: "", exitCode: 0 };
		}
		if (command === "dot") {
			return { stdout: "", stderr: "syntax error", exitCode: 1 };
		}
		if (command === "mmdc" && this.workspace?.source === GOOD_MERMAID) {
			return { stdout: "", stderr: "", exitCode: 0 };
		}
		if (command === "mmdc") {
			return { stdout: "", stderr: "Parse error", exitCode: 1 };
		}
		throw new Error(`Unexpected exec call ${command} ${args.join(" ")}`);
	}

	async createWorkspace(): Promise<ExecSandboxWorkspace> {
		this.workspace = new ContractWorkspace();
		return this.workspace;
	}
}

const readyController: SandboxController = {
	id: "bundle",
	kind: "exec",
	runtime: "docker-container",
	status: async () => sandboxStatus({ state: "ready", message: "ready" }),
	start: async () => sandboxStatus({ state: "ready", message: "ready" }),
	stop: async () => sandboxStatus({ state: "stopped", message: "stopped" }),
};

runFenceProcessorContract(
	"bundle-sandbox graphviz",
	() => createBundleSandboxProcessor(readyController, new ContractExecSandboxEnvironment()),
	{
		tag: "graphviz",
		goodSource: GOOD_DOT,
		badSource: BAD_DOT,
	},
);

runFenceProcessorContract(
	"bundle-sandbox mermaid",
	() => createBundleSandboxProcessor(readyController, new ContractExecSandboxEnvironment()),
	{
		tag: "mermaid",
		goodSource: GOOD_MERMAID,
		badSource: BAD_MERMAID,
	},
);
