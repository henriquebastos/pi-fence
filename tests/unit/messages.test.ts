/**
 * Unit tests for `messages.ts` — specifically the `buildPiFenceOutputMessage`
 * builder's handling of the text output variant introduced in CV3.E1.S1.
 *
 * Image-output behaviour is already exercised end-to-end by the extension
 * tests; these tests pin the text-output branch directly.
 */

import { describe, expect, it } from "vitest";

import { buildPiFenceOutputMessage } from "../../extensions/pi-fence/messages.ts";
import type { FenceResult } from "../../extensions/pi-fence/processor.ts";

describe("buildPiFenceOutputMessage — text output", () => {
	it("emits a text content item for a text result", () => {
		const result: FenceResult = { ok: true, text: "| a | b |\n|---|---|\n| 1 | 2 |" };
		const msg = buildPiFenceOutputMessage("csv", "a,b\n1,2", "table", result);

		const items = msg.content as Array<{ type: string; text?: string; data?: string }>;
		expect(items).toHaveLength(1);
		expect(items[0].type).toBe("text");
		expect(items[0].text).toBe("| a | b |\n|---|---|\n| 1 | 2 |");
	});

	it("sets details.kind to ok for a text result", () => {
		const result: FenceResult = { ok: true, text: "table content" };
		const msg = buildPiFenceOutputMessage("jsonl", "{}", "table", result);

		expect((msg.details as Record<string, unknown>).kind).toBe("ok");
		expect((msg.details as Record<string, unknown>).tag).toBe("jsonl");
		expect((msg.details as Record<string, unknown>).processor).toBe("table");
	});

	it("still emits an image content item for a png result", () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const result: FenceResult = { ok: true, png };
		const msg = buildPiFenceOutputMessage("mermaid", "flowchart LR", "kroki", result);

		const items = msg.content as Array<{ type: string; data?: string; mimeType?: string }>;
		expect(items).toHaveLength(1);
		expect(items[0].type).toBe("image");
		expect(items[0].mimeType).toBe("image/png");
	});
});
