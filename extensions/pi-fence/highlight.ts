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
			let j = i + 1;
			// Handle negation
			if (j < source.length && source[j] === "^") j++;
			// Handle ] as first char in class
			if (j < source.length && source[j] === "]") j++;
			while (j < source.length && source[j] !== "]") {
				if (source[j] === "\\" && j + 1 < source.length) j++; // skip escaped
				j++;
			}
			if (j < source.length) j++; // include closing ]
			result += ansi(CYAN, source.slice(i, j));
			i = j;
			continue;
		}

		// Groups
		if (ch === "(" || ch === ")") {
			result += ansi(RED, ch);
			i++;
			continue;
		}

		// Quantifiers
		if (ch === "*" || ch === "+" || ch === "?") {
			result += ansi(MAGENTA, ch);
			i++;
			continue;
		}

		// Curly quantifiers {n,m}
		if (ch === "{") {
			let j = i + 1;
			while (j < source.length && source[j] !== "}") j++;
			if (j < source.length) j++;
			result += ansi(MAGENTA, source.slice(i, j));
			i = j;
			continue;
		}

		// Anchors
		if (ch === "^" || ch === "$") {
			result += ansi(BOLD + RED, ch);
			i++;
			continue;
		}

		// Alternation
		if (ch === "|") {
			result += ansi(RED, ch);
			i++;
			continue;
		}

		result += ch;
		i++;
	}

	return result;
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
			let j = i + 1;
			while (j < source.length && source[j] !== '"') {
				if (source[j] === "\\" && j + 1 < source.length) j++;
				j++;
			}
			if (j < source.length) j++;
			result += ansi(GREEN, source.slice(i, j));
			i = j;
			continue;
		}

		// Comment
		if (ch === "#") {
			const end = source.indexOf("\n", i);
			const comment = end === -1 ? source.slice(i) : source.slice(i, end);
			result += ansi(DIM, comment);
			i += comment.length;
			continue;
		}

		// Pipe and operators
		if (ch === "|") {
			result += ansi(BOLD + YELLOW, ch);
			i++;
			continue;
		}

		// Dot accessor
		if (ch === ".") {
			// .field or .[n]
			if (i + 1 < source.length && /[a-zA-Z_[]/.test(source[i + 1])) {
				let j = i + 1;
				while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
				result += ansi(CYAN, source.slice(i, j));
				i = j;
			} else {
				result += ansi(CYAN, ch);
				i++;
			}
			continue;
		}

		// Number
		if (/\d/.test(ch) && (i === 0 || /[\s,|:([]/.test(source[i - 1]))) {
			let j = i;
			while (j < source.length && /[\d.]/.test(source[j])) j++;
			result += ansi(MAGENTA, source.slice(i, j));
			i = j;
			continue;
		}

		// Alt operator //
		if (ch === "/" && source[i + 1] === "/") {
			result += ansi(BOLD + YELLOW, "//");
			i += 2;
			continue;
		}

		// Word (potential builtin)
		if (/[a-zA-Z_]/.test(ch)) {
			let j = i;
			while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
			const word = source.slice(i, j);
			if (JQ_BUILTINS.has(word)) {
				result += ansi(BOLD + BLUE, word);
			} else {
				result += word;
			}
			i = j;
			continue;
		}

		result += ch;
		i++;
	}

	return result;
}
