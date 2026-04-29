import { createGraphvizLocalProcessor } from "../graphviz-local.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "graphviz-host",
	create: ({ shell, logger }) => createGraphvizLocalProcessor(shell, logger),
};
