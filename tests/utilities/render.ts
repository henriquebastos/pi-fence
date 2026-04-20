/**
 * `paintComponent` — paint a pi-tui `Component` through a `TUI` into a
 * `LoggingVirtualTerminal` and return the terminal for viewport /
 * write-log assertions.
 *
 * Every render-layer test in the fast suite wants the same sequence:
 *
 *   1. Build a LoggingVirtualTerminal at some (width, height).
 *   2. Wrap it in a TUI, add the component, call tui.start().
 *   3. Await terminal.waitForRender() to let pi-tui's throttled
 *      render pipeline settle.
 *   4. Call tui.stop() to release the listeners.
 *   5. Return the terminal so the test reads getViewport() and
 *      getWrites().
 *
 * Today there are two callsites (`tests/unit/renderer.test.ts` and
 * `tests/extension/pi-fence.test.ts`); more are expected as the
 * roadmap's render-layer rung matures. Pulling the sequence into one
 * helper keeps the test-terminal dimension rationale in one place
 * and makes future refactors (e.g. a different worst-case fixture)
 * a one-file edit.
 *
 * This helper does **not** force pi-tui capabilities. Capabilities
 * are the test-setup's concern \u2014 wrap individual cases with
 * `forceCapabilities()` (see `./force-capabilities.ts`) and keep
 * `paintComponent` free of side effects outside the returned
 * terminal.
 */

import type { Component } from "@mariozechner/pi-tui";
import { TUI } from "@mariozechner/pi-tui";

import { LoggingVirtualTerminal } from "./virtual-terminal.ts";

/**
 * Default render-layer terminal dimensions.
 *
 * `columns = 120` gives the `pi-fence:output` Box's paddingX=1 indent
 * and the image's 60-cell width cap room to exercise without wrapping.
 *
 * `rows = 60` absorbs the Image component's worst case. For a 1x1
 * source PNG (common test fixture), pi-tui scales to 60 cells wide at
 * the default cell ratio, which stretches to ~30 rows tall. Label +
 * spacer + image clears 32 rows; 60 is comfortable headroom and still
 * well below xterm.js's default buffer size. Real Kroki PNGs render
 * shorter on the 60-cell cap; the test uses a worst-case fixture to
 * keep assertions robust.
 */
export const DEFAULT_COLUMNS = 120;
export const DEFAULT_ROWS = 60;

export async function paintComponent(
	component: Component,
	columns: number = DEFAULT_COLUMNS,
	rows: number = DEFAULT_ROWS,
): Promise<LoggingVirtualTerminal> {
	const terminal = new LoggingVirtualTerminal(columns, rows);
	const tui = new TUI(terminal);
	tui.addChild(component);
	tui.start();
	await terminal.waitForRender();
	tui.stop();
	return terminal;
}
