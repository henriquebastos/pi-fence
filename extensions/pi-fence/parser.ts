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
const MAX_FENCE_LINE_BYTES = 4096;

export function extractFencedBlocksFromChunks(
	chunks: Iterable<string>,
	tags: string[],
	options: ExtractFencedBlocksOptions = {},
): FencedBlock[] {
	const parser = createBlockParser(tags, options);
	if (parser.done) return parser.finish();
	for (const line of linesFromChunks(chunks, lineBufferLimit(options.maxSourceBytes))) {
		parser.consume(line);
		if (parser.done) break;
	}
	return parser.finish();
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function lineBufferLimit(maxSourceBytes: number | undefined): number | undefined {
	if (maxSourceBytes === undefined) return undefined;
	return Math.max(MAX_FENCE_LINE_BYTES, maxSourceBytes);
}


interface LineRecord {
	text: string;
	bytes: number;
	truncated: boolean;
}

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
	consume(line: LineRecord): void;
	finish(): FencedBlock[];
}

function createBlockParser(tags: string[], options: ExtractFencedBlocksOptions): BlockParser {
	const allowlist = new Set(tags);
	const blocks: FencedBlock[] = [];
	let active: ActiveFence | undefined;
	let done = options.maxBlocks !== undefined && options.maxBlocks <= 0;

	return {
		get done() {
			return done;
		},
		consume(line: LineRecord): void {
			if (done) return;
			if (active) {
				if (!line.truncated && isCloser(line.text, active.opener.char, active.opener.length)) {
					if (active.collector) blocks.push(finishCollector(active.collector, options.maxSourceBytes));
					active = undefined;
					if (options.maxBlocks !== undefined && blocks.length >= options.maxBlocks) done = true;
					return;
				}
				if (active.collector) {
					collectBodyLine(active.collector, line, options.maxSourceBytes);
					return;
				}
				return;
			}

			const opener = parseLineOpener(line);
			if (opener) active = openFence(opener, allowlist);
		},
		finish(): FencedBlock[] {
			return blocks;
		},
	};
}

function openFence(opener: Opener, allowlist: ReadonlySet<string>): ActiveFence {
	return {
		opener,
		...(allowlist.has(opener.tag) ? { collector: startCollector(opener.tag) } : {}),
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

function collectBodyLine(collector: BodyCollector, line: LineRecord, maxSourceBytes: number | undefined): void {
	const separatorBytes = collector.lineCount === 0 ? 0 : 1;
	const segmentBytes = separatorBytes + line.bytes;
	collector.lineCount += 1;
	collector.sourceBytes += segmentBytes;

	if (maxSourceBytes === undefined) {
		collector.source += `${separatorBytes === 0 ? "" : "\n"}${line.text}`;
		collector.retainedBytes += segmentBytes;
		return;
	}
	if (collector.truncated) return;

	const prefix = separatorBytes === 0 ? "" : "\n";
	const segment = `${prefix}${line.text}`;
	const remainingBytes = maxSourceBytes - collector.retainedBytes;
	if (remainingBytes >= Buffer.byteLength(segment, "utf8") && !line.truncated) {
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
function parseLineOpener(line: LineRecord): Opener | null {
	return line.truncated ? parseTruncatedOpener(line.text) : parseOpener(line.text);
}

function parseTruncatedOpener(line: string): Opener | null {
	const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
	if (!match) return null;
	const fence = match[2];
	const rest = match[3];
	return {
		char: fence[0] as "`" | "~",
		length: rest.length === 0 ? Number.MAX_SAFE_INTEGER : fence.length,
		tag: "",
	};
}

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

function* linesFromChunks(chunks: Iterable<string>, maxLineBytes: number | undefined): Generator<LineRecord> {
	let line = "";
	let lineBytes = 0;
	let retainedBytes = 0;
	let truncated = false;
	let pendingCr = false;
	const limit = maxLineBytes ?? Number.POSITIVE_INFINITY;
	for (const chunk of chunks) {
		for (const char of chunk) {
			if (pendingCr) {
				pendingCr = false;
				if (char === "\n") continue;
			}
			if (char === "\r") {
				yield { text: line, bytes: lineBytes, truncated };
				line = "";
				lineBytes = 0;
				retainedBytes = 0;
				truncated = false;
				pendingCr = true;
				continue;
			}
			if (char === "\n") {
				yield { text: line, bytes: lineBytes, truncated };
				line = "";
				lineBytes = 0;
				retainedBytes = 0;
				truncated = false;
				continue;
			}
			const charBytes = Buffer.byteLength(char, "utf8");
			lineBytes += charBytes;
			if (retainedBytes + charBytes <= limit) {
				line += char;
				retainedBytes += charBytes;
			} else {
				truncated = true;
			}
		}
	}
	if (pendingCr || line.length > 0 || truncated) yield { text: line, bytes: lineBytes, truncated };
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
