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
 * allowed placement order. CV9.E1.S2 made bindings exact tag-scoped
 * selector constraints that fail closed when the selected processor or
 * placement cannot produce exactly one eligible processor.
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
	constrained?: boolean;
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
 * Resolution rule (CV9.E1):
 *   1. Disabled ids and omitted placements are hard skips.
 *   2. A tag binding is a selector constraint. It selects only matching,
 *      enabled, available processors inside allowed placements.
 *   3. An unsatisfied binding selects no processor for that tag; it does
 *      not fall through to broader placement policy.
 *   4. Without a binding, gather available candidates that claim the tag
 *      and choose the first placement in `processorPrecedence` with exactly
 *      one candidate.
 *   5. Multiple candidates in the winning placement are ambiguous;
 *      do not fall through to a lower-trust placement by registration order.
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
	const binding = bindingForTag(bindings, tag);
	const context: ResolveContext = {
		availability,
		allowedPlacements: new Set(processorPrecedence),
		binding,
		boundId: processorBindingId(binding),
		disabled,
		placementRank: buildPlacementRank(processorPrecedence),
		tag,
	};
	const bindingDecision = selectBinding(processors, context);
	const placementDecision = bindingDecision.constrained
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
	if (isProcessorBinding(context.binding)) return selectProcessorBinding(processors, context);
	return selectPlacementBinding(processors, context, context.binding.placement);
}

function selectProcessorBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
): PlacementDecision {
	if (context.boundId === undefined) return { constrained: true };
	const index = processors.findIndex((processor) => processor.id === context.boundId);
	if (index < 0) return { constrained: true };
	const processor = processors[index];
	if (bindingBlocked(processor, context) || !claimsTag(processor, context.tag)) {
		return { constrained: true };
	}
	return { constrained: true, selection: { index, mode: "binding", processor } };
}

function selectPlacementBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
	placement: ProcessorPlacement,
): PlacementDecision {
	if (!context.allowedPlacements.has(placement)) return { constrained: true };
	return { constrained: true, ...selectByPlacement(processors, context, [placement], "binding") };
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
		return selectedOutcome(selection);
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
	if (ambiguity) return ambiguityOutcome(processor, context, ambiguousIds);
	if (selection) return "skipped-lower-precedence";
	return unresolvedOutcome(context);
}

function selectedOutcome(selection: Selection): StepOutcome {
	return selection.mode === "binding" ? "selected-by-binding" : "selected-by-placement";
}

function ambiguityOutcome(
	processor: FenceProcessor,
	context: ResolveContext,
	ambiguousIds: ReadonlySet<string>,
): StepOutcome {
	if (ambiguousIds.has(processor.id)) return "skipped-ambiguous-same-placement";
	return unresolvedOutcome(context, "skipped-lower-precedence");
}

function unresolvedOutcome(
	context: ResolveContext,
	fallback: StepOutcome = "skipped-no-claim",
): StepOutcome {
	return context.binding === undefined ? fallback : "skipped-binding-prefers-other";
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
	return binding && isProcessorBinding(binding) ? binding.processor : undefined;
}

function bindingForTag(
	bindings: Readonly<Record<string, TagBinding>> | undefined,
	tag: string,
): TagBinding | undefined {
	if (bindings === undefined || !Object.hasOwn(bindings, tag)) return undefined;
	const binding = bindings[tag] as unknown;
	return isTagBinding(binding) ? binding : undefined;
}

function isTagBinding(binding: unknown): binding is TagBinding {
	if (!isPlainBindingObject(binding)) return false;
	return (
		(typeof binding.processor === "string" && binding.placement === undefined) ||
		(binding.processor === undefined && typeof binding.placement === "string")
	);
}

function isProcessorBinding(binding: TagBinding): binding is { processor: string } {
	return "processor" in binding;
}

function isPlainBindingObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Surface per-binding resolution state for `/fence list` and `/fence doctor`.
 * Returns one row per entry in `bindings`, preserving iteration order. Effective
 * rows identify the selected processor; issue rows explain why the selector has
 * no single eligible processor.
 *
 * Separate from `resolveProcessor` because command output needs full
 * categorisation once at render time; the per-block resolver only needs the
 * selected processor, trace, and ambiguity state.
 */
export type BindingResolution =
	| { status: "effective"; tag: string; selector: "processor"; processorId: string }
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
			selector: "processor";
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
	const allowedPlacements = new Set(processorPrecedence);
	return Object.entries(bindings).map(([tag, binding]) =>
		resolveBinding(
			processors,
			availability,
			tag,
			binding,
			disabled,
			processorPrecedence,
			allowedPlacements,
		),
	);
}

function resolveBinding(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	binding: TagBinding,
	disabled: ReadonlySet<string> | undefined,
	processorPrecedence: readonly ProcessorPlacement[],
	allowedPlacements: ReadonlySet<ProcessorPlacement>,
): BindingResolution {
	if ("placement" in binding) {
		return resolvePlacementBinding(
			processors,
			availability,
			tag,
			binding.placement,
			disabled,
			processorPrecedence,
			allowedPlacements,
		);
	}
	return resolveProcessorBinding(
		processors,
		availability,
		tag,
		binding.processor,
		disabled,
		allowedPlacements,
	);
}

type ProcessorBindingIssueReason = Extract<
	BindingResolution,
	{ status: "ignored"; processorId: string }
>["reason"];

function resolveProcessorBinding(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	processorId: string,
	disabled: ReadonlySet<string> | undefined,
	allowedPlacements: ReadonlySet<ProcessorPlacement>,
): BindingResolution {
	const processor = processors.find((p) => p.id === processorId);
	if (!processor) return processorBindingIssue(tag, processorId, "unknown-processor");
	if (disabled?.has(processor.id)) {
		return processorBindingIssue(tag, processorId, "processor-disabled");
	}
	if (!allowedPlacements.has(processor.placement)) {
		return processorBindingIssue(tag, processorId, "processor-placement-disabled");
	}
	if (availability.get(processor.id)?.ok !== true) {
		return processorBindingIssue(tag, processorId, "processor-unavailable");
	}
	if (!claimsTag(processor, tag)) {
		return processorBindingIssue(tag, processorId, "processor-does-not-claim-tag");
	}
	return { status: "effective", tag, selector: "processor", processorId };
}

function processorBindingIssue(
	tag: string,
	processorId: string,
	reason: ProcessorBindingIssueReason,
): BindingResolution {
	return { status: "ignored", tag, selector: "processor", processorId, reason };
}

function resolvePlacementBinding(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	placement: ProcessorPlacement,
	disabled: ReadonlySet<string> | undefined,
	processorPrecedence: readonly ProcessorPlacement[],
	allowedPlacements: ReadonlySet<ProcessorPlacement>,
): BindingResolution {
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
