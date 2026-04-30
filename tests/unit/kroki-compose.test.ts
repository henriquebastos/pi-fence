import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
	KROKI_COMPOSE_FILE,
	KROKI_COMPOSE_PROJECT_NAME,
} from "../../extensions/pi-fence/sandbox.ts";

async function readComposeFile(): Promise<string> {
	return await readFile(new URL(`../../${KROKI_COMPOSE_FILE}`, import.meta.url), "utf8");
}

function coreServicePorts(compose: string): string[] {
	const ports: string[] = [];
	let inCoreService = false;
	let inPorts = false;
	for (const line of compose.split("\n")) {
		if (line === "  core:") {
			inCoreService = true;
			inPorts = false;
			continue;
		}
		if (inCoreService && line.startsWith("  ") && !line.startsWith("    ")) break;
		if (!inCoreService) continue;
		if (line === "    ports:") {
			inPorts = true;
			continue;
		}
		if (inPorts && !line.startsWith("      - ")) break;
		const match = line.match(/^      - "(.+)"$/);
		if (inPorts && match) ports.push(match[1]);
	}
	return ports;
}

describe("Kroki Compose sandbox stack contract", () => {
	it("commits the fixed Compose stack used by the sandbox controller", async () => {
		const compose = await readComposeFile();

		expect(KROKI_COMPOSE_PROJECT_NAME).toBe("pi-fence-kroki");
		expect(compose).toContain("name: pi-fence-kroki");
		expect(compose).toContain("container_name: pi-fence-kroki-core");
		expect(compose).toContain("container_name: pi-fence-kroki-mermaid");
		expect(compose).toContain("image: yuzutech/kroki");
		expect(compose).toContain("image: yuzutech/mermaid");
		expect(compose).toContain("pi-fence.sandbox: kroki");
		expect(coreServicePorts(compose)).toEqual(["127.0.0.1:8000:8000"]);
	});
});
