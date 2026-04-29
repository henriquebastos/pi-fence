import { describe, expect, it } from "vitest";

import {
	collectProcessorFactories,
	createProcessorsFromFactories,
	type ProcessorFactoryContext,
	type ProcessorFactoryRegistration,
	type ProcessorFactoryModuleRecord,
} from "../../extensions/pi-fence/processor-factory.ts";
import type { FenceProcessor } from "../../extensions/pi-fence/processor.ts";

function makeProcessor(id: string): FenceProcessor {
	return {
		id,
		placement: "embedded",
		tags: [id],
		aliases: {},
		available: async () => ({ ok: true }),
		render: async () => ({ ok: true, text: id }),
	};
}

function makeFactory(id: string, create = () => makeProcessor(id)): ProcessorFactoryRegistration {
	return { id, create };
}

function moduleRecord(name: string, processorFactory: unknown): ProcessorFactoryModuleRecord {
	return { name, module: { processorFactory } };
}

const context: ProcessorFactoryContext = {
	http: {
		request: async () => ({ status: 200, headers: {}, body: Buffer.alloc(0) }),
	},
	shell: {
		run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
	},
	logger: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	},
	themeState: {},
	config: { bindings: {} },
	sandboxes: new Map(),
};

describe("collectProcessorFactories", () => {
	it("collects valid standard processorFactory exports", () => {
		const first = makeFactory("table-embedded");
		const second = makeFactory("kroki-remote");

		const result = collectProcessorFactories([
			moduleRecord("table", first),
			moduleRecord("kroki", second),
		]);

		expect(result.factories).toEqual([first, second]);
		expect(result.diagnostics).toEqual([]);
	});

	it("rejects modules without a processorFactory export", () => {
		const result = collectProcessorFactories([{ name: "missing", module: {} }]);

		expect(result.factories).toEqual([]);
		expect(result.diagnostics).toEqual([
			{
				moduleName: "missing",
				message: "missing processorFactory export",
			},
		]);
	});

	it("rejects invalid processorFactory shapes", () => {
		const result = collectProcessorFactories([
			moduleRecord("bad-id", { id: "", create: () => makeProcessor("bad-id") }),
			moduleRecord("bad-create", { id: "bad-create", create: "nope" }),
		]);

		expect(result.factories).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			"processorFactory.id must be a non-empty string",
			"processorFactory.create must be a function",
		]);
	});

	it("rejects duplicate factory ids before creation", () => {
		const result = collectProcessorFactories([
			moduleRecord("one", makeFactory("table-embedded")),
			moduleRecord("two", makeFactory("table-embedded")),
		]);

		expect(result.factories.map((factory) => factory.id)).toEqual(["table-embedded"]);
		expect(result.diagnostics).toEqual([
			{
				moduleName: "two",
				factoryId: "table-embedded",
				message: "duplicate processorFactory id table-embedded",
			},
		]);
	});

	it("rejects precedence-like metadata on factory registrations", () => {
		const result = collectProcessorFactories([
			moduleRecord("ordered", { ...makeFactory("ordered"), order: 10 }),
			moduleRecord("prioritized", { ...makeFactory("prioritized"), priority: 1 }),
			moduleRecord("precedence", { ...makeFactory("precedence"), processorPrecedence: ["embedded"] }),
		]);

		expect(result.factories).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			"processorFactory must not declare order",
			"processorFactory must not declare priority",
			"processorFactory must not declare processorPrecedence",
		]);
	});
});

describe("createProcessorsFromFactories", () => {
	it("creates processors through collected factories", async () => {
		const result = await createProcessorsFromFactories([
			makeFactory("table-embedded"),
			makeFactory("kroki-remote"),
		], context);

		expect(result.processors.map((processor) => processor.id)).toEqual([
			"table-embedded",
			"kroki-remote",
		]);
		expect(result.diagnostics).toEqual([]);
	});

	it("reports create failures without throwing or keeping the failed processor", async () => {
		const result = await createProcessorsFromFactories([
			makeFactory("ok"),
			makeFactory("boom", () => {
				throw new Error("factory exploded");
			}),
		], context);

		expect(result.processors.map((processor) => processor.id)).toEqual(["ok"]);
		expect(result.diagnostics).toEqual([
			{
				factoryId: "boom",
				message: "processorFactory boom create failed: factory exploded",
			},
		]);
	});

	it("reports processors that fail the FenceProcessor contract validation", async () => {
		const badFactory = {
			id: "bad-processor",
			create: () => ({ id: "bad-processor" }),
		} as unknown as ProcessorFactoryRegistration;

		const result = await createProcessorsFromFactories([badFactory], context);

		expect(result.processors).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({
			factoryId: "bad-processor",
		});
		expect(result.diagnostics[0]?.message).toContain("invalid processor from factory bad-processor");
	});
});
