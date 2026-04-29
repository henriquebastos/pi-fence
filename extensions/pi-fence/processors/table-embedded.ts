import type { ProcessorFactoryRegistration } from "../processor-factory.ts";
import { createTableProcessor } from "../table.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "table-embedded",
	create: () => createTableProcessor(),
};
