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
 * Production impl. Thin wrapper over the global `fetch`. Returns responses
 * with a binary-safe body (always Buffer). Headers are lowercased.
 */
export class NodeHttpClient implements HttpClient {
	async request(input: HttpRequest): Promise<HttpResponse> {
		const response = await fetch(input.url, {
			method: input.method,
			headers: input.headers,
			body: toFetchBody(input.body),
			signal: input.signal,
		});

		const arrayBuf = await response.arrayBuffer();
		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key.toLowerCase()] = value;
		});

		return {
			status: response.status,
			headers,
			body: Buffer.from(arrayBuf),
		};
	}
}

function toFetchBody(body: HttpRequest["body"]): Exclude<RequestInit["body"], null> | undefined {
	if (body === undefined) return undefined;
	return typeof body === "string" ? body : new Uint8Array(body);
}
