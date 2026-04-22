import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

interface CrapFunctionReport {
	complexity: number;
	functionDescriptor: string;
	statements: {
		coverage: number;
		crap: number;
	};
}

type CrapFileReport = Record<string, CrapFunctionReport>;
type CrapReport = Record<string, CrapFileReport>;

interface Row {
	file: string;
	fn: string;
	complexity: number;
	coveragePct: number;
	crap: number;
}

const TOP_N = 10;
const FILE_WIDTH = 28;
const FUNCTION_WIDTH = 36;

function main(): void {
	const tempDir = mkdtempSync(join(tmpdir(), "pi-fence-crap-ext-"));
	const reportPath = join(tempDir, "crap-report.json");
	try {
		const result = spawnSync(getPnpmCommand(), [
			"exec",
			"crap",
			"--json",
			reportPath,
			"--verbosity=silent",
			"coverage/coverage-final.json",
		], {
			encoding: "utf8",
		});
		if (result.status !== 0) {
			if (result.stderr.length > 0) {
				process.stderr.write(result.stderr);
			}
			if (result.stdout.length > 0) {
				process.stdout.write(result.stdout);
			}
			process.exit(result.status ?? 1);
		}

		const report = JSON.parse(readFileSync(reportPath, "utf8")) as CrapReport;
		printReport(report);
	} finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
}

function getPnpmCommand(): string {
	return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function printReport(report: CrapReport): void {
	const rows = flattenReport(report).sort((a, b) => {
		if (b.crap !== a.crap) return b.crap - a.crap;
		if (b.complexity !== a.complexity) return b.complexity - a.complexity;
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return a.fn.localeCompare(b.fn);
	});

	const shown = rows.slice(0, TOP_N);
	console.log(`CRAP(ext): ${rows.length} functions | top ${shown.length} by CRAP`);
	if (shown.length === 0) {
		console.log("(no functions reported)");
		return;
	}

	const header = [
		pad("File", FILE_WIDTH),
		pad("Function", FUNCTION_WIDTH),
		padStart("CC", 4),
		padStart("Cov%", 7),
		padStart("CRAP", 8),
	].join("  ");
	console.log(header);
	console.log("-".repeat(header.length));
	for (const row of shown) {
		console.log(
			[
				pad(truncate(row.file, FILE_WIDTH), FILE_WIDTH),
				pad(truncate(row.fn, FUNCTION_WIDTH), FUNCTION_WIDTH),
				padStart(String(row.complexity), 4),
				padStart(`${row.coveragePct.toFixed(1)}%`, 7),
				padStart(row.crap.toFixed(2), 8),
			].join("  "),
		);
	}
}

function flattenReport(report: CrapReport): Row[] {
	const rows: Row[] = [];
	for (const [file, functions] of Object.entries(report)) {
		for (const [fn, details] of Object.entries(functions)) {
			rows.push({
				file,
				fn,
				complexity: details.complexity,
				coveragePct: details.statements.coverage * 100,
				crap: details.statements.crap,
			});
		}
	}
	return rows;
}

function truncate(value: string, width: number): string {
	if (value.length <= width) return value;
	if (width <= 1) return value.slice(0, width);
	return `${value.slice(0, width - 1)}…`;
}

function pad(value: string, width: number): string {
	return value.padEnd(width, " ");
}

function padStart(value: string, width: number): string {
	return value.padStart(width, " ");
}

main();
