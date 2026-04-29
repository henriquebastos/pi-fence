import { describe, expect, it } from "vitest";

import {
	BUILT_IN_PROCESSOR_MODULES,
	createBuiltInProcessors,
} from "../../extensions/pi-fence/built-in-processors.ts";
import { DEFAULT_CONFIG, type PiFenceConfig } from "../../extensions/pi-fence/config.ts";
import { collectProcessorFactories, type ProcessorFactoryContext } from "../../extensions/pi-fence/processor-factory.ts";
import { createSandboxControllers } from "../../extensions/pi-fence/sandbox-context.ts";
import { FakeHttpClient } from "../utilities/http-client.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { FakeShellRunner } from "../utilities/shell-runner.ts";

function makeContext(config: PiFenceConfig = DEFAULT_CONFIG): ProcessorFactoryContext {
	const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
	const logger = new FakeLogger();
	return {
		http: new FakeHttpClient({ status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("png") }),
		shell,
		logger,
		themeState: {},
		config,
		sandboxes: createSandboxControllers({ shell, logger }, config),
	};
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
});

describe("createSandboxControllers", () => {
	it("creates default bundle and Kroki service controllers", () => {
		const shell = new FakeShellRunner({ stdout: "", stderr: "", exitCode: 0 });
		const logger = new FakeLogger();

		const sandboxes = createSandboxControllers({ shell, logger }, DEFAULT_CONFIG);

		expect([...sandboxes.keys()].sort()).toEqual(["bundle", "kroki"]);
		expect(sandboxes.get("bundle")).toMatchObject({ id: "bundle", kind: "exec", runtime: "docker-container" });
		expect(sandboxes.get("kroki")).toMatchObject({ id: "kroki", kind: "service", runtime: "docker-container" });
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

		const sandboxes = createSandboxControllers({ shell, logger }, config);

		expect([...sandboxes.keys()]).toEqual(["kroki"]);
		expect(sandboxes.get("kroki")).toMatchObject({ id: "kroki", kind: "service", runtime: "docker-compose" });
	});
});
