/**
 * Self-test for `forceCapabilities()` — the test-local helper that
 * pins pi-tui's capability cache to a Kitty-graphics-capable shape so
 * render-layer tests deterministically hit the image-protocol emission
 * path (instead of the Unicode-block fallback the cache settles on when
 * no TTY is attached, as in a test runner).
 *
 * The assertions are scoped to the helper's public contract:
 *   1. After calling `forceCapabilities()`, pi-tui's capability
 *      resolver reports the Kitty-full shape we pinned.
 *   2. The returned disposer restores the cache so a subsequent
 *      capability read does not return our pin.
 *
 * We assert against pi-tui's published `getCapabilities()` — the thing
 * every pi-tui render path actually reads — rather than mocking
 * `setCapabilities`. That way if upstream renames or rewires the
 * capability seam, this test notices instead of passing vacuously.
 */

import { afterEach, describe, expect, it } from "vitest";
import { detectCapabilities, getCapabilities, resetCapabilitiesCache } from "@mariozechner/pi-tui";

import { forceCapabilities, KITTY_FULL_CAPABILITIES } from "../utilities/force-capabilities.ts";

describe("forceCapabilities", () => {
	afterEach(() => {
		// Guarantee no leakage across cases even if a test forgets its disposer.
		resetCapabilitiesCache();
	});

	it("pins pi-tui's capability cache to the Kitty-full shape", () => {
		forceCapabilities();
		expect(getCapabilities()).toMatchObject(KITTY_FULL_CAPABILITIES);
	});

	it("drops the pin so getCapabilities() falls back to fresh detection", () => {
		// Snapshot what fresh detection yields in *this* environment. We
		// then pin to an intentionally different shape and assert that
		// after dispose we return to the detection value — proving the
		// disposer actually cleared the cache and wasn't a no-op.
		const detected = detectCapabilities();
		const distinctPin = {
			images: detected.images === null ? ("iterm2" as const) : null,
			trueColor: !detected.trueColor,
			hyperlinks: !detected.hyperlinks,
		};

		const reset = forceCapabilities(distinctPin);
		expect(getCapabilities()).toEqual(distinctPin);

		reset();
		expect(getCapabilities()).toEqual(detected);
	});
});
