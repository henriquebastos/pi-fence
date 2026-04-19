import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Fast suites (unit + contract + extension) run via `pnpm test`.
		// Integration (live) tests live under tests/integration/ and are
		// excluded from the default run — they require network or Docker.
		include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts", "tests/extension/**/*.test.ts", "tests/utilities/**/*.test.ts"],
		environment: "node",
		globals: false,
		// Deterministic: a test that forgets to clean up its tempdir should
		// show up as a lingering process, not as flaky cross-test state.
		restoreMocks: true,
		clearMocks: true,
	},
});
