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

describe("buildPiFenceOutputMessage — explicit output", () => {
	it("emits image content for an explicit image output", () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const msg = buildPiFenceOutputMessage("mermaid", "flowchart LR", "kroki-remote", {
			kind: "image",
			data: png,
			mimeType: "image/png",
		});

		expect(msg.content).toEqual([{ type: "image", data: png.toString("base64"), mimeType: "image/png" }]);
		expect(msg.details).toMatchObject({
			kind: "ok",
			outputKind: "image",
			sourcePreview: { text: "flowchart LR", truncated: false },
		});
		expect(msg.details).not.toHaveProperty("source");
	});

	it("emits text content for an explicit text output", () => {
		const msg = buildPiFenceOutputMessage("csv", "a,b", "table-embedded", {
			kind: "text",
			text: "table content",
		});

		expect(msg.content).toEqual([{ type: "text", text: "table content" }]);
		expect(msg.details).toMatchObject({ kind: "ok", outputKind: "text" });
	});

	it("emits error content for an explicit error output", () => {
		const msg = buildPiFenceOutputMessage("mermaid", "bad", "kroki-remote", {
			kind: "error",
			error: "syntax",
		});

		expect(msg.content).toEqual([{ type: "text", text: "syntax" }]);
		expect(msg.details).toMatchObject({ kind: "error", outputKind: "error" });
	});

	it("stores only a bounded source preview in details", () => {
		const source = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
		const msg = buildPiFenceOutputMessage("mermaid", source, "kroki-remote", {
			kind: "text",
			text: "ok",
		}, { maxBytes: 80, maxLines: 5 });

		const details = msg.details as {
			source?: string;
			sourcePreview: { text: string; truncated: boolean; omittedBytes: number; omittedLines: number };
		};
		expect(details.source).toBeUndefined();
		expect(details.sourcePreview.text).not.toContain("line 49");
		expect(details.sourcePreview.truncated).toBe(true);
		expect(details.sourcePreview.omittedBytes).toBeGreaterThan(0);
		expect(details.sourcePreview.omittedLines).toBeGreaterThan(0);
	});
});

describe("buildPiFenceOutputMessage — legacy output", () => {
	it("emits a text content item for a text result", () => {
		const result: FenceResult = { ok: true, text: "| a | b |\n|---|---|\n| 1 | 2 |" };
		const msg = buildPiFenceOutputMessage("csv", "a,b\n1,2", "table-embedded", result);

		const items = msg.content as Array<{ type: string; text?: string; data?: string }>;
		expect(items).toHaveLength(1);
		expect(items[0].type).toBe("text");
		expect(items[0].text).toBe("| a | b |\n|---|---|\n| 1 | 2 |");
	});

	it("sets details.kind to ok for a text result", () => {
		const result: FenceResult = { ok: true, text: "table content" };
		const msg = buildPiFenceOutputMessage("jsonl", "{}", "table-embedded", result);

		expect((msg.details as Record<string, unknown>).kind).toBe("ok");
		expect((msg.details as Record<string, unknown>).tag).toBe("jsonl");
		expect((msg.details as Record<string, unknown>).processor).toBe("table-embedded");
	});

	it("still emits an image content item for a png result", () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const result: FenceResult = { ok: true, png };
		const msg = buildPiFenceOutputMessage("mermaid", "flowchart LR", "kroki-remote", result);

		const items = msg.content as Array<{ type: string; data?: string; mimeType?: string }>;
		expect(items).toHaveLength(1);
		expect(items[0].type).toBe("image");
		expect(items[0].mimeType).toBe("image/png");
	});
});
