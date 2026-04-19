/**
 * FakeExtensionAPI — a minimal stand-in for pi's `ExtensionAPI` surface,
 * sufficient for unit-level tests of pi-fence's event handlers in
 * isolation.
 *
 * Why this exists alongside real-SDK extension tests:
 *   - Real-SDK tests (tests/extension/) exercise the whole pipeline —
 *     slower, more setup, less targeted.
 *   - FakeExtensionAPI lets a test fire a single event and assert what a
 *     specific handler did, without spinning up a pi session.
 *
 * Scope: only the methods pi-fence handlers will actually call soon. Every
 * other method on the real interface throws loudly on invocation. When
 * a new consumer needs a new method, add it here with its own self-test
 * coverage — don't stub silently.
 *
 * Scope lives under `tests/utilities/`; a later refactor will promote the
 * three I/O seams to `extensions/pi-fence/io/` but this fake stays a test
 * utility forever — it has no production use.
 */

export type ExtensionEventHandler = (event: unknown, ctx: FakeExtensionContext) => Promise<void> | void;

export interface FakeExtensionContext {
	cwd: string;
	hasUI: boolean;
	// Minimal ctx surface. Real ExtensionContext has many more fields
	// (sessionManager, modelRegistry, signal, …). Add them here as the
	// tests that need them arrive.
}

export interface SentMessage {
	customType: string;
	content: unknown;
	display?: boolean;
	details?: unknown;
	options?: {
		triggerTurn?: boolean;
		deliverAs?: "steer" | "followUp" | "nextTurn";
	};
}

export interface SentUserMessage {
	content: unknown;
	options?: {
		deliverAs?: "steer" | "followUp";
	};
}

const NOT_IMPLEMENTED = "not implemented in FakeExtensionAPI — add coverage when a consumer needs it";

/**
 * Minimal fake. Methods that pi-fence uses are implemented; everything else
 * throws.
 */
export class FakeExtensionAPI {
	private readonly handlers = new Map<string, ExtensionEventHandler[]>();

	readonly sentMessages: SentMessage[] = [];
	readonly sentUserMessages: SentUserMessage[] = [];
	readonly registeredRenderers = new Map<string, unknown>();
	readonly registeredCommands = new Map<string, unknown>();
	readonly registeredTools = new Map<string, unknown>();

	private defaultCtx: FakeExtensionContext = {
		cwd: process.cwd(),
		hasUI: false,
	};

	// -------------------------------------------------------------------
	// on / dispatch
	// -------------------------------------------------------------------

	on(event: string, handler: ExtensionEventHandler): void {
		const list = this.handlers.get(event) ?? [];
		list.push(handler);
		this.handlers.set(event, list);
	}

	/**
	 * Fire a registered event. Handlers run sequentially in registration
	 * order. Any async handler's promise is awaited before the next runs.
	 * Returns when all handlers have finished.
	 */
	async dispatch(event: string, payload: unknown, ctxOverride?: Partial<FakeExtensionContext>): Promise<void> {
		const ctx: FakeExtensionContext = { ...this.defaultCtx, ...ctxOverride };
		const list = this.handlers.get(event) ?? [];
		for (const handler of list) {
			await handler(payload, ctx);
		}
	}

	// -------------------------------------------------------------------
	// sendMessage / sendUserMessage — captured, not delivered anywhere
	// -------------------------------------------------------------------

	sendMessage(message: Omit<SentMessage, "options">, options?: SentMessage["options"]): void {
		this.sentMessages.push({ ...message, options });
	}

	sendUserMessage(content: unknown, options?: SentUserMessage["options"]): void {
		this.sentUserMessages.push({ content, options });
	}

	// -------------------------------------------------------------------
	// Registrations — record the argument, never invoke
	// -------------------------------------------------------------------

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.registeredRenderers.set(customType, renderer);
	}

	registerCommand(name: string, options: unknown): void {
		this.registeredCommands.set(name, options);
	}

	registerTool(tool: { name: string; [k: string]: unknown }): void {
		this.registeredTools.set(tool.name, tool);
	}

	// -------------------------------------------------------------------
	// Unimplemented methods — throw loudly so tests fail the moment a
	// handler reaches for something the fake doesn't cover yet.
	// -------------------------------------------------------------------

	appendEntry(_customType: string, _data?: unknown): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	setSessionName(_name: string): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	getSessionName(): string | undefined {
		throw new Error(NOT_IMPLEMENTED);
	}
	setLabel(_entryId: string, _label: string | undefined): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	getActiveTools(): string[] {
		throw new Error(NOT_IMPLEMENTED);
	}
	getAllTools(): unknown[] {
		throw new Error(NOT_IMPLEMENTED);
	}
	setActiveTools(_names: string[]): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	getCommands(): unknown[] {
		throw new Error(NOT_IMPLEMENTED);
	}
	async setModel(_model: unknown): Promise<boolean> {
		throw new Error(NOT_IMPLEMENTED);
	}
	getThinkingLevel(): string {
		throw new Error(NOT_IMPLEMENTED);
	}
	setThinkingLevel(_level: string): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	registerShortcut(_shortcut: string, _options: unknown): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	registerFlag(_name: string, _options: unknown): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	getFlag(_name: string): unknown {
		throw new Error(NOT_IMPLEMENTED);
	}
	async exec(_cmd: string, _args: string[]): Promise<unknown> {
		throw new Error(NOT_IMPLEMENTED);
	}
	registerProvider(_name: string, _config: unknown): void {
		throw new Error(NOT_IMPLEMENTED);
	}
	unregisterProvider(_name: string): void {
		throw new Error(NOT_IMPLEMENTED);
	}
}
