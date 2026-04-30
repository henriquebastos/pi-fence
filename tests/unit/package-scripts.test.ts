import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const REQUIRED_RUNTIME_PACKAGE_ASSETS = [
	"docker/bundle/Dockerfile",
	"docker/bundle/manifest.json",
	"docker/bundle/puppeteer-config.json",
	"docker/kroki/compose.yaml",
	"gondolin/bundle/init-extra.sh",
	"gondolin/bundle/pi-fence-bundle.json",
] as const;

type PackageJson = {
	scripts?: Record<string, string>;
};

type NpmPackEntry = {
	files?: Array<{ path?: string }>;
};

async function readScripts(): Promise<Record<string, string>> {
	const raw = await readFile(new URL("../../package.json", import.meta.url), "utf8");
	const packageJson = JSON.parse(raw) as PackageJson;

	return packageJson.scripts ?? {};
}

async function packedFilePaths(): Promise<Set<string>> {
	const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
		cwd: new URL("../..", import.meta.url),
		maxBuffer: 1024 * 1024,
	});
	const entries = JSON.parse(stdout) as NpmPackEntry[];
	return new Set(entries.flatMap((entry) => entry.files?.map((file) => file.path ?? "") ?? []));
}

describe("npm package contents", () => {
	it("includes runtime assets needed by installed workflows", async () => {
		const files = await packedFilePaths();

		for (const asset of REQUIRED_RUNTIME_PACKAGE_ASSETS) {
			expect(files.has(asset), `${asset} should be present in npm pack output`).toBe(true);
		}
	});
});

describe("package.json scripts", () => {
	it("exposes the canonical feedback, lint, and inspect families", async () => {
		const scripts = await readScripts();

		expect(scripts.feedback).toBe("pnpm run feedback:fast");
		expect(scripts["feedback:fast"]).toBe(
			"pnpm test && pnpm run inspect:crap:ext && pnpm run lint:markdown && pnpm run lint:types && pnpm run lint:deps",
		);
		expect(scripts.test).toContain("--coverage.thresholds.statements=90");
		expect(scripts.test).toContain("--coverage.thresholds.lines=90");
		expect(scripts.test).toContain("--coverage.thresholds.functions=90");
		expect(scripts.test).toContain("--coverage.thresholds.branches=75");
		expect(scripts.lint).toBe("pnpm run lint:markdown");
		expect(scripts["lint:types"]).toBe("tsc --noEmit");
		expect(scripts["lint:deps"]).toBe(
			"depcruise --config .dependency-cruiser.cjs extensions tests scripts",
		);
		expect(scripts["lint:markdown"]).toBe(
			"pnpm run lint:markdown:links && pnpm run lint:markdown:body",
		);
		expect(scripts["lint:markdown:links"]).toBe("tsx scripts/lint-markdown-links.ts");
		expect(scripts["lint:markdown:body"]).toBe("markdownlint-cli2");
		expect(scripts["lint:markdown:fix"]).toBe("markdownlint-cli2 --fix");
		expect(scripts.inspect).toBe("tsx scripts/inspect.ts");
		expect(scripts["inspect:coverage:nonlive"]).toContain("--coverage.reportsDirectory=coverage/nonlive");
		expect(scripts["inspect:crap"]).toBe(
			"pnpm run inspect:coverage:nonlive && pnpm run inspect:crap:nonlive",
		);
		expect(scripts["inspect:crap:ext"]).toBe("tsx scripts/inspect-crap-ext.ts");
		expect(scripts["inspect:sonar"]).toBe(
			"pnpm run inspect:sonar:coverage && pnpm run inspect:sonar:scan && pnpm run inspect:sonar:report",
		);
		expect(scripts["inspect:sonar:coverage"]).toContain("--coverage.reportsDirectory=coverage/sonar");
		expect(scripts["test:live"]).toBe("tsx scripts/test-live.ts");
		expect(scripts["live:up"]).toBe("tsx scripts/live.ts up");
		expect(scripts["live:down"]).toBe("tsx scripts/live.ts down");
		expect(scripts["live:status"]).toBe("tsx scripts/live.ts status");
		expect(scripts["live:exec"]).toBe("tsx scripts/live.ts exec");
		expect(scripts["live:build"]).toBe("tsx scripts/live.ts build");
	});

	it("does not expose the removed legacy aliases", async () => {
		const scripts = await readScripts();

		expect(scripts.check).toBeUndefined();
		expect(scripts["check:docs"]).toBeUndefined();
		expect(scripts["check:links"]).toBeUndefined();
		expect(scripts["check:markdown"]).toBeUndefined();
		expect(scripts["check:types"]).toBeUndefined();
		expect(scripts["check:deps"]).toBeUndefined();
		expect(scripts["link:markdown"]).toBeUndefined();
		expect(scripts["link:markdown:links"]).toBeUndefined();
		expect(scripts["link:markdown:body"]).toBeUndefined();
		expect(scripts["fix:markdown"]).toBeUndefined();
		expect(scripts["verify:fast"]).toBeUndefined();
		expect(scripts.typecheck).toBeUndefined();
		expect(scripts["typecheck:deps"]).toBeUndefined();
		expect(scripts["coverage:nonlive"]).toBeUndefined();
		expect(scripts["feedback:crap"]).toBeUndefined();
		expect(scripts["crap:ext:report"]).toBeUndefined();
		expect(scripts["crap:ext"]).toBeUndefined();
		expect(scripts["crap:nonlive:report"]).toBeUndefined();
		expect(scripts.crap).toBeUndefined();
		expect(scripts.sonar).toBeUndefined();
		expect(scripts["sonar:scan"]).toBeUndefined();
		expect(scripts["sonar:report"]).toBeUndefined();
	});

	it("keeps the normal feedback loop separate from deeper inspection", async () => {
		const scripts = await readScripts();
		const feedback = scripts["feedback:fast"];

		expect(feedback).toContain("pnpm test");
		expect(feedback).toContain("pnpm run inspect:crap:ext");
		expect(feedback).toContain("pnpm run lint:markdown");
		expect(feedback).toContain("pnpm run lint:types");
		expect(feedback).toContain("pnpm run lint:deps");
		expect(feedback).not.toContain("pnpm run inspect:crap &&");
		expect(feedback).not.toContain("inspect:sonar");
	});
});
