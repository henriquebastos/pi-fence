import { createHighlightProcessor } from "../highlight.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "highlight-embedded",
	create: () => createHighlightProcessor(),
};
