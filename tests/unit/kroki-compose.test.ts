import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
	KROKI_COMPOSE_FILE,
	KROKI_COMPOSE_PROJECT_NAME,
} from "../../extensions/pi-fence/sandbox.ts";

async function readComposeFile(): Promise<string> {
	return await readFile(new URL(`../../${KROKI_COMPOSE_FILE}`, import.meta.url), "utf8");
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
		expect(compose).toContain('"127.0.0.1:8000:8000"');
	});
});
