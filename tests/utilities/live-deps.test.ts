/**
 * Self-tests for live-dep detection helpers.
 *
 * These helpers let integration-layer tests decide whether to run or skip
 * based on environment. Both must be fast (tests import them at module
 * load time for `describe.skipIf(...)`) and must never throw — a missing
 * Docker daemon or offline network is not an error, it's information.
 */

import { describe, expect, it } from "vitest";

import { canStartLiveSandbox, gondolinBundleImageFromEnv, hasContainer, hasDocker, hasNetwork } from "./live-deps.ts";

describe("hasDocker", () => {
	it("returns a boolean without throwing", async () => {
		const result = await hasDocker();
		expect(typeof result).toBe("boolean");
	});
});

describe("hasContainer", () => {
	it("returns false for a container name that is definitely not running", async () => {
		// UUID-ish garbage — no container should ever be named this.
		const bogus = `pi-fence-nope-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const result = await hasContainer(bogus);
		expect(result).toBe(false);
	});

	it("returns false without throwing when Docker is unavailable", async () => {
		// The function must tolerate 'docker: command not found' gracefully.
		// Can't simulate the absence reliably, but on machines without Docker
		// this test's prior check (hasDocker) reports false and hasContainer
		// still returns false rather than throwing.
		await expect(hasContainer("anything")).resolves.toBe(false);
	});
});

describe("gondolinBundleImageFromEnv", () => {
	it("returns a trimmed image selector only when configured", () => {
		expect(gondolinBundleImageFromEnv({})).toBeUndefined();
		expect(gondolinBundleImageFromEnv({ PI_FENCE_GONDOLIN_BUNDLE_IMAGE: "   " })).toBeUndefined();
		expect(gondolinBundleImageFromEnv({ PI_FENCE_GONDOLIN_BUNDLE_IMAGE: " pi-fence-bundle:0.1.0 " })).toBe("pi-fence-bundle:0.1.0");
	});
});

describe("canStartLiveSandbox", () => {
	it("returns false instead of throwing for unavailable live sandboxes", async () => {
		await expect(canStartLiveSandbox({
			start: async () => ({ state: "error", message: "qemu missing" }),
			stop: async () => ({ state: "stopped", message: "stopped" }),
		})).resolves.toBe(false);
		await expect(canStartLiveSandbox({
			start: async () => { throw new Error("assets missing"); },
			stop: async () => ({ state: "stopped", message: "stopped" }),
		})).resolves.toBe(false);
	});

	it("stops a ready live sandbox after preflight", async () => {
		let stopCalls = 0;

		await expect(canStartLiveSandbox({
			start: async () => ({ state: "ready", message: "ready" }),
			stop: async () => {
				stopCalls += 1;
				return { state: "stopped", message: "stopped" };
			},
		})).resolves.toBe(true);
		expect(stopCalls).toBe(1);
	});
});

describe("hasNetwork", () => {
	it("returns a boolean without throwing", async () => {
		const result = await hasNetwork();
		expect(typeof result).toBe("boolean");
	});

	it("accepts a custom probe target", async () => {
		// The probe target itself is reachable/unreachable; either way the
		// function must return a boolean.
		const result = await hasNetwork("https://example.invalid");
		expect(typeof result).toBe("boolean");
	});
});
