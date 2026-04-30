import { describe, expect, it } from "vitest";

import { createKrokiDockerManager } from "../../extensions/pi-fence/kroki-docker.ts";
import { createKrokiSandboxProcessor } from "../../extensions/pi-fence/kroki.ts";
import { NodeHttpClient } from "../../extensions/pi-fence/io/http-client.ts";
import { NodeShellRunner } from "../../extensions/pi-fence/io/shell-runner.ts";
import {
	createKrokiDockerComposeSandboxController,
	createKrokiDockerSandboxController,
} from "../../extensions/pi-fence/sandbox.ts";
import { hasContainer } from "../utilities/live-deps.ts";

const SINGLE_CONTAINER_NAME = "pi-fence-kroki";
const COMPOSE_CORE_CONTAINER_NAME = "pi-fence-kroki-core";
const COMPOSE_MERMAID_CONTAINER_NAME = "pi-fence-kroki-mermaid";

const singleContainerRunning = await hasContainer(SINGLE_CONTAINER_NAME);
const composeStackRunning =
	(await hasContainer(COMPOSE_CORE_CONTAINER_NAME)) &&
	(await hasContainer(COMPOSE_MERMAID_CONTAINER_NAME));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZE_FLOOR_BYTES = 500;

const GOOD_DOT = "digraph { A -> B -> C }";
const GOOD_MERMAID = "flowchart LR\nA --> B --> C";

function expectRealPng(bytes: Buffer): void {
	expect(bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)).toBe(true);
	expect(bytes.length).toBeGreaterThan(SIZE_FLOOR_BYTES);
}

describe.skipIf(!singleContainerRunning)("kroki-sandbox single-container — live", () => {
	const shell = new NodeShellRunner();
	const processor = createKrokiSandboxProcessor(
		new NodeHttpClient(),
		createKrokiDockerSandboxController(createKrokiDockerManager(shell)),
	);

	it("available() returns ok for the managed single Kroki container", async () => {
		await expect(processor.available()).resolves.toEqual({ ok: true });
	}, 15_000);

	it("renders Graphviz through the managed single Kroki container", async () => {
		const result = await processor.render("dot", GOOD_DOT);

		expect(result.kind).toBe("image");
		if (result.kind !== "image") return;
		expectRealPng(result.data);
	}, 20_000);
});

describe.skipIf(!composeStackRunning)("kroki-sandbox Compose stack — live", () => {
	const shell = new NodeShellRunner();
	const processor = createKrokiSandboxProcessor(
		new NodeHttpClient(),
		createKrokiDockerComposeSandboxController(shell),
	);

	it("available() returns ok for the managed Compose Kroki stack", async () => {
		await expect(processor.available()).resolves.toEqual({ ok: true });
	}, 15_000);

	it("renders Mermaid through the managed Compose Kroki stack", async () => {
		const result = await processor.render("mermaid", GOOD_MERMAID);

		expect(result.kind).toBe("image");
		if (result.kind !== "image") return;
		expectRealPng(result.data);
	}, 30_000);
});
