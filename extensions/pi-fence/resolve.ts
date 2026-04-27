/**
 * Processor resolution — the registry's one piece of logic.
 *
 * `resolveProcessor(processors, availability, tag)` returns the selected
 * processor plus the structured trace steps that explain each candidate's
 * outcome. `processor` is `null` if no registered, enabled, available
 * processor can handle the tag.
 *
 * `probeAvailability(processors)` runs every processor's `available()`
 * once and returns a map from processor id to result. Defensive against
 * processor authors who forget the "never throw" contract — a thrown
 * probe would otherwise crash the extension's wire-time initialisation.
 *
 * Both functions are pure (apart from the async probe). No pi-SDK, no
 * pi-tui, no HTTP, no shell. Unit tests construct fake processors with
 * scripted `available()` responses and assert on the outputs directly.
 *
 * Landed in CV0.E2.S1 when pi-fence stopped assuming a single processor
 * and needed a resolution rule between "parsed a block" and "render it".
 * CV9.E1.S1 made that rule placement-aware: user policy picks the
 * allowed placement order, while bindings remain tag-scoped preferences.
 */

import { DEFAULT_PROCESSOR_PRECEDENCE, type TagBinding } from "./config.ts";
import type {
	Availability,
	FenceProcessor,
	ProcessorPlacement,
} from "./processor.ts";

export type StepOutcome =
	| "selected-by-binding"
	| "selected-by-placement"
	| "skipped-already-resolved"
	| "skipped-ambiguous-same-placement"
	| "skipped-binding-prefers-other"
	| "skipped-disabled"
	| "skipped-lower-precedence"
	| "skipped-no-claim"
	| "skipped-placement-disabled"
	| "skipped-unavailable";

export interface TraceStep {
	id: string;
	outcome: StepOutcome;
}

export interface ResolveAmbiguity {
	placement: ProcessorPlacement;
	processorIds: string[];
}

export interface ResolveProcessorResult {
	processor: FenceProcessor | null;
	steps: TraceStep[];
	ambiguity?: ResolveAmbiguity;
}

interface ResolveContext {
	availability: ReadonlyMap<string, Availability>;
	allowedPlacements: ReadonlySet<ProcessorPlacement>;
	binding?: TagBinding;
	boundId?: string;
	disabled?: ReadonlySet<string>;
	placementRank: ReadonlyMap<ProcessorPlacement, number>;
	tag: string;
}

interface Selection {
	index: number;
	mode: "binding" | "placement";
	processor: FenceProcessor;
}

interface PlacementDecision {
	ambiguity?: ResolveAmbiguity;
	selection?: Selection;
}

type BlockingOutcome =
	| "skipped-disabled"
	| "skipped-no-claim"
	| "skipped-placement-disabled"
	| "skipped-unavailable";

/**
 * Return the processor that can serve `tag` under user placement policy.
 *
 * Resolution rule (CV9.E1.S1):
 *   1. Disabled ids and omitted placements are hard skips.
 *   2. A user binding wins only when its processor is registered,
 *      available, enabled, and in an allowed placement.
 *   3. Otherwise, gather available candidates that claim the tag and
 *      choose the first placement in `processorPrecedence` with exactly
 *      one candidate.
 *   4. Multiple candidates in that winning placement are ambiguous;
 *      do not fall through to a lower-trust placement by registration order.
 *
 * Bindings are still preferences, not hard requirements. A binding to an
 * unknown, unavailable, disabled, or placement-disabled processor falls
 * through to placement policy. Strict mode remains deferred to S2/S3.
 *
 * Pure. The caller logs at wire time; `resolve.ts` has no logger.
 */
export function resolveProcessor(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	bindings?: Readonly<Record<string, TagBinding>>,
	disabled?: ReadonlySet<string>,
	processorPrecedence: readonly ProcessorPlacement[] = DEFAULT_PROCESSOR_PRECEDENCE,
): ResolveProcessorResult {
	const context: ResolveContext = {
		availability,
		allowedPlacements: new Set(processorPrecedence),
		binding: bindings?.[tag],
		boundId: processorBindingId(bindings?.[tag]),
		disabled,
		placementRank: buildPlacementRank(processorPrecedence),
		tag,
	};
	const bindingDecision = selectBinding(processors, context);
	const placementDecision = bindingDecision.selection || bindingDecision.ambiguity
		? {}
		: selectByPlacement(processors, context, processorPrecedence);
	const selection = bindingDecision.selection ?? placementDecision.selection;
	const ambiguity = bindingDecision.ambiguity ?? placementDecision.ambiguity;
	const steps = buildTraceSteps(processors, context, selection, ambiguity);

	return {
		processor: selection?.processor ?? null,
		steps,
		...(ambiguity ? { ambiguity } : {}),
	};
}

function selectBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
): PlacementDecision {
	if (context.binding === undefined) return {};
	if ("processor" in context.binding) return selectProcessorBinding(processors, context);
	return selectPlacementBinding(processors, context, context.binding.placement);
}

function selectProcessorBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
): PlacementDecision {
	if (context.boundId === undefined) return {};
	const index = processors.findIndex((processor) => processor.id === context.boundId);
	if (index < 0) return {};
	const processor = processors[index];
	if (bindingBlocked(processor, context) || !claimsTag(processor, context.tag)) {
		return {};
	}
	return { selection: { index, mode: "binding", processor } };
}

function selectPlacementBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
	placement: ProcessorPlacement,
): PlacementDecision {
	if (!context.allowedPlacements.has(placement)) return {};
	return selectByPlacement(processors, context, [placement], "binding");
}

function selectByPlacement(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
	processorPrecedence: readonly ProcessorPlacement[],
	mode: Selection["mode"] = "placement",
): PlacementDecision {
	const candidates = processors
		.map((processor, index) => ({ index, processor }))
		.filter(({ processor }) => candidateBlocked(processor, context) === undefined);

	for (const placement of processorPrecedence) {
		const group = candidates.filter(({ processor }) => processor.placement === placement);
		if (group.length === 0) continue;
		if (group.length === 1) {
			return {
				selection: {
					index: group[0].index,
					mode,
					processor: group[0].processor,
				},
			};
		}
		return {
			ambiguity: {
				placement,
				processorIds: group.map(({ processor }) => processor.id),
			},
		};
	}

	return {};
}

function buildTraceSteps(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
	selection?: Selection,
	ambiguity?: ResolveAmbiguity,
): TraceStep[] {
	const ambiguousIds = new Set(ambiguity?.processorIds ?? []);
	return processors.map((processor, index) => ({
		id: processor.id,
		outcome: traceOutcome(processor, index, context, selection, ambiguity, ambiguousIds),
	}));
}

function traceOutcome(
	processor: FenceProcessor,
	index: number,
	context: ResolveContext,
	selection: Selection | undefined,
	ambiguity: ResolveAmbiguity | undefined,
	ambiguousIds: ReadonlySet<string>,
): StepOutcome {
	if (selection?.processor.id === processor.id) {
		return selection.mode === "binding" ? "selected-by-binding" : "selected-by-placement";
	}

	const blocked = candidateBlocked(processor, context);
	if (blocked === "skipped-disabled" || blocked === "skipped-placement-disabled") {
		return blocked;
	}
	if (isLowerPrecedenceThanSelection(processor, selection, context)) {
		return "skipped-lower-precedence";
	}
	if (selection?.mode === "binding") {
		return blocked ?? "skipped-binding-prefers-other";
	}
	if (selection && index > selection.index) {
		return "skipped-already-resolved";
	}
	if (blocked) return blocked;
	if (ambiguity) {
		return ambiguousIds.has(processor.id)
			? "skipped-ambiguous-same-placement"
			: "skipped-lower-precedence";
	}
	if (selection) {
		return "skipped-lower-precedence";
	}
	return context.binding === undefined ? "skipped-no-claim" : "skipped-binding-prefers-other";
}

function isLowerPrecedenceThanSelection(
	processor: FenceProcessor,
	selection: Selection | undefined,
	context: ResolveContext,
): boolean {
	if (selection?.mode !== "placement") return false;
	const processorRank = context.placementRank.get(processor.placement);
	const selectedRank = context.placementRank.get(selection.processor.placement);
	return processorRank !== undefined && selectedRank !== undefined && processorRank > selectedRank;
}

function buildPlacementRank(
	processorPrecedence: readonly ProcessorPlacement[],
): ReadonlyMap<ProcessorPlacement, number> {
	return new Map(processorPrecedence.map((placement, index) => [placement, index]));
}

function bindingBlocked(
	processor: FenceProcessor,
	context: ResolveContext,
): Exclude<BlockingOutcome, "skipped-no-claim"> | undefined {
	if (context.disabled?.has(processor.id)) return "skipped-disabled";
	if (!context.allowedPlacements.has(processor.placement)) {
		return "skipped-placement-disabled";
	}
	if (context.availability.get(processor.id)?.ok !== true) return "skipped-unavailable";
	return undefined;
}

function candidateBlocked(
	processor: FenceProcessor,
	context: ResolveContext,
): BlockingOutcome | undefined {
	const blocked = bindingBlocked(processor, context);
	if (blocked) return blocked;
	if (!claimsTag(processor, context.tag)) return "skipped-no-claim";
	return undefined;
}

function claimsTag(processor: FenceProcessor, tag: string): boolean {
	return processor.tags.includes(tag) || processor.aliases[tag] !== undefined;
}

function processorBindingId(binding: TagBinding | undefined): string | undefined {
	return binding && "processor" in binding ? binding.processor : undefined;
}

/**
 * Surface per-binding resolution state for `/fence list`. Returns one
 * row per entry in `bindings`, preserving iteration order. Each row
 * says whether the binding is `effective` (registered + available, so
 * resolveProcessor would honour it) or `ignored` (with a reason).
 *
 * Separate from `resolveProcessor` because `/fence list` needs the
 * full categorisation once at render time; the per-block resolver
 * only needs the positive lookup per tag.
 */
export type BindingResolution =
	| { status: "effective"; tag: string; processorId: string }
	| {
			status: "effective";
			tag: string;
			selector: "placement";
			placement: ProcessorPlacement;
			processorId: string;
	  }
	| {
			status: "ignored";
			tag: string;
			processorId: string;
			reason:
				| "unknown-processor"
				| "processor-unavailable"
				| "processor-disabled"
				| "processor-placement-disabled"
				| "processor-does-not-claim-tag";
		}
	| {
			status: "ignored";
			tag: string;
			selector: "placement";
			placement: ProcessorPlacement;
			reason: "placement-disabled" | "placement-no-match";
		}
	| {
			status: "ignored";
			tag: string;
			selector: "placement";
			placement: ProcessorPlacement;
			reason: "placement-ambiguous";
			processorIds: string[];
		};

export function resolveBindings(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	bindings: Readonly<Record<string, TagBinding>>,
	disabled?: ReadonlySet<string>,
	processorPrecedence: readonly ProcessorPlacement[] = DEFAULT_PROCESSOR_PRECEDENCE,
): BindingResolution[] {
	const out: BindingResolution[] = [];
	const allowedPlacements = new Set(processorPrecedence);
	for (const [tag, binding] of Object.entries(bindings)) {
		if ("placement" in binding) {
			const placementRow = resolvePlacementBinding(
				processors,
				availability,
				tag,
				binding.placement,
				disabled,
				processorPrecedence,
			);
			if (placementRow !== undefined) out.push(placementRow);
			continue;
		}
		const processorId = processorBindingId(binding);
		if (processorId === undefined) continue;
		const processor = processors.find((p) => p.id === processorId);
		if (!processor) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "unknown-processor",
			});
			continue;
		}
		if (disabled?.has(processor.id)) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "processor-disabled",
			});
			continue;
		}
		if (!allowedPlacements.has(processor.placement)) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "processor-placement-disabled",
			});
			continue;
		}
		if (availability.get(processor.id)?.ok !== true) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "processor-unavailable",
			});
			continue;
		}
		if (!claimsTag(processor, tag)) {
			out.push({
				status: "ignored",
				tag,
				processorId,
				reason: "processor-does-not-claim-tag",
			});
			continue;
		}
		out.push({ status: "effective", tag, processorId });
	}
	return out;
}

function resolvePlacementBinding(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	placement: ProcessorPlacement,
	disabled: ReadonlySet<string> | undefined,
	processorPrecedence: readonly ProcessorPlacement[],
): BindingResolution | undefined {
	const allowedPlacements = new Set(processorPrecedence);
	if (!allowedPlacements.has(placement)) {
		return {
			status: "ignored",
			tag,
			selector: "placement",
			placement,
			reason: "placement-disabled",
		};
	}
	const context: ResolveContext = {
		availability,
		allowedPlacements,
		binding: { placement },
		disabled,
		placementRank: buildPlacementRank(processorPrecedence),
		tag,
	};
	const candidates = processors.filter(
		(processor) =>
			processor.placement === placement && candidateBlocked(processor, context) === undefined,
	);
	if (candidates.length === 0) {
		return {
			status: "ignored",
			tag,
			selector: "placement",
			placement,
			reason: "placement-no-match",
		};
	}
	if (candidates.length > 1) {
		return {
			status: "ignored",
			tag,
			selector: "placement",
			placement,
			reason: "placement-ambiguous",
			processorIds: candidates.map((processor) => processor.id),
		};
	}
	return {
		status: "effective",
		tag,
		selector: "placement",
		placement,
		processorId: candidates[0].id,
	};
}

/**
 * Probe every processor's `available()` in registration order and
 * return a map from processor id to result. Called once at wire time
 * by the extension; the returned map is captured and reused for the
 * session.
 *
 * The `FenceProcessor` contract says `available()` must never throw,
 * and the contract helper asserts it. This function still wraps each
 * call in try/catch because a processor author whose probe crashes
 * would otherwise take the whole extension down at registration —
 * worse than a single processor silently listing as `unavailable`.
 * Thrown values become `{ ok: false, reason: <stringified error> }`.
 */
export async function probeAvailability(
	processors: readonly FenceProcessor[],
): Promise<Map<string, Availability>> {
	const out = new Map<string, Availability>();
	for (const processor of processors) {
		try {
			out.set(processor.id, await processor.available());
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			out.set(processor.id, {
				ok: false,
				reason: `available() threw: ${message}`,
			});
		}
	}
	return out;
}

/**
 * Derive the extension's fenced-block allowlist from the registered
 * processors. Canonical tags + alias keys across every processor.
 * Duplicate tags (when two processors both claim `graphviz`, for
 * example) are collapsed to one entry — the parser only cares that
 * the tag is accepted, not which processor will handle it.
 *
 * Lives alongside `resolveProcessor` because they share the same
 * processor-array input shape and callers typically use both.
 */
export function collectSupportedTags(
	processors: readonly FenceProcessor[],
): string[] {
	const tags = new Set<string>();
	for (const processor of processors) {
		for (const tag of processor.tags) tags.add(tag);
		for (const alias of Object.keys(processor.aliases)) tags.add(alias);
	}
	return [...tags];
}
