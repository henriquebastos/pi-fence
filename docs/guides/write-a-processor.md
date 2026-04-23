[< Docs](../README.md)

# Write Your Own Processor

This guide shows how to create a pi extension that registers a custom processor with pi-fence via the event bus. No import of pi-fence is required — the event bus is the only coupling point.

## The FenceProcessor interface

A processor is a plain object with five fields:

```typescript
interface FenceProcessor {
  /** Stable id for logs, settings, and registry lookups. */
  readonly id: string;

  /** Tags this processor handles (e.g. ["csv", "jsonl"]). Non-empty. */
  readonly tags: readonly string[];

  /** Alias → canonical tag map. Empty object if no aliases. */
  readonly aliases: Readonly<Record<string, string>>;

  /** One-shot capability probe. Never throw — return { ok: false, reason }. */
  available(): Promise<{ ok: true } | { ok: false; reason: string; installHint?: string }>;

  /** Render the source. Return data on both success and failure paths. */
  render(tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}
```

## The FenceResult type

A render can return image or text output:

```typescript
type FenceResult =
  | { ok: true; png: Buffer }     // image output (PNG bytes)
  | { ok: true; text: string }    // text output (plain or ANSI)
  | { ok: false; error: string }; // error
```

## Minimal example — an `uppercase` processor

Create a pi extension that uppercases any text in an ```` ```upper ```` block:

```typescript
// extensions/my-upper/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function activate(pi: ExtensionAPI): void {
  // Register the processor with pi-fence via the event bus.
  pi.events.emit("pi-fence:register", {
    id: "my-upper",
    tags: ["upper"],
    aliases: {},

    async available() {
      return { ok: true }; // pure logic, always available
    },

    async render(_tag, source, signal) {
      if (signal?.aborted) {
        return { ok: false, error: "Aborted" };
      }
      const trimmed = source.trim();
      if (trimmed.length === 0) {
        return { ok: false, error: "empty input" };
      }
      return { ok: true, text: trimmed.toUpperCase() };
    },
  });
}
```

Install your extension, `/reload`, then ask the assistant to use an `upper` block:

````text
```upper
hello world
```
````

pi-fence intercepts the block, routes it to your processor, and displays `HELLO WORLD`.

## Event bus protocol

| Channel | Direction | Payload |
|---------|-----------|---------|
| `pi-fence:register` | Your extension → pi-fence | A `FenceProcessor` object |
| `pi-fence:registered` | pi-fence → your extension | `{ id: string; tags: string[] }` |
| `pi-fence:register-error` | pi-fence → your extension | `{ error: string }` |

Listen for the confirmation if you need to know registration succeeded:

```typescript
pi.events.on("pi-fence:registered", (data) => {
  const { id, tags } = data as { id: string; tags: string[] };
  console.log(`Registered ${id} for tags: ${tags.join(", ")}`);
});

pi.events.on("pi-fence:register-error", (data) => {
  const { error } = data as { error: string };
  console.error(`Registration failed: ${error}`);
});
```

## Registration timing

- **Emit in your extension factory.** pi-fence's factory runs first (it's loaded before yours). The event listener is ready by the time your factory executes.
- **Or emit in `session_start`.** All extension factories complete before `session_start` fires.
- The registration is async internally (pi-fence probes `available()`). If you emit in your factory, allow a tick for the probe to complete before relying on the tag being active.

## Availability probes

`available()` is called once at registration time. If your processor depends on an external binary or service, probe it here:

```typescript
async available() {
  try {
    // Check for the binary.
    const result = await shell.run("mytool", ["--version"]);
    if (result.exitCode === 0) return { ok: true };
    return { ok: false, reason: `mytool exited ${result.exitCode}` };
  } catch {
    return {
      ok: false,
      reason: "mytool not found on PATH",
      installHint: "brew install mytool",
    };
  }
}
```

`installHint` is shown by `/fence list` and `/fence doctor` when the processor is unavailable.

## Resolution order

pi-fence resolves processors in registration order: built-in locals first, then third-party, then kroki as catch-all. Your processor is inserted before kroki automatically.

If two processors claim the same tag, the first available one wins — unless the user explicitly binds the tag to a processor in their config:

```json
{
  "bindings": {
    "upper": "my-upper"
  }
}
```

## What happens on errors

If `render()` returns `{ ok: false, error }`:

1. pi-fence shows an error panel to the user.
2. The error is sent as a follow-up message to the LLM so it can self-correct.

Never throw from `render()` or `available()` — return the error variant instead.
