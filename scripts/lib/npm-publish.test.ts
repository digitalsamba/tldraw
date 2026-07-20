import assert from 'node:assert'
import { buildNpmPublishArgs, getPublishTag, isRepublishConflict } from './npm-publish'

// getPublishTag: stable -> 'latest', prerelease -> prerelease id
assert.strictEqual(getPublishTag('2.0.0'), 'latest')
assert.strictEqual(getPublishTag('2.0.0-canary.abc123def456'), 'canary')
assert.strictEqual(getPublishTag('2.0.0-alpha.17'), 'alpha')

// buildNpmPublishArgs: provenance off adds --no-provenance
assert.deepStrictEqual(
	buildNpmPublishArgs({ tarball: 'package.tgz', tag: 'canary', provenance: false }),
	['publish', 'package.tgz', '--tag', 'canary', '--access', 'public', '--no-provenance']
)

// buildNpmPublishArgs: provenance on adds --provenance
assert.deepStrictEqual(
	buildNpmPublishArgs({ tarball: 'package.tgz', tag: 'latest', provenance: true }),
	['publish', 'package.tgz', '--tag', 'latest', '--access', 'public', '--provenance']
)

// isRepublishConflict: matches npm's "already published" errors, case-insensitively
assert.strictEqual(
	isRepublishConflict(
		'npm error 403 You cannot publish over the previously published versions: 2.0.0.'
	),
	true
)
assert.strictEqual(isRepublishConflict('npm error code EPUBLISHCONFLICT'), true)
assert.strictEqual(isRepublishConflict('npm error 401 Unauthorized'), false)

console.log('OK: npm-publish helpers')
