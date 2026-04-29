import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	BUNDLE_SANDBOX_CONTAINER_NAME,
	BUNDLE_SANDBOX_IMAGE,
	BUNDLE_SANDBOX_LABELS,
	createBundleSandboxProcessor,
} from "../../extensions/pi-fence/bundle-sandbox.ts";
import { NodeShellRunner } from "../../extensions/pi-fence/io/shell-runner.ts";
import {
	createDockerContainerSandboxController,
	createDockerExecSandboxEnvironment,
	createGondolinBundleSandboxController,
	createGondolinVMFactory,
} from "../../extensions/pi-fence/sandbox.ts";
import { canStartLiveSandbox, gondolinBundleImageFromEnv, hasContainer } from "../utilities/live-deps.ts";

const containerRunning = await hasContainer(BUNDLE_SANDBOX_CONTAINER_NAME);
const gondolinBundleImage = gondolinBundleImageFromEnv();
const gondolinBundleReady = await canStartGondolinBundle(gondolinBundleImage);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZE_FLOOR_BYTES = 500;

const GOOD_DOT = "digraph { A -> B -> C }";
const GOOD_MERMAID = "flowchart LR\nA --> B --> C";

describe.skipIf(!containerRunning)("bundle-sandbox — live", () => {
	const shell = new NodeShellRunner();
	const controller = createDockerContainerSandboxController(shell, {
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
	const env = createDockerExecSandboxEnvironment(shell, {
		containerName: BUNDLE_SANDBOX_CONTAINER_NAME,
	});
	const processor = createBundleSandboxProcessor(controller, env);

	it("available() returns ok for the labelled bundle container", async () => {
		await expect(processor.available()).resolves.toEqual({ ok: true });
	}, 15_000);

	it("renders Graphviz through dot inside the bundle container", async () => {
		const result = await processor.render("dot", GOOD_DOT);

		expect(result.ok).toBe(true);
		if (!result.ok || !("png" in result)) return;
		expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
		expect(result.png.length).toBeGreaterThan(SIZE_FLOOR_BYTES);
	}, 15_000);

	it("renders Mermaid through mmdc inside the bundle container", async () => {
		const result = await processor.render("mermaid", GOOD_MERMAID);

		expect(result.ok).toBe(true);
		if (!result.ok || !("png" in result)) return;
		expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
		expect(result.png.length).toBeGreaterThan(SIZE_FLOOR_BYTES);
	}, 20_000);
});

describe.skipIf(!gondolinBundleReady)("bundle-sandbox — Gondolin live", () => {
	const controller = createGondolinBundleSandboxController(createGondolinVMFactory(), {
		image: gondolinBundleImage,
	});
	const env = controller.execEnvironment;
	if (!env) throw new Error("Gondolin bundle controller did not expose an exec environment");
	const processor = createBundleSandboxProcessor(controller, env);
	let started = false;

	beforeAll(async () => {
		const status = await controller.start();
		if (status.state !== "ready") throw new Error(status.message);
		started = true;
	}, 120_000);

	afterAll(async () => {
		if (started) await controller.stop();
	}, 30_000);

	it("available() returns ok for the configured Gondolin bundle image", async () => {
		await expect(processor.available()).resolves.toEqual({ ok: true });
	}, 30_000);

	it("renders Graphviz through dot inside the Gondolin bundle VM", async () => {
		const result = await processor.render("dot", GOOD_DOT);

		expect(result.ok).toBe(true);
		if (!result.ok || !("png" in result)) return;
		expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
		expect(result.png.length).toBeGreaterThan(SIZE_FLOOR_BYTES);
	}, 30_000);

	it("renders Mermaid through mmdc inside the Gondolin bundle VM", async () => {
		const result = await processor.render("mermaid", GOOD_MERMAID);

		expect(result.ok).toBe(true);
		if (!result.ok || !("png" in result)) return;
		expect(result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
		expect(result.png.length).toBeGreaterThan(SIZE_FLOOR_BYTES);
	}, 45_000);
});

async function canStartGondolinBundle(image: string | undefined): Promise<boolean> {
	if (image === undefined) return false;
	return canStartLiveSandbox(createGondolinBundleSandboxController(createGondolinVMFactory(), { image }));
}
