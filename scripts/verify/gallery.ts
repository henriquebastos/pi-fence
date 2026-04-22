/**
 * HTML gallery renderer for CVx.E2.S2 + follow-up polish.
 *
 * Pure function: given a list of rendered cards, emit a single
 * self-contained HTML document. No external scripts, no CDN CSS.
 * Inline CSS and a small inline `<script>` provide:
 *   - a flex-wrapping grid of cards, one per render combo;
 *   - a per-card toggle between the rendered PNG and the committed
 *     golden (when a golden is supplied);
 *   - click-to-zoom: clicking a card's image opens the full-size
 *     PNG in a lightbox overlay.
 *
 * The renderer stays a pure function — given the same card list it
 * produces the same HTML — so it's unit-testable and cache-friendly.
 * Consumers: `pnpm render:verify` writes the produced HTML to
 * `scripts/out/render-verify/index.html` after a run.
 */

export interface GalleryCard {
	/** Scenario name; used as the card title. */
	scenarioName: string;
	/** Variant name; appears beside the scenario name in the card. */
	variantName: string;
	/** Path to the rendered PNG, relative to the gallery HTML's directory. */
	pngRelativePath: string;
	/** Optional path to the committed golden PNG, relative to the gallery
	 *  HTML's directory. When present, the card shows a toggle between
	 *  rendered and golden. */
	goldenRelativePath?: string;
	cols: number;
	rows: number;
}

/**
 * Options for the gallery HTML renderer. All fields optional — defaults
 * match `pnpm render:verify`'s original shape, so existing callers don't
 * need to pass anything.
 */
export interface GalleryHtmlOptions {
	/** Document `<title>`. Default: "pi-fence render:verify gallery". */
	title?: string;
	/**
	 * Heading shown inside the empty-state placeholder when `cards` is
	 * empty. Defaults to the `pnpm render:verify` hint; `pnpm render:gallery`
	 * and other callers can override it.
	 */
	emptyHint?: string;
}

const DEFAULT_TITLE = "pi-fence render:verify gallery";
const DEFAULT_EMPTY_HINT =
	'No renders in this run. Invoke <code>pnpm render:verify</code> with at least one matching scenario.';

export function renderGalleryHtml(
	cards: readonly GalleryCard[],
	options: GalleryHtmlOptions = {},
): string {
	const title = options.title ?? DEFAULT_TITLE;
	const emptyHint = options.emptyHint ?? DEFAULT_EMPTY_HINT;
	const generatedAt = new Date().toISOString();
	const cardHtml = cards.length === 0
		? `<div class="empty">${emptyHint}</div>`
		: cards.map(renderCardHtml).join("\n");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  :root {
    color-scheme: dark;
    --card-bg: #181818;
    --card-border: #2a2a2a;
    --fg: #e5e5e5;
    --muted: #a0a0a0;
    --accent: #7a9fff;
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
    cursor: zoom-in;
  }
  .card .toggle-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .toggle-golden {
    background: transparent;
    color: var(--fg);
    border: 1px solid var(--card-border);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }
  .toggle-golden:hover {
    border-color: var(--accent);
  }
  .toggle-golden[data-showing="rendered"]::before {
    content: "Showing rendered — click for golden";
  }
  .toggle-golden[data-showing="golden"]::before {
    content: "Showing golden — click for rendered";
    color: var(--accent);
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
  /* Lightbox for click-to-zoom. Hidden until a card image is clicked. */
  #lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
    cursor: zoom-out;
    padding: 24px;
  }
  #lightbox.open {
    display: flex;
  }
  #lightbox img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
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
<div id="lightbox" role="dialog" aria-label="Full-size render"><img src="" alt="" /></div>
<script>
  (function () {
    var lightbox = document.getElementById("lightbox");
    if (!lightbox) return;
    var lbImg = lightbox.querySelector("img");
    var grid = document.querySelector(".grid");
    if (grid) {
      grid.addEventListener("click", function (e) {
        var target = e.target;
        // Toggle-golden button: swap the sibling img's src between
        // rendered and golden paths, tracked on the button via
        // data-showing.
        if (target && target.classList && target.classList.contains("toggle-golden")) {
          var card = target.closest(".card");
          if (!card) return;
          var img = card.querySelector("img.render");
          if (!img) return;
          var showing = target.getAttribute("data-showing") || "rendered";
          var rendered = target.getAttribute("data-rendered");
          var golden = target.getAttribute("data-golden");
          if (showing === "rendered") {
            img.src = golden;
            target.setAttribute("data-showing", "golden");
          } else {
            img.src = rendered;
            target.setAttribute("data-showing", "rendered");
          }
          e.preventDefault();
          return;
        }
        // Click-to-zoom on card images: open lightbox with the
        // image's current src (respects the current rendered/golden
        // toggle state).
        if (target && target.tagName === "IMG" && target.classList.contains("render")) {
          lbImg.src = target.src;
          lbImg.alt = target.alt;
          lightbox.classList.add("open");
          e.preventDefault();
        }
      });
    }
    lightbox.addEventListener("click", function () {
      lightbox.classList.remove("open");
      lbImg.src = "";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        lightbox.classList.remove("open");
        lbImg.src = "";
      }
    });
  })();
</script>
</body>
</html>`;
}

function renderCardHtml(card: GalleryCard): string {
	const toggleHtml = card.goldenRelativePath
		? `    <div class="toggle-row"><button class="toggle-golden" data-showing="rendered" data-rendered="${escapeAttr(card.pngRelativePath)}" data-golden="${escapeAttr(card.goldenRelativePath)}" type="button"></button></div>\n`
		: "";
	return `  <div class="card">
    <h2>${escapeHtml(card.scenarioName)}</h2>
    <div class="caption">${escapeHtml(card.variantName)} • ${card.cols}×${card.rows} • <code>${escapeHtml(card.pngRelativePath)}</code></div>
${toggleHtml}    <img class="render" src="${escapeAttr(card.pngRelativePath)}" alt="${escapeAttr(`${card.scenarioName} / ${card.variantName}`)}" />
  </div>`;
}

function escapeHtml(s: string): string {
	return s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeAttr(s: string): string {
	return escapeHtml(s).replaceAll('"', "&quot;");
}
