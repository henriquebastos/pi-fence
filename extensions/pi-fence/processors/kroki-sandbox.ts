import { createKrokiSandboxProcessor, isDarkThemeName } from "../kroki.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "kroki-sandbox",
	create: ({ http, logger, sandboxes, themeState, policy }) => {
		const controller = sandboxes.get("kroki");
		if (!controller) throw new Error("Kroki sandbox controller is not configured");
		return createKrokiSandboxProcessor(http, controller, logger, () =>
			isDarkThemeName(themeState.currentName) ? "dark" : "light",
		policy.renderLimits.processorOutputMaxBytes,
		);
	},
};
