/**
 * Unit tests for `extensions/pi-fence/io/config-loader.ts`.
 *
 * Covers the loader's contract:
 *   - Two optional files: global (~/.pi/agent/pi-fence.config.json) +
 *     project (<cwd>/.pi/pi-fence.config.json).
 *   - Project bindings override global; safety controls can only restrict lower layers.
 *   - Error paths warn and continue (except the common missing-file
 *     case, which stays silent); malformed safety controls fail closed.
 *   - Shape validation: non-object top level, non-object bindings,
 *     invalid binding selector values — invalid entries warn.
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
			{ bindings: { graphviz: { processor: "kroki-remote" }, mermaid: { processor: "one" } } },
			{ bindings: { mermaid: { processor: "two" } } },
			{ bindings: { plantuml: { processor: "three" } } },
		);

		expect(merged.bindings).toEqual({
			graphviz: { processor: "kroki-remote" },
			mermaid: { processor: "two" },
			plantuml: { processor: "three" },
		});
	});

	it("returns an empty layer when validation sees a non-object top level", () => {
		const logger = new FakeLogger();

		expect(validatePiFenceConfig(["nope"], "global", logger)).toEqual({
			bindings: {},
			processorPrecedence: ["embedded"],
		});
		expect(logger.byLevel("warn")[0]?.message).toContain("not an object");
	});

	it("merges blocked policy: absent blocked key inherits from earlier config", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, blocked: { tags: ["qr"], processors: ["kroki-remote"] } },
			{ bindings: {} },
		);

		expect(merged.blocked).toEqual({ tags: ["qr"], processors: ["kroki-remote"] });
	});

	it("merges blocked policy: explicit empty arrays replace lower-priority policy", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, blocked: { tags: ["qr"], processors: ["kroki-remote"] } },
			{ bindings: {}, blocked: { tags: [], processors: [] } },
		);

		expect(merged.blocked).toEqual({ tags: [], processors: [] });
	});

	it("defaults processorPrecedence to embedded, host, sandbox, remote", () => {
		expect(DEFAULT_CONFIG.processorPrecedence).toEqual([
			"embedded",
			"host",
			"sandbox",
			"remote",
		]);
	});

	it("defaults blocked policy to empty tag and processor lists", () => {
		expect(DEFAULT_CONFIG.blocked).toEqual({ tags: [], processors: [] });
	});

	it("validates blocked policy: accepts tag and processor string arrays", () => {
		const result = validatePiFenceConfig(
			{ blocked: { tags: ["qr", "dot"], processors: ["kroki-remote"] } },
			"test",
		);

		expect(result.blocked).toEqual({ tags: ["qr", "dot"], processors: ["kroki-remote"] });
	});

	it("validates blocked policy: drops non-string entries with warns and fails closed", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ blocked: { tags: ["qr", 42], processors: ["kroki-remote", true] } },
			"test",
			logger,
		);

		expect(result.blocked).toEqual({ tags: ["qr"], processors: ["kroki-remote"] });
		expect(result.processorPrecedence).toEqual(["embedded"]);
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"non-string entry in test blocked.tags",
			"non-string entry in test blocked.processors",
		]);
	});

	it("merges blocked policy: later layers replace lower-priority arrays", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, blocked: { tags: ["qr"], processors: ["kroki-remote"] } },
			{ bindings: {}, blocked: { tags: ["dot"], processors: [] } },
		);

		expect(merged.blocked).toEqual({ tags: ["dot"], processors: [] });
	});

	it("merges processorPrecedence: later layers can only restrict lower-priority placements", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["embedded", "remote"] },
			{ bindings: {}, processorPrecedence: ["host"] },
		);
		expect(merged.processorPrecedence).toEqual([]);
	});

	it("merges processorPrecedence: absent key inherits from earlier config", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["remote"] },
			{ bindings: {} },
		);
		expect(merged.processorPrecedence).toEqual(["remote"]);
	});

	it("merges processorPrecedence: empty array explicitly disables every lower-priority placement", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["embedded", "remote"] },
			{ bindings: {}, processorPrecedence: [] },
		);
		expect(merged.processorPrecedence).toEqual([]);
	});

	it("merges processorPrecedence: preserves later-layer order within the lower-priority allowlist", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, processorPrecedence: ["host", "remote"] },
			{ bindings: {}, processorPrecedence: ["remote", "host"] },
		);
		expect(merged.processorPrecedence).toEqual(["remote", "host"]);
	});

	it("merges processorPrecedence: copies the winning array", () => {
		const precedence: ["remote"] = ["remote"];
		const merged = mergePiFenceConfigs({ bindings: {}, processorPrecedence: precedence });
		expect(merged.processorPrecedence).toEqual(["remote"]);
		expect(merged.processorPrecedence).not.toBe(precedence);
	});

	it("validates privacy controls: ignores inherited fields", () => {
		const inheritedKroki = Object.create({ endpoint: "https://evil.example", docker: { autoStart: true } });
		const inheritedBlocked = Object.create({ tags: ["qr"], processors: ["kroki-remote"] });
		const parsed = Object.create({
			blocked: inheritedBlocked,
			processorPrecedence: ["remote"],
			kroki: inheritedKroki,
		});

		const result = validatePiFenceConfig(parsed, "test");

		expect(result.blocked).toBeUndefined();
		expect(result.processorPrecedence).toBeUndefined();
		expect(result.kroki).toBeUndefined();
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

	it("validates disabled: ignores legacy top-level disabled", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ disabled: ["kroki-remote", "graphviz-host"] },
			"test",
			logger,
		);

		expect(result).toEqual({ bindings: {} });
		expect(logger.byLevel("warn")).toEqual([]);
	});

	it("validates blocked policy: keeps processor ids literal without legacy normalization", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ blocked: { tags: [], processors: ["kroki", "graphviz-local"] } },
			"test",
			logger,
		);

		expect(result.blocked).toEqual({ tags: [], processors: ["kroki", "graphviz-local"] });
		expect(logger.byLevel("warn")).toEqual([]);
	});

	it("validates bindings: ignores inherited binding entries", () => {
		const rawBindings = Object.create({ graphviz: { processor: "kroki-remote" } });
		const result = validatePiFenceConfig({ bindings: rawBindings }, "test");

		expect(result.bindings).toEqual({});
	});

	it("validates bindings: keeps __proto__ as a safe own binding key", () => {
		const parsed = JSON.parse(
			'{"bindings":{"__proto__":{"processor":"kroki-remote"}}}',
		) as unknown;
		const result = validatePiFenceConfig(parsed, "test");

		expect(Object.getPrototypeOf(result.bindings)).toBeNull();
		expect(Object.hasOwn(result.bindings, "__proto__")).toBe(true);
		expect(result.bindings.__proto__).toEqual({ processor: "kroki-remote" });
	});

	it("validates bindings: drops string selector values with a warn", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ bindings: { graphviz: "kroki-remote" } },
			"test",
			logger,
		);

		expect(result.bindings).toEqual({});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"invalid binding selector in test bindings",
		]);
	});

	it("validates bindings: keeps prototype-named processor ids as strings", () => {
		const result = validatePiFenceConfig(
			{
				bindings: {
					graphviz: { processor: "__proto__" },
					mermaid: { processor: "constructor" },
				},
			},
			"test",
		);

		expect(result.bindings).toEqual({
			graphviz: { processor: "__proto__" },
			mermaid: { processor: "constructor" },
		});
	});

	it("validates bindings: normalizes legacy processor ids inside processor selectors", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{
				bindings: {
					dot: { processor: "kroki" },
					graphviz: { processor: "graphviz-local" },
					csv: { processor: "table" },
				},
			},
			"test",
			logger,
		);

		expect(result.bindings).toEqual({
			dot: { processor: "kroki-remote" },
			graphviz: { processor: "graphviz-host" },
			csv: { processor: "table-embedded" },
		});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"legacy processor id in test config 'bindings.dot.processor'",
			"legacy processor id in test config 'bindings.graphviz.processor'",
			"legacy processor id in test config 'bindings.csv.processor'",
		]);
	});

	it("validates bindings: accepts processor selector objects", () => {
		const result = validatePiFenceConfig(
			{ bindings: { graphviz: { processor: "kroki-remote" } } },
			"test",
		);

		expect(result.bindings).toEqual({
			graphviz: { processor: "kroki-remote" },
		});
	});

	it("validates bindings: drops non-string processor selectors", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ bindings: { graphviz: { processor: 42 } } },
			"test",
			logger,
		);

		expect(result.bindings).toEqual({});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"invalid binding selector in test bindings",
		]);
	});

	it("validates bindings: accepts placement selector objects", () => {
		const result = validatePiFenceConfig(
			{ bindings: { mermaid: { placement: "host" } } },
			"test",
		);

		expect(result.bindings).toEqual({
			mermaid: { placement: "host" },
		});
	});

	it("validates bindings: drops inherited selector properties", () => {
		const logger = new FakeLogger();
		const inheritedProcessor = Object.create({ processor: "kroki-remote" });
		const inheritedPlacement = Object.create({ placement: "host" });
		const result = validatePiFenceConfig(
			{ bindings: { graphviz: inheritedProcessor, mermaid: inheritedPlacement } },
			"test",
			logger,
		);

		expect(result.bindings).toEqual({});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"invalid binding selector in test bindings",
			"invalid binding selector in test bindings",
		]);
	});

	it("validates bindings: drops objects with both selectors", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ bindings: { graphviz: { processor: "graphviz-host", placement: "host" } } },
			"test",
			logger,
		);

		expect(result.bindings).toEqual({});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"invalid binding selector in test bindings",
		]);
	});

	it("validates bindings: drops objects with neither selector", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ bindings: { graphviz: {} } },
			"test",
			logger,
		);

		expect(result.bindings).toEqual({});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"invalid binding selector in test bindings",
		]);
	});

	it("validates bindings: drops invalid placement selectors", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ bindings: { mermaid: { placement: "laptop" } } },
			"test",
			logger,
		);

		expect(result.bindings).toEqual({});
		expect(logger.byLevel("warn").map((entry) => entry.message)).toEqual([
			"invalid binding selector in test bindings",
		]);
	});

	it("validates kroki: ignores inherited nested fields", () => {
		const rawDocker = Object.create({ autoStart: true });
		const rawKroki = Object.create({ endpoint: "https://evil.example", docker: rawDocker });

		const result = validatePiFenceConfig({ kroki: rawKroki }, "test");

		expect(result.kroki).toBeUndefined();
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
		expect(result.processorPrecedence).toEqual(["embedded"]);
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("validates kroki.endpoint: non-string endpoint dropped with a warn and fails closed", () => {
		const logger = new FakeLogger();
		const result = validatePiFenceConfig(
			{ kroki: { endpoint: 42 } },
			"test",
			logger,
		);
		expect(result.kroki?.endpoint).toBeUndefined();
		expect(result.processorPrecedence).toEqual(["embedded"]);
		expect(logger.byLevel("warn").length).toBeGreaterThanOrEqual(1);
	});

	it("merges kroki.endpoint: global endpoint cannot be replaced by project config", () => {
		const merged = mergePiFenceConfigs(
			{ bindings: {}, kroki: { endpoint: "http://global:8000" } },
			{ bindings: {}, kroki: { endpoint: "http://project:9000" } },
		);
		expect(merged.kroki?.endpoint).toBe("http://global:8000");
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
			JSON.stringify({ bindings: { graphviz: { processor: "kroki-remote" } } }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: join(globalDir, "no-project-file.json"),
		});

		expect(config.bindings).toEqual({ graphviz: { processor: "kroki-remote" } });
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
			JSON.stringify({ bindings: { mermaid: { processor: "kroki-remote" } } }),
		);

		const config = await loadConfig({
			globalConfigPath: join(projectDir, "no-global-file.json"),
			projectConfigPath: projectPath,
		});

		expect(config.bindings).toEqual({ mermaid: { processor: "kroki-remote" } });
	});

	it("merges disjoint bindings keys from global + project", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { graphviz: { processor: "kroki-remote" } } }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { mermaid: { processor: "graphviz-host" } } }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		expect(config.bindings).toEqual({
			graphviz: { processor: "kroki-remote" },
			mermaid: { processor: "graphviz-host" },
		});
	});

	it("project bindings override global bindings on the same key", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { graphviz: { processor: "kroki-remote" } } }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ bindings: { graphviz: { processor: "graphviz-host" } } }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		// Project wins on the overlapping key.
		expect(config.bindings.graphviz).toEqual({ processor: "graphviz-host" });
	});

	it("project processorPrecedence cannot widen global processorPrecedence", async () => {
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

		expect(config.processorPrecedence).toEqual([]);
	});

	it("project processorPrecedence can restrict global precedence to an empty list", async () => {
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
			JSON.stringify({ bindings: { graphviz: { processor: "from-home" } } }),
		);
		writeFileSync(
			join(cwd, ".pi", "pi-fence.config.json"),
			JSON.stringify({ bindings: { mermaid: { processor: "from-cwd" } } }),
		);

		const config = await loadConfig({ home, cwd });

		expect(config.bindings).toEqual({
			graphviz: { processor: "from-home" },
			mermaid: { processor: "from-cwd" },
		});
	});
});

describe("loadPiFenceConfig — malformed files", () => {
	afterEach(() => cleanupTempDirs());

	it("fails closed on malformed global JSON and logs warn", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, "not valid json{");
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config).toEqual({
			...DEFAULT_CONFIG,
			processorPrecedence: ["embedded"],
		});
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns).toHaveLength(1);
		expect(warns[0].message).toContain("malformed JSON");
	});

	it("fails closed on top-level array and logs warn", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify(["this", "is", "not", "an", "object"]));
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config).toEqual({ ...DEFAULT_CONFIG, processorPrecedence: ["embedded"] });
		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		expect(warns.some((e) => e.message.includes("not an object"))).toBe(true);
	});

	it("fails closed + logs warn on top-level string", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify("just a string"));
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
			logger,
		});

		expect(config).toEqual({ ...DEFAULT_CONFIG, processorPrecedence: ["embedded"] });
		expect(
			logger.bySubsystem("config").some((e) => e.message.includes("not an object")),
		).toBe(true);
	});

	it("drops invalid selector values inside bindings and logs one warn per dropped entry", async () => {
		const dir = makeTempDir();
		const path = writeConfig(
			dir,
			JSON.stringify({
				bindings: {
					graphviz: { processor: "kroki-remote" }, // valid
					mermaid: 42, // dropped
					dot: null, // dropped
					puml: true, // dropped
					plantuml: { processor: "kroki-remote" }, // valid
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
			graphviz: { processor: "kroki-remote" },
			plantuml: { processor: "kroki-remote" },
		});

		const warns = logger.bySubsystem("config").filter((e) => e.level === "warn");
		// Three dropped entries → three warns.
		expect(warns.filter((e) => e.message.includes("invalid binding selector"))).toHaveLength(3);
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
				bindings: { graphviz: { processor: "kroki-remote" } },
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

		expect(config.bindings).toEqual({ graphviz: { processor: "kroki-remote" } });
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
			JSON.stringify({ bindings: { mermaid: { processor: "kroki-remote" } } }),
		);
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
			logger,
		});

		expect(config.bindings).toEqual({ mermaid: { processor: "kroki-remote" } });
		expect(config.processorPrecedence).toEqual(["embedded"]);
		expect(
			logger.bySubsystem("config").some((e) => e.message.includes("malformed JSON")),
		).toBe(true);
	});

	it("malformed global config fails closed even when project attempts remote-only precedence", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(globalDir, "malformed{");
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ processorPrecedence: ["remote"] }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		expect(config.processorPrecedence).toEqual([]);
	});

	it("project config cannot re-enable remote after a global read error", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ processorPrecedence: ["remote"] }),
		);

		const result = await loadPiFenceConfig({
			globalConfigPath: globalDir,
			projectConfigPath: projectPath,
		});

		expect(result.globalStatus).toBe("read-error");
		expect(result.config.processorPrecedence).toEqual([]);
	});

	it("lets project blocked policy replace global blocked policy while placement stays restrictive", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ blocked: { tags: [], processors: ["kroki-remote"] }, processorPrecedence: ["host"] }),
		);
		const projectPath = writeConfig(
			projectDir,
			JSON.stringify({ blocked: { tags: [], processors: [] }, processorPrecedence: ["remote"] }),
		);

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
		});

		expect(config.blocked).toEqual({ tags: [], processors: [] });
		expect(config.processorPrecedence).toEqual([]);
	});

	it("is robust to a valid global file plus a malformed project file — fails closed", async () => {
		const globalDir = makeTempDir();
		const projectDir = makeTempDir();
		const globalPath = writeConfig(
			globalDir,
			JSON.stringify({ bindings: { dot: { processor: "kroki-remote" } }, processorPrecedence: ["remote"] }),
		);
		const projectPath = writeConfig(projectDir, "malformed{");
		const logger = new FakeLogger();

		const config = await loadConfig({
			globalConfigPath: globalPath,
			projectConfigPath: projectPath,
			logger,
		});

		expect(config.bindings).toEqual({ dot: { processor: "kroki-remote" } });
		expect(config.processorPrecedence).toEqual([]);
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
		const path = writeConfig(dir, JSON.stringify({ bindings: { a: { processor: "b" } } }));

		const result = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
		});

		expect(result.globalStatus).toBe("loaded");
		expect(result.projectStatus).toBe("not-found");
		expect(result.config.bindings).toEqual({ a: { processor: "b" } });
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

	it("reports 'invalid-shape' for syntactically valid non-object JSON", async () => {
		const dir = makeTempDir();
		const path = writeConfig(dir, JSON.stringify(["not", "an", "object"]));

		const result = await loadPiFenceConfig({
			globalConfigPath: path,
			projectConfigPath: join(dir, "no-project.json"),
		});

		expect(result.globalStatus).toBe("invalid-shape");
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
