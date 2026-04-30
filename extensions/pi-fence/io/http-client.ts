/**
 * HttpClient — production-owned HTTP seam for pi-fence runtime code.
 *
 * Production adapters import the contract and `NodeHttpClient` from here.
 * Test fakes stay under `tests/utilities/` and implement this contract.
 */

export interface HttpRequest {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string | Buffer;
	signal?: AbortSignal;
	/** Abort response buffering once this many bytes would be exceeded. */
	maxResponseBytes?: number;
}

export interface HttpResponse {
	status: number;
	headers: Record<string, string>;
	body: Buffer;
}

export interface HttpClient {
	request(input: HttpRequest): Promise<HttpResponse>;
}

/**
 * Production impl over global `fetch`. Returns responses with a binary-safe
 * body (always Buffer), lowercased headers, and optional response byte caps.
 */
export class NodeHttpClient implements HttpClient {
	async request(input: HttpRequest): Promise<HttpResponse> {
		const response = await fetch(input.url, {
			method: input.method,
			headers: input.headers,
			body: toFetchBody(input.body),
			signal: input.signal,
		});

		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key.toLowerCase()] = value;
		});
		const body = await readResponseBody(response, input.maxResponseBytes);

		return {
			status: response.status,
			headers,
			body,
		};
	}
}

async function readResponseBody(response: Response, maxBytes: number | undefined): Promise<Buffer> {
	const contentLength = Number(response.headers.get("content-length"));
	if (maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
		await response.body?.cancel().catch(() => undefined);
		throw new Error(limitError("HTTP response", contentLength, maxBytes));
	}
	if (!response.body) return Buffer.alloc(0);

	const reader = response.body.getReader();
	const chunks: Buffer[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = Buffer.from(value);
			totalBytes += chunk.length;
			if (maxBytes !== undefined && totalBytes > maxBytes) {
				await reader.cancel().catch(() => undefined);
				throw new Error(limitError("HTTP response", totalBytes, maxBytes));
			}
			chunks.push(chunk);
		}
	} finally {
		reader.releaseLock();
	}

	return Buffer.concat(chunks, totalBytes);
}

function limitError(label: string, actualBytes: number, maxBytes: number): string {
	return `${label} is too large: ${actualBytes} bytes exceeds limit of ${maxBytes} bytes`;
}

function toFetchBody(body: HttpRequest["body"]): Exclude<RequestInit["body"], null> | undefined {
	if (body === undefined) return undefined;
	return typeof body === "string" ? body : new Uint8Array(body);
}
