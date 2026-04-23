/**
 * highlight processor — applies ANSI syntax highlighting to SQL, regex,
 * and jq fenced blocks. Pure logic, no external dependencies.
 *
 * Landing with CV3.E1.S2. Uses standard 16-color ANSI codes so output
 * adapts to any terminal theme.
 */

import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";

// ── ANSI helpers ────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";

function ansi(code: string, text: string): string {
	return `${code}${text}${RESET}`;
}

// ── Public factory ──────────────────────────────────────────────────

export function createHighlightProcessor(): FenceProcessor {
	return {
		id: "highlight",
		tags: ["sql", "regex", "jq"],
		aliases: {},

		async available(): Promise<Availability> {
			return { ok: true };
		},

		async render(tag, source, signal): Promise<FenceResult> {
			if (signal?.aborted) {
				return { ok: false, error: "Aborted before render" };
			}

			const trimmed = source.trim();
			if (trimmed.length === 0) {
				return { ok: false, error: `${tag}: empty input` };
			}

			const highlighter = HIGHLIGHTERS[tag];
			if (!highlighter) {
				return { ok: false, error: `${tag}: unsupported language` };
			}

			const text = highlighter(trimmed);
			return { ok: true, text };
		},
	};
}

const HIGHLIGHTERS: Record<string, (source: string) => string> = {
	sql: highlightSql,
	regex: highlightRegex,
	jq: highlightJq,
};

// ── SQL highlighter ─────────────────────────────────────────────────

const SQL_KEYWORDS = new Set([
	"SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET",
	"DELETE", "CREATE", "DROP", "ALTER", "TABLE", "INDEX", "VIEW",
	"JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "CROSS", "ON",
	"AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "IS",
	"NULL", "AS", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET",
	"UNION", "ALL", "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END",
	"ASC", "DESC", "COUNT", "SUM", "AVG", "MIN", "MAX",
	"PRIMARY", "KEY", "FOREIGN", "REFERENCES", "CONSTRAINT",
	"BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION",
	"IF", "ELSE", "WHILE", "FOR", "RETURN",
	"INT", "INTEGER", "VARCHAR", "TEXT", "BOOLEAN", "DATE", "TIMESTAMP",
	"FLOAT", "DOUBLE", "DECIMAL", "CHAR", "SERIAL", "BIGINT",
	"TRUE", "FALSE", "DEFAULT", "UNIQUE", "CHECK", "CASCADE",
	"WITH", "RECURSIVE", "OVER", "PARTITION", "ROW", "ROWS",
	"WINDOW", "FETCH", "NEXT", "FIRST", "LAST", "ONLY",
]);

function highlightSql(source: string): string {
	let result = "";
	let i = 0;

	while (i < source.length) {
		// Line comment: --
		if (source[i] === "-" && source[i + 1] === "-") {
			const end = source.indexOf("\n", i);
			const comment = end === -1 ? source.slice(i) : source.slice(i, end);
			result += ansi(DIM, comment);
			i += comment.length;
			continue;
		}

		// Block comment: /* ... */
		if (source[i] === "/" && source[i + 1] === "*") {
			const end = source.indexOf("*/", i + 2);
			const comment = end === -1 ? source.slice(i) : source.slice(i, end + 2);
			result += ansi(DIM, comment);
			i += comment.length;
			continue;
		}

		// Single-quoted string
		if (source[i] === "'") {
			let j = i + 1;
			while (j < source.length) {
				if (source[j] === "'" && source[j + 1] === "'") {
					j += 2; // escaped quote
				} else if (source[j] === "'") {
					j++;
					break;
				} else {
					j++;
				}
			}
			result += ansi(GREEN, source.slice(i, j));
			i = j;
			continue;
		}

		// Number
		if (/\d/.test(source[i]) && (i === 0 || /[\s,=(]/.test(source[i - 1]))) {
			let j = i;
			while (j < source.length && /[\d.]/.test(source[j])) j++;
			result += ansi(MAGENTA, source.slice(i, j));
			i = j;
			continue;
		}

		// Word (potential keyword)
		if (/[a-zA-Z_]/.test(source[i])) {
			let j = i;
			while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
			const word = source.slice(i, j);
			if (SQL_KEYWORDS.has(word.toUpperCase())) {
				result += ansi(BOLD + BLUE, word);
			} else {
				result += word;
			}
			i = j;
			continue;
		}

		result += source[i];
		i++;
	}

	return result;
}

// ── regex highlighter ───────────────────────────────────────────────

function highlightRegex(source: string): string {
	let result = "";
	let i = 0;

	while (i < source.length) {
		const ch = source[i];

		// Escape sequence
		if (ch === "\\" && i + 1 < source.length) {
			result += ansi(YELLOW, source.slice(i, i + 2));
			i += 2;
			continue;
		}

		// Character class [...]
		if (ch === "[") {
			const end = scanCharClass(source, i);
			result += ansi(CYAN, source.slice(i, end));
			i = end;
			continue;
		}

		// Curly quantifiers {n,m}
		if (ch === "{") {
			const end = scanDelimited(source, i, "}");
			result += ansi(MAGENTA, source.slice(i, end));
			i = end;
			continue;
		}

		const color = REGEX_SINGLE_CHAR_COLORS[ch];
		if (color) {
			result += ansi(color, ch);
			i++;
			continue;
		}

		result += ch;
		i++;
	}

	return result;
}

const REGEX_SINGLE_CHAR_COLORS: Record<string, string> = {
	"(": RED, ")": RED, "|": RED,
	"*": MAGENTA, "+": MAGENTA, "?": MAGENTA,
	"^": BOLD + RED, "$": BOLD + RED,
};

/** Scan a regex character class `[...]`, returning the index after the closing `]`. */
function scanCharClass(source: string, start: number): number {
	let j = start + 1;
	if (j < source.length && source[j] === "^") j++;
	if (j < source.length && source[j] === "]") j++;
	while (j < source.length && source[j] !== "]") {
		if (source[j] === "\\" && j + 1 < source.length) j++;
		j++;
	}
	if (j < source.length) j++;
	return j;
}

/** Scan to a closing delimiter, returning the index after it (or end of string). */
function scanDelimited(source: string, start: number, closer: string): number {
	let j = start + 1;
	while (j < source.length && source[j] !== closer) j++;
	if (j < source.length) j++;
	return j;
}

// ── jq highlighter ──────────────────────────────────────────────────

const JQ_BUILTINS = new Set([
	"select", "map", "map_values", "empty", "length", "keys", "keys_unsorted",
	"values", "has", "in", "contains", "inside",
	"add", "any", "all", "flatten", "range", "floor", "ceil", "round",
	"tostring", "tonumber", "ascii_downcase", "ascii_upcase",
	"ltrimstr", "rtrimstr", "startswith", "endswith", "split", "join",
	"test", "match", "capture", "scan", "sub", "gsub",
	"type", "infinite", "nan", "isinfinite", "isnan", "isnormal",
	"sort", "sort_by", "group_by", "unique", "unique_by", "max_by", "min_by",
	"to_entries", "from_entries", "with_entries", "transpose",
	"recurse", "recurse_down", "env", "debug", "input", "inputs",
	"limit", "first", "last", "nth", "not", "if", "then", "else", "elif",
	"end", "try", "catch", "reduce", "foreach", "label", "break",
	"def", "as", "import", "include", "and", "or", "null", "true", "false",
]);

function highlightJq(source: string): string {
	let result = "";
	let i = 0;

	while (i < source.length) {
		const ch = source[i];

		// String
		if (ch === '"') {
			const end = scanDoubleQuotedString(source, i);
			result += ansi(GREEN, source.slice(i, end));
			i = end;
			continue;
		}

		// Comment
		if (ch === "#") {
			const comment = scanLineComment(source, i);
			result += ansi(DIM, comment);
			i += comment.length;
			continue;
		}

		// Alt operator //
		if (ch === "/" && source[i + 1] === "/") {
			result += ansi(BOLD + YELLOW, "//");
			i += 2;
			continue;
		}

		// Pipe
		if (ch === "|") {
			result += ansi(BOLD + YELLOW, ch);
			i++;
			continue;
		}

		// Dot accessor
		if (ch === ".") {
			const end = scanDotAccessor(source, i);
			result += ansi(CYAN, source.slice(i, end));
			i = end;
			continue;
		}

		// Number
		if (/\d/.test(ch) && (i === 0 || /[\s,|:([]/.test(source[i - 1]))) {
			const end = scanNumber(source, i);
			result += ansi(MAGENTA, source.slice(i, end));
			i = end;
			continue;
		}

		// Word (potential builtin)
		if (/[a-zA-Z_]/.test(ch)) {
			const end = scanWord(source, i);
			const word = source.slice(i, end);
			result += JQ_BUILTINS.has(word) ? ansi(BOLD + BLUE, word) : word;
			i = end;
			continue;
		}

		result += ch;
		i++;
	}

	return result;
}

// ── Shared scan helpers ─────────────────────────────────────────────

function scanDoubleQuotedString(source: string, start: number): number {
	let j = start + 1;
	while (j < source.length && source[j] !== '"') {
		if (source[j] === "\\" && j + 1 < source.length) j++;
		j++;
	}
	if (j < source.length) j++;
	return j;
}

function scanLineComment(source: string, start: number): string {
	const end = source.indexOf("\n", start);
	return end === -1 ? source.slice(start) : source.slice(start, end);
}

function scanDotAccessor(source: string, start: number): number {
	if (start + 1 < source.length && /[a-zA-Z_[]/.test(source[start + 1])) {
		let j = start + 1;
		while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
		return j;
	}
	return start + 1;
}

function scanNumber(source: string, start: number): number {
	let j = start;
	while (j < source.length && /[\d.]/.test(source[j])) j++;
	return j;
}

function scanWord(source: string, start: number): number {
	let j = start;
	while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
	return j;
}
