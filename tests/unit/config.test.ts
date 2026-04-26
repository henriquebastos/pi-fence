/**
 * Unit tests for `extensions/pi-fence/io/config-loader.ts`.
 *
 * Covers the loader's contract:
 *   - Two optional files: global (~/.pi/agent/pi-fence.config.json) +
 *     project (<cwd>/.pi/pi-fence.config.json).
 *   - Project overrides global; global overrides defaults.
 *   - Every error path returns defaults and logs a warn (except the
 *     common missing-file case, which stays silent).
 *   - Shape validation: non-object top level, non-object bindings,
 *     non-string values inside bindings — all dropped with a warn.
 *   - Unknown top-level keys are tolerated so CV1.E1's future keys
 *     don't break existing files.
 *
 * Filesystem seam goes through `makeTempDir()` + explicit
 * `globalConfigPath` / `projectConfigPath` arguments. No test writes
 * outside `os.tmpdir()`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	DEFAULT_CONFIG,
	mergePiFenceConfigs,
	validatePiFenceConfig,
} from "../../extensions/pi-fence/config.ts";
import {
	loadPiFenceConfig,
	type LoadConfigOptions,
} from "../../extensions/pi-fence/io/config-loader.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";

function writeConfig(dir: string, body: string): string {
	const path = join(dir, "pi-fence.config.json");
	writeFileSync(path, body);
	return path;
}

async function loadConfig(opts: LoadConfigOptions = {}) {
	return (await loadPiFenceConfig(opts)).config;
}

describe("config core", () => {
	it("merges bindings left-to-right with later configs winning", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: { graphviz: "kroki", mermaid: "one" }, disabled: [] },
			{ bindings: { mermaid: "two" }, disabled: [] },
			{ bindings: { plantuml: "three" }, disabled: [] },
		);

		expect(merged.bindings).toEqual({
			graphviz: "kroki",
			mermaid: "two",
			plantuml: "three",
		});
	});

	it("returns an empty layer when validation sees a non-object top level", () => {
		const logger = new FakeLogger();

		expect(validatePiFenceConfig(["nope"], "global", logger)).toEqual({ bindings: {} });
		expect(logger.byLevel("warn")[0]?.message).toContain("not an object");
	});

	it("merges disabled: last config with a disabled key wins entirely", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, disabled: ["kroki"] },
			{ bindings: {}, disabled: ["graphviz-local"] },
		);
		expect(merged.disabled).toEqual(["graphviz-local"]);
	});

	it("merges disabled: absent disabled inherits from earlier config", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, disabled: ["kroki"] },
			{ bindings: {} },
		);
		expect(merged.disabled).toEqual(["kroki"]);
	});

	it("merges disabled: empty array overrides earlier non-empty", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, disabled: ["kroki"] },
			{ bindings: {}, disabled: [] },
		);
		expect(merged.disabled).toEqual([]);
	});

	it("defaults disabled to undefined (absent = inherit)", () => {
		expect(DEFAULT_CONFIG.disabled).toBeUndefined();
	});

	it("defaults processorPrecedence to embedded, host, sandbox, remote", () => {
		expect(DEFAULT_CONFIG.processorPrecedence).toEqual([
			"embedded",
			"host",
			"sandbox",
			"remote",
		]);
	});

	it("merges processorPrecedence: last config with the key replaces the earlier list", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["embedded", "remote"] },
			{ bindings: {}, processorPrecedence: ["host"] },
		);
		expect(merged.processorPrecedence).toEqual(["host"]);
	});

	it("merges processorPrecedence: absent key inherits from earlier config", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["remote"] },
			{ bindings: {} },
		);
		expect(merged.processorPrecedence).toEqual(["remote"]);
	});

	it("merges processorPrecedence: empty array explicitly replaces earlier config", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["embedded", "remote"] },
			{ bindings: {}, processorPrecedence: [] },
		);
		expect(merged.processorPrecedence).toEqual([]);
	});

	it("merges processorPrecedence: copies the winning array", () => {
		const precedence: ["remote"] = ["remote"];
		const merged = mergePiFenceConfigs({ bindings: {}, processorPrecedence: precedence });
		expect(merged.processorPrecedence).toEqual(["remote"]);
		expect(merged.processorPrecedence).not.toBe(precedence);
	});

	it("validates processorPrecedence: accepts placement strings in user order", () => {
		const result = validatePiFenceConfig(
			{ processorPrecedence: ["remote", "host"] },
			"test",
		);
		expect(result.processorPrecedence).toEqual(["remote", "host"]);
	});

	it("validates processorPrecedence: accepts every declared placement", () => {
		const result = validatePiFenceConfig(
			{ processorPrecedence: ["embedded", "host", "sandbox", "remote"] },
			"test",
		);
		expect(result.processorPrecedence).toEqual([
			"embedded",
			"host",
			"sandbox",
			"remote",
		]);
	});

	it("validates processorPrecedence: any invalid entry fails closed with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ processorPrecedence: ["remote", "bogus", 42, "host"] },
			"test",
			logger,
		);
		expect(result.processorPrecedence).toEqual([]);
		const warnings = logger.byLevel("warn");
		expect(warnings).toHaveLength(2);
		expect(warnings.every((entry) => entry.message.includes("processorPrecedence"))).toBe(true);
	});

	it("validates processorPrecedence: non-array fails closed with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ processorPrecedence: "remote" },
			"test",
			logger,
		);
		expect(result.processorPrecedence).toEqual([]);
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"test config 'processorPrecedence' is not an array",
		]);
	});

	it("validates processorPrecedence: all-invalid non-empty array fails closed", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ processorPrecedence: ["remtoe"] },
			"test",
			logger,
		);
		expect(result.processorPrecedence).toEqual([]);
		expect(logger.byLevel("warn")).toHaveLength(1);
	});

	it("validates disabled: accepts array of strings", () => {
		const result = validatePiFenceConfig(
			{ disabled: ["kroki", "graphviz-local"] },
			"test",
		);
		expect(result.disabled).toEqual(["kroki", "graphviz-local"]);
	});

	it("validates disabled: drops non-string entries with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ disabled: ["kroki", 42, true] },
			"test",
			logger,
		);
		expect(result.disabled).toEqual(["kroki"]);
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("validates disabled: non-array becomes empty with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ disabled: "kroki" },
			"test",
			logger,
		);
		expect(result.disabled).toEqual([]);
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("validates kroki.endpoint: accepts a string", () => {
		const result = validatePiFenceConfig(
			{ kroki: { endpoint: "http://localhost:8000" } },
			"test",
		);
		expect(result.kroki?.endpoint).toBe("http://localhost:8000");
	});

	it("validates kroki.endpoint: absent kroki section yields undefined", () => {
		const result = validatePiFenceConfig({}, "test");
		expect(result.kroki).toBeUndefined();
	});

	it("validates kroki: non-object becomes undefined with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ kroki: "bad" },
			"test",
			logger,
		);
		expect(result.kroki).toBeUndefined();
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("validates kroki.endpoint: non-string endpoint dropped with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ kroki: { endpoint: 42 } },
			"test",
			logger,
		);
		expect(result.kroki?.endpoint).toBeUndefined();
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("merges kroki.endpoint: project overrides global", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, kroki: { endpoint: "http://global:8000" } },
			{ bindings: {}, kroki: { endpoint: "http://project:9000" } },
		);
		expect(merged.kroki?.endpoint).toBe("http://project:9000");
	});

	it("merges kroki.endpoint: absent project inherits global", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, kroki: { endpoint: "http://global:8000" } },
			{ bindings: {} },
		);
		expect(merged.kroki?.endpoint).toBe("http://global:8000");
	});

	it("validates kroki.docker.autoStart: accepts a boolean", () => {
		const result = validatePiFenceConfig(
			{ kroki: { docker: { autoStart: true } } },
			"test",
		);
		expect(result.kroki?.docker?.autoStart).toBe(true);
	});

	it("validates kroki: preserves endpoint and docker settings together", () => {
		const result = validatePiFenceConfig(
			{ kroki: { endpoint: "http://localhost:8000", docker: { autoStart: true } } },
			"test",
		);
		expect(result.kroki).toEqual({
			endpoint: "http://localhost:8000",
			docker: { autoStart: true },
		});
	});

	it("validates kroki.docker.autoStart: non-boolean dropped with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ kroki: { docker: { autoStart: "yes" } } },
			"test",
			logger,
		);
		expect(result.kroki?.docker?.autoStart).toBeUndefined();
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("validates kroki.docker: non-object dropped with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ kroki: { docker: 42 } },
			"test",
			logger,
		);
		expect(result.kroki?.docker).toBeUndefined();
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});
});

describe("loadPiFenceConfig — missing files", () => {
	afterEach(() => cleanupTempDirs());

	it("returns defaults when neither file exists", async () => {
		const empty = makeTempDir();
		const config = await loadConfig({
			globalConfigPath: join(empty, "does-not-exist.json"),
			projectConfigPath: join(empty, "also-missing.json"),
		});

		expect(config).toEqual(DEFAULT_CONFIG);
		expect(config.processorPrecedence).not.toBe(DEFAULT_CONFIG.processorPrecedence);
	});

	it("does NOT log warn when files are simply missing (common case, silent)", async () => {
		const empty = makeTempDir();
		const logger = new FakeLogger();

		await loadConfig({
			globalConfigPath: join(empty, "does-not-exist.json"),
			projectConfigPath: join(empty, "also-missing.json"),
			logger,
		});

		expect(logger.bySubsystem("config")).toHaveLength(0);
	});
});

describe("loadPiFenceConfig — file-present paths", () => {
	afterEach(() => cleanupTempDirs());

	it("reads the global config when only global is present", async () => {
		const globalDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { graphviz: "kroki" } }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: join(globalDir, "no-project-file.json"),
		});

		expect(config.bindings).toEqual({ graphviz: "kroki" });
	});

	it("reads processorPrecedence from file-backed config", async () => {
		const globalDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ processorPrecedence: ["remote", "host"] }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: join(globalDir, "no-project-file.json"),
		});

		expect(config.processorPrecedence).toEqual(["remote", "host"]);
	});

	it("reads the project config when only project is present", async () => {
		const projectDir = makeTempDir();
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { mermaid: "kroki" } }),
		);

		const config = await loadConfig({
			globalConfigPath: join(projectDir, "no-global-file.json"),
			projectConfigPath: projectPath,
		});

		expect(config.bindings).toEqual({ mermaid: "kroki" });
	});

	it("merges disjoint bindings keys from global + project", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { graphviz: "kroki" } }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { mermaid: "graphviz-local" } }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		expect(config.bindings).toEqual({
			graphviz: "kroki",
			mermaid: "graphviz-local",
		});
	});

	it("project bindings override global bindings on the same key", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { graphviz: "kroki" } }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { graphviz: "graphviz-local" } }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		// Project wins on the overlapping key.
		expect(config.bindings.graphviz).toBe("graphviz-local");
	});

	it("project processorPrecedence replaces global processorPrecedence", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ processorPrecedence: ["remote"] }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ processorPrecedence: ["host"] }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		expect(config.processorPrecedence).toEqual(["host"]);
	});

	it("project processorPrecedence can replace global precedence with an empty list", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ processorPrecedence: ["remote"] }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ processorPrecedence: [] }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		expect(config.processorPrecedence).toEqual([]);
	});

	it("honours custom home + cwd to derive the default paths", async () => {
		const home = makeTempDir();
		const cwd = makeTempDir();

		// Build the expected default paths relative to the overrides.
		const { mkdirSync, writeFileSync } = await import("node:fs");
		mkdirSync(join(home, ".pi", "agent"), { recursive: true });
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(
			join(home, ".pi", "agent", "pi-fence.config.json"),
			JSON.stringify({ bindings: { graphviz: "from-home" } }),
		);
		writeFileSync(
			join(cwd, ".pi", "pi-fence.config.json"),
			JSON.stringify({ bindings: { mermaid: "from-cwd" } }),
		);

		const config = await loadConfig({ home, cwd });

		expect(config.bindings).toEqual({
			graphviz: "from-home",
			mermaid: "from-cwd",
		});
	});
});

describe("loadPiFenceConfig — malformed files", () => {
	afterEach(() => cleanupTempDirs());

	it("returns defaults + logs warn on malformed JSON", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, "not valid json{");
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config).toEqual(DEFAULT_CONFIG);
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns).toHaveLength(1);
		expect(warns[0].message).toContain("malformed JSON");
	});

	it("returns defaults + logs warn on top-level array", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify(["this", "is", "not", "an", "object"]));
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config).toEqual(DEFAULT_CONFIG);
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns.some((e) => e.message.includes("not an object"))).toBe(true);
	});

	it("returns defaults + logs warn on top-level string", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify("just a string"));
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config).toEqual(DEFAULT_CONFIG);
		expect(
			logger.bySubsystem("config").some((e) => e.message.includes("not an object")),
		).toBe(true);
	});

	it("drops non-string values inside bindings and logs one warn per dropped entry", async () => {
		const dir = makeTempDir();
		const path = writeConfig(
			dir,
			JSON.stringify({
				bindings: {
					graphviz: "kroki", // valid
					mermaid: 42, // dropped
					dot: null, // dropped
					puml: true, // dropped
					plantuml: "kroki", // valid
				},
			}),
		);
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config.bindings).toEqual({
			graphviz: "kroki",
			plantuml: "kroki",
		});

		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		// Three dropped entries → three warns.
		expect(warns.filter((e) => e.message.includes("non-string value"))).toHaveLength(3);
	});

	it("drops bindings entirely when `bindings` is not an object", async () => {
		const dir = makeTempDir();
		const path = writeConfig(
			dir,
			JSON.stringify({ bindings: "not an object" }),
		);
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config.bindings).toEqual({});
		expect(
			logger
				.bySubsystem("config")
				.some((e) => e.message.includes("'bindings' is not an object")),
		).toBe(true);
	});

	it("tolerates unknown top-level keys silently (forward-compat with CV1.E1's future keys)", async () => {
		const dir = makeTempDir();
		const path = writeConfig(
			dir,
			JSON.stringify({
				bindings: { graphviz: "kroki" },
				endpoint: "http://localhost:8000",
				futureKey: { nested: true },
			}),
		);
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config.bindings).toEqual({ graphviz: "kroki" });
		// No warn for the unknown keys — forward-compat.
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns).toHaveLength(0);
	});

	it("is robust to a malformed global file plus a valid project file — returns the project bindings", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(globalDir, "malformed{");
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { mermaid: "kroki" } }),
		);
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
			logger,
		});

		expect(config.bindings).toEqual({ mermaid: "kroki" });
		expect(config.processorPrecedence).toEqual(DEFAULT_CONFIG.processorPrecedence);
		expect(
			logger.bySubsystem("config").some((e) => e.message.includes("malformed JSON")),
		).toBe(true);
	});

	it("is robust to a valid global file plus a malformed project file — preserves global precedence", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { dot: "kroki" }, processorPrecedence: ["remote"] }),
		);
		const projectPath = writeConfig(projectDir, "malformed{");
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
			logger,
		});

		expect(config.bindings).toEqual({ dot: "kroki" });
		expect(config.processorPrecedence).toEqual(["remote"]);
		expect(
			logger.bySubsystem("config").some((e) => e.message.includes("malformed JSON")),
		).toBe(true);
	});

	it("tolerates missing `bindings` key (empty-config file)", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify({}));

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
		});

		expect(config.bindings).toEqual({});
	});
});

describe("loadPiFenceConfig — status reporting", () => {
	afterEach(() => cleanupTempDirs());

	it("reports 'loaded' for a valid config file", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify({ bindings: { a: "b" } }));

		const result = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
		});

		expect(result.globalStatus).toBe("loaded");
		expect(result.projectStatus).toBe("not-found");
		expect(result.config.bindings).toEqual({ a: "b" });
	});

	it("reports 'malformed-json' for invalid JSON", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, "not json");

		const result = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
		});

		expect(result.globalStatus).toBe("malformed-json");
	});

	it("reports 'not-found' for missing files", async () => {
		const dir = makeTempDir();

		const result = await loadPiFenceConfig({
			globalConfigPath: join(dir, "missing.json"),
			projectConfigPath: join(dir, "also-missing.json"),
		});

		expect(result.globalStatus).toBe("not-found");
		expect(result.projectStatus).toBe("not-found");
	});

	it("includes the resolved file paths", async () => {
		const dir = makeTempDir();
		const gPath = join(dir, "g.json");
		const pPath = join(dir, "p.json");

		const result = await loadPiFenceConfig({
			globalConfigPath: gPath,
			projectConfigPath: pPath,
		});

		expect(result.globalPath).toBe(gPath);
		expect(result.projectPath).toBe(pPath);
	});
});
