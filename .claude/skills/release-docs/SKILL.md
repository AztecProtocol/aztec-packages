---
name: release-docs
description: Build and update the developer documentation site for a new release
argument-hint: <RPC_URL>
---

# Release Docs

Update the Aztec developer documentation for a new release. Queries the network
for current info, updates version defaults, contract addresses, migration notes,
builds the docs, cuts a versioned snapshot, and prepares changes on `next`.

Supports **devnet**, **testnet**, and **mainnet** releases. The release type is
auto-detected from the version string returned by the network (e.g. `devnet` in
the version means devnet, `testnet` means testnet, `mainnet` means mainnet). If
the version string does not self-identify its release type, ask the user to confirm.

## Usage

```
/release-docs https://v4-devnet-3.aztec-labs.com
/release-docs https://rpc.testnet.aztec-labs.com
```

## Workflow

### Step 1: Query Network Info and Detect Release Type

Fetch node info from the provided RPC URL:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"method":"node_getNodeInfo"}' <RPC_URL> | jq .result
```

Parse the response to extract:

- `nodeVersion` (the version string, e.g. `4.0.0-devnet.3` or `4.1.0-rc.2`)
- L1 contract addresses: registry, rollup, inbox, outbox, fee juice, staking asset,
  fee juice portal, fee asset handler, coin issuer, reward distributor, reward booster,
  governance proposer, governance, governance staking escrow, staking registry,
  slash factory, slasher, tally slashing proposer
- `rollupVersion`
- `l1ChainId`

**Detect release type** from the version string:

- Contains `devnet` → release type is `devnet`
- Contains `testnet` → release type is `testnet`
- Contains `mainnet` → release type is `mainnet`
- If unclear, ask the user to confirm the release type

Store all values (including the detected release type) for use in subsequent steps.

### Step 2: Verify Git Tag Matches Network Version

The version from step 1 tells us which git tag the docs should be built from.

```bash
git fetch origin
git tag -l "v<nodeVersion>"
```

- If the tag exists and is already checked out, continue.
- If the tag exists but is not checked out: `git checkout v<nodeVersion>`
- **Abort if the tag doesn't exist** - the release hasn't been tagged yet.

### Step 3: Verify Aztec CLI Version

```bash
aztec --version
```

The installed version must match the `nodeVersion` from step 1.

**If wrong version, abort** and instruct the user to install the correct one:

```
VERSION=<version> bash -i <(curl -sL https://install.aztec.network/<version>)
```

### Step 4: Get Sponsored FPC Address

```bash
aztec get-canonical-sponsored-fpc-address
```

Store the address for updating docs.

**Note:** The Sponsored FPC is only deployed on devnet. For mainnet and testnet releases,
mark the SponsoredFPC row as "Not deployed" in the L2 Contract Addresses table.

### Step 5: Update Version Config

**File:** `docs/developer_version_config.json`

This file maps release types to version strings. Update the entry matching the
release type with the new version (prefixed with `v`):

```json
{
  "mainnet": "v4.2.0-aztecnr-rc.2",
  "testnet": "v4.1.0-rc.2",
  "devnet": "v4.0.0-devnet.2-patch.1",
  "nightly": "v5.0.0-nightly.20260320"
}
```

For example, for a devnet release of `4.1.0-devnet.1`, update `"devnet": "v4.1.0-devnet.1"`.

The preprocessor (`include_version.js`) reads defaults from this config file, so
updating it is sufficient — you no longer need to edit hardcoded defaults in JS.

### Step 6: Generate API Reference Docs

Generate the Aztec.nr and TypeScript API documentation for the new version. The
generation scripts automatically map version strings to stable folder names
(`devnet`, `testnet`, `mainnet`, `nightly`). When the version string doesn't
self-identify its release type, set `RELEASE_TYPE` explicitly.

```bash
cd docs
RELEASE_TYPE=<release_type> yarn generate:aztec-nr-api <nodeVersion>
RELEASE_TYPE=<release_type> yarn generate:typescript-api <nodeVersion>
```

This creates/updates the API docs in:

- `docs/static/aztec-nr-api/<release_type>/` (e.g. `mainnet/`, `testnet/`)
- `docs/static/typescript-api/<release_type>/`

**Prerequisites:**

- `nargo` must be available (for aztec-nr docs)
- `yarn-project` must be built for the checked-out tag (for TypeScript docs):
  ```bash
  cd yarn-project && yarn && yarn build
  ```
  This ensures TypeDoc can resolve cross-package types correctly.

If generation fails, check that the tag has the required source code and that
`yarn-project` has been built. The build step (Step 10) will validate that API
reference links resolve correctly.

### Step 7: Generate CLI Reference Docs

Regenerate the CLI reference documentation from the installed CLI (which must
match the release version per Step 3). The generation scripts scan `--help`
output from each CLI binary.

```bash
cd docs
./scripts/cli_reference_generation/generate_all_cli_docs.sh --force current
```

This updates the CLI reference files in `docs/docs-developers/docs/cli/`:

- `aztec_cli_reference.md`
- `aztec_wallet_cli_reference.md`
- `aztec_up_cli_reference.md`

These files are auto-generated — do not hand-edit them.

### Step 8: Update Migration Notes

**File:** `docs/docs-developers/docs/resources/migration_notes.md`

1. Rename the existing `## TBD` heading to `## <new version>`
2. Add a new empty `## TBD` heading above it (with a blank line between)
3. Check for missing migration items by analyzing the diff between the previous
   release tag and the new one:
   ```bash
   git diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/
   ```
4. Present draft entries for user review before adding them

### Step 9: Update Network Info & Contract Addresses

**File:** `docs/docs/networks.md`

Update the column matching the release type (**Devnet**, **Testnet**, or **Alpha (Mainnet)**) in the tables:

- **Network Technical Information table**: version, RPC endpoint, rollup version
- **L1 Contract Addresses table**: all addresses from the `node_getNodeInfo` response
  (registry, rollup, inbox, outbox, fee juice, staking asset, fee juice portal,
  fee asset handler, coin issuer, reward distributor, reward booster, governance proposer,
  governance, governance staking escrow, staking registry, slash factory, slasher,
  tally slashing proposer)
- **L2 Contract Addresses table**: update the SponsoredFPC address from step 4

Both testnet and devnet use Sepolia. Use the Sepolia etherscan URL format for L1 addresses:
`[0xADDR](https://sepolia.etherscan.io/address/0xADDR)`

Also grep for any other files referencing old addresses for this network and update:

```bash
grep -r "<old_address>" docs/
```

### Step 10: Update Getting Started Page

**For devnet releases:**

**File:** `docs/docs-developers/getting_started_on_devnet.md`

- Update `SPONSORED_FPC_ADDRESS` in the environment variables section
- Update `NODE_URL` if the RPC URL changed
- Update any other hardcoded addresses or URLs referencing the old devnet
- Review the page for correctness: version references, CLI commands, FPC registration

**For testnet releases:**

There is no dedicated `getting_started_on_testnet.md` page. Instead:

- Update any testnet RPC URLs or addresses in operator docs under `docs/docs-operate/`
- Review the testnet section of `docs/docs/networks.md` for accuracy
- Check `docs/docs-developers/getting_started_on_devnet.md` for any testnet references
  that also need updating

### Step 11: Run `yarn build` and Fix Issues

Set the environment variables matching the release type so the build preprocessor
resolves version placeholders correctly:

- **Devnet**: `DEVNET_TAG=<new_version> RELEASE_TYPE=devnet`
- **Testnet**: `TESTNET_TAG=<new_version> RELEASE_TYPE=testnet`
- **Mainnet**: `MAINNET_TAG=<new_version> RELEASE_TYPE=mainnet`

**IMPORTANT:** `COMMIT_TAG` must include the `v` prefix (e.g., `v4.2.0-aztecnr-rc.2`).
The `#include_aztec_version` macro outputs `COMMIT_TAG` as-is (used for git tags and
GitHub URLs which require the `v` prefix), while `#include_version_without_prefix` strips
the `v` to produce the bare version (used for install commands and npm packages). If you
omit the `v`, all GitHub links and git tag references in the versioned docs will be broken.

```bash
cd docs && <TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> COMMIT_TAG=v<nodeVersion> yarn build
```

Fix any issues reported by the build:

- Broken redirect targets (from `validate_redirect_targets.sh`)
- Broken API reference links (from `validate_api_ref_links.sh`)
- Spellcheck errors

Iterate until the build passes.

### Step 12: Review Getting Started Page

**For devnet releases:** Read through `docs/docs-developers/getting_started_on_devnet.md`
one final time after all changes are complete.

**For testnet releases:** Read through the testnet section of `docs/docs/networks.md`
and any updated operator docs.

In both cases verify:

- CLI commands use the correct version and flags
- Fee payment instructions are accurate
- Block explorer links are correct
- The SponsoredFPC address matches step 4

Present a summary of the review to the user for approval.

### Step 13: Cut Versioned Docs

Create a versioned snapshot of the developer docs:

Set the environment variables matching the release type:

- **Devnet**: `DEVNET_TAG=<new_version> RELEASE_TYPE=devnet`
- **Testnet**: `TESTNET_TAG=<new_version> RELEASE_TYPE=testnet`
- **Mainnet**: `MAINNET_TAG=<new_version> RELEASE_TYPE=mainnet`

**Important:** The version string passed to `docs:version` must always be prefixed
with `v` (e.g. `v4.1.0-rc.2`, not `4.1.0-rc.2`).

```bash
cd docs
<TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> yarn docusaurus docs:version:developer v<new_version>
```

Then update the versions file:

```bash
docs/scripts/update_docs_versions.sh developer
```

Verify the new version appears in `docs/developer_version_config.json`.

### Step 14: Review Recent Docs Updates on `next`

After cutting versioned docs, check whether any recent documentation updates on
`next` are relevant for the newly versioned pages but were missed during the cut.

1. Find recent docs commits on `next` that touch the source docs folders:

   ```bash
   git log --oneline --no-merges -30 next -- docs/docs-developers/ docs/docs-operate/
   ```

2. For each substantive commit (skip version cuts, nightly auto-cuts, and
   template-only changes), diff the source docs against the versioned copy:

   ```bash
   diff -rq docs/docs-developers/ docs/developer_versioned_docs/version-v<new_version>/
   diff -rq docs/docs-operate/ docs/network_versioned_docs/version-v<new_version>/
   ```

3. For files that differ, check whether the source version reflects code changes
   that shipped in the release tag. Compare API signatures, function names, and
   trait definitions in the docs against the actual source code at the tag:

   ```bash
   git show v<new_version>:<path_to_source_file>
   ```

4. Backport any fixes that are relevant to the release version (e.g. corrected
   API signatures, new SDK reference tables, additional error entries). Skip
   changes that are nightly-only or introduce APIs not present in the release.

5. Present a summary of what was found and what was backported to the user.

### Step 15: Clean Up Old Version

Identify the previous version for this release type from `docs/developer_version_config.json`
(look for the old entry being replaced — e.g. the old devnet, testnet, or mainnet version).

**Note:** For testnet, there may not be an old developer docs version to clean up if
this is the first testnet developer docs cut. In that case, skip this step.

**Ask the user for confirmation** before deleting. If approved, remove:

- `docs/developer_versioned_docs/version-<old_version>/`
- `docs/developer_versioned_sidebars/version-<old_version>-sidebars.json`
- The old entry from `developer_version_config.json`
- Any old API docs in `docs/static/aztec-nr-api/<old_version>/`
- Any old API docs in `docs/static/typescript-api/<old_version>/`

### Step 16: Move Changes to `next` Branch

```bash
git stash
git checkout next && git pull origin next
git stash pop
```

Check for stash conflicts. Then report to the user:

- `git status` and `git diff --stat` to show what changed
- List all modified/added files
- Flag any conflicts or unexpected changes
- Let the user know the changes are ready to be committed and a PR can be opened

## Key Points

- **Always query the network first**: The RPC response is the source of truth for
  version and contract addresses.
- **Tag must exist**: If the git tag for the version doesn't exist, abort. The
  release hasn't been tagged yet.
- **CLI version must match**: The `aztec` CLI must match the network version to get
  the correct canonical FPC address.
- **Build must pass**: Don't cut versioned docs until `yarn build` succeeds.
- **User confirmation required**: Ask before deleting old versioned docs and before
  adding migration note entries.
- **Changes land on `next`**: All changes are stashed and moved to the `next` branch
  at the end, ready for a PR.
- **API ref docs**: Generated in Step 6 into `docs/static/typescript-api/` and
  `docs/static/aztec-nr-api/` with stable folder names (`mainnet`, `testnet`,
  `devnet`, `nightly`). The `#api_ref_version` macro resolves to the matching
  folder name for each release type (see `include_version.js`).
