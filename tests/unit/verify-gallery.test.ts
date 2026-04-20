/**
 * Unit tests for the per-run HTML gallery renderer.
 *
 * The renderer is a pure function: list of cards in, single HTML
 * string out. No browser, no file I/O. Keeping it pure lets the
 * test suite assert on the exact document shape without mocking.
 */

import { describe, expect, it } from "vitest";

import {
	renderGalleryHtml,
	type GalleryCard,
} from "../../scripts/verify/gallery.ts";

describe("renderGalleryHtml", () => {
	it("returns a valid HTML document with a placeholder for an empty card list", () => {
		const html = renderGalleryHtml([]);
		expect(html).toContain("<!doctype html>");
		expect(html).toContain("<html");
		expect(html).toContain("</html>");
		// An empty run still produces a document; a friendly message
		// tells the reader what they're looking at.
		expect(html.toLowerCase()).toContain("no renders");
	});

	it("renders one card per input, preserving order", () => {
		const cards: GalleryCard[] = [
			{
				scenarioName: "mermaid-happy-path",
				variantName: "default",
				pngRelativePath: "mermaid-happy-path/default/render.png",
				cols: 120,
				rows: 60,
			},
			{
				scenarioName: "mermaid-error-path",
				variantName: "default",
				pngRelativePath: "mermaid-error-path/default/render.png",
				cols: 120,
				rows: 60,
			},
		];

		const html = renderGalleryHtml(cards);

		// Every card's scenario and variant names must appear in the output.
		for (const card of cards) {
			expect(html).toContain(card.scenarioName);
			expect(html).toContain(card.variantName);
			expect(html).toContain(card.pngRelativePath);
			expect(html).toContain(`${card.cols}\u00d7${card.rows}`);
		}

		// Order is preserved: the first card's scenario name appears
		// before the second card's in the document body.
		const first = html.indexOf(cards[0]!.pngRelativePath);
		const second = html.indexOf(cards[1]!.pngRelativePath);
		expect(first).toBeGreaterThan(0);
		expect(second).toBeGreaterThan(first);
	});

	it("emits <img> tags that reference the PNG paths", () => {
		const cards: GalleryCard[] = [
			{
				scenarioName: "x",
				variantName: "y",
				pngRelativePath: "x/y/render.png",
				cols: 80,
				rows: 24,
			},
		];
		const html = renderGalleryHtml(cards);
		expect(html).toMatch(/<img[^>]+src="x\/y\/render\.png"/);
	});

	it("includes a golden toggle and click-to-zoom when a card has a goldenRelativePath", () => {
		const cards: GalleryCard[] = [
			{
				scenarioName: "x",
				variantName: "y",
				pngRelativePath: "x/y/render.png",
				goldenRelativePath: "../golden/x/y.png",
				cols: 80,
				rows: 24,
			},
		];
		const html = renderGalleryHtml(cards);
		// Toggle references both paths.
		expect(html).toContain("x/y/render.png");
		expect(html).toContain("../golden/x/y.png");
		// The toggle button label mentions 'golden' and 'rendered' so
		// a reviewer knows what they're switching between.
		expect(html.toLowerCase()).toContain("golden");
		// Click-to-zoom: a script block listens for card clicks. We
		// assert a simple signal — there's a <script> and it wires to
		// the card class.
		expect(html).toContain("<script>");
		expect(html).toContain("card");
	});

	it("omits the golden toggle button element when goldenRelativePath is absent", () => {
		const cards: GalleryCard[] = [
			{
				scenarioName: "x",
				variantName: "y",
				pngRelativePath: "x/y/render.png",
				cols: 80,
				rows: 24,
			},
		];
		const html = renderGalleryHtml(cards);
		// The toggle-golden CSS class may appear in the <style> block
		// (harmless when no button uses it). What must NOT appear is a
		// rendered <button class="toggle-golden">; that's the signal.
		expect(html).not.toMatch(/<button[^>]*class="toggle-golden"/);
	});

	it("is self-contained (no external scripts or stylesheets)", () => {
		const html = renderGalleryHtml([
			{
				scenarioName: "x",
				variantName: "y",
				pngRelativePath: "x/y/render.png",
				cols: 80,
				rows: 24,
			},
		]);
		// No CDN imports, no external CSS, no script tags pointing
		// at remotes. Styling is inline; content is local relative paths.
		expect(html).not.toMatch(/<script[^>]+src="https?:/);
		expect(html).not.toMatch(/<link[^>]+href="https?:/);
	});
});
