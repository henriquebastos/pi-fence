/**
 * Live-dependency detection.
 *
 * Integration-layer tests use these to decide whether to run or skip. Each
 * helper must be fast (called at module load for `describe.skipIf(...)`)
 * and must never throw — a missing Docker daemon or offline network is
 * information, not an exceptional condition.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_NETWORK_PROBE = "https://kroki.io";

export function gondolinBundleImageFromEnv(
	env: Partial<Pick<NodeJS.ProcessEnv, "PI_FENCE_GONDOLIN_BUNDLE_IMAGE">> = process.env,
): string | undefined {
	const image = env.PI_FENCE_GONDOLIN_BUNDLE_IMAGE?.trim();
	return image ? image : undefined;
}

/**
 * Does the `docker` binary exist and respond to `docker info`?
 *
 * Returns false for "binary missing", "daemon not running", or any other
 * reason the docker CLI can't be used right now. Never throws.
 */
export async function hasDocker(): Promise<boolean> {
	try {
		await execFileAsync("docker", ["info"], { timeout: 2000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Is a container with the given name currently running?
 *
 * Returns false when Docker is unavailable, when no such container exists,
 * or when the container exists but isn't running. Never throws.
 */
export async function hasContainer(name: string): Promise<boolean> {
	try {
		// `docker ps` lists running containers; `--filter name=` matches on
		// name. --format '{{.Names}}' keeps output predictable across
		// versions.
		const { stdout } = await execFileAsync(
			"docker",
			["ps", "--filter", `name=^${escapeFilter(name)}$`, "--format", "{{.Names}}"],
			{ timeout: 2000 },
		);
		return stdout.trim().split(/\r?\n/).includes(name);
	} catch {
		return false;
	}
}

/**
 * Can we reach a network target?
 *
 * Default probe is https://kroki.io which is the HTTP target our live
 * tests care about. Callers can pass another URL if they need to.
 *
 * Uses HEAD with a short timeout. Any fetch failure (DNS, connection
 * refused, timeout) yields false.
 */
export async function hasNetwork(target: string = DEFAULT_NETWORK_PROBE): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 3000);
		try {
			const response = await fetch(target, {
				method: "HEAD",
				signal: controller.signal,
			});
			// Any response — including 4xx/5xx — means the network reached
			// the target. Only DNS/connection failures count as "no network".
			return response.status < 600;
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return false;
	}
}

function escapeFilter(name: string): string {
	// `--filter name=` accepts a regex. We anchor with ^...$ in the caller;
	// here we escape anything regex-special in the user-supplied name.
	return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
