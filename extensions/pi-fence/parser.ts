/**
 * Fenced-block parser for pi-fence.
 *
 * Pure function. Extracts fenced code blocks from markdown where the opening
 * fence's first info-string token matches the caller's allowlist.
 *
 * The parser scans incrementally so callers can enforce block/source limits
 * without first normalising, splitting, or retaining the full assistant text.
 */

export interface FencedBlock {
	tag: string;
	source: string;
	sourceBytes?: number;
	sourceTruncated?: boolean;
}

export interface ExtractFencedBlocksOptions {
	maxBlocks?: number;
	maxSourceBytes?: number;
}

/** Extract every fenced block whose opening tag is in `tags`, in source order. */
export function extractFencedBlocks(
	markdown: string,
	tags: string[],
	options: ExtractFencedBlocksOptions = {},
): FencedBlock[] {
	return extractFencedBlocksFromChunks([markdown], tags, options);
}

/**
 * Streaming-friendly parser variant. Chunks are consumed in order and never
 * concatenated into a full markdown string. CRLF/CR are normalised to LF at
 * line boundaries, matching the historical `extractFencedBlocks()` behaviour.
 */
export function extractFencedBlocksFromChunks(
	chunks: Iterable<string>,
	tags: string[],
	options: ExtractFencedBlocksOptions = {},
): FencedBlock[] {
	const parser = createBlockParser(tags, options);
	for (const line of linesFromChunks(chunks)) {
		parser.consume(line);
		if (parser.done) break;
	}
	return parser.finish();
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

interface Opener {
	char: "`" | "~";
	length: number;
	tag: string;
}

interface ActiveFence {
	opener: Opener;
	collector?: BodyCollector;
}

interface BodyCollector {
	tag: string;
	source: string;
	sourceBytes: number;
	retainedBytes: number;
	lineCount: number;
	truncated: boolean;
}

interface BlockParser {
	readonly done: boolean;
	consume(line: string): void;
	finish(): FencedBlock[];
}

function createBlockParser(tags: string[], options: ExtractFencedBlocksOptions): BlockParser {
	const allowlist = new Set(tags);
	const blocks: FencedBlock[] = [];
	let active: ActiveFence | undefined;
	let done = false;

	return {
		get done() {
			return done;
		},
		consume(line: string): void {
			if (done) return;
			if (active) {
				if (isCloser(line, active.opener.char, active.opener.length)) {
					if (active.collector) blocks.push(finishCollector(active.collector, options.maxSourceBytes));
					active = undefined;
					if (options.maxBlocks !== undefined && blocks.length >= options.maxBlocks) done = true;
					return;
				}
				if (active.collector) collectBodyLine(active.collector, line, options.maxSourceBytes);
				return;
			}

			const opener = parseOpener(line);
			if (!opener) return;
			active = {
				opener,
				...(allowlist.has(opener.tag) ? { collector: startCollector(opener.tag) } : {}),
			};
		},
		finish(): FencedBlock[] {
			return blocks;
		},
	};
}

function startCollector(tag: string): BodyCollector {
	return {
		tag,
		source: "",
		sourceBytes: 0,
		retainedBytes: 0,
		lineCount: 0,
		truncated: false,
	};
}

function collectBodyLine(collector: BodyCollector, line: string, maxSourceBytes: number | undefined): void {
	const segment = `${collector.lineCount === 0 ? "" : "\n"}${line}`;
	collector.lineCount += 1;
	const segmentBytes = Buffer.byteLength(segment, "utf8");
	collector.sourceBytes += segmentBytes;

	if (maxSourceBytes === undefined) {
		collector.source += segment;
		collector.retainedBytes += segmentBytes;
		return;
	}
	const remainingBytes = maxSourceBytes - collector.retainedBytes;
	if (remainingBytes >= segmentBytes) {
		collector.source += segment;
		collector.retainedBytes += segmentBytes;
		return;
	}
	collector.truncated = true;
	if (remainingBytes > 0) {
		const clipped = clipUtf8ToBytes(segment, remainingBytes);
		collector.source += clipped;
		collector.retainedBytes += Buffer.byteLength(clipped, "utf8");
	}
}

function finishCollector(collector: BodyCollector, maxSourceBytes: number | undefined): FencedBlock {
	return {
		tag: collector.tag,
		source: collector.source,
		...(maxSourceBytes !== undefined ? { sourceBytes: collector.sourceBytes } : {}),
		...(collector.truncated ? { sourceTruncated: true } : {}),
	};
}

/**
 * Parse a line as an opening fence, if it is one. Returns null otherwise.
 *
 * An opening fence:
 *   - has 0..3 spaces of leading whitespace,
 *   - then 3+ consecutive ` or ~ characters,
 *   - followed by an info string whose first whitespace-delimited token is
 *     the tag.
 */
function parseOpener(line: string): Opener | null {
	const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
	if (!match) return null;

	const fence = match[2];
	const rest = match[3];
	const char = fence[0] as "`" | "~";

	if (char === "`" && rest.includes("`")) return null;

	const tag = rest.trim().split(/\s+/, 1)[0] ?? "";
	return { char, length: fence.length, tag };
}

function isCloser(line: string, char: "`" | "~", minLength: number): boolean {
	const charEscaped = char === "`" ? "`" : "~";
	const pattern = new RegExp(String.raw`^ {0,3}${charEscaped}{${minLength},}\s*$`);
	return pattern.test(line);
}

function* linesFromChunks(chunks: Iterable<string>): Generator<string> {
	let line = "";
	let pendingCr = false;
	for (const chunk of chunks) {
		for (const char of chunk) {
			if (pendingCr) {
				pendingCr = false;
				if (char === "\n") continue;
			}
			if (char === "\r") {
				yield line;
				line = "";
				pendingCr = true;
				continue;
			}
			if (char === "\n") {
				yield line;
				line = "";
				continue;
			}
			line += char;
		}
	}
	if (pendingCr || line.length > 0) yield line;
}

function clipUtf8ToBytes(text: string, maxBytes: number): string {
	let out = "";
	let bytes = 0;
	for (const char of text) {
		const charBytes = Buffer.byteLength(char, "utf8");
		if (bytes + charBytes > maxBytes) break;
		out += char;
		bytes += charBytes;
	}
	return out;
}
