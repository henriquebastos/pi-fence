/**
 * `forceCapabilities()` — pin pi-tui's capability cache to a known shape
 * for render-layer tests.
 *
 * Why this exists
 * ---------------
 * pi-tui detects terminal capabilities (image protocol, true-color,
 * hyperlinks) lazily on the first `getCapabilities()` call and caches
 * the result. Under a test runner there is no TTY, so detection
 * settles on `images: "none"` and all Image components degrade to the
 * Unicode-block fallback. That makes it impossible to assert on the
 * Kitty-graphics byte stream the production path emits in a real
 * Kitty-capable terminal.
 *
 * The helper calls pi-tui's `setCapabilities()` (explicitly documented
 * upstream as "for tests") with a Kitty-full shape, then returns a
 * disposer that resets the cache so the pinned value does not leak
 * into sibling tests.
 *
 * Usage
 * -----
 *     const reset = forceCapabilities();
 *     try {
 *       // ... render-layer assertions that expect Kitty graphics ...
 *     } finally {
 *       reset();
 *     }
 *
 * or with `beforeEach` / `afterEach`:
 *
 *     let reset: () => void;
 *     beforeEach(() => { reset = forceCapabilities(); });
 *     afterEach(() => { reset(); });
 */

import {
	resetCapabilitiesCache,
	setCapabilities,
	type TerminalCapabilities,
} from "@mariozechner/pi-tui";

/**
 * The capability shape pi-fence's render-layer tests standardise on.
 * Kitty graphics for the image path, true-color for ANSI styling, and
 * hyperlinks on so any future terminal-link emission is exercised too.
 */
export const KITTY_FULL_CAPABILITIES: TerminalCapabilities = {
	images: "kitty",
	trueColor: true,
	hyperlinks: true,
};

/**
 * Pin pi-tui's capability cache to the given shape (default:
 * `KITTY_FULL_CAPABILITIES`). Returns a disposer that resets the cache
 * so subsequent `getCapabilities()` calls run fresh detection.
 */
export function forceCapabilities(
	caps: TerminalCapabilities = KITTY_FULL_CAPABILITIES,
): () => void {
	setCapabilities(caps);
	return () => {
		resetCapabilitiesCache();
	};
}
