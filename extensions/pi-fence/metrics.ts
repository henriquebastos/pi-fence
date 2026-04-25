/**
 * Per-session usage metrics for pi-fence.
 *
 * Tracks render count, error count, and per-processor/per-tag breakdowns.
 * Surfaced via `/fence stats`. Landing with CV4.E2.S2.
 */

export interface MetricsSummary {
	total: number;
	ok: number;
	errors: number;
	byProcessor: Record<string, { ok: number; errors: number }>;
	byTag: Record<string, { ok: number; errors: number }>;
}

export class MetricsCollector {
	private total = 0;
	private okCount = 0;
	private errorCount = 0;
	private readonly processorCounts = new Map<string, { ok: number; errors: number }>();
	private readonly tagCounts = new Map<string, { ok: number; errors: number }>();

	recordRender(processorId: string, tag: string, ok: boolean): void {
		this.total++;
		if (ok) {
			this.okCount++;
		} else {
			this.errorCount++;
		}

		const procEntry = this.processorCounts.get(processorId) ?? { ok: 0, errors: 0 };
		if (ok) procEntry.ok++; else procEntry.errors++;
		this.processorCounts.set(processorId, procEntry);

		const tagEntry = this.tagCounts.get(tag) ?? { ok: 0, errors: 0 };
		if (ok) tagEntry.ok++; else tagEntry.errors++;
		this.tagCounts.set(tag, tagEntry);
	}

	getSummary(): MetricsSummary {
		return {
			total: this.total,
			ok: this.okCount,
			errors: this.errorCount,
			byProcessor: Object.fromEntries(this.processorCounts),
			byTag: Object.fromEntries(this.tagCounts),
		};
	}
}

export function formatMetricsLines(summary: MetricsSummary): string[] {
	return [
		"Session metrics",
		"",
		`Total renders: ${summary.total} (${summary.ok} ok, ${summary.errors} errors)`,
		...formatMetricBreakdown("By processor:", summary.byProcessor),
		...formatMetricBreakdown("By tag:", summary.byTag),
		...formatEmptySessionNote(summary.total),
	];
}

function formatMetricBreakdown(
	title: string,
	entriesByName: Record<string, { ok: number; errors: number }>,
): string[] {
	const entries = Object.entries(entriesByName);
	if (entries.length === 0) return [];

	return [
		"",
		title,
		...entries.map(([name, counts]) =>
			`  ${name}: ${counts.ok + counts.errors} (${counts.ok} ok, ${counts.errors} errors)`,
		),
	];
}

function formatEmptySessionNote(total: number): string[] {
	return total === 0 ? ["", "No renders in this session yet."] : [];
}
