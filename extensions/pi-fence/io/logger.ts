/**
 * Logger — production-owned diagnostic seam for pi-fence runtime code.
 *
 * Production adapters import the contract and `NodeLogger` from here.
 * Test capture stays under `tests/utilities/`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
	level: LogLevel;
	subsystem: string;
	message: string;
	meta?: Record<string, unknown>;
	timestamp: number;
}

export interface Logger {
	debug(subsystem: string, message: string, meta?: Record<string, unknown>): void;
	info(subsystem: string, message: string, meta?: Record<string, unknown>): void;
	warn(subsystem: string, message: string, meta?: Record<string, unknown>): void;
	error(subsystem: string, message: string, meta?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export function shouldLog(threshold: LogLevel, entryLevel: LogLevel): boolean {
	const thresholdRank =
		threshold in LEVEL_ORDER ? LEVEL_ORDER[threshold] : LEVEL_ORDER.info;
	return LEVEL_ORDER[entryLevel] >= thresholdRank;
}

function thresholdFromEnv(): LogLevel {
	const raw = process.env.PI_FENCE_LOG_LEVEL;
	if (raw && raw in LEVEL_ORDER) return raw as LogLevel;
	return "info";
}

/**
 * Production logger. Writes to process.stderr. Each call is a single line
 * terminated with `\n`. Meta (when provided) is JSON-serialised at the end.
 */
export class NodeLogger implements Logger {
	debug(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.write("debug", subsystem, message, meta);
	}
	info(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.write("info", subsystem, message, meta);
	}
	warn(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.write("warn", subsystem, message, meta);
	}
	error(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.write("error", subsystem, message, meta);
	}

	private write(
		level: LogLevel,
		subsystem: string,
		message: string,
		meta?: Record<string, unknown>,
	): void {
		if (!shouldLog(thresholdFromEnv(), level)) return;
		const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
		process.stderr.write(`[pi-fence:${subsystem}] ${level}: ${message}${metaStr}\n`);
	}
}
