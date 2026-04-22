/** @type {import('dependency-cruiser').CruiseOptions} */
module.exports = {
	forbidden: [
		{
			name: 'no-production-imports-from-tests',
			comment:
				"Production runtime code under extensions/ must not import from tests/. Test-owned fakes stay in the test lane.",
			severity: 'error',
			from: { path: '^extensions/' },
			to: { path: '^tests/' },
		},
	],
	options: {
		doNotFollow: { path: 'node_modules' },
		exclude: { path: ['node_modules', 'dist', 'scripts/out'] },
		includeOnly: '^.',
		tsConfig: {
			fileName: 'tsconfig.json',
		},
	},
};
