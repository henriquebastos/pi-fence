/**
 * HTML gallery renderer for CVx.E2.S2.
 *
 * Pure function: given a list of rendered cards, emit a single
 * self-contained HTML document. No external scripts, no CDN CSS.
 * Styling is inline; content is local relative paths.
 *
 * Consumers: `pnpm render:verify` writes the produced HTML to
 * `scripts/out/render-verify/index.html` after a run, so a human can
 * open one file and scan every render in the batch.
 *
 * The renderer stays deliberately simple (a flex-wrapping grid of
 * cards). Future stories can add navigation, side-by-side diffs
 * against the golden, zoom-on-click, and so on; S2's job is just
 * "one document, every render visible."
 */

export interface GalleryCard {
	/** Scenario name; used as the card title. */
	scenarioName: string;
	/** Variant name; appears beside the scenario name in the card. */
	variantName: string;
	/** Path to the PNG, relative to the gallery HTML's directory. */
	pngRelativePath: string;
	cols: number;
	rows: number;
}

/**
 * Render the full HTML document. Takes an array of cards (possibly
 * empty); returns a string containing the full `<!doctype html>…`.
 *
 * Design notes:
 *   - `<!doctype html>` and `<meta charset>` up top for browser parity.
 *   - Inline `<style>` keeps the output a single file. Flex-wrap
 *     grid behaves well from narrow (phone) to wide viewports; each
 *     card caps at a readable max-width.
 *   - Text content uses `&#8226;`, `&times;` etc. as HTML entities
 *     to avoid needing any escaping logic for the tiny set of
 *     special characters we emit.
 *   - Card PNG uses `object-fit: contain` so an over-wide render
 *     shrinks to fit the card width without cropping.
 */
export function renderGalleryHtml(cards: readonly GalleryCard[]): string {
	const generatedAt = new Date().toISOString();
	const cardHtml = cards.length === 0
		? '<div class="empty">No renders in this run. Invoke <code>pnpm render:verify</code> with at least one matching scenario.</div>'
		: cards.map(renderCardHtml).join("\n");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>pi-fence render:verify gallery</title>
<style>
  :root {
    color-scheme: dark;
    --card-bg: #181818;
    --card-border: #2a2a2a;
    --fg: #e5e5e5;
    --muted: #a0a0a0;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #0d0d0d;
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
      "Helvetica Neue", Arial, sans-serif;
  }
  header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--card-border);
  }
  header h1 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
  }
  header .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 20px 24px;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 8px;
    padding: 12px;
    width: min(640px, 100%);
  }
  .card h2 {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 600;
  }
  .card .caption {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 8px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }
  .card img {
    max-width: 100%;
    height: auto;
    display: block;
    border-radius: 4px;
    background: #000;
    object-fit: contain;
  }
  .empty {
    color: var(--muted);
    font-size: 14px;
    padding: 24px;
  }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    background: var(--card-bg);
    padding: 1px 6px;
    border-radius: 3px;
  }
</style>
</head>
<body>
<header>
  <h1>pi-fence render:verify</h1>
  <div class="meta">${cards.length} card${cards.length === 1 ? "" : "s"} • generated ${escapeHtml(generatedAt)}</div>
</header>
<div class="grid">
${cardHtml}
</div>
</body>
</html>`;
}

function renderCardHtml(card: GalleryCard): string {
	return `  <div class="card">
    <h2>${escapeHtml(card.scenarioName)}</h2>
    <div class="caption">${escapeHtml(card.variantName)} • ${card.cols}×${card.rows} • <code>${escapeHtml(card.pngRelativePath)}</code></div>
    <img src="${escapeAttr(card.pngRelativePath)}" alt="${escapeAttr(`${card.scenarioName} / ${card.variantName}`)}" />
  </div>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/"/g, "&quot;");
}
