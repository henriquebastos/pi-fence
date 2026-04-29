/**
 * Live integration test for the configured Kroki renderer.
 *
 * Exercises whichever Kroki processor (`kroki-remote` or `kroki-sandbox`)
 * pi-fence config selects through the same config/factory/resolver
 * composition as production. To force the managed local sandbox, run:
 *
 *   PI_FENCE_CONFIG=tests/fixtures/live-config/kroki-sandbox.json pnpm test:live
 *
 * Two shapes live here:
 *
 *   1. **Data-driven happy-path round-trip** — iterates
 *      `KROKI_TEXT_LANGUAGES` from the research fixture
 *      (`tests/fixtures/kroki/canonical-sources.ts`). Each language
 *      contributes one `it()` asserting that the canonical source
 *      returns a real PNG (magic byte check + per-language size floor).
 *      Aliases (e.g. `dot`, `puml`) get their own `it()` blocks that
 *      exercise the alias-resolution path end-to-end against the
 *      configured Kroki processor. Adding a new language = edit the
 *      fixture, nothing else.
 *
 *   2. **Handwritten specific-behaviour cases** — malformed source
 *      (error path), mid-flight cancellation (AbortSignal path). These
 *      verify behaviours data-driving can't express.
 *
 * No byte-comparison against a committed PNG: Kroki's PNG output is
 * not bit-stable across releases (font hinting, version drift). Size
 * floors in the fixture catch the common regression pattern — Kroki
 * returning a ~300-byte "error PNG" on bad input.
 *
 * Live-suite runtime on the calibration machine: ~25–30s wall-clock
 * for the full set, dominated by c4plantuml which pulls the C4-PlantUML
 * stdlib over HTTPS at Kroki's render time. Accept the cost — it's the
 * honest price of verifying real rendering.
 */

import { describe, expect, it } from "vitest";

import { createBuiltInProcessors } from "../../extensions/pi-fence/built-in-processors.ts";
import { DEFAULT_PROCESSOR_PRECEDENCE } from "../../extensions/pi-fence/config.ts";
import { loadPiFenceConfig } from "../../extensions/pi-fence/io/config-loader.ts";
import { NodeHttpClient } from "../../extensions/pi-fence/io/http-client.ts";
import { NULL_LOGGER } from "../../extensions/pi-fence/io/logger.ts";
import { NodeShellRunner } from "../../extensions/pi-fence/io/shell-runner.ts";
import type { FenceProcessor, FenceResult } from "../../extensions/pi-fence/processor.ts";
import { probeAvailability, resolveProcessor } from "../../extensions/pi-fence/resolve.ts";
import { createSandboxControllers } from "../../extensions/pi-fence/sandbox-context.ts";
import { KROKI_TEXT_LANGUAGES } from "../fixtures/kroki/canonical-sources.ts";
import { hasNetwork } from "../utilities/live-deps.ts";

// Deliberately malformed mermaid; Kroki returns 4xx with a parse error.
const BROKEN_MERMAID = "flowchart\n  A ->>> B";
const DEFAULT_KROKI_ENDPOINT = "https://kroki.io";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Per-case timeout. c4plantuml's stdlib fetch on Kroki's side has been
// observed at ~10s; the rest land in the 1–3s range. 30s leaves head-
// room for transient slow paths without masking a genuinely hung request.
const PER_LANGUAGE_TIMEOUT_MS = 30_000;

const runtime = await createConfiguredKrokiRuntime();

describe("kroki renderer — live", () => {
	describe("happy-path PNG round-trip per language", () => {
		for (const spec of KROKI_TEXT_LANGUAGES) {
			it.skipIf(!runtime.canRender(spec.tag))(
				`renders a canonical \`${spec.tag}\` source as a real PNG (≥ ${spec.sizeFloorBytes}B)`,
				async () => {
					const result = await runtime.render(spec.tag, spec.source);

					expect(result.ok).toBe(true);
					if (!result.ok || !("png" in result)) return;

					// Magic byte check: the response is a real PNG, not HTML,
					// not JSON, not a redirect body.
					expect(
						result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
					).toBe(true);

					// Per-language size floor. Guards against Kroki regressing
					// to ~300-byte "error PNG" responses on otherwise 200 status.
					// Calibrated in the fixture from the research pass.
					expect(result.png.length).toBeGreaterThan(spec.sizeFloorBytes);
				},
				PER_LANGUAGE_TIMEOUT_MS,
			);
		}
	});

	describe("alias resolution (end-to-end)", () => {
		for (const spec of KROKI_TEXT_LANGUAGES) {
			for (const alias of spec.aliases) {
				it.skipIf(!runtime.canRender(alias))(
					`resolves alias \`${alias}\` to \`${spec.tag}\` and renders a real PNG`,
					async () => {
						// Caller writes the alias; kroki.ts maps to the
						// /<canonical>/png endpoint at request time. A
						// successful PNG here proves both the alias path and
						// the live wiring work against the configured Kroki
						// processor.
						const result = await runtime.render(alias, spec.source);

						expect(result.ok).toBe(true);
						if (!result.ok || !("png" in result)) return;

						expect(
							result.png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
						).toBe(true);
						expect(result.png.length).toBeGreaterThan(spec.sizeFloorBytes);
					},
					PER_LANGUAGE_TIMEOUT_MS,
				);
			}
		}
	});

	it.skipIf(!runtime.canRender("mermaid"))(
		"returns ok:false with an error message on malformed mermaid",
		async () => {
			const result = await runtime.render("mermaid", BROKEN_MERMAID);

			expect(result.ok).toBe(false);
			if (result.ok) return;

			// Kroki's error bodies are prose; we only assert non-empty.
			// Specific wording drifts across kroki versions.
			expect(result.error.length).toBeGreaterThan(0);
		},
		PER_LANGUAGE_TIMEOUT_MS,
	);

	it.skipIf(!runtime.canRender("mermaid"))(
		"survives a cancellation mid-flight via AbortSignal",
		async () => {
			const controller = new AbortController();
			// Fire abort almost immediately — likely lands before the response.
			setTimeout(() => controller.abort(), 10);

			const result = await runtime.render(
				"mermaid",
				"flowchart LR\nA --> B",
				controller.signal,
			);

			expect(result.ok).toBe(false);
			// The error message content depends on where in the round-trip
			// the abort took effect. All paths must produce ok:false without
			// throwing.
		},
		PER_LANGUAGE_TIMEOUT_MS,
	);
});

interface ConfiguredKrokiRuntime {
	canRender(tag: string): boolean;
	render(tag: string, source: string, signal?: AbortSignal): Promise<FenceResult>;
}

async function createConfiguredKrokiRuntime(): Promise<ConfiguredKrokiRuntime> {
	const shell = new NodeShellRunner();
	const http = new NodeHttpClient();
	const configResult = await loadPiFenceConfig({ logger: NULL_LOGGER });
	const config = configResult.config;
	const sandboxes = createSandboxControllers({ shell, logger: NULL_LOGGER }, config);
	const creation = await createBuiltInProcessors({
		http,
		shell,
		logger: NULL_LOGGER,
		themeState: {},
		config,
		sandboxes,
	});
	if (creation.diagnostics.length > 0) {
		throw new Error(`processor factory diagnostics: ${JSON.stringify(creation.diagnostics)}`);
	}
	const processors = creation.processors;
	const availability = await probeAvailability(processors);
	const remoteNetworkUp = await hasNetwork(config.kroki?.endpoint ?? DEFAULT_KROKI_ENDPOINT);

	const processorFor = (tag: string): FenceProcessor | undefined => {
		const resolved = resolveProcessor(
			processors,
			availability,
			tag,
			config.bindings,
			new Set(config.blocked?.processors ?? []),
			config.processorPrecedence ?? DEFAULT_PROCESSOR_PRECEDENCE,
			new Set(config.blocked?.tags ?? []),
		);
		const processor = resolved.processor ?? undefined;
		if (!processor?.id.startsWith("kroki-")) return undefined;
		if (processor.id === "kroki-remote" && !remoteNetworkUp) return undefined;
		return processor;
	};

	return {
		canRender: (tag) => processorFor(tag) !== undefined,
		render: async (tag, source, signal) => {
			const processor = processorFor(tag);
			if (!processor) {
				return { ok: false, error: `No configured Kroki processor available for ${tag}` };
			}
			return processor.render(tag, source, signal);
		},
	};
}
