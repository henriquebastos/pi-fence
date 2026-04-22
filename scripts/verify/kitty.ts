/**
 * Kitty graphics protocol helpers for the CVx.E2 verifier.
 *
 * The pipeline counts image APC transmits in the scenario's byte
 * stream so it knows how many `ImageAddon.onImageAdded` events to
 * await before screenshotting. Counting lives here rather than in
 * `pipeline.ts` so it is unit-testable without a browser.
 *
 * Kitty graphics APC shape:
 *   `\x1b_G<params>;<payload>\x1b\\`
 *
 * Parameters are `key=value` pairs separated by `,`; the one that
 * names the action is `a=<X>`:
 *
 *   a=T   transmit and display (we count this)
 *   a=t   transmit only, no display (also counts — it still fires onImageAdded)
 *   a=q   query support (does NOT count)
 *   a=d   delete image (does NOT count)
 *   a=p   place previously-transmitted image (does NOT count; no new image)
 *
 * Multi-chunk transmits: the first chunk carries `a=T,m=1`; subsequent
 * chunks carry only `m=1` or `m=0` (trailing chunk) — they do NOT
 * re-declare `a=`, so we only count the first chunk and skip the
 * continuations.
 *
 * A chunk's `a=` param (or lack thereof) is therefore the signal:
 *   - has `a=T` or `a=t` → count +1
 *   - has `a=q` / `a=d` / `a=p` / etc. → count +0
 *   - has no `a=` at all → continuation of a previous transmit; count +0
 *
 * This matches what `@xterm/addon-image` does internally: one
 * `onImageAdded` per complete image, not per chunk.
 */

const APC_PREFIX = "\x1b_G";
const APC_SUFFIX = "\x1b\\";

export function countKittyImages(bytes: string): number {
	let count = 0;
	let cursor = 0;
	while (true) {
		const start = bytes.indexOf(APC_PREFIX, cursor);
		if (start < 0) return count;
		const paramsStart = start + APC_PREFIX.length;
		const paramsEnd = bytes.indexOf(";", paramsStart);
		const end = bytes.indexOf(APC_SUFFIX, paramsStart);
		if (end < 0) return count;

		// Params string is everything between \x1b_G and the first `;`,
		// bounded by the APC terminator. Some APCs have no payload and
		// no `;`; in that case the params run to the APC suffix.
		const effectiveParamsEnd =
			paramsEnd < 0 || paramsEnd > end ? end : paramsEnd;
		const params = bytes.slice(paramsStart, effectiveParamsEnd);

		const action = extractActionParam(params);
		if (action === "T" || action === "t") {
			count++;
		}

		cursor = end + APC_SUFFIX.length;
	}
}

function extractActionParam(params: string): string | null {
	for (const pair of params.split(",")) {
		const trimmed = pair.trim();
		if (trimmed.startsWith("a=")) {
			return trimmed.slice(2);
		}
	}
	return null;
}
