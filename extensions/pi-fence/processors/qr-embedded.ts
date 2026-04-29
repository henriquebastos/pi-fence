import type { ProcessorFactoryRegistration } from "../processor-factory.ts";
import { createQrProcessor } from "../qr.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "qr-embedded",
	create: () => createQrProcessor(),
};
