/**
 * HttpClient — the HTTP seam used by pi-fence's kroki processor and any
 * future processor that talks over HTTP.
 *
 * Like ShellRunner, this lives under `tests/utilities/` for S0. A later
 * story will promote it to `extensions/pi-fence/io/`.
 *
 * Contract:
 *   - Non-success status codes (4xx, 5xx) are RETURNED as HttpResponse.
 *     They are not thrown. A 400 from kroki is a normal outcome the
 *     extension reports to the user; it is not an exception.
 *   - Errors that prevent producing a response (DNS failure, timeout,
 *     abort, network unreachable) ARE thrown.
 *   - Response body is always Buffer. PNG responses from kroki must be
 *     binary-safe; text responses are `.toString("utf8")`.
 *
 * Two impls:
 *   - NodeHttpClient  production; wraps global fetch.
 *   - FakeHttpClient  test fake with capture/replay, including binary
 *                     bodies and dynamic function responses.
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

// ---------------------------------------------------------------------------
// NodeHttpClient
// ---------------------------------------------------------------------------

/**
 * Production impl. Thin wrapper over the global `fetch`. Returns responses
 * with a binary-safe body (always Buffer). Headers are lowercased.
 *
 * Not unit-tested directly — the wrapper is trivial and the live test at
 * `tests/integration/kroki.live.test.ts` (S1) exercises it end-to-end
 * against kroki.io.
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

// ---------------------------------------------------------------------------
// FakeHttpClient
// ---------------------------------------------------------------------------

export interface RecordedHttpRequest {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string | Buffer;
}

type ResponseOrFn = HttpResponse | ((req: HttpRequest) => HttpResponse);

/**
 * Test fake. Programmed via `setResponse(method, url, response | fn)`.
 * Requests that don't match fall through to the default (set at
 * construction); if no default, `request()` throws.
 *
 * Records every request in `requests` in source order.
 *
 * Dynamic responses (functions) let a test inspect the outgoing request
 * and return a body that depends on it — useful for "echo the body length"
 * style assertions.
 */
export class FakeHttpClient implements HttpClient {
	readonly requests: RecordedHttpRequest[] = [];
	private readonly programmed = new Map<string, ResponseOrFn>();
	private readonly defaultResponse: HttpResponse | undefined;

	constructor(defaultResponse?: HttpResponse) {
		this.defaultResponse = defaultResponse;
	}

	setResponse(method: string, url: string, response: ResponseOrFn): void {
		this.programmed.set(keyFor(method, url), response);
	}

	async request(input: HttpRequest): Promise<HttpResponse> {
		if (input.signal?.aborted) {
			throw new DOMException("The operation was aborted.", "AbortError");
		}

		this.requests.push({
			method: input.method,
			url: input.url,
			headers: input.headers,
			body: input.body,
		});

		const programmed = this.programmed.get(keyFor(input.method, input.url));
		if (programmed) {
			return typeof programmed === "function" ? programmed(input) : programmed;
		}
		if (this.defaultResponse) return this.defaultResponse;

		throw new Error(
			`FakeHttpClient: no programmed response for ${input.method} ${input.url} and no default set`,
		);
	}
}

function keyFor(method: string, url: string): string {
	return `${method.toUpperCase()}\0${url}`;
}

function toFetchBody(body: HttpRequest["body"]): Exclude<RequestInit["body"], null> | undefined {
	if (body === undefined) return undefined;
	return typeof body === "string" ? body : new Uint8Array(body);
}
