/**
 * highlight processor — applies ANSI syntax highlighting to SQL, regex,
 * and jq fenced blocks. Pure logic, no external dependencies.
 *
 * Landing with CV3.E1.S2. Uses standard 16-color ANSI codes so output
 * adapts to any terminal theme.
 */

import { withRenderGuards, type Availability, type FenceProcessor, type FenceResult } from "./processor.ts";

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
		placement: "embedded",
		tags: ["sql", "regex", "jq"],
		aliases: {},

		async available(): Promise<Availability> {
			return { ok: true };
		},

		render: withRenderGuards(async (tag, source): Promise<FenceResult> => {
			const highlighter = HIGHLIGHTERS[tag];
			if (!highlighter) {
				return { ok: false, error: `${tag}: unsupported language` };
			}

			const text = highlighter(source);
			return { ok: true, text };
		}),
	};
}

const HIGHLIGHTERS: Record<string, (source: string) => string> = {
	sql: highlightSql,
	regex: highlightRegex,
	jq: highlightJq,
};

interface HighlightMatch {
	text: string;
	end: number;
}

type HighlightRule = (source: string, index: number) => HighlightMatch | null;

function highlightWithRules(source: string, rules: readonly HighlightRule[]): string {
	let result = "";
	let i = 0;

	while (i < source.length) {
		const match = firstHighlightMatch(source, i, rules);
		if (match) {
			result += match.text;
			i = match.end;
		} else {
			result += source[i];
			i++;
		}
	}

	return result;
}

function firstHighlightMatch(
	source: string,
	index: number,
	rules: readonly HighlightRule[],
): HighlightMatch | null {
	for (const rule of rules) {
		const match = rule(source, index);
		if (match) return match;
	}
	return null;
}

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

const SQL_RULES: readonly HighlightRule[] = [
	sqlLineCommentRule,
	sqlBlockCommentRule,
	sqlStringRule,
	sqlNumberRule,
	sqlWordRule,
];

function highlightSql(source: string): string {
	return highlightWithRules(source, SQL_RULES);
}

function sqlLineCommentRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== "-" || source[index + 1] !== "-") return null;
	const comment = scanLineComment(source, index);
	return { text: ansi(DIM, comment), end: index + comment.length };
}

function sqlBlockCommentRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== "/" || source[index + 1] !== "*") return null;
	const end = source.indexOf("*/", index + 2);
	const comment = end === -1 ? source.slice(index) : source.slice(index, end + 2);
	return { text: ansi(DIM, comment), end: index + comment.length };
}

function sqlStringRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== "'") return null;
	const end = scanSqlString(source, index);
	return { text: ansi(GREEN, source.slice(index, end)), end };
}

function scanSqlString(source: string, start: number): number {
	let j = start + 1;
	while (j < source.length) {
		if (source[j] === "'" && source[j + 1] === "'") {
			j += 2;
		} else if (source[j] === "'") {
			return j + 1;
		} else {
			j++;
		}
	}
	return j;
}

function sqlNumberRule(source: string, index: number): HighlightMatch | null {
	if (!isNumberStart(source, index)) return null;
	const end = scanNumber(source, index);
	return { text: ansi(MAGENTA, source.slice(index, end)), end };
}

function isNumberStart(source: string, index: number): boolean {
	return /\d/.test(source[index]) && (index === 0 || /[\s,=(]/.test(source[index - 1]));
}

function sqlWordRule(source: string, index: number): HighlightMatch | null {
	if (!/[a-zA-Z_]/.test(source[index])) return null;
	const end = scanWord(source, index);
	const word = source.slice(index, end);
	return {
		text: SQL_KEYWORDS.has(word.toUpperCase()) ? ansi(BOLD + BLUE, word) : word,
		end,
	};
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

const JQ_RULES: readonly HighlightRule[] = [
	jqStringRule,
	jqCommentRule,
	jqAltOperatorRule,
	jqPipeRule,
	jqDotAccessorRule,
	jqNumberRule,
	jqWordRule,
];

function highlightJq(source: string): string {
	return highlightWithRules(source, JQ_RULES);
}

function jqStringRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== '"') return null;
	const end = scanDoubleQuotedString(source, index);
	return { text: ansi(GREEN, source.slice(index, end)), end };
}

function jqCommentRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== "#") return null;
	const comment = scanLineComment(source, index);
	return { text: ansi(DIM, comment), end: index + comment.length };
}

function jqAltOperatorRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== "/" || source[index + 1] !== "/") return null;
	return { text: ansi(BOLD + YELLOW, "//"), end: index + 2 };
}

function jqPipeRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== "|") return null;
	return { text: ansi(BOLD + YELLOW, source[index]), end: index + 1 };
}

function jqDotAccessorRule(source: string, index: number): HighlightMatch | null {
	if (source[index] !== ".") return null;
	const end = scanDotAccessor(source, index);
	return { text: ansi(CYAN, source.slice(index, end)), end };
}

function jqNumberRule(source: string, index: number): HighlightMatch | null {
	if (!isJqNumberStart(source, index)) return null;
	const end = scanNumber(source, index);
	return { text: ansi(MAGENTA, source.slice(index, end)), end };
}

function isJqNumberStart(source: string, index: number): boolean {
	return /\d/.test(source[index]) && (index === 0 || /[\s,|:([]/.test(source[index - 1]));
}

function jqWordRule(source: string, index: number): HighlightMatch | null {
	if (!/[a-zA-Z_]/.test(source[index])) return null;
	const end = scanWord(source, index);
	const word = source.slice(index, end);
	return {
		text: JQ_BUILTINS.has(word) ? ansi(BOLD + BLUE, word) : word,
		end,
	};
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
		while (j < source.length && /\w/.test(source[j])) j++;
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
	while (j < source.length && /\w/.test(source[j])) j++;
	return j;
}
