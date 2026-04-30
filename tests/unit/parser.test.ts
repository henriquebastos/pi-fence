/**
 * Unit tests for the fenced-block parser.
 *
 * These cases enumerate the contract the parser owes every caller:
 *   - Recognises both ``` and ~~~ fences.
 *   - Respects fence length (a fence of 4 backticks only closes on 4+).
 *   - Honours the tag allowlist (callers ask for ["mermaid"] only).
 *   - Preserves source order across multiple blocks.
 *   - Treats the block body as opaque — no nested-fence parsing.
 *   - Returns an empty array when there are no matches.
 *   - Tolerates trailing whitespace, missing final newline, CRLF.
 */

import { describe, expect, it } from "vitest";

import { extractFencedBlocks, extractFencedBlocksFromChunks } from "../../extensions/pi-fence/parser.ts";

describe("extractFencedBlocks", () => {
	it("parses incrementally across chunks without requiring a full markdown string", () => {
		const blocks = extractFencedBlocksFromChunks(
			["intro\n```mer", "maid\nflow", "chart LR\nA --> B\n```\n"],
			["mermaid"],
		);

		expect(blocks).toEqual([{ tag: "mermaid", source: "flowchart LR\nA --> B" }]);
	});

	it("can bound extracted source while preserving actual source byte count", () => {
		const blocks = extractFencedBlocks(
			"```mermaid\nééé\n```",
			["mermaid"],
			{ maxSourceBytes: 4 },
		);

		expect(blocks).toEqual([
			{
				tag: "mermaid",
				source: "éé",
				sourceBytes: 6,
				sourceTruncated: true,
			},
		]);
	});

	it("can stop after the requested number of matching blocks", () => {
		const blocks = extractFencedBlocks(
			"```mermaid\none\n```\n```graphviz\ntwo\n```",
			["mermaid", "graphviz"],
			{ maxBlocks: 1 },
		);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ tag: "mermaid", source: "one" });
	});

	it("finds a single mermaid block with backtick fences", () => {
		const md = [
			"Here is a diagram:",
			"",
			"```mermaid",
			"flowchart LR",
			"A --> B",
			"```",
			"",
			"That was it.",
		].join("\n");

		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toEqual([{ tag: "mermaid", source: "flowchart LR\nA --> B" }]);
	});

	it("recognises tilde fences", () => {
		const md = ["~~~mermaid", "flowchart LR", "A --> B", "~~~"].join("\n");
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].source).toBe("flowchart LR\nA --> B");
	});

	it("returns an empty array when no fences match the allowlist", () => {
		const md = "Just prose. No code.\n\nAnother line.";
		expect(extractFencedBlocks(md, ["mermaid"])).toEqual([]);
	});

	it("filters out blocks whose tag is not in the allowlist", () => {
		const md = [
			"```mermaid",
			"flowchart LR",
			"```",
			"",
			"```dot",
			"digraph {}",
			"```",
		].join("\n");

		const onlyMermaid = extractFencedBlocks(md, ["mermaid"]);
		expect(onlyMermaid).toHaveLength(1);
		expect(onlyMermaid[0].tag).toBe("mermaid");

		const both = extractFencedBlocks(md, ["mermaid", "dot"]);
		expect(both).toHaveLength(2);
		expect(both.map((b) => b.tag)).toEqual(["mermaid", "dot"]);
	});

	it("preserves source order across multiple matching blocks", () => {
		const md = [
			"```mermaid",
			"FIRST",
			"```",
			"",
			"prose in between",
			"",
			"```mermaid",
			"SECOND",
			"```",
			"",
			"```mermaid",
			"THIRD",
			"```",
		].join("\n");

		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks.map((b) => b.source)).toEqual(["FIRST", "SECOND", "THIRD"]);
	});

	it("respects fence length: a 4-backtick fence only closes on 4+ backticks", () => {
		// The body intentionally contains a 3-backtick line that must NOT
		// close the outer 4-backtick fence.
		const md = [
			"````mermaid",
			"inner content with a fake closer:",
			"```",
			"still inside the outer fence",
			"````",
		].join("\n");

		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].source).toContain("inner content with a fake closer");
		expect(blocks[0].source).toContain("still inside the outer fence");
		// The embedded 3-backtick line MUST be preserved in the body.
		expect(blocks[0].source).toContain("```");
	});

	it("handles CRLF line endings", () => {
		const md = "```mermaid\r\nflowchart LR\r\nA --> B\r\n```\r\n";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toHaveLength(1);
		// Source preserves the original inner lines verbatim, but the exact
		// line-ending normalisation is an impl detail — caller shouldn't
		// care. We assert on content, not byte-for-byte.
		expect(blocks[0].source).toMatch(/flowchart LR/);
		expect(blocks[0].source).toMatch(/A --> B/);
	});

	it("tolerates the markdown ending without a trailing newline", () => {
		const md = "```mermaid\nflowchart LR\nA --> B\n```";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toHaveLength(1);
	});

	it("ignores a fence that is never closed", () => {
		const md = "```mermaid\nflowchart LR\nA --> B\n\n(never closed)";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toEqual([]);
	});

	it("ignores fences with no tag when the caller asks for a specific tag", () => {
		const md = "```\nno tag here\n```";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toEqual([]);
	});

	it("treats the tag as case-sensitive — 'Mermaid' does not match 'mermaid'", () => {
		// Fence info strings in GFM are not tag-aliased; convention is
		// lowercase. Keeping strict matches mirrors every reference impl
		// (pi-mermaid, pi-graphviz) we studied.
		const md = "```Mermaid\nflowchart LR\n```";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toEqual([]);
	});

	it("tolerates leading whitespace on the opening fence", () => {
		// Markdown allows up to 3 spaces of indentation on the opening fence.
		const md = "   ```mermaid\nflowchart LR\n   ```";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].source).toContain("flowchart LR");
	});

	it("allows info-string suffix after the tag (e.g. `mermaid theme=dark`)", () => {
		// The parser returns the source verbatim; the tag is just the first
		// token. Meta parsing happens elsewhere (to be built later).
		const md = "```mermaid theme=dark\nflowchart LR\n```";
		const blocks = extractFencedBlocks(md, ["mermaid"]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].tag).toBe("mermaid");
		expect(blocks[0].source.trim()).toBe("flowchart LR");
	});
});
