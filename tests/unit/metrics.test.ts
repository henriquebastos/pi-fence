/**
 * Unit tests for `metrics.ts` — per-session usage metrics.
 */

import { describe, expect, it } from "vitest";

import { MetricsCollector } from "../../extensions/pi-fence/metrics.ts";

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
		m.recordRender("kroki", "mermaid", true);

		const s = m.getSummary();
		expect(s.total).toBe(1);
		expect(s.ok).toBe(1);
		expect(s.errors).toBe(0);
		expect(s.byProcessor.kroki).toEqual({ ok: 1, errors: 0 });
		expect(s.byTag.mermaid).toEqual({ ok: 1, errors: 0 });
	});

	it("records a failed render", () => {
		const m = new MetricsCollector();
		m.recordRender("kroki", "mermaid", false);

		const s = m.getSummary();
		expect(s.total).toBe(1);
		expect(s.ok).toBe(0);
		expect(s.errors).toBe(1);
		expect(s.byProcessor.kroki).toEqual({ ok: 0, errors: 1 });
	});

	it("accumulates across multiple renders", () => {
		const m = new MetricsCollector();
		m.recordRender("kroki", "mermaid", true);
		m.recordRender("kroki", "plantuml", true);
		m.recordRender("table", "csv", true);
		m.recordRender("kroki", "mermaid", false);

		const s = m.getSummary();
		expect(s.total).toBe(4);
		expect(s.ok).toBe(3);
		expect(s.errors).toBe(1);
		expect(s.byProcessor.kroki).toEqual({ ok: 2, errors: 1 });
		expect(s.byProcessor.table).toEqual({ ok: 1, errors: 0 });
		expect(s.byTag.mermaid).toEqual({ ok: 1, errors: 1 });
		expect(s.byTag.plantuml).toEqual({ ok: 1, errors: 0 });
		expect(s.byTag.csv).toEqual({ ok: 1, errors: 0 });
	});
});
