import { createKrokiProcessor, isDarkThemeName } from "../kroki.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "kroki-remote",
	create: ({ http, logger, themeState, config }) =>
		createKrokiProcessor(http, config.kroki?.endpoint, logger, () =>
			isDarkThemeName(themeState.currentName) ? "dark" : "light",
		),
};
