import { createColorProcessor } from "../color.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "color-embedded",
	create: () => createColorProcessor(),
};
