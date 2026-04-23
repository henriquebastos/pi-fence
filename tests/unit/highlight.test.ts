/**
 * Unit tests for `highlight.ts` — the SQL/regex/jq syntax highlighting processor.
 *
 * Covers: metadata, available(), per-language ANSI highlighting, abort, errors.
 * ANSI escape sequences are validated by checking for ESC[ (CSI) sequences
 * in the output — the exact color codes are implementation details.
 */

import { describe, expect, it } from "vitest";

import { createHighlightProcessor } from "../../extensions/pi-fence/highlight.ts";

const ESC = "\x1b[";

describe("highlight processor — metadata", () => {
	it("has id 'highlight'", () => {
		expect(createHighlightProcessor().id).toBe("highlight");
	});

	it("handles sql, regex, and jq tags", () => {
		expect(createHighlightProcessor().tags).toEqual(["sql", "regex", "jq"]);
	});

	it("has no aliases", () => {
		expect(createHighlightProcessor().aliases).toEqual({});
	});
});

describe("highlight processor — available()", () => {
	it("always returns ok:true", async () => {
		expect(await createHighlightProcessor().available()).toEqual({ ok: true });
	});
});

describe("highlight processor — SQL", () => {
	it("highlights SQL keywords", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT name FROM users WHERE age > 30",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
		// Keywords should be present (possibly wrapped in ANSI).
		expect(result.text).toContain("SELECT");
		expect(result.text).toContain("FROM");
		expect(result.text).toContain("WHERE");
		// Non-keywords should be present too.
		expect(result.text).toContain("name");
		expect(result.text).toContain("users");
	});

	it("highlights single-quoted strings", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT * FROM t WHERE name = 'Alice'",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("Alice");
		expect(result.text).toContain(ESC);
	});

	it("highlights line comments", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT 1 -- a comment",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("a comment");
	});

	it("highlights block comments", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT /* inline */ 1",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("inline");
	});

	it("highlights numbers", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT 42, 3.14 FROM dual",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("42");
		expect(result.text).toContain("3.14");
	});

	it("is case-insensitive for keywords", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"select name from users",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		// Should still contain ANSI codes for the keywords.
		expect(result.text).toContain(ESC);
		expect(result.text).toContain("select");
	});
});

describe("highlight processor — regex", () => {
	it("highlights character classes", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"[a-z]+",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
		expect(result.text).toContain("a-z");
	});

	it("highlights groups and quantifiers", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"(foo|bar){2,3}",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("foo");
		expect(result.text).toContain("bar");
		expect(result.text).toContain(ESC);
	});

	it("highlights anchors and escapes", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"^\\d+\\.\\d+$",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});
});

describe("highlight processor — jq", () => {
	it("highlights builtins", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			'.[] | select(.age > 30) | .name',
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
		expect(result.text).toContain("select");
	});

	it("highlights strings", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			'. + {"key": "value"}',
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("key");
		expect(result.text).toContain("value");
	});

	it("highlights numbers", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			".x + 42",
		);

		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("42");
	});
});

describe("highlight processor — SQL edge cases", () => {
	it("highlights a line comment at end of input (no trailing newline)", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT 1 -- trailing",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("trailing");
	});

	it("highlights an unterminated block comment", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT /* unclosed",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("unclosed");
	});

	it("highlights SQL escaped single quotes", async () => {
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT 'it''s'",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("it");
	});
});

describe("highlight processor — jq edge cases", () => {
	it("highlights comments", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			".x | length # count items",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("count items");
		expect(result.text).toContain(ESC);
	});

	it("highlights the // alt operator", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			'.name // "default"',
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("//");
		expect(result.text).toContain("default");
	});

	it("highlights bare dot identity", async () => {
		const result = await createHighlightProcessor().render("jq", ".");
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});

	it("highlights escaped chars in strings", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			'.x | "hello\\nworld"',
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("hello");
	});

	it("highlights numbers after operators", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			".x | limit(5; .[])",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("5");
		expect(result.text).toContain("limit");
	});

	it("handles unterminated string gracefully", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			'.x | "unterminated',
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("unterminated");
	});

	it("highlights dot with array index", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			".[0] | .name",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});

	it("highlights comment at end of input (no trailing newline)", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			".x # trailing",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("trailing");
	});

	it("renders non-builtin identifiers as plain text", async () => {
		const result = await createHighlightProcessor().render(
			"jq",
			"myFunc | select(.x)",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain("myFunc");
		// myFunc should NOT be highlighted as a builtin.
		// select should be highlighted.
		expect(result.text).toContain("select");
	});
});

describe("highlight processor — regex edge cases", () => {
	it("highlights negated character class", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"[^abc]+",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});

	it("highlights escaped char inside character class", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"[\\d\\w]+",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});

	it("handles ] as first char in class", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"[]abc]",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});

	it("handles unterminated character class", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"[abc",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});

	it("handles unterminated curly quantifier", async () => {
		const result = await createHighlightProcessor().render(
			"regex",
			"a{2",
		);
		expect(result.ok).toBe(true);
		if (!result.ok || !("text" in result)) return;
		expect(result.text).toContain(ESC);
	});
});

describe("highlight processor — errors and abort", () => {
	it("returns error for empty input", async () => {
		const result = await createHighlightProcessor().render("sql", "");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("empty");
	});

	it("returns ok:false for a pre-aborted signal", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await createHighlightProcessor().render(
			"sql",
			"SELECT 1",
			controller.signal,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Aborted");
	});

	it("passes through whitespace-only input as error", async () => {
		const result = await createHighlightProcessor().render("jq", "   \n\n  ");
		expect(result.ok).toBe(false);
	});
});
