import {
	BUNDLE_SANDBOX_CONTAINER_NAME,
	createBundleSandboxProcessor,
} from "../bundle-sandbox.ts";
import type { ProcessorFactoryRegistration } from "../processor-factory.ts";
import { createDockerExecSandboxEnvironment } from "../sandbox.ts";

export const processorFactory: ProcessorFactoryRegistration = {
	id: "bundle-sandbox",
	create: ({ sandboxes, shell }) => {
		const controller = sandboxes.get("bundle");
		if (!controller) throw new Error("bundle sandbox controller is not configured");
		const env = createDockerExecSandboxEnvironment(shell, {
			containerName: BUNDLE_SANDBOX_CONTAINER_NAME,
		});
		return createBundleSandboxProcessor(controller, env);
	},
};
