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

import type { Availability, FenceProcessor, FenceResult } from "./processor.ts";

const MAX_CELL_WIDTH = 40;

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
		id: "table",
		tags: ["csv", "jsonl"],
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

			try {
				const { headers, rows } = tag === "jsonl"
					? parseJsonl(trimmed)
					: parseCsv(trimmed);

				if (rows.length === 0) {
					return { ok: false, error: `${tag}: no data rows` };
				}

				const text = formatTable(headers, rows);
				return { ok: true, text };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return { ok: false, error: message };
			}
		},
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

	return { headers, rows };
}

function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let i = 0;

	while (i <= line.length) {
		if (i === line.length) {
			fields.push("");
			break;
		}

		if (line[i] === '"') {
			// Quoted field.
			let value = "";
			i++; // skip opening quote
			while (i < line.length) {
				if (line[i] === '"') {
					if (i + 1 < line.length && line[i + 1] === '"') {
						// Escaped quote.
						value += '"';
						i += 2;
					} else {
						// Closing quote.
						i++; // skip closing quote
						break;
					}
				} else {
					value += line[i];
					i++;
				}
			}
			fields.push(value);
			// Skip comma after closing quote.
			if (i < line.length && line[i] === ",") i++;
		} else {
			// Unquoted field.
			const commaIdx = line.indexOf(",", i);
			if (commaIdx === -1) {
				fields.push(line.slice(i));
				break;
			}
			fields.push(line.slice(i, commaIdx));
			i = commaIdx + 1;
		}
	}

	return fields;
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
		headers.map((h) => {
			const v = obj[h];
			if (v === undefined || v === null) return "";
			if (typeof v === "object") return JSON.stringify(v);
			return String(v);
		}),
	);

	return { headers, rows };
}

// ── Table formatter ─────────────────────────────────────────────────

function formatTable(headers: string[], rows: string[][]): string {
	// Truncate all cells and compute column widths.
	const truncatedHeaders = headers.map(truncateCell);
	const truncatedRows = rows.map((row) =>
		headers.map((_, ci) => truncateCell(row[ci] ?? "")),
	);

	const colWidths = truncatedHeaders.map((h, ci) => {
		let max = h.length;
		for (const row of truncatedRows) {
			if (row[ci].length > max) max = row[ci].length;
		}
		return max;
	});

	const out: string[] = [];

	// Top border.
	out.push(horizontalLine(colWidths, BOX.tl, BOX.tt, BOX.tr));

	// Header row.
	out.push(dataRow(truncatedHeaders, colWidths));

	// Header separator.
	out.push(horizontalLine(colWidths, BOX.lt, BOX.x, BOX.rt));

	// Data rows.
	for (const row of truncatedRows) {
		out.push(dataRow(row, colWidths));
	}

	// Bottom border.
	out.push(horizontalLine(colWidths, BOX.bl, BOX.bt, BOX.br));

	return out.join("\n");
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

function splitLines(input: string): string[] {
	return input.replace(/\r\n?/g, "\n").split("\n");
}
