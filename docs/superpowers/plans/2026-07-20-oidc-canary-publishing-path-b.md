# OIDC Canary Publishing (Path B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the 8 `@digitalsamba/*` canary packages via npm OIDC "trusted publishing" (no `NPM_TOKEN`) while keeping the repo on Yarn 3.5.0.

**Architecture:** Keep Yarn 3.5 for dependency management and packing; pack each package with `yarn pack` (which rewrites `workspace:*` deps to concrete versions in the tarball), then upload the tarball with the OIDC-capable npm CLI (`npm publish <tarball>`). npm ≥ 11.5.1 exchanges the GitHub Actions OIDC id-token for a short-lived registry credential automatically when `id-token: write` is set and no auth token is present. Only `publish-canary.yml` is migrated in this plan (npm allows one trusted publisher per package); the two manual workflows keep `NPM_TOKEN`.

**Tech Stack:** Yarn 3.5.0, npm CLI ≥ 11.5.1, Node 20, GitHub Actions OIDC, tsx, TypeScript, semver.

## Global Constraints

- **npm CLI floor:** publish step must run npm **≥ 11.5.1** (OIDC trusted publishing GA). npm 11 requires Node ≥ 20, so CI Node must be **≥ 20**.
- **Yarn stays at 3.5.0** — do NOT upgrade Yarn or regenerate `public-yarn.lock` in this plan. That is the separate, higher-risk Path A.
- **No auth token in the canary job** — do NOT set `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or a `registry-url` that writes an `_authToken` line to `.npmrc`. Any configured token makes npm skip the OIDC handshake.
- **Provenance default = OFF** (`--no-provenance`). npm auto-provenance fails on private repositories. Flip to `--provenance` only when publishing from a public repo.
- **Packages published (8, all public):** `assets`, `editor`, `state`, `store`, `tldraw`, `tlschema`, `utils`, `validate`, all scoped `@digitalsamba/*`.
- **Do NOT modify** `.github/workflows/publish-new.yml` or `.github/workflows/publish-manual.yml` in this plan — they remain on `NPM_TOKEN`.
- **Preserve existing behavior:** topological publish order, per-package registry polling, and idempotent re-runs (tolerate "already published").

---

## Prerequisites (manual, npm-side — MUST be done before Task 4)

These are performed by someone with admin on the `@digitalsamba` npm org. They cannot be done from code and **block Task 4 only** (Tasks 1–3 can be completed first).

For **each** of the 8 packages (`@digitalsamba/assets`, `-editor`, `-state`, `-store`, `-tldraw`, `-tlschema`, `-utils`, `-validate`):

1. npmjs.com → package → **Settings → Trusted Publisher → GitHub Actions**.
2. Set: **Organization/user** = `digitalsamba`, **Repository** = `tldraw`, **Workflow filename** = `publish-canary.yml` (exact, case-sensitive), **Environment** = `npm deploy`, **Allowed actions** = `npm publish`.
3. Leave token-based publishing enabled (do NOT enable "require trusted publisher only") so the manual workflows keep working via `NPM_TOKEN`.

> Note: npm allows exactly one trusted publisher per package. Tying it to `publish-canary.yml` is deliberate; migrating the manual workflows is a separate follow-up.

---

## Task 1: Extract & unit-test pure publish helpers

Pull the token-independent decision logic out of `publish()` into a small, unit-testable module. This is the only part with meaningful branching, so it gets real tests; the shell orchestration is validated end-to-end in Task 4.

**Files:**
- Create: `scripts/lib/npm-publish.ts`
- Test: `scripts/lib/npm-publish.test.ts`

**Interfaces:**
- Consumes: `parse` from `semver` (already a dependency).
- Produces:
  - `getPublishTag(version: string): string`
  - `buildNpmPublishArgs(opts: { tarball: string; tag: string; provenance: boolean }): string[]`
  - `isRepublishConflict(output: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/npm-publish.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn tsx scripts/lib/npm-publish.test.ts`
Expected: FAIL — module resolution error (`Cannot find module './npm-publish'`).

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/npm-publish.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn tsx scripts/lib/npm-publish.test.ts`
Expected: PASS — prints `OK: npm-publish helpers` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/npm-publish.ts scripts/lib/npm-publish.test.ts
git commit -m "feat(publish): add OIDC npm-publish helper functions"
```

---

## Task 2: Rewrite `publish()` to pack with Yarn and upload with npm OIDC

Replace the `NPM_TOKEN` + `yarn npm publish` flow with `yarn pack` (resolves `workspace:*`) + `npm publish <tarball>` (speaks OIDC). Reuse the Task 1 helpers. Keep topological order and the registry-polling loop.

**Files:**
- Modify: `scripts/lib/publishing.ts:111-193` (the `publish()` function) and its import block.

**Interfaces:**
- Consumes: `getPublishTag`, `buildNpmPublishArgs`, `isRepublishConflict` from `./npm-publish` (Task 1); existing `exec`, `nicelog`, `getAllPackageDetails`, `topologicalSortPackages`, `retry`.
- Produces: `publish()` — same exported signature (`async () => Promise<void>`), now OIDC-based.

- [ ] **Step 1: Add the helper import**

At the top of `scripts/lib/publishing.ts`, after the existing `import { nicelog } from './nicelog'` line, add:

```ts
import { buildNpmPublishArgs, getPublishTag, isRepublishConflict } from './npm-publish'
```

- [ ] **Step 2: Replace the token block and per-package publish step**

Replace the current `publish()` body from line 111 down to the end of the first `retry(...)` block (the `yarn npm publish` block, ending at line 169) with the following. Leave the second `retry(...)` registry-polling block (lines 171–191) unchanged.

Replace:

```ts
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
```

With:

```ts
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
					await exec(
						'npm',
						buildNpmPublishArgs({ tarball: 'package.tgz', tag, provenance }),
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
```

- [ ] **Step 3: Verify no now-unused imports remain**

Confirm `execSync` (from `child_process`) is still used by `setAllVersions` at `scripts/lib/publishing.ts:71` (`execSync('yarn')`) and `parse` (from `semver`) is still used by `getLatestVersion`. Both remain used, so leave the imports. Do NOT remove them.

Run: `yarn tsx -e "import('./scripts/lib/publishing.ts').then(() => console.log('imports OK'))"`
Expected: prints `imports OK` (module loads without a resolution/compile error).

- [ ] **Step 4: Type-check the changed file**

Run: `yarn tsc --noEmit -p tsconfig.base.json 2>&1 | grep -i "scripts/lib" || echo "no type errors in scripts/lib"`
Expected: `no type errors in scripts/lib`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/publishing.ts
git commit -m "feat(publish): pack with yarn, upload with npm OIDC (no NPM_TOKEN)"
```

---

## Task 3: Update `publish-canary.yml` for OIDC

Bump Node to 20, ensure npm ≥ 11.5.1, and remove `NPM_TOKEN`. `id-token: write` is already declared.

**Files:**
- Modify: `.github/workflows/publish-canary.yml:24-41`

**Interfaces:**
- Consumes: the `publish()` behavior from Task 2 (tokenless, OIDC).
- Produces: a canary workflow that runs with OIDC and no npm auth token.

- [ ] **Step 1: Update the Node setup, add npm upgrade, drop NPM_TOKEN**

Replace lines 24–41 (from `- name: Setup Node.js environment` to the end of the file):

```yaml
      - name: Setup Node.js environment
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'yarn'
          cache-dependency-path: 'public-yarn.lock'

      - name: Enable corepack
        run: corepack enable

      - name: Install dependencies
        run: yarn

      - name: Publish Canary Packages
        run: yarn tsx ./scripts/publish-canary.ts
        env:
          GH_TOKEN: ${{ github.token }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

With:

```yaml
      - name: Setup Node.js environment
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'yarn'
          cache-dependency-path: 'public-yarn.lock'

      - name: Ensure npm supports trusted publishing (>= 11.5.1)
        run: |
          npm install -g npm@latest
          npm --version

      - name: Enable corepack
        run: corepack enable

      - name: Install dependencies
        run: yarn

      - name: Publish Canary Packages
        run: yarn tsx ./scripts/publish-canary.ts
        env:
          GH_TOKEN: ${{ github.token }}
```

> `NPM_TOKEN` is intentionally removed — its presence would make npm skip the OIDC handshake. `permissions.id-token: write` (lines 7-9) is already present and required.

- [ ] **Step 2: Validate the workflow YAML**

Run: `yarn tsx -e "import('js-yaml').then(y=>{const fs=require('fs');y.load(fs.readFileSync('.github/workflows/publish-canary.yml','utf8'));console.log('yaml OK')})" 2>/dev/null || npx --yes yaml-lint .github/workflows/publish-canary.yml`
Expected: `yaml OK` (or yaml-lint reports no errors). Confirm by eye that `NPM_TOKEN` no longer appears in the file.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-canary.yml
git commit -m "ci(canary): publish via OIDC on node 20 + npm@latest, drop NPM_TOKEN"
```

---

## Task 4: End-to-end validation (live canary publish)

**Blocked by the Prerequisites section** (trusted publisher must be configured on npm for all 8 packages first). Canary versions are sha-tagged and disposable, so a real publish is the correct validation — `npm publish --dry-run` does not exercise the OIDC handshake.

**Files:** none (verification only).

- [ ] **Step 1: Merge the three commits to `main`**

Merge Tasks 1–3 to `main` (the canary workflow triggers on push to `main`).

- [ ] **Step 2: Watch the workflow run**

Run: `gh run watch $(gh run list --workflow=publish-canary.yml --limit 1 --json databaseId --jq '.[0].databaseId')`
Expected: the run succeeds. In the "Publish Canary Packages" step logs, confirm npm authenticated via OIDC (no `NPM_TOKEN`) and all 8 packages published without an `ENEEDAUTH`/401/403-auth error.

- [ ] **Step 3: Confirm workspace deps were resolved in a published tarball**

Run: `gh run view --log $(gh run list --workflow=publish-canary.yml --limit 1 --json databaseId --jq '.[0].databaseId') | grep -m1 "Publishing @digitalsamba/editor with version"`
Note the printed canary version (e.g. `2.0.1-canary.<sha>`), then run:
`npm view @digitalsamba/editor@<that-version> dependencies`
Expected: internal deps show concrete versions (e.g. `@digitalsamba/state: '2.0.1-canary.<sha>'`), NOT `workspace:*`.

- [ ] **Step 4: Confirm registry availability**

Run: `npm view @digitalsamba/tldraw@<that-version> version`
Expected: prints the canary version (proves the topological last package published and is fetchable).

---

## Rollback

If Task 4 fails and cannot be fixed forward: revert the three commits (`git revert <task3> <task2> <task1>`) and push. The manual workflows (`publish-new.yml`, `publish-manual.yml`) are untouched and still publish via `NPM_TOKEN`, so release capability is never lost. The npm-side trusted publisher config is harmless to leave in place.

## Follow-ups (out of scope)

- Migrate `publish-new.yml` / `publish-manual.yml` to OIDC. Requires either consolidating to one publish workflow or reconfiguring the npm trusted publisher (one-per-package limit).
- Path A (upgrade Yarn 3.5 → 4.9+ for native `yarn npm publish` OIDC), if the split toolchain proves undesirable.

## Self-Review Notes

- Spec coverage: tooling floor (Task 3), tokenless OIDC (Tasks 2+3), `workspace:*` resolution (Task 2 `yarn pack` + Task 4 Step 3 verify), republish tolerance (Task 1 `isRepublishConflict` + Task 2), provenance-off default (Task 1/2), one-publisher-per-package (Prerequisites + Global Constraints), manual workflows untouched (Global Constraints). All covered.
- Type consistency: `getPublishTag` / `buildNpmPublishArgs` / `isRepublishConflict` signatures identical across Tasks 1 and 2. `provenance` is a boolean everywhere. Tarball name `package.tgz` consistent between `yarn pack --out` and `buildNpmPublishArgs`.
