import { runFenceProcessorContract } from "./fence-processor.ts";

import { createBundleSandboxProcessor } from "../../extensions/pi-fence/bundle-sandbox.ts";
import type {
	ExecSandboxEnvironment,
	ExecSandboxRunOptions,
	ExecSandboxRunResult,
	ExecSandboxWorkspace,
	SandboxController,
} from "../../extensions/pi-fence/sandbox.ts";

const GOOD_DOT = "digraph { A -> B }";
const BAD_DOT = "digraph { A ->";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const MANIFEST = JSON.stringify({
	name: "pi-fence-bundle",
	version: "0.1.0",
	tools: {
		dot: { command: "dot", versionCommand: ["dot", "-V"] },
		mmdc: { command: "mmdc", versionCommand: ["mmdc", "--version"] },
	},
});

class ContractExecSandboxEnvironment implements ExecSandboxEnvironment {
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
		if (command === "dot" && args.join(" ") === "-Tpng" && options.input === GOOD_DOT) {
			return { stdout: PNG.toString("binary"), stdoutBuffer: PNG, stderr: "", exitCode: 0 };
		}
		if (command === "dot" && args.join(" ") === "-Tpng") {
			return { stdout: "", stderr: "syntax error", exitCode: 1 };
		}
		throw new Error(`Unexpected exec call ${command} ${args.join(" ")}`);
	}

	async createWorkspace(): Promise<ExecSandboxWorkspace> {
		throw new Error("workspace not used by graphviz contract");
	}
}

const readyController: SandboxController = {
	id: "bundle",
	kind: "exec",
	runtime: "docker-container",
	status: async () => ({ state: "ready", message: "ready" }),
	start: async () => ({ state: "ready", message: "ready" }),
	stop: async () => ({ state: "stopped", message: "stopped" }),
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
