/**
 * Unit tests for `table.ts` — the CSV/JSONL → formatted table processor.
 *
 * Covers: CSV parsing, JSONL parsing, table formatting (box-drawing,
 * alignment, truncation), available(), render() happy/error/abort paths.
 */

import { describe, expect, it } from "vitest";

import { createTableProcessor } from "../../extensions/pi-fence/table.ts";

describe("table processor — available()", () => {
	it("always returns ok:true (pure logic, no external deps)", async () => {
		const processor = createTableProcessor();
		const availability = await processor.available();
		expect(availability).toEqual({ ok: true });
	});
});

describe("table processor — metadata", () => {
	it("has id 'table'", () => {
		const processor = createTableProcessor();
		expect(processor.id).toBe("table");
	});

	it("handles csv and jsonl tags", () => {
		const processor = createTableProcessor();
		expect(processor.tags).toEqual(["csv", "jsonl"]);
	});

	it("has no aliases", () => {
		const processor = createTableProcessor();
		expect(processor.aliases).toEqual({});
	});
});

describe("table processor — render CSV", () => {
	it("renders a simple CSV as a Unicode box table", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", "name,age\nAlice,30\nBob,25");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;

		// Should contain box-drawing characters and data.
		expect(result.text).toContain("name");
		expect(result.text).toContain("age");
		expect(result.text).toContain("Alice");
		expect(result.text).toContain("30");
		expect(result.text).toContain("Bob");
		expect(result.text).toContain("25");
		expect(result.text).toContain("─");
		expect(result.text).toContain("│");
	});

	it("handles quoted fields with commas", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", 'city,pop\n"New York",8336817\nTokyo,13960000');

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("New York");
	});

	it("handles quoted fields with escaped quotes", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", 'name,note\nAlice,"said ""hi"""\nBob,ok');

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain('said "hi"');
	});

	it("handles empty cells", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", "a,b,c\n1,,3\n,,");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("a");
		// Table should render without crashing on empty cells.
		const lines = result.text.split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(5); // header + separator + 2 rows + borders
	});

	it("returns error for empty input", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", "");

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("empty");
	});

	it("returns error for header-only CSV (no data rows)", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", "a,b,c");

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("no data");
	});

	it("aligns columns to the widest cell in each column", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("csv", "x,long_header\n1,2");

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;

		// Each row line should have the same length (padded columns).
		const contentLines = result.text
			.split("\n")
			.filter((l) => l.includes("│"));
		const lengths = contentLines.map((l) => l.length);
		expect(new Set(lengths).size).toBe(1);
	});

	it("truncates cell values exceeding 40 characters", async () => {
		const processor = createTableProcessor();
		const longValue = "A".repeat(60);
		const result = await processor.render("csv", `col\n${longValue}`);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("…");
		expect(result.text).not.toContain(longValue);
	});
});

describe("table processor — render JSONL", () => {
	it("renders flat JSONL objects as a table", async () => {
		const processor = createTableProcessor();
		const source = '{"name":"Alice","age":30}\n{"name":"Bob","age":25}';
		const result = await processor.render("jsonl", source);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("name");
		expect(result.text).toContain("age");
		expect(result.text).toContain("Alice");
		expect(result.text).toContain("30");
	});

	it("handles missing keys (empty cell)", async () => {
		const processor = createTableProcessor();
		const source = '{"a":1,"b":2}\n{"a":3}';
		const result = await processor.render("jsonl", source);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("a");
		expect(result.text).toContain("b");
	});

	it("stringifies non-primitive values", async () => {
		const processor = createTableProcessor();
		const source = '{"id":1,"meta":{"nested":true}}';
		const result = await processor.render("jsonl", source);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("meta");
		// Nested object should appear as JSON string.
		expect(result.text).toContain("{");
	});

	it("returns error for invalid JSON lines", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("jsonl", "not json\nalso not json");

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
	});

	it("returns error for empty JSONL input", async () => {
		const processor = createTableProcessor();
		const result = await processor.render("jsonl", "");

		expect(result.ok).toBe(false);
	});

	it("unions all keys from all rows as headers", async () => {
		const processor = createTableProcessor();
		const source = '{"a":1}\n{"b":2}\n{"a":3,"c":4}';
		const result = await processor.render("jsonl", source);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("a");
		expect(result.text).toContain("b");
		expect(result.text).toContain("c");
	});
});

describe("table processor — abort", () => {
	it("returns ok:false for a pre-aborted signal", async () => {
		const processor = createTableProcessor();
		const controller = new AbortController();
		controller.abort();
		const result = await processor.render("csv", "a,b\n1,2", controller.signal);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Aborted");
	});
});
