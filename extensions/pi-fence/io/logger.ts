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

/** No-op logger for factories that take an optional Logger. */
export const NULL_LOGGER: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

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

