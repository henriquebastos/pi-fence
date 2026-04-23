#!/usr/bin/env tsx
/**
 * Internal-link checker for the pi-fence docs tree.
 *
 * Walks every *.md file in the repo (excluding common build/vendor dirs) and
 * validates:
 *   1. Relative links [text](target) resolve to a real file on disk.
 *   2. Fragment anchors [text](target#slug) point to an existing heading in
 *      the target file.
 *
 * External links (http://, https://, mailto:) are skipped — we don't want to
 * block commits on upstream availability. Pure-fragment links (#something)
 * are trusted as same-file anchors without cross-checking, to keep the
 * output noise-free.
 *
 * Exit codes:
 *   0 — all internal links resolve
 *   1 — one or more broken links or missing fragments
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, posix } from "node:path";

interface BrokenLink {
	file: string;
	line: number;
	target: string;
	reason: string;
}

const ROOT = resolve(process.cwd());
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".obsidian", ".vscode", ".idea"]);

/** Recursively collect every markdown file in the repo. */
function collectMarkdownFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (IGNORED_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		const s = statSync(full);
		if (s.isDirectory()) {
			out.push(...collectMarkdownFiles(full));
		} else if (s.isFile() && entry.toLowerCase().endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

/**
 * GitHub-flavored heading-to-slug approximation. Matches github-slugger's
 * observable behavior for the characters we actually use (ASCII, em-dash,
 * backticks): lowercase, strip punctuation, then replace each remaining
 * space with a hyphen one-for-one (not collapsed).
 *
 * The one-for-one space rule is load-bearing: a heading like
 * "CV1 — Take Control" strips the em-dash, leaves two spaces, and becomes
 * "cv1--take-control" — a double hyphen, which is what GitHub actually
 * renders as the anchor. Collapsing whitespace would produce single hyphens
 * and silently miss broken fragments.
 *
 * Not modeled: duplicate-heading suffixing (-1, -2, …). If we ever use the
 * same heading twice in one file, add Slugger-style occurrence tracking.
 */
function slugify(heading: string): string {
	return heading
		.trim()
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
		.replaceAll(/\s/g, "-");
}

/** Extract heading slugs from a markdown file, in document order. */
function extractHeadingSlugs(content: string): string[] {
	const slugs: string[] = [];
	for (const line of content.split(/\r?\n/)) {
		const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
		if (m) slugs.push(slugify(m[1]));
	}
	return slugs;
}

/**
 * Find every `[text](target)` link in the markdown, returning each with the
 * 1-indexed line number where it appeared. The regex is deliberately simple
 * — it does not attempt to handle escaped brackets or code-block contents.
 * For our docs that trade-off yields zero false positives so far; revisit if
 * we add heavy code blocks that include literal `[x](y)` strings.
 */
function extractLinks(content: string): Array<{ target: string; line: number }> {
	const out: Array<{ target: string; line: number }> = [];
	const lines = content.split(/\r?\n/);
	const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	for (let i = 0; i < lines.length; i++) {
		let m: RegExpExecArray | null;
		linkRe.lastIndex = 0;
		while ((m = linkRe.exec(lines[i])) !== null) {
			out.push({ target: m[1], line: i + 1 });
		}
	}
	return out;
}

function isExternal(target: string): boolean {
	return /^(https?:|mailto:|tel:)/i.test(target);
}

function main(): number {
	const files = collectMarkdownFiles(ROOT);
	const { contents, slugs } = loadMarkdownIndex(files);
	const broken = findBrokenLinks(files, contents, slugs);
	if (broken.length === 0) {
		const relFiles = files.length === 1 ? "1 file" : `${files.length} files`;
		console.log(`✓ link check passed (${relFiles})`);
		return 0;
	}
	reportBrokenLinks(broken);
	return 1;
}

function loadMarkdownIndex(files: readonly string[]): {
	contents: Map<string, string>;
	slugs: Map<string, Set<string>>;
} {
	const contents = new Map<string, string>();
	const slugs = new Map<string, Set<string>>();
	for (const file of files) {
		const content = readFileSync(file, "utf8");
		contents.set(file, content);
		slugs.set(file, new Set(extractHeadingSlugs(content)));
	}
	return { contents, slugs };
}

function findBrokenLinks(
	files: readonly string[],
	contents: ReadonlyMap<string, string>,
	slugs: ReadonlyMap<string, Set<string>>,
): BrokenLink[] {
	const broken: BrokenLink[] = [];
	for (const file of files) {
		const content = contents.get(file);
		if (content === undefined) {
			continue;
		}
		for (const { target, line } of extractLinks(content)) {
			const result = validateLink(file, target, line, slugs);
			if (result) {
				broken.push(result);
			}
		}
	}
	return broken;
}

function validateLink(
	file: string,
	target: string,
	line: number,
	slugs: ReadonlyMap<string, Set<string>>,
): BrokenLink | null {
	if (isExternal(target) || target.startsWith("#")) {
		return null;
	}

	const [rawPath, rawFragment] = target.split("#", 2);
	const fragment = rawFragment ?? null;
	const resolvedPath = rawPath ? resolve(dirname(file), rawPath) : file;
	if (!pathExists(resolvedPath)) {
		return {
			file,
			line,
			target,
			reason: `path does not exist: ${relative(ROOT, resolvedPath)}`,
		};
	}
	if (!fragment) {
		return null;
	}

	const headings = slugs.get(resolvedPath);
	if (headings && !headings.has(fragment)) {
		return {
			file,
			line,
			target,
			reason: `fragment '#${fragment}' not found in ${relative(ROOT, resolvedPath)}`,
		};
	}
	return null;
}

function pathExists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

function reportBrokenLinks(broken: readonly BrokenLink[]): void {
	const byFile = new Map<string, BrokenLink[]>();
	for (const entry of broken) {
		const entries = byFile.get(entry.file) ?? [];
		entries.push(entry);
		byFile.set(entry.file, entries);
	}

	console.error(`✗ link check failed (${broken.length} broken link${broken.length === 1 ? "" : "s"})\n`);
	for (const [file, entries] of byFile) {
		console.error(posix.normalize(relative(ROOT, file)) + ":");
		for (const entry of entries) {
			console.error(`  line ${entry.line}: ${entry.target}`);
			console.error(`    ${entry.reason}`);
		}
		console.error("");
	}
}

process.exit(main());
