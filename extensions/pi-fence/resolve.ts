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

interface CandidateContext {
	availability: ReadonlyMap<string, Availability>;
	allowedPlacements: ReadonlySet<ProcessorPlacement>;
	disabled?: ReadonlySet<string>;
	tag: string;
}

interface ResolveContext extends CandidateContext {
	binding?: TagBinding;
	boundId?: string;
	placementRank: ReadonlyMap<ProcessorPlacement, number>;
}

interface Selection {
	index: number;
	mode: "binding" | "placement";
	processor: FenceProcessor;
}

interface ProcessorCandidate {
	index: number;
	processor: FenceProcessor;
}

interface ResolutionDecision {
	ambiguity?: ResolveAmbiguity;
	constrained?: boolean;
	selection?: Selection;
}

type BlockingOutcome =
	| "skipped-disabled"
	| "skipped-no-claim"
	| "skipped-placement-disabled"
	| "skipped-unavailable";

type ProcessorBindingIssueReason =
	| "unknown-processor"
	| "processor-unavailable"
	| "processor-disabled"
	| "processor-placement-disabled"
	| "processor-does-not-claim-tag";

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
): ResolutionDecision {
	if (context.binding === undefined) return {};
	if (isProcessorBinding(context.binding)) return selectProcessorBinding(processors, context);
	return selectPlacementBinding(processors, context, context.binding.placement);
}

function selectProcessorBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
): ResolutionDecision {
	if (context.boundId === undefined) return { constrained: true };
	const index = processors.findIndex((processor) => processor.id === context.boundId);
	if (index < 0) return { constrained: true };
	const processor = processors[index];
	if (processorBindingIssueReason(processor, context)) {
		return { constrained: true };
	}
	return { constrained: true, selection: { index, mode: "binding", processor } };
}

function selectPlacementBinding(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
	placement: ProcessorPlacement,
): ResolutionDecision {
	const classification = classifyPlacementBinding(processors, context, placement);
	if (classification.kind === "effective") {
		return {
			constrained: true,
			selection: {
				index: classification.candidate.index,
				mode: "binding",
				processor: classification.candidate.processor,
			},
		};
	}
	if (classification.kind === "ambiguous") {
		return {
			constrained: true,
			ambiguity: {
				placement,
				processorIds: classification.candidates.map(({ processor }) => processor.id),
			},
		};
	}
	return { constrained: true };
}

function selectByPlacement(
	processors: readonly FenceProcessor[],
	context: ResolveContext,
	processorPrecedence: readonly ProcessorPlacement[],
	mode: Selection["mode"] = "placement",
): ResolutionDecision {
	const candidates = eligibleCandidates(processors, context);

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

type PlacementBindingClassification =
	| { kind: "disabled" }
	| { kind: "no-match" }
	| { kind: "ambiguous"; candidates: ProcessorCandidate[] }
	| { kind: "effective"; candidate: ProcessorCandidate };

function classifyPlacementBinding(
	processors: readonly FenceProcessor[],
	context: CandidateContext,
	placement: ProcessorPlacement,
): PlacementBindingClassification {
	if (!context.allowedPlacements.has(placement)) return { kind: "disabled" };
	const candidates = eligibleCandidates(processors, context).filter(
		({ processor }) => processor.placement === placement,
	);
	if (candidates.length === 0) return { kind: "no-match" };
	if (candidates.length > 1) return { kind: "ambiguous", candidates };
	return { kind: "effective", candidate: candidates[0] };
}

function eligibleCandidates(
	processors: readonly FenceProcessor[],
	context: CandidateContext,
): ProcessorCandidate[] {
	return processors
		.map((processor, index) => ({ index, processor }))
		.filter(({ processor }) => candidateBlocked(processor, context) === undefined);
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
	context: CandidateContext,
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
	context: CandidateContext,
): BlockingOutcome | undefined {
	const blocked = bindingBlocked(processor, context);
	if (blocked) return blocked;
	if (!claimsTag(processor, context.tag)) return "skipped-no-claim";
	return undefined;
}

function processorBindingIssueReason(
	processor: FenceProcessor,
	context: CandidateContext,
): ProcessorBindingIssueReason | undefined {
	const blocked = candidateBlocked(processor, context);
	if (blocked === undefined) return undefined;
	if (blocked === "skipped-disabled") return "processor-disabled";
	if (blocked === "skipped-placement-disabled") return "processor-placement-disabled";
	if (blocked === "skipped-unavailable") return "processor-unavailable";
	return "processor-does-not-claim-tag";
}

function claimsTag(processor: FenceProcessor, tag: string): boolean {
	return processor.tags.includes(tag) || Object.hasOwn(processor.aliases, tag);
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
	const hasProcessor = Object.hasOwn(binding, "processor");
	const hasPlacement = Object.hasOwn(binding, "placement");
	return (
		(hasProcessor && !hasPlacement && typeof binding.processor === "string") ||
		(!hasProcessor && hasPlacement && typeof binding.placement === "string")
	);
}

function isProcessorBinding(binding: TagBinding): binding is { processor: string } {
	return Object.hasOwn(binding, "processor");
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
			status: "issue";
			tag: string;
			selector: "processor";
			processorId: string;
			reason: ProcessorBindingIssueReason;
		}
	| {
			status: "issue";
			tag: string;
			selector: "placement";
			placement: ProcessorPlacement;
			reason: "placement-disabled" | "placement-no-match";
		}
	| {
			status: "issue";
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
	allowedPlacements: ReadonlySet<ProcessorPlacement>,
): BindingResolution {
	if ("placement" in binding) {
		return resolvePlacementBinding(
			processors,
			availability,
			tag,
			binding.placement,
			disabled,
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
	const reason = processorBindingIssueReason(processor, {
		availability,
		allowedPlacements,
		disabled,
		tag,
	});
	if (reason) return processorBindingIssue(tag, processorId, reason);
	return { status: "effective", tag, selector: "processor", processorId };
}

function processorBindingIssue(
	tag: string,
	processorId: string,
	reason: ProcessorBindingIssueReason,
): BindingResolution {
	return { status: "issue", tag, selector: "processor", processorId, reason };
}

function resolvePlacementBinding(
	processors: readonly FenceProcessor[],
	availability: ReadonlyMap<string, Availability>,
	tag: string,
	placement: ProcessorPlacement,
	disabled: ReadonlySet<string> | undefined,
	allowedPlacements: ReadonlySet<ProcessorPlacement>,
): BindingResolution {
	const classification = classifyPlacementBinding(
		processors,
		{ availability, allowedPlacements, disabled, tag },
		placement,
	);
	if (classification.kind === "disabled") {
		return placementBindingIssue(tag, placement, "placement-disabled");
	}
	if (classification.kind === "no-match") {
		return placementBindingIssue(tag, placement, "placement-no-match");
	}
	if (classification.kind === "ambiguous") {
		return {
			status: "issue",
			tag,
			selector: "placement",
			placement,
			reason: "placement-ambiguous",
			processorIds: classification.candidates.map(({ processor }) => processor.id),
		};
	}
	return {
		status: "effective",
		tag,
		selector: "placement",
		placement,
		processorId: classification.candidate.processor.id,
	};
}

function placementBindingIssue(
	tag: string,
	placement: ProcessorPlacement,
	reason: "placement-disabled" | "placement-no-match",
): BindingResolution {
	return { status: "issue", tag, selector: "placement", placement, reason };
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
