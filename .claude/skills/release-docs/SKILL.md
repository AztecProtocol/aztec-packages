---
name: release-docs
description: Build and update the documentation site for a new devnet release
argument-hint: <RPC_URL>
---

# Release Docs

Update the Aztec documentation for a new devnet deployment. Queries the network
for current info, updates version defaults, contract addresses, migration notes,
builds the docs, cuts a versioned snapshot, and prepares changes on `next`.

## Usage

```
/release-docs https://v4-devnet-3.aztec-labs.com
```

## Workflow

### Step 1: Query Network Info

Fetch node info from the provided RPC URL:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"method":"node_getNodeInfo"}' <RPC_URL> | jq .result
```

Parse the response to extract:
- `nodeVersion` (the version string, e.g. `4.0.0-devnet.3`)
- L1 contract addresses: registry, rollup, inbox, outbox, fee juice, staking asset,
  fee juice portal, fee asset handler, coin issuer, reward distributor, reward booster,
  governance proposer, governance, governance staking escrow, staking registry,
  slash factory, slasher, tally slashing proposer
- `rollupVersion`
- `l1ChainId`

Store all values for use in subsequent steps.

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

### Step 5: Update `include_version.js` Defaults

**File:** `docs/src/preprocess/include_version.js`

Update the `DEVNET_TAG` default value. The line looks like:

```javascript
const devnetTag = process.env.DEVNET_TAG || "4.0.0-devnet.2-patch.1";
```

Replace the old version string with the new `nodeVersion`.

### Step 6: Update Migration Notes

**File:** `docs/docs-developers/docs/resources/migration_notes.md`

1. Rename the existing `## TBD` heading to `## <new version>`
2. Add a new empty `## TBD` heading above it (with a blank line between)
3. Check for missing migration items by analyzing the diff between the previous
   devnet tag and the new one:
   ```bash
   git diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/
   ```
4. Present draft entries for user review before adding them

### Step 7: Update Network Info & Contract Addresses

**File:** `docs/docs/networks.md`

Update the **Devnet** column in the tables:
- **Network Technical Information table**: version, RPC endpoint, rollup version
- **L1 Contract Addresses table**: all addresses from the `node_getNodeInfo` response
  (registry, rollup, inbox, outbox, fee juice, staking asset, fee juice portal,
  fee asset handler, coin issuer, reward distributor, reward booster, governance proposer,
  governance, governance staking escrow, staking registry, slash factory, slasher,
  tally slashing proposer)
- **L2 Contract Addresses table**: update the SponsoredFPC address from step 4

Use the Sepolia etherscan URL format for L1 addresses:
`[0xADDR](https://sepolia.etherscan.io/address/0xADDR)`

Also grep for any other files referencing old devnet addresses and update those too:
```bash
grep -r "<old_address>" docs/
```

### Step 8: Update Getting Started on Devnet Page

**File:** `docs/docs-developers/getting_started_on_devnet.md`

- Update `SPONSORED_FPC_ADDRESS` in the environment variables section
- Update `NODE_URL` if the RPC URL changed
- Update any other hardcoded addresses or URLs referencing the old devnet
- Review the page for correctness: version references, CLI commands, FPC registration

### Step 9: Run `yarn build` and Fix Issues

```bash
cd docs && yarn build
```

Fix any issues reported by the build:
- Broken redirect targets (from `validate_redirect_targets.sh`)
- Broken API reference links (from `validate_api_ref_links.sh`)
- Spellcheck errors

Iterate until the build passes.

### Step 10: Review Devnet Getting Started Page

Read through `docs/docs-developers/getting_started_on_devnet.md` one final time after
all changes are complete:

- Verify CLI commands use the correct version and flags
- Verify fee payment instructions are accurate
- Verify block explorer links are correct
- Verify the SponsoredFPC address matches step 4

Present a summary of the review to the user for approval.

### Step 11: Cut Versioned Docs

Create a versioned snapshot of the developer docs:

```bash
cd docs
DEVNET_TAG=<new_version> RELEASE_TYPE=devnet yarn docusaurus docs:version:developer <new_version>
```

Then update the versions file:

```bash
docs/scripts/update_docs_versions.sh developer
```

Verify the new version appears in `docs/developer_versions.json`.

### Step 12: Clean Up Old Devnet Version

Identify the previous devnet version from `docs/developer_versions.json` (look for
the old devnet entry being replaced).

**Ask the user for confirmation** before deleting. If approved, remove:
- `docs/developer_versioned_docs/version-<old_version>/`
- `docs/developer_versioned_sidebars/version-<old_version>-sidebars.json`
- The old entry from `developer_versions.json`
- Any old devnet API docs in `docs/static/aztec-nr-api/<old_version>/`

### Step 13: Move Changes to `next` Branch

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
