import {
	BUNDLE_SANDBOX_CONTAINER_NAME,
	BUNDLE_SANDBOX_IMAGE,
	BUNDLE_SANDBOX_LABELS,
} from "./bundle-sandbox.ts";
import type { PiFenceConfig } from "./config.ts";
import type { Logger } from "./io/logger.ts";
import type { ShellRunner } from "./io/shell-runner.ts";
import { createKrokiDockerManager } from "./kroki-docker.ts";
import {
	createDockerContainerSandboxController,
	createGondolinBundleSandboxController,
	createGondolinVMFactory,
	createKrokiDockerComposeSandboxController,
	createKrokiDockerSandboxController,
	type GondolinVMFactory,
	type SandboxController,
} from "./sandbox.ts";

export interface SandboxControllerDeps {
	shell: ShellRunner;
	logger: Logger;
	gondolin?: GondolinVMFactory;
}

export function createSandboxControllers(
	deps: SandboxControllerDeps,
	config: PiFenceConfig,
): ReadonlyMap<string, SandboxController> {
	const controllers = new Map<string, SandboxController>();
	const bundle = createBundleSandboxController(deps, config);
	if (bundle) controllers.set(bundle.id, bundle);
	const kroki = createKrokiServiceController(deps, config);
	if (kroki) controllers.set(kroki.id, kroki);
	return controllers;
}

function createBundleSandboxController(
	deps: SandboxControllerDeps,
	config: PiFenceConfig,
): SandboxController | undefined {
	const bundle = config.sandboxes?.bundle;
	if (bundle?.kind !== "exec") return undefined;
	if (bundle.runtime === "gondolin-vm") {
		return createGondolinBundleSandboxController(deps.gondolin ?? createGondolinVMFactory(), { image: bundle.image });
	}
	if (bundle.runtime !== "docker-container") return undefined;
	return createDockerContainerSandboxController(deps.shell, {
		id: "bundle",
		kind: "exec",
		containerName: BUNDLE_SANDBOX_CONTAINER_NAME,
		expectedImage: BUNDLE_SANDBOX_IMAGE,
		expectedLabels: BUNDLE_SANDBOX_LABELS,
		security: {
			networkMode: "none",
			noPublishedPorts: true,
			allowOnlyTmpfsMounts: true,
			requiredTmpfsMounts: ["/tmp"],
			capDropAll: true,
			noAddedCapabilities: true,
			notPrivileged: true,
			noNewPrivileges: true,
			forbidUnconfinedSeccomp: true,
		},
	});
}

function createKrokiServiceController(
	deps: SandboxControllerDeps,
	config: PiFenceConfig,
): SandboxController | undefined {
	const kroki = config.sandboxes?.kroki;
	if (kroki?.kind !== "service") return undefined;
	if (kroki.runtime === "docker-container") {
		return createKrokiDockerSandboxController(
			createKrokiDockerManager(deps.shell, deps.logger),
		);
	}
	if (kroki.runtime === "docker-compose") {
		return createKrokiDockerComposeSandboxController(deps.shell);
	}
	return undefined;
}
