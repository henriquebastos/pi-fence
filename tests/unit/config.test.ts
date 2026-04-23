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
import { loadPiFenceConfig } from "../../extensions/pi-fence/io/config-loader.ts";
import { FakeLogger } from "../utilities/logger.ts";
import { cleanupTempDirs, makeTempDir } from "../utilities/temp-dir.ts";

function writeConfig(dir: string, body: string): string {
	const path = join(dir, "pi-fence.config.json");
	writeFileSync(path, body);
	return path;
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

	it("returns defaults when validation sees a non-object top level", () => {
		const logger = new FakeLogger();

		expect(validatePiFenceConfig(["nope"], "global", logger)).toBe(DEFAULT_CONFIG);
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
});

describe("loadPiFenceConfig — missing files", () => {
	afterEach(() => cleanupTempDirs());

	it("returns defaults when neither file exists", async () => {
		const empty = makeTempDir();
		const config = await loadPiFenceConfig({
			globalConfigPath: join(empty, "does-not-exist.json"),
			projectConfigPath: join(empty, "also-missing.json"),
		});

		expect(config).toEqual({ bindings: {} });
	});

	it("does NOT log warn when files are simply missing (common case, silent)", async () => {
		const empty = makeTempDir();
		const logger = new FakeLogger();

		await loadPiFenceConfig({
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

		const config = await loadPiFenceConfig({
			globalConfigPath: globalPath,
			projectConfigPath: join(globalDir, "no-project-file.json"),
		});

		expect(config.bindings).toEqual({ graphviz: "kroki" });
	});

	it("reads the project config when only project is present", async () => {
		const projectDir = makeTempDir();
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { mermaid: "kroki" } }),
		);

		const config = await loadPiFenceConfig({
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

		const config = await loadPiFenceConfig({
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

		const config = await loadPiFenceConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		// Project wins on the overlapping key.
		expect(config.bindings.graphviz).toBe("graphviz-local");
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

		const config = await loadPiFenceConfig({ home, cwd });

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

		const config = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config.bindings).toEqual({});
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns).toHaveLength(1);
		expect(warns[0].message).toContain("malformed JSON");
	});

	it("returns defaults + logs warn on top-level array", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify(["this", "is", "not", "an", "object"]));
		const logger = new FakeLogger();

		const config = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config.bindings).toEqual({});
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns.some((e) => e.message.includes("not an object"))).toBe(true);
	});

	it("returns defaults + logs warn on top-level string", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify("just a string"));
		const logger = new FakeLogger();

		const config = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config.bindings).toEqual({});
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

		const config = await loadPiFenceConfig({
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

		const config = await loadPiFenceConfig({
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

		const config = await loadPiFenceConfig({
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

		const config = await loadPiFenceConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
			logger,
		});

		expect(config.bindings).toEqual({ mermaid: "kroki" });
		expect(
			logger.bySubsystem("config").some((e) => e.message.includes("malformed JSON")),
		).toBe(true);
	});

	it("tolerates missing `bindings` key (empty-config file)", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify({}));

		const config = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
		});

		expect(config.bindings).toEqual({});
	});
});
