import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type BundleManifest = {
	name?: unknown;
	version?: unknown;
	tools?: Record<string, { command?: unknown; versionCommand?: unknown }>;
};

async function readText(path: string): Promise<string> {
	return await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

async function readBundleManifest(): Promise<BundleManifest> {
	return JSON.parse(await readText("docker/bundle/manifest.json")) as BundleManifest;
}

describe("bundle sandbox image contract", () => {
	it("commits a machine-readable manifest for the product bundle image", async () => {
		const manifest = await readBundleManifest();

		expect(manifest.name).toBe("pi-fence-bundle");
		expect(manifest.version).toBe("0.1.0");
		expect(manifest.tools).toEqual({
			dot: {
				command: "dot",
				versionCommand: ["dot", "-V"],
			},
			mmdc: {
				command: "mmdc",
				versionCommand: ["mmdc", "--version"],
			},
		});
	});

	it("keeps the product bundle image separate from the live-deps test image", async () => {
		const liveDepsDockerfile = await readText("docker/Dockerfile");
		const bundleDockerfile = await readText("docker/bundle/Dockerfile");

		expect(liveDepsDockerfile).toContain("pi-fence-live-deps");
		expect(liveDepsDockerfile).not.toContain("pi-fence-bundle");
		expect(bundleDockerfile).toContain("pi-fence-bundle");
		expect(bundleDockerfile).not.toContain("pi-fence-live-deps");
	});

	it("installs the first bundled command renderers and copies the manifest into the image", async () => {
		const dockerfile = await readText("docker/bundle/Dockerfile");

		expect(dockerfile).toContain("graphviz");
		expect(dockerfile).toContain("chromium");
		expect(dockerfile).toContain("@mermaid-js/mermaid-cli");
		expect(dockerfile).toContain("COPY manifest.json /opt/pi-fence-bundle/manifest.json");
		expect(dockerfile).toContain(
			"COPY puppeteer-config.json /opt/pi-fence-bundle/puppeteer-config.json",
		);
		expect(dockerfile).toContain("CMD [\"sleep\", \"infinity\"]");
	});
});
