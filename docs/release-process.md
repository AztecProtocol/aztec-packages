# Aztec Release Process

## Who Should Read This and When

| Role | Read when |
| --- | --- |
| **Any engineer** | You're developing a fix that must not be public before release |
| **Release engineer** | You're cutting a release from `aztec-packages-private` |
| **Engineering leads** | Deciding whether a fix warrants a private release at all |

This document covers the mechanics of executing a private release, the normal release pipeline, backporting fixes to stable branches, pinning build artifacts, and retracting a release. It does not cover communicating with the community, governance votes, or executing a payload.

---

## Context: Normal vs. Private Release

In a normal Aztec release, `ci3.yml` on `AztecProtocol/aztec-packages` fires when a `v*` tag is pushed, checks out public source, builds all components, and publishes. Everything is in the open.

A private release uses `AztecProtocol/aztec-packages-private` — a private mirror of `aztec-packages`, synced from public `next` every 15 minutes. The fix lives here, never reaching the public repo. The release mechanism is the same `ci3.yml` pipeline — but it is triggered from private source.

---

## How the Private Release Works

The key mechanism: `private-fork-release.yml` (on the private fork) creates a GitHub Release on the **public** repo via the Releases API using `AZTEC_BOT_GITHUB_TOKEN`. Creating a release via the API creates the git tag as a side-effect — but crucially, this does **not** trigger `ci3.yml` (which only fires on `push` events). A separate `Release (Fork)` step then checks out code from the **private fork** at a specified commit SHA, and runs the standard `.github/ci3.sh release` pipeline against it using the public repo's `master` environment secrets.

From the outside, the release looks identical to a normal one. The public repo gets the tag and the GitHub Release; the source behind the build came from the private fork.

Publishing secrets (NPM, DockerHub, AWS) are intentionally kept on the public repo's `master` environment — not on the private fork — to keep the publishing identity consistent and avoid duplicating credential management.

---

## Triggering a Private Release

1. Develop and review the fix on `aztec-packages-private/next`
2. Confirm the upstream sync from public `next` merged cleanly
3. Go to **Actions → Release (Fork) → Run workflow** on the private fork
4. Enter a tag (e.g. `v0.76.1`) and the commit SHA from the private fork. Try a release candidate (`-rc.1`) first.

> **Tag length constraint:** The `bb` binary embeds the version string in a 26-character sentinel field. The version string after stripping the leading `v` must be ≤ 26 characters.

---

## What Gets Released

The `release` function in `bootstrap.sh` iterates a `projects` array. `noir-projects/noir-protocol-circuits` is **not included** — it does not have a release artifact and is naturally obscured. The components that do publish:

| Component | Output |
| --- | --- |
| `barretenberg/cpp` | `bb` binary → GitHub Release |
| `barretenberg/ts` | `@aztec/bb.js` → npm |
| `barretenberg/rust` | crates → crates.io |
| `noir` | `nargo`, `acvm` → GitHub + npm |
| `l1-contracts` | mirrored repo tag + npm |
| `noir-projects/aztec-nr` | mirrored repo tag |
| `yarn-project` | ~60 `@aztec/*` packages → npm |
| `boxes` | mirrored repo tag |
| `aztec-up` | installer scripts → S3 (`s3://install.aztec.network/$version/`) |
| `playground` | built app → S3 (`s3://play.aztec.network/$version/`) |
| `release-image` | `aztecprotocol/aztec` + `aztecprotocol/aztec-prover-agent` → DockerHub |

To suppress a component for a given release, patch `bootstrap.sh` on the private fork before triggering. The patch never reaches the public repo.

---

## Source Exposure by Component

**Cryptography fixes:** If the vulnerability is a cryptographic incorrectness, the fix will often be in Barretenberg or Noir, whose release binaries can already be considered obscured — stripped C++/Rust builds with no readable source. The TypeScript layer calls these via WASM/FFI; the bug fix does not surface in readable JS.

| Artifact | What is published | Source exposure |
| --- | --- | --- |
| `barretenberg/cpp` — `bb` binary | Stripped C++ release build | None |
| `barretenberg/ts` — `@aztec/bb.js` | `src/`, `dest/`, `build/`; `inlineSourceMap: true`, `declarationMap: true` | **Full source** |
| `barretenberg/rust` — crates.io | Full Rust source published by design | **Full source** |
| `noir` — `nargo`, `acvm` | Stripped Rust/C++ release binaries | None |
| `l1-contracts` — mirrored repo | Full Solidity source via `git archive`; also copies `rollup_root_verifier.sol` from noir-protocol-circuits | **Full source** |
| `noir-projects/aztec-nr` — mirrored repo | Full Noir source mirrored to a public repo tag | **Full source** |
| `yarn-project` — ~60 npm packages | Raw `src/` TypeScript + compiled `dest/` with `inlineSourceMap: true` | **Full source** |
| `release-image` — DockerHub | Whitelist only: compiled TypeScript, `bb-avm`, `nargo`, `acvm`, circuit artifacts, l1-contracts forge files | Compiled only |
| `aztec-up` | Shell installer scripts uploaded to S3 | Scripts only |
| `boxes` | Full source mirrored to a public repo tag | **Full source** |

**l1-contracts note:** Most cryptography fixes only touch a verification key in the verifier contract, which you cannot derive release details from. If broader contract source must be hidden, the deploy script would need to work from pre-compiled bytecode rather than Foundry source, and Etherscan verification must be skipped at deploy time.

---

## Release-Please: Automated Version Bumping

Release-please monitors `v4` and `master` branches and opens a "Release PR" that bumps the version and generates a changelog whenever conventional commits land.

### How version bumps are determined

| Branch | `versioning` setting | `feat:` | `fix:` | `feat!:` / `BREAKING CHANGE:` |
| --- | --- | --- | --- | --- |
| `master` | `default` | minor bump | patch bump | **major bump** |
| `v4` | `always-bump-patch` | patch bump | patch bump | patch bump |

On `v4`, `"versioning": "always-bump-patch"` means every merged PR bumps the patch version regardless of commit type. This is intentional — the v4 branch is a stable maintenance line where only patch releases are expected.

On `master`, standard semver rules apply: `feat:` = minor, `fix:` = patch, breaking change = major.

### Conventional commit prefixes that appear in the changelog

| Prefix | Section | Hidden on `v4`? |
| --- | --- | --- |
| `feat:` | Features | No |
| `fix:` | Bug Fixes | No |
| `docs:` | Documentation | No |
| `chore:`, `test:`, `refactor:` | Miscellaneous | **Yes** (hidden on v4) |

### RC tagging (v4 branch only)

Every push to a `v[0-9]*` branch (e.g. `v4`) runs the `auto-tag` job in `release-please.yml`, which:

1. Reads the current version from `.release-please-manifest.json`
2. Finds the highest existing `v{VERSION}-rc.N` tag
3. Creates `v{VERSION}-rc.{N+1}` as an annotated git tag

This means every commit to `v4` automatically gets an RC tag. The final stable tag (e.g. `v4.0.3`) is created manually by the release engineer once the RC has been validated.

### The Release PR

Release-please opens one long-lived PR per branch (e.g. "chore(v4): Release 4.0.3"). It accumulates changelog entries as commits land. Merging this PR:

- Bumps `.release-please-manifest.json`
- Updates `CHANGELOG.md`
- Creates the stable git tag

---

## Backport Process (v4 Stabilization)

Fixes that land on `next` and need to also apply to the `v4` stable branch are backported via the `backport-to-v4-staging` branch.

### How it works

1. Merge your fix to `next` as normal
2. Add the label `backport-to-v4` to the merged PR
3. The `backport.yml` workflow automatically runs `scripts/backport_to_staging.sh`:
   - Fetches the diff of your PR
   - Creates or updates the `backport-to-v4-staging` branch (branched from `v4`)
   - Applies the diff via `git apply`
   - Commits with your original authorship preserved
   - Creates/updates the PR `backport-to-v4-staging → v4` with an accumulated commit list
4. CI runs on the staging PR. Once all backports are ready, merge to `v4`.

### Conflict resolution

If the diff doesn't apply cleanly:

- The workflow posts a comment on your PR: `❌ Failed to cherry-pick...`
- ClaudeBox is dispatched to resolve the conflict automatically
- If ClaudeBox can't resolve it, fix manually:
  ```bash
  scripts/backport_to_staging.sh --continue <pr_number> v4
  ```
  Run this after manually resolving conflicts on the `backport-to-v4-staging` branch.

### Manual backport

To backport without a label (e.g. retroactively):

```bash
scripts/backport_to_staging.sh <pr_number> v4
```

---

## Pin-Build: Freezing Circuit Artifacts

Noir protocol circuits take a long time to compile. On the `backport-to-v4-staging` branch, you may want to avoid recompilation if you're only patching non-circuit code (e.g. Solidity, TypeScript). The pin-build mechanism lets you commit pre-compiled circuit artifacts so the build skips Noir compilation entirely.

### When to use it

- Backporting a fix to `v4` where Noir or the circuit source hasn't changed
- Stabilizing a release branch without updating the Nargo version

### How it works

The build function in `noir-projects/noir-protocol-circuits/bootstrap.sh` checks for a `pinned-build.tar.gz` file at startup:

```bash
if [ -f pinned-build.tar.gz ]; then
  echo "Using pinned-build.tar.gz instead of compiling."
  tar xzf pinned-build.tar.gz -C target
  return
fi
```

If the file exists, the `target/` directory is extracted from the archive and compilation is skipped.

### Steps

```bash
# 1. Build from source (this runs a full compile)
cd noir-projects
./bootstrap.sh pin-build

# 2. Commit the archives
git add noir-projects/mock-protocol-circuits/pinned-build.tar.gz \
        noir-projects/noir-protocol-circuits/pinned-build.tar.gz
git commit -m "chore: pin noir-protocol-circuits artifacts for v4.x.y"

# 3. Push to backport-to-v4-staging
git push origin backport-to-v4-staging
```

CI will now use the pinned artifacts instead of recompiling. To un-pin, delete the `.tar.gz` files and commit.

---

## Retracting a Release

If a release was published in error or must be pulled back, use the retract pipeline. **npm packages cannot be deleted** — npmjs policy blocks deletion after 72 hours. Everything else can be retracted.

### What gets deleted

| Artifact | Where |
| --- | --- |
| GitHub release + monorepo git tag | `gh release delete --cleanup-tag` |
| `l1-contracts` mirror tag | github.com/AztecProtocol/l1-contracts |
| `aztec-nr` mirror tag | github.com/AztecProtocol/aztec-nr |
| `aztec-starter-vanilla` mirror tag | github.com/AztecProtocol/aztec-starter-vanilla |
| aztec-up S3 files | `s3://install.aztec.network/$version/` |
| playground S3 files | `s3://play.aztec.network/$REF_NAME/` (dist-tag path only if still owned by this version) |
| DockerHub images (amd64, arm64, manifest) | `aztecprotocol/aztec`, `aztecprotocol/aztec-prover-agent` |

### How to retract

Via CI (preferred):

```bash
# REF_NAME must be set and must be a valid semver tag
bootstrap.sh ci-retract
```

Dry-run locally (no credentials needed, previews all actions):

```bash
REF_NAME=v1.2.3 ./bootstrap.sh retract_dryrun
```

Live locally (requires all credentials in env):

```bash
REF_NAME=v1.2.3 DOCKERHUB_PASSWORD=... ./bootstrap.sh retract
```

### Dist-tag safety guard

`playground release` writes a `_version` marker to `s3://play.aztec.network/$dist_tag/_version`. `retract_release` reads it and only deletes the dist-tag path if it still points to the version being retracted. This prevents accidentally wiping a newer deployment's live URL.

### npm packages

npm packages (`@aztec/*`, `@noir-lang/*`, `@aztec/bb.js`) are intentionally **not** retracted. Removing a published package breaks any project already pinned to that version. If a package must be removed, contact npm support directly — but this is rarely the right answer.

---

## Release Checklist

```
[ ] Fix developed and reviewed on aztec-packages-private/next
[ ] Upstream sync from public next merged cleanly
[ ] Pin-build committed if protocol circuits have not changed (backport path only)
[ ] Dry-run: DRY_RUN=1 REF_NAME=v<semver> ./bootstrap.sh retract_dryrun
[ ] RC release: Actions → Release (Fork) → v<semver>-rc.1
[ ] RC validated on staging network
[ ] Production release: Actions → Release (Fork) → v<semver>
[ ] Coordinate rollup upgrade / disclosure timing
[ ] Post-disclosure: force-push release tag to point at public source
[ ] Verify l1-contracts on Etherscan
[ ] Post-disclosure: retract RC tags if desired
```
