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
	const lines: string[] = [];
	lines.push("Session metrics");
	lines.push("");
	lines.push(`Total renders: ${summary.total} (${summary.ok} ok, ${summary.errors} errors)`);

	if (Object.keys(summary.byProcessor).length > 0) {
		lines.push("");
		lines.push("By processor:");
		for (const [id, counts] of Object.entries(summary.byProcessor)) {
			lines.push(`  ${id}: ${counts.ok + counts.errors} (${counts.ok} ok, ${counts.errors} errors)`);
		}
	}

	if (Object.keys(summary.byTag).length > 0) {
		lines.push("");
		lines.push("By tag:");
		for (const [tag, counts] of Object.entries(summary.byTag)) {
			lines.push(`  ${tag}: ${counts.ok + counts.errors} (${counts.ok} ok, ${counts.errors} errors)`);
		}
	}

	if (summary.total === 0) {
		lines.push("");
		lines.push("No renders in this session yet.");
	}

	return lines;
}
