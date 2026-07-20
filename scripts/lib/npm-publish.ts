import { parse } from 'semver'

/**
 * Returns the npm dist-tag for a version: the prerelease id (e.g. 'canary',
 * 'alpha') when present, otherwise 'latest'.
 */
export function getPublishTag(version: string): string {
	return String(parse(version)?.prerelease[0] ?? 'latest')
}

/** Builds the argv for `npm publish <tarball>`. */
export function buildNpmPublishArgs(opts: {
	tarball: string
	tag: string
	provenance: boolean
}): string[] {
	return [
		'publish',
		opts.tarball,
		'--tag',
		opts.tag,
		'--access',
		'public',
		opts.provenance ? '--provenance' : '--no-provenance',
	]
}

/**
 * True when npm output indicates the exact version is already on the registry.
 * `npm publish` has no `--tolerate-republish`, so we detect this and treat it
 * as success to keep re-runs idempotent (canary re-runs, manual recovery).
 */
export function isRepublishConflict(output: string): boolean {
	const normalized = output.toLowerCase()
	return (
		normalized.includes('previously published') ||
		normalized.includes('epublishconflict') ||
		normalized.includes('cannot publish over')
	)
}
