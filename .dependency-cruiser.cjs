/** @type {import('dependency-cruiser').CruiseOptions} */
module.exports = {
	forbidden: [
		{
			name: 'no-production-imports-from-tests',
			comment:
				'Production runtime code under extensions/ must not import from tests/. Test-owned fakes stay in the test lane.',
			severity: 'error',
			from: { path: '^extensions/' },
			to: { path: '^tests/' },
		},
		{
			name: 'no-circular',
			comment: 'No circular dependencies within extension code.',
			severity: 'error',
			from: { path: '^extensions/' },
			to: { circular: true },
		},
		{
			name: 'io-seams-are-leaves',
			comment:
				'I/O seam modules must not import extension logic (config-loader → config.ts is the one allowed edge).',
			severity: 'error',
			from: { path: '^extensions/pi-fence/io/' },
			to: { path: '^extensions/pi-fence/(?!io/|config\\.ts)' },
		},
		{
			name: 'pure-modules-no-node-builtins',
			comment:
				'Pure domain modules must not import Node builtins. All I/O goes through DI seams.',
			severity: 'error',
			from: {
				path: '^extensions/pi-fence/(parser|processor|resolve|list|config)\\.ts$',
			},
			to: { dependencyTypes: ['core'] },
		},
		{
			name: 'pure-modules-no-pi-sdk',
			comment:
				'Pure domain modules must not depend on the host runtime SDK (not even type-only).',
			severity: 'error',
			from: {
				path: '^extensions/pi-fence/(parser|processor|resolve|list|config)\\.ts$',
			},
			to: { path: '@mariozechner/' },
		},
		{
			name: 'processors-independent',
			comment:
				'Processor implementations must not import each other. Resolution lives in resolve.ts.',
			severity: 'error',
			from: { path: '^extensions/pi-fence/(kroki|graphviz-local)\\.ts$' },
			to: { path: '^extensions/pi-fence/(kroki|graphviz-local)\\.ts$' },
		},
		{
			name: 'processors-no-pi-sdk',
			comment:
				'Processor implementations must not depend on the host runtime SDK.',
			severity: 'error',
			from: { path: '^extensions/pi-fence/(kroki|graphviz-local)\\.ts$' },
			to: { path: '@mariozechner/' },
		},
		{
			name: 'only-index-wires-node-impls',
			comment:
				'Only the composition root (index.ts) may value-import from io/ modules. Others use type-only imports for the interfaces.',
			severity: 'error',
			from: {
				path: '^extensions/pi-fence/(?!index\\.ts$|io/).*\\.ts$',
			},
			to: {
				path: '^extensions/pi-fence/io/',
				dependencyTypesNot: ['type-only'],
			},
		},
	],
	options: {
		tsPreCompilationDeps: true,
		doNotFollow: { path: 'node_modules' },
		exclude: { path: ['node_modules', 'dist', 'scripts/out'] },
		includeOnly: '^.',
		tsConfig: {
			fileName: 'tsconfig.json',
		},
	},
};
