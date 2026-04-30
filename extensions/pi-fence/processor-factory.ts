import type { ThemeState } from "./agent-end.ts";
import type { HttpClient } from "./io/http-client.ts";
import type { Logger } from "./io/logger.ts";
import type { ShellRunner } from "./io/shell-runner.ts";
import type { ResolvedPiFencePolicy } from "./policy.ts";
import type { FenceProcessor } from "./processor.ts";
import { validateProcessor } from "./register.ts";
import type { SandboxController } from "./sandbox.ts";

export interface ProcessorFactoryContext {
	http: HttpClient;
	shell: ShellRunner;
	logger: Logger;
	themeState: ThemeState;
	policy: ResolvedPiFencePolicy;
	sandboxes: ReadonlyMap<string, SandboxController>;
}

export interface ProcessorFactoryRegistration {
	readonly id: string;
	create(context: ProcessorFactoryContext): FenceProcessor | Promise<FenceProcessor>;
}

export interface ProcessorFactoryModuleRecord {
	readonly name: string;
	readonly module: Readonly<Record<string, unknown>>;
}

export interface ProcessorFactoryDiagnostic {
	readonly moduleName?: string;
	readonly factoryId?: string;
	readonly message: string;
}

export interface ProcessorFactoryCollectionResult {
	readonly factories: ProcessorFactoryRegistration[];
	readonly diagnostics: ProcessorFactoryDiagnostic[];
}

export interface ProcessorFactoryCreationResult {
	readonly processors: FenceProcessor[];
	readonly diagnostics: ProcessorFactoryDiagnostic[];
}

const FORBIDDEN_FACTORY_FIELDS = ["order", "priority", "processorPrecedence"] as const;

export function collectProcessorFactories(
	modules: readonly ProcessorFactoryModuleRecord[],
): ProcessorFactoryCollectionResult {
	const factories: ProcessorFactoryRegistration[] = [];
	const diagnostics: ProcessorFactoryDiagnostic[] = [];
	const seen = new Set<string>();
	for (const record of modules) {
		const validation = validateProcessorFactoryRecord(record);
		if (!validation.ok) {
			diagnostics.push(validation.diagnostic);
			continue;
		}
		const factory = validation.factory;
		if (seen.has(factory.id)) {
			diagnostics.push({
				moduleName: record.name,
				factoryId: factory.id,
				message: `duplicate processorFactory id ${factory.id}`,
			});
			continue;
		}
		seen.add(factory.id);
		factories.push(factory);
	}
	return { factories, diagnostics };
}

export async function createProcessorsFromFactories(
	factories: readonly ProcessorFactoryRegistration[],
	context: ProcessorFactoryContext,
): Promise<ProcessorFactoryCreationResult> {
	const processors: FenceProcessor[] = [];
	const diagnostics: ProcessorFactoryDiagnostic[] = [];
	for (const factory of factories) {
		try {
			const created = await factory.create(context);
			const validation = validateProcessor(created);
			if (!validation.ok) {
				diagnostics.push({
					factoryId: factory.id,
					message: `invalid processor from factory ${factory.id}: ${validation.error}`,
				});
				continue;
			}
			processors.push(validation.processor);
		} catch (error) {
			diagnostics.push({
				factoryId: factory.id,
				message: `processorFactory ${factory.id} create failed: ${errorMessage(error)}`,
			});
		}
	}
	return { processors, diagnostics };
}

export async function createProcessorsFromFactoryModules(
	modules: readonly ProcessorFactoryModuleRecord[],
	context: ProcessorFactoryContext,
): Promise<ProcessorFactoryCreationResult> {
	const collection = collectProcessorFactories(modules);
	const creation = await createProcessorsFromFactories(collection.factories, context);
	return {
		processors: creation.processors,
		diagnostics: [...collection.diagnostics, ...creation.diagnostics],
	};
}

function validateProcessorFactoryRecord(record: ProcessorFactoryModuleRecord):
	| { ok: true; factory: ProcessorFactoryRegistration }
	| { ok: false; diagnostic: ProcessorFactoryDiagnostic } {
	const candidate = record.module.processorFactory;
	if (candidate === undefined) {
		return {
			ok: false,
			diagnostic: {
				moduleName: record.name,
				message: "missing processorFactory export",
			},
		};
	}
	if (!isRecord(candidate)) {
		return invalidFactory(record.name, "processorFactory export must be an object");
	}
	for (const field of FORBIDDEN_FACTORY_FIELDS) {
		if (Object.hasOwn(candidate, field)) {
			return invalidFactory(record.name, `processorFactory must not declare ${field}`, factoryId(candidate));
		}
	}
	if (typeof candidate.id !== "string" || candidate.id.length === 0) {
		return invalidFactory(record.name, "processorFactory.id must be a non-empty string");
	}
	if (typeof candidate.create !== "function") {
		return invalidFactory(record.name, "processorFactory.create must be a function", candidate.id);
	}
	return {
		ok: true,
		factory: {
			id: candidate.id,
			create: candidate.create as ProcessorFactoryRegistration["create"],
		},
	};
}

function invalidFactory(
	moduleName: string,
	message: string,
	factoryId?: string,
): { ok: false; diagnostic: ProcessorFactoryDiagnostic } {
	return {
		ok: false,
		diagnostic: { moduleName, factoryId, message },
	};
}

function factoryId(candidate: Readonly<Record<string, unknown>>): string | undefined {
	return typeof candidate.id === "string" ? candidate.id : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
