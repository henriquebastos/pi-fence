/**
 * table processor — renders CSV and JSONL fenced blocks as Unicode
 * box-drawing tables in the terminal. The first non-image processor
 * in pi-fence, landing with CV3.E1.S1.
 *
 * Pure logic: no external binary, no HTTP, no filesystem. Always
 * available. Tags: `csv`, `jsonl`.
 *
 * CSV parsing: comma-separated, RFC 4180 quoted fields (double-quote
 * escaping), first row as headers.
 *
 * JSONL parsing: one JSON object per line, union of all keys as
 * headers (insertion order from first appearance), missing keys →
 * empty cell, non-primitive values → JSON.stringify.
 *
 * Table formatting: Unicode box-drawing borders, column-aligned,
 * cell values truncated at MAX_CELL_WIDTH.
 */

import { errorOutput, textOutput, withRenderGuards, type Availability, type FenceOutput, type FenceProcessor } from "./processor.ts";

const MAX_CELL_WIDTH = 40;

export const DEFAULT_TABLE_MAX_ROWS = 1000;
export const DEFAULT_TABLE_MAX_COLUMNS = 100;
export const DEFAULT_TABLE_MAX_CELLS = 50_000;
export const DEFAULT_TABLE_MAX_CELL_BYTES = 8192;

// ── Box-drawing characters ──────────────────────────────────────────

const BOX = {
	tl: "┌", tr: "┐", bl: "└", br: "┘",
	h: "─", v: "│",
	lt: "├", rt: "┤", tt: "┬", bt: "┴",
	x: "┼",
} as const;

// ── Public factory ──────────────────────────────────────────────────

export function createTableProcessor(): FenceProcessor {
	return {
		id: "table-embedded",
		placement: "embedded",
		tags: ["csv", "jsonl"],
		aliases: {},

		async available(): Promise<Availability> {
			return { ok: true };
		},

		render: withRenderGuards(async (tag, source): Promise<FenceOutput> => {
			try {
				const { headers, rows } = tag === "jsonl"
					? parseJsonl(source)
					: parseCsv(source);

				if (rows.length === 0) {
					return errorOutput(`${tag}: no data rows`);
				}

				const text = formatTable(headers, rows);
				return textOutput(text);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return errorOutput(message);
			}
		}),
	};
}

// ── CSV parser ──────────────────────────────────────────────────────

interface ParsedTable {
	headers: string[];
	rows: string[][];
}

function parseCsv(input: string): ParsedTable {
	const lines = splitLines(input);
	if (lines.length === 0) throw new Error("csv: empty input");

	const allRows = lines.map(parseCsvLine);
	const headers = allRows[0];
	const rows = allRows.slice(1);
	assertTableShape("csv", headers, rows);

	return { headers, rows };
}

interface CsvField {
	value: string;
	next: number;
}

function parseCsvLine(line: string): string[] {
	if (line.length === 0) return [""];

	const fields: string[] = [];
	let i = 0;
	while (i < line.length) {
		const field = parseNextCsvField(line, i);
		fields.push(field.value);
		i = field.next;
	}
	return line.endsWith(",") ? [...fields, ""] : fields;
}

function parseNextCsvField(line: string, start: number): CsvField {
	return line[start] === '"'
		? parseQuotedCsvField(line, start)
		: parseUnquotedCsvField(line, start);
}

function parseQuotedCsvField(line: string, start: number): CsvField {
	let value = "";
	let i = start + 1;

	while (i < line.length) {
		const char = line[i];
		if (char !== '"') {
			value += char;
			i++;
			continue;
		}
		if (line[i + 1] === '"') {
			value += '"';
			i += 2;
			continue;
		}
		i++;
		break;
	}

	return { value, next: skipCsvComma(line, i) };
}

function parseUnquotedCsvField(line: string, start: number): CsvField {
	const commaIdx = line.indexOf(",", start);
	return commaIdx === -1
		? { value: line.slice(start), next: line.length }
		: { value: line.slice(start, commaIdx), next: commaIdx + 1 };
}

function skipCsvComma(line: string, index: number): number {
	return line[index] === "," ? index + 1 : index;
}

// ── JSONL parser ────────────────────────────────────────────────────

function parseJsonl(input: string): ParsedTable {
	const lines = splitLines(input);
	const objects: Record<string, unknown>[] = [];
	const headerSet = new Set<string>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.length === 0) continue;

		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			throw new Error(`jsonl: invalid JSON on line ${i + 1}`);
		}

		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error(`jsonl: line ${i + 1} is not a JSON object`);
		}

		const obj = parsed as Record<string, unknown>;
		objects.push(obj);
		for (const key of Object.keys(obj)) headerSet.add(key);
	}

	if (objects.length === 0) throw new Error("jsonl: no valid objects");

	const headers = [...headerSet];
	const rows = objects.map((obj) =>
		headers.map((h) => formatJsonCell(obj[h])),
	);
	assertTableShape("jsonl", headers, rows);

	return { headers, rows };
}

// ── Table limits ────────────────────────────────────────────────────

function assertTableShape(tag: string, headers: string[], rows: string[][]): void {
	if (rows.length > DEFAULT_TABLE_MAX_ROWS) {
		throw new Error(`${tag} row count is too large: ${rows.length} rows exceeds limit of ${DEFAULT_TABLE_MAX_ROWS}`);
	}
	const widestRow = Math.max(headers.length, ...rows.map((row) => row.length));
	if (widestRow > DEFAULT_TABLE_MAX_COLUMNS) {
		throw new Error(`${tag} column count is too large: ${widestRow} columns exceeds limit of ${DEFAULT_TABLE_MAX_COLUMNS}`);
	}
	const cellCount = headers.length + rows.reduce((sum, row) => sum + row.length, 0);
	if (cellCount > DEFAULT_TABLE_MAX_CELLS) {
		throw new Error(`${tag} cell count is too large: ${cellCount} cells exceeds limit of ${DEFAULT_TABLE_MAX_CELLS}`);
	}
	assertCellBytes(tag, headers);
	for (const row of rows) assertCellBytes(tag, row);
}

function assertCellBytes(tag: string, cells: string[]): void {
	for (const cell of cells) {
		const cellBytes = Buffer.byteLength(cell, "utf8");
		if (cellBytes > DEFAULT_TABLE_MAX_CELL_BYTES) {
			throw new Error(`${tag} cell is too large: ${cellBytes} bytes exceeds limit of ${DEFAULT_TABLE_MAX_CELL_BYTES}`);
		}
	}
}

// ── Table formatter ─────────────────────────────────────────────────

function formatTable(headers: string[], rows: string[][]): string {
	// Truncate all cells and compute column widths.
	const truncatedHeaders = headers.map(truncateCell);
	const truncatedRows = rows.map((row) =>
		headers.map((_, ci) => truncateCell(row[ci] ?? "")),
	);
	const colWidths = columnWidths(truncatedHeaders, truncatedRows);

	return [
		horizontalLine(colWidths, BOX.tl, BOX.tt, BOX.tr),
		dataRow(truncatedHeaders, colWidths),
		horizontalLine(colWidths, BOX.lt, BOX.x, BOX.rt),
		...truncatedRows.map((row) => dataRow(row, colWidths)),
		horizontalLine(colWidths, BOX.bl, BOX.bt, BOX.br),
	].join("\n");
}

function horizontalLine(widths: number[], left: string, mid: string, right: string): string {
	const segments = widths.map((w) => BOX.h.repeat(w + 2));
	return left + segments.join(mid) + right;
}

function dataRow(cells: string[], widths: number[]): string {
	const padded = cells.map((cell, i) => ` ${cell.padEnd(widths[i])} `);
	return BOX.v + padded.join(BOX.v) + BOX.v;
}

function truncateCell(value: string): string {
	if (value.length <= MAX_CELL_WIDTH) return value;
	return value.slice(0, MAX_CELL_WIDTH - 1) + "…";
}

function formatJsonCell(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value) ?? "";
}

function columnWidths(headers: string[], rows: string[][]): number[] {
	return headers.map((header, ci) =>
		Math.max(header.length, ...rows.map((row) => row[ci].length)),
	);
}

function splitLines(input: string): string[] {
	return input.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}
