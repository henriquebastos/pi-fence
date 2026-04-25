import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PackageJson = {
	scripts?: Record<string, string>;
};

async function readScripts(): Promise<Record<string, string>> {
	const raw = await readFile(new URL("../../package.json", import.meta.url), "utf8");
	const packageJson = JSON.parse(raw) as PackageJson;

	return packageJson.scripts ?? {};
}

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
