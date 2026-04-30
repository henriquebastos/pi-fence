import { describe, expect, it } from "vitest";

import {
	BUILT_IN_PROCESSOR_MODULES,
	createBuiltInProcessors,
} from "../../extensions/pi-fence/built-in-processors.ts";
import { DEFAULT_CONFIG, type PiFenceConfig } from "../../extensions/pi-fence/config.ts";
import { resolvePiFencePolicy } from "../../extensions/pi-fence/policy.ts";
import { processorFactory as bundleSandboxProcessorFactory } from "../../extensions/pi-fence/processors/bundle-sandbox.ts";
import {
	collectProcessorFactories,
	createProcessorsFromFactories,
	type ProcessorFactoryContext,
} from "../../extensions/pi-fence/processor-factory.ts";
import { resolveProcessor } from "../../extensions/pi-fence/resolve.ts";
import {
	type ExecSandboxEnvironment,
	type ExecSandboxRunOptions,
	type ExecSandboxRunResult,
	type SandboxController,
} from "../../extensions/pi-fence/sandbox.ts";
import { createSandboxControllers } from "../../extensions/pi-fence/sandbox-context.ts";
import { FakeHttpClient } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

function makeContext(config: PiFenceConfig = DEFAULT_CONFIG): ProcessorFactoryContext {
	const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
	const logger = new FakeLogger();
	const policy = resolvePiFencePolicy(config);
	return {
		http: new FakeHttpClient({ status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("png") }),
		shell,
		logger,
		themeState: {},
		policy: policy.processorFactories,
		sandboxes: createSandboxControllers({ shell, logger }, policy),
	};
}

async function createProcessorsFromReversedFactories() {
	const collection = collectProcessorFactories([...BUILT_IN_PROCESSOR_MODULES].reverse());
	expect(collection.diagnostics).toEqual([]);
	const creation = await createProcessorsFromFactories(collection.factories, makeContext());
	expect(creation.diagnostics).toEqual([]);
	return creation.processors;
}

function allAvailable(processors: Awaited<ReturnType<typeof createProcessorsFromReversedFactories>>) {
	return new Map(processors.map((processor) => [processor.id, { ok: true } as const]));
}

class CapturingExecSandboxEnvironment implements ExecSandboxEnvironment {
	readonly runs: Array<{ command: string; args: readonly string[]; options?: ExecSandboxRunOptions }> = [];

	async run(
		command: string,
		args: readonly string[],
		options?: ExecSandboxRunOptions,
	): Promise<ExecSandboxRunResult> {
		this.runs.push({ command, args, options });
		return { stdout: "png", stdoutBuffer: Buffer.from("png"), stderr: "", exitCode: 0 };
	}

	async createWorkspace(): Promise<never> {
		throw new Error("not needed in this test");
	}
}

describe("built-in processor factory manifest", () => {
	it("collects valid standard processorFactory exports", () => {
		const result = collectProcessorFactories(BUILT_IN_PROCESSOR_MODULES);

		expect(result.diagnostics).toEqual([]);
		expect(result.factories.map((factory) => factory.id).sort()).toEqual([
			"bundle-sandbox",
			"color-embedded",
			"graphviz-host",
			"highlight-embedded",
			"kroki-remote",
			"kroki-sandbox",
			"mermaid-host",
			"qr-embedded",
			"table-embedded",
		]);
	});

	it("creates the default built-in processors through factory context", async () => {
		const result = await createBuiltInProcessors(makeContext());

		expect(result.diagnostics).toEqual([]);
		expect(result.processors.map((processor) => processor.id).sort()).toEqual([
			"bundle-sandbox",
			"color-embedded",
			"graphviz-host",
			"highlight-embedded",
			"kroki-remote",
			"kroki-sandbox",
			"mermaid-host",
			"qr-embedded",
			"table-embedded",
		]);
	});

	it("omits sandbox processors when sandbox controllers are not configured", async () => {
		const result = await createBuiltInProcessors(makeContext({ ...DEFAULT_CONFIG, sandboxes: {} }));

		expect(result.diagnostics).toEqual([]);
		expect(result.processors.map((processor) => processor.id).sort()).toEqual([
			"color-embedded",
			"graphviz-host",
			"highlight-embedded",
			"kroki-remote",
			"mermaid-host",
			"qr-embedded",
			"table-embedded",
		]);
	});

	it("uses a Gondolin controller-provided exec environment for bundle-sandbox", async () => {
		const env = new CapturingExecSandboxEnvironment();
		const controller: SandboxController = {
			id: "bundle",
			kind: "exec",
			runtime: "gondolin-vm",
			execEnvironment: env,
			status: async () => ({ state: "ready", message: "ready" }),
			start: async () => ({ state: "ready", message: "ready" }),
			stop: async () => ({ state: "stopped", message: "stopped" }),
		};
		const context = makeContext({ ...DEFAULT_CONFIG, sandboxes: { bundle: { kind: "exec", runtime: "gondolin-vm" } } });
		const processor = await bundleSandboxProcessorFactory.create({
			...context,
			sandboxes: new Map([["bundle", controller]]),
		});

		const result = await processor.render("dot", "digraph { A -> B }");

		expect(result.kind).toBe("image");
		expect(env.runs).toEqual([
			{
				command: "dot",
				args: ["-Tpng"],
				options: expect.objectContaining({ input: "digraph { A -> B }" }),
			},
		]);
	});

	it("keeps cross-placement selection independent from factory collection order", async () => {
		const processors = await createProcessorsFromReversedFactories();
		const availability = allAvailable(processors);

		const resolved = resolveProcessor(
			processors,
			availability,
			"dot",
			undefined,
			undefined,
			["embedded", "host", "sandbox", "remote"],
		);

		expect(resolved.processor?.id).toBe("graphviz-host");
	});

	it("keeps same-placement factory conflicts ambiguous until bound", async () => {
		const processors = await createProcessorsFromReversedFactories();
		const availability = allAvailable(processors);

		const resolved = resolveProcessor(
			processors,
			availability,
			"dot",
			undefined,
			undefined,
			["sandbox", "remote"],
		);

		expect(resolved.processor).toBeNull();
		expect(resolved.ambiguity).toEqual({
			placement: "sandbox",
			processorIds: ["kroki-sandbox", "bundle-sandbox"],
		});
	});
});

describe("createSandboxControllers", () => {
	it("creates default bundle and Kroki service controllers", () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const logger = new FakeLogger();

		const sandboxes = createSandboxControllers({ shell, logger }, resolvePiFencePolicy(DEFAULT_CONFIG));

		expect([...sandboxes.keys()].sort()).toEqual(["bundle", "kroki"]);
		expect(sandboxes.get("bundle")).toMatchObject({ id: "bundle", kind: "exec", runtime: "docker-container" });
		expect(sandboxes.get("kroki")).toMatchObject({ id: "kroki", kind: "service", runtime: "docker-container" });
	});

	it("creates the Gondolin bundle controller when configured", () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const logger = new FakeLogger();
		const config: PiFenceConfig = {
			...DEFAULT_CONFIG,
			sandboxes: {
				bundle: { kind: "exec", runtime: "gondolin-vm", image: "pi-fence-bundle:0.1.0" },
			},
		};

		const sandboxes = createSandboxControllers({ shell, logger }, resolvePiFencePolicy(config));

		expect([...sandboxes.keys()]).toEqual(["bundle"]);
		expect(sandboxes.get("bundle")).toMatchObject({ id: "bundle", kind: "exec", runtime: "gondolin-vm" });
		expect(sandboxes.get("bundle")?.execEnvironment).toBeDefined();
	});

	it("creates the Compose Kroki controller when configured", () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const logger = new FakeLogger();
		const config: PiFenceConfig = {
			...DEFAULT_CONFIG,
			sandboxes: {
				kroki: { kind: "service", runtime: "docker-compose" },
			},
		};

		const sandboxes = createSandboxControllers({ shell, logger }, resolvePiFencePolicy(config));

		expect([...sandboxes.keys()]).toEqual(["kroki"]);
		expect(sandboxes.get("kroki")).toMatchObject({ id: "kroki", kind: "service", runtime: "docker-compose" });
	});
});
