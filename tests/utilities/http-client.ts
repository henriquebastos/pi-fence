/**
 * Test utilities for the HttpClient seam.
 *
 * Production-owned contracts and the Node implementation live in
 * `extensions/pi-fence/io/http-client.ts`. This file keeps the fake under the
 * test lane.
 */

import type {
	HttpClient,
	HttpRequest,
	HttpResponse,
} from "../../extensions/pi-fence/io/http-client.ts";

export type { HttpClient, HttpRequest, HttpResponse };

export interface RecordedHttpRequest {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: string | Buffer;
	maxResponseBytes?: number;
}

type ResponseOrFn = HttpResponse | ((req: HttpRequest) => HttpResponse);

/**
 * Test fake. Programmed via `setResponse(method, url, response | fn)`.
 * Requests that don't match fall through to the default (set at
 * construction); if no default, `request()` throws.
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
			maxResponseBytes: input.maxResponseBytes,
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
