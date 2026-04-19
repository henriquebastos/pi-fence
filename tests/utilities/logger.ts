/**
 * Logger — diagnostic seam for pi-fence.
 *
 * Production writes structured lines to stderr, filtered by
 * `PI_FENCE_LOG_LEVEL` (default `info`). Tests capture every entry in memory
 * so assertions can inspect the whole log timeline.
 *
 * Lives under `tests/utilities/` for S0. Promoted to
 * `extensions/pi-fence/io/` in a later refactor story.
 *
 * Line format for NodeLogger:
 *   [pi-fence:<subsystem>] <level>: <message> [<json-meta>]\n
 *
 * `ctx.ui.notify()` is a separate channel — user-facing. Logger is for
 * developers and for `/fence trace` inspection.
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

// ---------------------------------------------------------------------------
// Level filter
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Decide whether `entryLevel` should be emitted given a threshold.
 * Unknown thresholds fall back to `info` — a garbled env var produces
 * predictable output, not a silent mute.
 */
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

// ---------------------------------------------------------------------------
// NodeLogger
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FakeLogger
// ---------------------------------------------------------------------------

/**
 * Test logger. Captures every entry in memory. Thresholding does not apply
 * — tests want the whole picture. Convenience filters are provided for
 * common assertions.
 */
export class FakeLogger implements Logger {
	readonly entries: LogEntry[] = [];

	debug(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.push("debug", subsystem, message, meta);
	}
	info(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.push("info", subsystem, message, meta);
	}
	warn(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.push("warn", subsystem, message, meta);
	}
	error(subsystem: string, message: string, meta?: Record<string, unknown>): void {
		this.push("error", subsystem, message, meta);
	}

	bySubsystem(subsystem: string): LogEntry[] {
		return this.entries.filter((e) => e.subsystem === subsystem);
	}

	byLevel(level: LogLevel): LogEntry[] {
		return this.entries.filter((e) => e.level === level);
	}

	clear(): void {
		this.entries.length = 0;
	}

	private push(
		level: LogLevel,
		subsystem: string,
		message: string,
		meta?: Record<string, unknown>,
	): void {
		this.entries.push({
			level,
			subsystem,
			message,
			meta,
			timestamp: Date.now(),
		});
	}
}
