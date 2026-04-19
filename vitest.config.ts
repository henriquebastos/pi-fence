import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Every test file in the tree is discoverable by default. The
		// separation between fast (`pnpm test`) and live (`pnpm test:live`)
		// suites is enforced at the package.json script level via --exclude
		// / --dir flags so that integration tests can still be run directly
		// via `vitest tests/integration/...` during development.
		include: ["tests/**/*.test.ts"],
		environment: "node",
		globals: false,
		// Deterministic: a test that forgets to clean up its tempdir should
		// show up as a lingering process, not as flaky cross-test state.
		restoreMocks: true,
		clearMocks: true,
	},
});
