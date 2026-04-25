import type { Logger, LogLevel } from "./logger.ts";
import { shouldLog } from "./logger.ts";

function thresholdFromEnv(): LogLevel {
	const raw = process.env.PI_FENCE_LOG_LEVEL;
	if (raw && ["debug", "info", "warn", "error"].includes(raw)) return raw as LogLevel;
	return "info";
}

/**
 * Production logger. Writes to process.stderr. Each call is a single line
 * terminated with `\n`. Meta (when provided) is JSON-serialised at the end.
 */
export class NodeLogger implements Logger {
	private readonly threshold = thresholdFromEnv();

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
		if (shouldLog(this.threshold, level)) {
			const metaStr = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
			process.stderr.write(`[pi-fence:${subsystem}] ${level}: ${message}${metaStr}\n`);
		}
	}
}
