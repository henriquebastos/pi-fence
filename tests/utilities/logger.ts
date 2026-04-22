/**
 * Test utilities for the Logger seam.
 *
 * Production-owned contracts and the Node implementation live in
 * `extensions/pi-fence/io/logger.ts`. This file keeps the in-memory capture
 * fake under the test lane.
 */

import type {
	LogEntry,
	LogLevel,
	Logger,
} from "../../extensions/pi-fence/io/logger.ts";

export type { LogEntry, LogLevel, Logger };

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
