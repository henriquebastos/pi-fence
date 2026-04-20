/**
 * CSS workaround for `@xterm/addon-image`'s missing overlay positioning.
 *
 * The bug
 * -------
 * `@xterm/addon-image` (beta ≥ 0.10) creates a canvas element with
 * class `xterm-image-layer-top` (or `-bottom`) and appends it to
 * xterm.js's `.xterm-screen` element. It expects the canvas to
 * overlay the text grid — drawing images at buffer cell positions
 * that line up with the text at the same buffer position.
 *
 * But the addon ships NO CSS defining that positioning. By default
 * the canvas inherits `position: static` and flows as a regular
 * block element. Because it's appended AFTER the text grid (a child
 * of `.xterm-screen`), it ends up rendered BELOW the screen, not
 * over it. Images drawn at buffer row 2 appear at pixel row
 * `screenHeight + (2 * cellHeight)` instead of `2 * cellHeight`.
 *
 * That explains the "big gap between label and image" symptom:
 * pi-fence's renderer puts the label at buffer row 0 and the image
 * at buffer row 2, but because the image layer is positioned below
 * the screen in the page flow, the rendered output looks like
 * label-at-top / huge-gap / image-way-below.
 *
 * The fix
 * -------
 * Inject CSS that gives the image layer `position: absolute` inside
 * its `.xterm-screen` stacking context, with `top/left: 0` so the
 * canvas overlays the text grid precisely. `pointer-events: none`
 * lets text selection and click events pass through to the text
 * layer below.
 *
 * This CSS is exactly the shape `@xterm/addon-image` should ship
 * itself. Documenting here so the upstream bug report (when we
 * file it) can reference the exact rules.
 *
 * When to delete
 * --------------
 * When `@xterm/addon-image` ships a stylesheet that positions its
 * canvas layers, or documents a required consumer-side rule and
 * we adopt theirs. Until then, injecting this CSS is a one-liner
 * in the verifier's HTML and a full visual fix.
 */

export const ADDON_IMAGE_OVERLAY_CSS = `
/* Workaround for @xterm/addon-image@^0.10.0-beta: the image canvas
 * is appended to .xterm-screen without positioning rules, so it
 * flows as a block BELOW the text grid. Pin it as an absolute
 * overlay so image cells line up with the buffer rows.
 *
 * See tests/utilities/addon-image-overlay-fix.ts for the bug
 * explanation and deletion criteria. */
.xterm-screen {
  position: relative;
}
.xterm-screen > canvas[class^="xterm-image-layer-"] {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
`.trim();
