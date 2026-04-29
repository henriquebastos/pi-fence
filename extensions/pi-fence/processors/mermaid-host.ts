import { createMermaidLocalProcessor } from "../mermaid-local.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "mermaid-host",
	create: ({ shell, logger }) => createMermaidLocalProcessor(shell, logger),
};
