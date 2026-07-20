import { execSync } from 'child_process'
import { fetch } from 'cross-fetch'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import path, { join } from 'path'
import { compare, parse } from 'semver'
import { exec } from './exec'
import { BUBLIC_ROOT } from './file'
import { nicelog } from './nicelog'
import { buildNpmPublishArgs, getPublishTag, isRepublishConflict } from './npm-publish'

export type PackageDetails = {
	name: string
	dir: string
	localDeps: string[]
	version: string
}

function getPackageDetails(dir: string): PackageDetails | null {
	const packageJsonPath = path.join(dir, 'package.json')
	if (!existsSync(packageJsonPath)) {
		return null
	}
	const packageJson = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
	if (packageJson.private) {
		return null
	}
	return {
		name: packageJson.name,
		dir,
		version: packageJson.version,
		localDeps: Object.keys(packageJson.dependencies ?? {}).filter((dep) =>
			dep.startsWith('@digitalsamba')
		),
	}
}

export function getAllPackageDetails(): Record<string, PackageDetails> {
	const dirs = readdirSync(join(BUBLIC_ROOT, 'packages'))
	const results = dirs
		.map((dir) => getPackageDetails(path.join(BUBLIC_ROOT, 'packages', dir)))
		.filter((x): x is PackageDetails => Boolean(x))

	return Object.fromEntries(results.map((result) => [result.name, result]))
}

export function setAllVersions(version: string) {
	const packages = getAllPackageDetails()
	for (const packageDetails of Object.values(packages)) {
		const manifest = JSON.parse(readFileSync(path.join(packageDetails.dir, 'package.json'), 'utf8'))
		manifest.version = version
		writeFileSync(
			path.join(packageDetails.dir, 'package.json'),
			JSON.stringify(manifest, null, '\t') + '\n'
		)
		if (manifest.name === '@digitalsamba/editor') {
			const versionFileContents = `export const version = '${version}'\n`
			writeFileSync(path.join(packageDetails.dir, 'src', 'version.ts'), versionFileContents)
		}
		if (manifest.name === '@digitalsamba/tldraw') {
			const versionFileContents = `export const version = '${version}'\n`
			writeFileSync(
				path.join(packageDetails.dir, 'src', 'lib', 'ui', 'version.ts'),
				versionFileContents
			)
		}
	}

	const lernaJson = JSON.parse(readFileSync('lerna.json', 'utf8'))
	lernaJson.version = version
	writeFileSync('lerna.json', JSON.stringify(lernaJson, null, '\t') + '\n')

	execSync('yarn')
}

export function getLatestVersion() {
	const packages = getAllPackageDetails()

	const allVersions = Object.values(packages).map((p) => parse(p.version)!)
	allVersions.sort(compare)

	const latestVersion = allVersions[allVersions.length - 1]

	if (!latestVersion) {
		throw new Error('Could not find latest version')
	}

	return latestVersion
}

function topologicalSortPackages(packages: Record<string, PackageDetails>) {
	const sorted: PackageDetails[] = []
	const visited = new Set<string>()

	function visit(packageName: string, path: string[]) {
		if (visited.has(packageName)) {
			return
		}
		visited.add(packageName)
		const packageDetails = packages[packageName]
		if (!packageDetails) {
			throw new Error(`Could not find package ${packageName}. path: ${path.join(' -> ')}`)
		}
		packageDetails.localDeps.forEach((dep) => visit(dep, [...path, dep]))
		sorted.push(packageDetails)
	}

	Object.keys(packages).forEach((packageName) => visit(packageName, [packageName]))

	return sorted
}

export async function publish() {
	// OIDC "trusted publishing": no NPM_TOKEN. The npm CLI (>= 11.5.1) exchanges
	// the GitHub Actions OIDC id-token for a short-lived npm credential itself,
	// as long as `id-token: write` is granted and no auth token is configured.
	//
	// We pack each package with Yarn (which rewrites `workspace:*` deps to real
	// versions in the tarball) and upload the tarball with the npm CLI (which
	// speaks OIDC). This keeps Yarn 3.5 while getting tokenless publishing.

	// Set to true ONLY when publishing from a PUBLIC repo and you want npm
	// provenance attestations. Provenance generation fails on private repos.
	const provenance = false

	const packages = getAllPackageDetails()

	const publishOrder = topologicalSortPackages(packages)

	for (const packageDetails of publishOrder) {
		const tag = getPublishTag(packageDetails.version)
		nicelog(
			`Publishing ${packageDetails.name} with version ${packageDetails.version} under tag @${tag}`
		)

		await retry(
			async () => {
				// 1. Pack with Yarn so `workspace:*` deps are rewritten to concrete
				//    versions in the tarball's package.json. Runs the prepack (build).
				await exec('yarn', ['pack', '--out', 'package.tgz'], {
					pwd: packageDetails.dir,
					processStdoutLine: nicelog,
					processStderrLine: nicelog,
				})

				// 2. Upload the tarball with the OIDC-capable npm CLI.
				let output = ''
				try {
					await exec('npm', buildNpmPublishArgs({ tarball: 'package.tgz', tag, provenance }), {
						pwd: packageDetails.dir,
						processStdoutLine: (line) => {
							output += line + '\n'
							nicelog(line)
						},
						processStderrLine: (line) => {
							output += line + '\n'
							nicelog(line)
						},
					})
				} catch (e) {
					if (isRepublishConflict(output)) {
						// Version already on the registry — treat as success so re-runs
						// (canary re-pushes, manual recovery) are idempotent.
						return
					}
					throw e
				}
			},
			{
				delay: 10_000,
				numAttempts: 5,
			}
		)

		await retry(
			async ({ attempt, total }) => {
				nicelog('Waiting for package to be published... attempt', attempt, 'of', total)
				// fetch the new package directly from the npm registry
				const newVersion = packageDetails.version
				const unscopedName = packageDetails.name.replace('@digitalsamba/', '')

				const url = `https://registry.npmjs.org/@digitalsamba/${unscopedName}/-/${unscopedName}-${newVersion}.tgz`
				nicelog('looking for package at url: ', url)
				const res = await fetch(url, {
					method: 'HEAD',
				})
				if (res.status >= 400) {
					throw new Error(`Package not found: ${res.status}`)
				}
			},
			{
				delay: 10000,
				numAttempts: 50,
			}
		)
	}
}

function retry(
	fn: (args: { attempt: number; remaining: number; total: number }) => Promise<void>,
	opts: {
		numAttempts: number
		delay: number
	}
): Promise<void> {
	return new Promise((resolve, reject) => {
		let attempts = 0
		function attempt() {
			fn({ attempt: attempts, remaining: opts.numAttempts - attempts, total: opts.numAttempts })
				.then(resolve)
				.catch((err) => {
					attempts++
					if (attempts >= opts.numAttempts) {
						reject(err)
					} else {
						setTimeout(attempt, opts.delay)
					}
				})
		}
		attempt()
	})
}
