import * as bundleSandbox from "./processors/bundle-sandbox.ts";
import * as colorEmbedded from "./processors/color-embedded.ts";
import * as graphvizHost from "./processors/graphviz-host.ts";
import * as highlightEmbedded from "./processors/highlight-embedded.ts";
import * as krokiRemote from "./processors/kroki-remote.ts";
import * as krokiSandbox from "./processors/kroki-sandbox.ts";
import * as mermaidHost from "./processors/mermaid-host.ts";
import * as qrEmbedded from "./processors/qr-embedded.ts";
import * as tableEmbedded from "./processors/table-embedded.ts";
import {
	createProcessorsFromFactoryModules,
	type ProcessorFactoryContext,
	type ProcessorFactoryCreationResult,
	type ProcessorFactoryModuleRecord,
} from "./processor-factory.ts";

export const BUILT_IN_PROCESSOR_MODULES: readonly ProcessorFactoryModuleRecord[] = [
	{ name: "graphviz-host", module: graphvizHost },
	{ name: "mermaid-host", module: mermaidHost },
	{ name: "table-embedded", module: tableEmbedded },
	{ name: "highlight-embedded", module: highlightEmbedded },
	{ name: "qr-embedded", module: qrEmbedded },
	{ name: "color-embedded", module: colorEmbedded },
	{ name: "bundle-sandbox", module: bundleSandbox },
	{ name: "kroki-sandbox", module: krokiSandbox },
	{ name: "kroki-remote", module: krokiRemote },
];

export async function createBuiltInProcessors(
	context: ProcessorFactoryContext,
): Promise<ProcessorFactoryCreationResult> {
	return createProcessorsFromFactoryModules(builtInModulesForContext(context), context);
}

function builtInModulesForContext(
	context: ProcessorFactoryContext,
): readonly ProcessorFactoryModuleRecord[] {
	return BUILT_IN_PROCESSOR_MODULES.filter((record) =>
		isConfiguredSandboxFactory(record, context) || !isSandboxFactory(record.name),
	);
}

function isConfiguredSandboxFactory(
	record: ProcessorFactoryModuleRecord,
	context: ProcessorFactoryContext,
): boolean {
	if (record.name === "bundle-sandbox") return context.sandboxes.has("bundle");
	if (record.name === "kroki-sandbox") return context.sandboxes.has("kroki");
	return false;
}

function isSandboxFactory(name: string): boolean {
	return name === "bundle-sandbox" || name === "kroki-sandbox";
}
