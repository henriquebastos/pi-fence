[< Docs](../README.md)

# Write Your Own Processor

This guide shows how to create a pi extension that registers a custom processor with pi-fence via the event bus. No import of pi-fence is required — the event bus is the only coupling point.

## The FenceProcessor interface

A processor is a plain object with six fields:

```typescript
interface FenceProcessor {
  /** Stable safe id for logs, settings, and registry lookups. */
  readonly id: string;

  /** Trust/control boundary used by policy-driven resolution. */
  readonly placement: "embedded" | "host" | "sandbox" | "remote";

  /** Safe tags this processor handles (e.g. ["csv", "jsonl"]). Non-empty. */
  readonly tags: readonly string[];

  /** Safe alias → canonical tag map. Empty object if no aliases. */
  readonly aliases: Readonly<Record<string, string>>;

  /** One-shot capability probe. Never throw — return { ok: false, reason }. */
  available(): Promise<{ ok: true } | { ok: false; reason: string; installHint?: string }>;

  /** Render the source. Return data on both success and failure paths. */
  render(tag: string, source: string, signal?: AbortSignal): Promise<FenceOutput>;
}
```

## Registration validation

pi-fence treats third-party processor objects as semi-trusted. Invalid registration data is rejected before it enters registry, resolver, list, or render state. Rejections emit `pi-fence:register-error` and leave the registry unchanged.

Processor ids, tags, and alias keys use the same safe string grammar:

1. Lowercase ASCII letters, digits, and hyphens only.
2. Start and end with a letter or digit.
3. Maximum length: 64 characters.
4. No whitespace, control characters, `/`, `\\`, `.`, `..`, or path-like names.
5. `__proto__`, `constructor`, and `prototype` are reserved.

Aliases must be an own plain object or null-prototype object. Every alias key must be safe, every alias value must be a safe string, and every alias value must exist in the processor's canonical `tags` array. Do not use inherited alias keys.

Processors must not declare precedence metadata such as `order`, `priority`, or `processorPrecedence`; user policy owns resolution order.

## The FenceOutput type

A render can return image, text, or error output:

```typescript
type FenceOutput =
  | { kind: "image"; data: Buffer; mimeType: "image/png" }
  | { kind: "text"; text: string }
  | { kind: "error"; error: string };
```

The older `{ ok: true, text }`, `{ ok: true, png }`, and `{ ok: false, error }` result shapes are still normalized for compatibility, but new processors should return `FenceOutput`.

## Minimal example — an `uppercase` processor

Create a pi extension that uppercases any text in an ```` ```upper ```` block:

```typescript
// extensions/my-upper/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function activate(pi: ExtensionAPI): void {
  // Register the processor with pi-fence via the event bus.
  pi.events.emit("pi-fence:register", {
    id: "my-upper-embedded",
    placement: "embedded",
    tags: ["upper"],
    aliases: {},

    async available() {
      return { ok: true }; // pure logic, always available
    },

    async render(_tag, source, signal) {
      if (signal?.aborted) {
        return { kind: "error", error: "Aborted" };
      }
      const trimmed = source.trim();
      if (trimmed.length === 0) {
        return { kind: "error", error: "empty input" };
      }
      return { kind: "text", text: trimmed.toUpperCase() };
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
- The registration is async internally. When policy allows your processor, pi-fence probes `available()` before the tag becomes active. If you emit in your factory, allow a tick for registration to complete before relying on the tag being active.

## Availability probes

`available()` is called once at registration time when the processor is enabled by id and placement policy. If your processor depends on an external binary or service, probe it here:

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

pi-fence resolves processors by placement policy and availability. Third-party processors are registered before `kroki-remote`, the catch-all remote processor, so user policy and explicit bindings can choose them without relying on Kroki being last.

If two processors in different placements claim the same tag, `processorPrecedence` decides which placement wins. If multiple available processors in the winning placement claim the tag, pi-fence reports an ambiguity instead of choosing by registration order. Users can still explicitly bind the tag to a processor in their config:

```json
{
  "bindings": {
    "upper": { "processor": "my-upper-embedded" }
  }
}
```

## What happens on errors

If `render()` returns `{ kind: "error", error }`:

1. pi-fence shows an error panel to the user.
2. The error is sent as a follow-up message to the LLM so it can self-correct.

Never throw from `render()` or `available()` — return the error/unavailable variant instead.
