/**
 * Self-tests for `Logger` and its two implementations.
 *
 * Logger is the diagnostic seam for pi-fence. Production writes to stderr
 * with a structured prefix, gated by `PI_FENCE_LOG_LEVEL`. Tests capture
 * every log entry and assert against it directly — principles.md's
 * "/fence trace" command will read from the same capture in future work.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	FakeLogger,
	type LogEntry,
	type Logger,
	NodeLogger,
	shouldLog,
} from "./logger.ts";

describe("FakeLogger", () => {
	it("captures entries at every level", () => {
		const log: Logger = new FakeLogger();
		log.debug("parser", "trace-ish");
		log.info("kroki", "ok");
		log.warn("registry", "no processor for tag", { tag: "unknown" });
		log.error("kroki", "timeout", { url: "https://kroki.io/mermaid/png" });

		const entries = (log as FakeLogger).entries;
		expect(entries).toHaveLength(4);
		expect(entries[0]).toMatchObject({ level: "debug", subsystem: "parser", message: "trace-ish" });
		expect(entries[1]).toMatchObject({ level: "info", subsystem: "kroki", message: "ok" });
		expect(entries[2]).toMatchObject({
			level: "warn",
			subsystem: "registry",
			message: "no processor for tag",
			meta: { tag: "unknown" },
		});
		expect(entries[3]).toMatchObject({
			level: "error",
			subsystem: "kroki",
			message: "timeout",
			meta: { url: "https://kroki.io/mermaid/png" },
		});
	});

	it("stamps each entry with a timestamp", () => {
		const log = new FakeLogger();
		const before = Date.now();
		log.info("a", "first");
		const after = Date.now();

		expect(log.entries[0].timestamp).toBeGreaterThanOrEqual(before);
		expect(log.entries[0].timestamp).toBeLessThanOrEqual(after);
	});

	it("can be filtered by subsystem and level via helpers", () => {
		const log = new FakeLogger();
		log.debug("parser", "one");
		log.info("parser", "two");
		log.warn("kroki", "three");

		expect(log.bySubsystem("parser")).toHaveLength(2);
		expect(log.byLevel("warn")).toHaveLength(1);
		expect(log.byLevel("warn")[0].message).toBe("three");
	});

	it("clear() empties the capture", () => {
		const log = new FakeLogger();
		log.info("a", "first");
		log.clear();
		expect(log.entries).toHaveLength(0);
	});
});

describe("shouldLog", () => {
	it("permits levels at or above the threshold", () => {
		expect(shouldLog("info", "debug")).toBe(false);
		expect(shouldLog("info", "info")).toBe(true);
		expect(shouldLog("info", "warn")).toBe(true);
		expect(shouldLog("info", "error")).toBe(true);
	});

	it("allows everything at debug threshold", () => {
		for (const level of ["debug", "info", "warn", "error"] as const) {
			expect(shouldLog("debug", level)).toBe(true);
		}
	});

	it("falls back to info for unknown thresholds", () => {
		// Robustness: if PI_FENCE_LOG_LEVEL is garbage, we want predictable
		// behaviour, not a silent total mute.
		expect(shouldLog("nonsense" as "info", "info")).toBe(true);
		expect(shouldLog("nonsense" as "info", "debug")).toBe(false);
	});
});

describe("NodeLogger", () => {
	// We spy on process.stderr.write rather than capturing with a real stream:
	// cheap, precise, and doesn't involve any other plumbing.
	let writeSpy: ReturnType<typeof vi.spyOn>;
	const originalLevel = process.env.PI_FENCE_LOG_LEVEL;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});
	afterEach(() => {
		writeSpy.mockRestore();
		if (originalLevel === undefined) delete process.env.PI_FENCE_LOG_LEVEL;
		else process.env.PI_FENCE_LOG_LEVEL = originalLevel;
	});

	it("writes info entries with the expected prefix at default level", () => {
		delete process.env.PI_FENCE_LOG_LEVEL;
		const log = new NodeLogger();
		log.info("parser", "parsed fence", { count: 3 });

		expect(writeSpy).toHaveBeenCalledOnce();
		const line = writeSpy.mock.calls[0][0] as string;
		expect(line).toContain("[pi-fence:parser]");
		expect(line).toContain("info:");
		expect(line).toContain("parsed fence");
		expect(line).toContain("{\"count\":3}");
		expect(line.endsWith("\n")).toBe(true);
	});

	it("suppresses debug entries at default level", () => {
		delete process.env.PI_FENCE_LOG_LEVEL;
		const log = new NodeLogger();
		log.debug("parser", "detail");
		expect(writeSpy).not.toHaveBeenCalled();
	});

	it("honours PI_FENCE_LOG_LEVEL=debug", () => {
		process.env.PI_FENCE_LOG_LEVEL = "debug";
		const log = new NodeLogger();
		log.debug("parser", "detail");
		expect(writeSpy).toHaveBeenCalledOnce();
	});

	it("always writes warn and error regardless of default", () => {
		delete process.env.PI_FENCE_LOG_LEVEL;
		const log = new NodeLogger();
		log.warn("kroki", "slow");
		log.error("kroki", "failed");
		expect(writeSpy).toHaveBeenCalledTimes(2);
	});

	it("omits the meta payload when not provided", () => {
		delete process.env.PI_FENCE_LOG_LEVEL;
		const log = new NodeLogger();
		log.info("parser", "bare");
		const line = writeSpy.mock.calls[0][0] as string;
		// No trailing JSON blob.
		expect(line).not.toContain("{");
	});
});

describe("LogEntry shape is usable by consumers", () => {
	// Quick type-test-ish check to make sure LogEntry fields are stable.
	it("matches the exported type", () => {
		const entry: LogEntry = {
			level: "info",
			subsystem: "parser",
			message: "m",
			timestamp: Date.now(),
		};
		expect(entry.level).toBe("info");
	});
});
