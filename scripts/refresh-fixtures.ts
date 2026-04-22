#!/usr/bin/env tsx
/**
 * refresh-fixtures — regenerate committed test fixtures from live sources.
 *
 * Skeleton. S1 fills in the Kroki path: hit kroki.io for a small canonical
 * set of diagrams, write the PNG bytes under tests/fixtures/kroki/. Future
 * stories extend this for each processor with fixtures (graphviz-local,
 * mermaid-cli, etc).
 *
 * Philosophy:
 *   - Fixtures live in git so unit tests are deterministic without network.
 *   - `refresh` is run deliberately by a human (or scheduled CI job) when
 *     an upstream renderer changes output and we accept the new baseline.
 *   - Each (tag, name) pair is a known canonical fixture documented in the
 *     relevant processor's test file. The refresh function reads those
 *     manifests and regenerates only what's listed.
 *
 * Usage (once S1 fills it in):
 *   pnpm refresh-fixtures                # refresh all known fixture sets
 *   pnpm refresh-fixtures kroki          # refresh only kroki's
 *   pnpm refresh-fixtures kroki mermaid  # refresh only the mermaid fixture
 */

/**
 * Regenerate fixtures for the given tag (and optionally a specific fixture
 * name within that tag). Throws until a real implementation lands in S1.
 */
export async function refresh(tag: string, _name?: string): Promise<void> {
	throw new Error(
		`refresh: not yet implemented for tag '${tag}'. The skeleton landed in CV0.E1.S0; ` +
			`Kroki fixture refresh lands in CV0.E1.S1.`,
	);
}

// CLI entry — only runs when invoked directly, not when imported by tests.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
	const [, , tag, name] = process.argv;
	if (!tag) {
		console.error("Usage: pnpm refresh-fixtures <tag> [name]");
		process.exit(1);
	}
	try {
		await refresh(tag, name);
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}
