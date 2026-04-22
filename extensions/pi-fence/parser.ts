/**
 * Fenced-block parser for pi-fence.
 *
 * Pure function. Extracts fenced code blocks from a markdown string where the
 * opening fence's first info-string token matches the caller's allowlist.
 *
 * Scope (matches CommonMark 0.31 fenced-code-block rules, narrowed to what
 * pi-fence actually needs):
 *
 *   - Both ``` and ~~~ fences are recognised; the closer must use the same
 *     character as the opener.
 *   - A fence is 3+ consecutive fence characters. The closer must be at
 *     least as long as the opener (a 4-backtick fence is not closed by a
 *     3-backtick line).
 *   - Up to 3 spaces of leading whitespace on the opening fence are allowed.
 *   - The tag is the first whitespace-delimited token after the fence. Any
 *     trailing info-string (e.g. `mermaid theme=dark`) is preserved in the
 *     source but not interpreted here.
 *   - Tag matching is case-sensitive. Callers pass lowercase tags.
 *   - An opener with no closer is ignored (not returned).
 *   - The body between opener and closer is returned verbatim, minus
 *     surrounding empty-line padding and the single trailing newline that
 *     sits between the last body line and the closer. CRLF is normalised to
 *     LF inside the body so callers can match on `\n` without worrying.
 *
 * What this parser does NOT do:
 *
 *   - No meta parsing — `theme=dark width=800` is a future concern.
 *   - No nested-fence awareness — the body is opaque. A 3-backtick line
 *     inside a 4-backtick fence is part of the body.
 *   - No HTML / tables / other markdown constructs. Pi-fence only cares
 *     about fenced code blocks.
 */

export interface FencedBlock {
	tag: string;
	source: string;
}

/**
 * Extract every fenced block whose opening tag is in `tags`, in source
 * order.
 */
export function extractFencedBlocks(markdown: string, tags: string[]): FencedBlock[] {
	const allowlist = new Set(tags);
	const lines = markdown.replaceAll(/\r\n?/g, "\n").split("\n");
	const blocks: FencedBlock[] = [];

	let i = 0;
	while (i < lines.length) {
		const opener = parseOpener(lines[i]);
		if (!opener) {
			i++;
			continue;
		}

		// Found an opener. Look for a matching closer.
		const closerIndex = findCloser(lines, i + 1, opener.char, opener.length);
		if (closerIndex === -1) {
			// Unclosed fence — ignore the whole thing per spec pragmatism.
			i++;
			continue;
		}

		if (allowlist.has(opener.tag)) {
			const body = lines.slice(i + 1, closerIndex).join("\n");
			blocks.push({ tag: opener.tag, source: body });
		}

		i = closerIndex + 1;
	}

	return blocks;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface Opener {
	char: "`" | "~";
	length: number;
	tag: string;
}

/**
 * Parse a line as an opening fence, if it is one. Returns null otherwise.
 *
 * An opening fence:
 *   - has 0..3 spaces of leading whitespace,
 *   - then 3+ consecutive ` or ~ characters,
 *   - followed by an info string whose first whitespace-delimited token is
 *     the tag.
 *
 * A line that is only the fence characters (no tag) is a valid opener but
 * the tag is the empty string, which never matches any allowlist.
 */
function parseOpener(line: string): Opener | null {
	const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
	if (!match) return null;

	const fence = match[2];
	const rest = match[3];
	const char = fence[0] as "`" | "~";

	// An opening backtick fence must not contain any backticks in the info
	// string (CommonMark rule, prevents accidentally pairing with inline
	// code). Tilde fences have no such restriction. We honour it to stay
	// out of surprises even though our tag allowlist would filter most of
	// the edge cases anyway.
	if (char === "`" && rest.includes("`")) return null;

	const tag = rest.trim().split(/\s+/, 1)[0] ?? "";
	return { char, length: fence.length, tag };
}

/**
 * Find the index of the closing fence line, starting from `from`.
 *
 * A closer:
 *   - uses the same fence character as the opener,
 *   - has length >= opener length,
 *   - has 0..3 spaces of leading whitespace,
 *   - has only whitespace after the fence characters.
 *
 * Returns -1 if no valid closer is found.
 */
function findCloser(lines: string[], from: number, char: "`" | "~", minLength: number): number {
	const charEscaped = char === "`" ? "`" : "~";
	const pattern = new RegExp(String.raw`^ {0,3}${charEscaped}{${minLength},}\s*$`);
	for (let j = from; j < lines.length; j++) {
		if (pattern.test(lines[j])) return j;
	}
	return -1;
}
