/**
 * Unit tests for `metrics.ts` — per-session usage metrics.
 */

import { describe, expect, it } from "vitest";

import { formatMetricsLines, MetricsCollector } from "../../extensions/pi-fence/metrics.ts";

describe("MetricsCollector", () => {
	it("starts with zero counts", () => {
		const m = new MetricsCollector();
		const s = m.getSummary();

		expect(s.total).toBe(0);
		expect(s.ok).toBe(0);
		expect(s.errors).toBe(0);
		expect(Object.keys(s.byProcessor)).toHaveLength(0);
		expect(Object.keys(s.byTag)).toHaveLength(0);
	});

	it("records a successful render", () => {
		const m = new MetricsCollector();
		m.recordRender("kroki-remote", "mermaid", true);

		const s = m.getSummary();
		expect(s.total).toBe(1);
		expect(s.ok).toBe(1);
		expect(s.errors).toBe(0);
		expect(s.byProcessor["kroki-remote"]).toEqual({ ok: 1, errors: 0 });
		expect(s.byTag.mermaid).toEqual({ ok: 1, errors: 0 });
	});

	it("records a failed render", () => {
		const m = new MetricsCollector();
		m.recordRender("kroki-remote", "mermaid", false);

		const s = m.getSummary();
		expect(s.total).toBe(1);
		expect(s.ok).toBe(0);
		expect(s.errors).toBe(1);
		expect(s.byProcessor["kroki-remote"]).toEqual({ ok: 0, errors: 1 });
	});

	it("accumulates across multiple renders", () => {
		const m = new MetricsCollector();
		m.recordRender("kroki-remote", "mermaid", true);
		m.recordRender("kroki-remote", "plantuml", true);
		m.recordRender("table-embedded", "csv", true);
		m.recordRender("kroki-remote", "mermaid", false);

		const s = m.getSummary();
		expect(s.total).toBe(4);
		expect(s.ok).toBe(3);
		expect(s.errors).toBe(1);
		expect(s.byProcessor["kroki-remote"]).toEqual({ ok: 2, errors: 1 });
		expect(s.byProcessor["table-embedded"]).toEqual({ ok: 1, errors: 0 });
		expect(s.byTag.mermaid).toEqual({ ok: 1, errors: 1 });
		expect(s.byTag.plantuml).toEqual({ ok: 1, errors: 0 });
		expect(s.byTag.csv).toEqual({ ok: 1, errors: 0 });
	});
});

describe("formatMetricsLines", () => {
	it("formats empty-session metrics with a no-renders note", () => {
		expect(formatMetricsLines({
			total: 0,
			ok: 0,
			errors: 0,
			byProcessor: {},
			byTag: {},
		})).toEqual([
			"Session metrics",
			"",
			"Total renders: 0 (0 ok, 0 errors)",
			"",
			"No renders in this session yet.",
		]);
	});

	it("formats processor and tag breakdowns", () => {
		expect(formatMetricsLines({
			total: 3,
			ok: 2,
			errors: 1,
			byProcessor: {
				"kroki-remote": { ok: 1, errors: 1 },
				"table-embedded": { ok: 1, errors: 0 },
			},
			byTag: {
				mermaid: { ok: 1, errors: 1 },
				csv: { ok: 1, errors: 0 },
			},
		})).toEqual([
			"Session metrics",
			"",
			"Total renders: 3 (2 ok, 1 errors)",
			"",
			"By processor:",
			"  kroki-remote: 2 (1 ok, 1 errors)",
			"  table-embedded: 1 (1 ok, 0 errors)",
			"",
			"By tag:",
			"  mermaid: 2 (1 ok, 1 errors)",
			"  csv: 1 (1 ok, 0 errors)",
		]);
	});
});
