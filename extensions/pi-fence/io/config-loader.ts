/**
 * pi-fence config loader.
 *
 * Edge-owned file discovery and reads. Pure config validation/merge lives in
 * `../config.ts`.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	DEFAULT_CONFIG,
	EMPTY_CONFIG_LAYER,
	mergePiFenceConfigs,
	type PiFenceConfig,
	validatePiFenceConfig,
} from "../config.ts";
import type { Logger } from "./logger.ts";

export const PI_FENCE_CONFIG_ENV = "PI_FENCE_CONFIG";

export interface LoadConfigOptions {
	/** Explicit config file path. Replaces normal global/project discovery. */
	configPath?: string;
	globalConfigPath?: string;
	projectConfigPath?: string;
	cwd?: string;
	home?: string;
	logger?: Logger;
	env?: Readonly<Record<string, string | undefined>>;
}

export type ConfigFileStatus =
	| "loaded"
	| "not-found"
	| "read-error"
	| "malformed-json"
	| "invalid-shape";

export interface ConfigLoadResult {
	config: PiFenceConfig;
	globalStatus: ConfigFileStatus;
	globalPath: string;
	projectStatus: ConfigFileStatus;
	projectPath: string;
}

/**
 * Compute the default global / project paths, load both files, merge,
 * and report per-file load status for `/fence doctor`. Never throws.
 */
export async function loadPiFenceConfig(
	opts: LoadConfigOptions = {},
): Promise<ConfigLoadResult> {
	const logger = opts.logger;
	const explicitPath = explicitConfigPath(opts);
	if (explicitPath !== undefined) {
		return loadExplicitConfig(explicitPath, logger);
	}

	const home = opts.home ?? homedir();
	const cwd = opts.cwd ?? process.cwd();
	const globalPath =
		opts.globalConfigPath ?? join(home, ".pi", "agent", "pi-fence.config.json");
	const projectPath =
		opts.projectConfigPath ?? join(cwd, ".pi", "pi-fence.config.json");

	const [globalConfig, globalStatus] = await readConfigFileWithStatus(globalPath, "global", logger);
	const [projectConfig, projectStatus] = await readConfigFileWithStatus(projectPath, "project", logger);
	return {
		config: mergePiFenceConfigs(
			DEFAULT_CONFIG,
			configFailurePrivacyLayer(globalStatus, globalConfig),
			configFailurePrivacyLayer(projectStatus, projectConfig),
		),
		globalStatus,
		globalPath,
		projectStatus,
		projectPath,
	};
}

async function loadExplicitConfig(
	path: string,
	logger?: Logger,
): Promise<ConfigLoadResult> {
	const [config, status] = await readConfigFileWithStatus(path, "explicit", logger);
	return {
		config: mergePiFenceConfigs(
			DEFAULT_CONFIG,
			configFailurePrivacyLayer(status, config),
		),
		globalStatus: status,
		globalPath: path,
		projectStatus: "not-found",
		projectPath: `(disabled by ${PI_FENCE_CONFIG_ENV})`,
	};
}

function explicitConfigPath(opts: LoadConfigOptions): string | undefined {
	const fromOption = nonEmptyPath(opts.configPath);
	if (fromOption !== undefined) return fromOption;
	return nonEmptyPath((opts.env ?? process.env)[PI_FENCE_CONFIG_ENV]);
}

function nonEmptyPath(path: string | undefined): string | undefined {
	return path === undefined || path.length === 0 ? undefined : path;
}

function configFailurePrivacyLayer(
	status: ConfigFileStatus,
	config: PiFenceConfig,
): PiFenceConfig {
	if (status === "malformed-json" || status === "read-error" || status === "invalid-shape") {
		return {
			bindings: config.bindings,
			processorPrecedence: ["embedded"],
		};
	}
	return config;
}

async function readConfigFileWithStatus(
	path: string,
	label: string,
	logger?: Logger,
): Promise<[PiFenceConfig, ConfigFileStatus]> {
	let raw: string;
	try {
		raw = await fs.readFile(path, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === "ENOENT") {
			return [EMPTY_CONFIG_LAYER, "not-found"];
		}
		logger?.warn("config", `failed to read ${label} config`, {
			path,
			error: err instanceof Error ? err.message : String(err),
		});
		return [EMPTY_CONFIG_LAYER, "read-error"];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		logger?.warn("config", `malformed JSON in ${label} config`, {
			path,
			error: err instanceof Error ? err.message : String(err),
		});
		return [EMPTY_CONFIG_LAYER, "malformed-json"];
	}

	if (!isConfigObject(parsed)) {
		return [validatePiFenceConfig(parsed, label, logger), "invalid-shape"];
	}

	return [validatePiFenceConfig(parsed, label, logger), "loaded"];
}

function isConfigObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
