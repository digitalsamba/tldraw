import { execSync } from 'child_process'
import { fetch } from 'cross-fetch'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import path, { join } from 'path'
import { compare, parse } from 'semver'
import { exec } from './exec'
import { BUBLIC_ROOT } from './file'
import { nicelog } from './nicelog'

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
	const npmToken = process.env.NPM_TOKEN
	if (!npmToken) {
		throw new Error('NPM_TOKEN not set')
	}

	execSync(`yarn config set npmAuthToken ${npmToken}`, { stdio: 'inherit' })
	execSync(`yarn config set npmRegistryServer https://registry.npmjs.org`, { stdio: 'inherit' })

	const packages = getAllPackageDetails()

	const publishOrder = topologicalSortPackages(packages)

	for (const packageDetails of publishOrder) {
		const prereleaseTag = parse(packageDetails.version)?.prerelease[0] ?? 'latest'
		nicelog(
			`Publishing ${packageDetails.name} with version ${packageDetails.version} under tag @${prereleaseTag}`
		)

		await retry(
			async () => {
				let output = ''
				try {
					await exec(
						`yarn`,
						[
							'npm',
							'publish',
							'--tag',
							String(prereleaseTag),
							'--tolerate-republish',
							'--access',
							'public',
						],
						{
							pwd: packageDetails.dir,
							processStdoutLine: (line) => {
								output += line + '\n'
								nicelog(line)
							},
							processStderrLine: (line) => {
								output += line + '\n'
								nicelog(line)
							},
						}
					)
				} catch (e) {
					if (output.includes('You cannot publish over the previously published versions')) {
						// --tolerate-republish seems to not work for canary versions??? so let's just ignore this error
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
