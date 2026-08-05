---
name: release-network-docs
description: Update network/operator documentation for a mainnet or testnet release without touching developer docs
argument-hint: <RPC_URL>
---

# Release Network Docs

Update the Aztec network/operator documentation for a new release. Queries the
network for current info, updates contract addresses, builds the docs, cuts a
versioned snapshot of the operator docs, and prepares changes on `next`.

This is a **lightweight alternative** to the full `/release-docs` skill. Use it
when only the network/operator docs need updating (new contract addresses,
network upgrade, config changes) and the developer docs remain unchanged.

Supports **mainnet** and **testnet** releases only. Network operator docs do not
have devnet or nightly versions. The release type is auto-detected from the
version string returned by the network. If the version string does not
self-identify its release type, ask the user to confirm.

**This skill does NOT:**

- Generate developer API docs (aztec-nr or TypeScript)
- Generate CLI reference docs
- Update developer version config or cut developer versioned docs
- Update migration notes
- Require aztec CLI, nargo, or yarn-project build

**This skill DOES** regenerate the Node JSON-RPC API reference for the
versioned docs (see Step 5a).

## Usage

```
/release-network-docs https://aztec-mainnet.drpc.org
/release-network-docs https://rpc.testnet.aztec-labs.com
```

## Workflow

### Step 1: Query Network Info and Detect Release Type

Fetch node info from the provided RPC URL:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"method":"aztec_getNodeInfo"}' <RPC_URL> | jq .result
```

Parse the response to extract:

- `nodeVersion` (the version string, e.g. `4.1.2` or `4.1.0-rc.2`)
- L1 contract addresses from `l1ContractAddresses`: registry, rollup, inbox,
  outbox, fee juice, staking asset, fee juice portal, fee asset handler, coin
  issuer, reward distributor, governance proposer, governance, slash factory
- L2 protocol contract addresses from `protocolContractAddresses`: instance
  registry, class registry, multi-call entrypoint, fee juice
- `rollupVersion`
- `l1ChainId`

**Detect release type** from the version string:

- Contains `mainnet` or matches a plain semver like `4.1.2` → release type is `mainnet`
- Contains `testnet` or `rc` → release type is `testnet`
- Contains `devnet` → **abort**: network docs do not support devnet. Direct the
  user to use `/release-docs` instead.
- If unclear, ask the user to confirm the release type (must be `mainnet` or `testnet`)

Store all values for use in subsequent steps.

### Step 2: Verify Git Tag and Checkout

The version from Step 1 tells us which git tag the docs should be built from.
The operator docs source in `docs/docs-operate/` must reflect the code at the
release tag, not whatever happens to be on `next`.

```bash
git fetch origin
git tag -l "v<nodeVersion>"
```

- If the tag exists and is already checked out, continue.
- If the tag exists but is not checked out: `git checkout v<nodeVersion>`
- **Abort if the tag doesn't exist** — the release hasn't been tagged yet.

### Step 3: Identify and Resolve Missing Contract Addresses

The `networks.md` L1 table includes contracts that are **not** returned by
`aztec_getNodeInfo`. Resolve these addresses in three tiers:

#### Tier 1: Query on-chain from known contracts

The Rollup and Registry addresses are already known from the RPC response. Use
them to query additional addresses on L1. Determine the L1 RPC from the chain
ID: `1` → Ethereum mainnet, `11155111` → Sepolia.

```bash
# GSE (Governance Staking Escrow) — from Rollup
cast call <ROLLUP_ADDRESS> "getGSE()(address)" --rpc-url <L1_RPC>

# Slasher — from Rollup
cast call <ROLLUP_ADDRESS> "getSlasher()(address)" --rpc-url <L1_RPC>

# Governance — from Registry
cast call <REGISTRY_ADDRESS> "getGovernance()(address)" --rpc-url <L1_RPC>
```

#### Tier 2: From deployment output (if available)

These addresses are stored internally in contracts with no public getter. They
can be obtained from the Forge deployment script output
(`l1-contracts/script/deploy/DeployAztecL1Contracts.s.sol` prints JSON with all
addresses). Ask the user if they have deployment output.

- **Reward Booster** (stored in Rollup's `RewardLib` storage, no getter)
- **Tally Slashing Proposer** (deployed alongside Slasher, no getter)
- **Staking Registry**

#### Tier 3: Manual / confirm unchanged

These periphery contracts have no on-chain getter. Ask the user to provide new
addresses or confirm that the existing values in `networks.md` are still correct.

- **Honk Verifier**
- **Register New Rollup Version Payload**
- **Slash Payload Cloneable**

Present a summary table showing: which addresses came from RPC, which were
queried on-chain, which came from deployment output, and which are unchanged.
Get user confirmation before proceeding.

### Step 4: Update Network Info and Contract Addresses

**File:** `docs/docs/networks.md`

Update the column matching the release type (**Alpha (Mainnet)** or **Testnet**)
in each table:

- **Network Technical Information table**: update the version, rollup version.
  Update the RPC endpoint only if the user provides a new one (the argument
  RPC URL may be temporary or internal). Keep bootnodes and block explorer
  links unless the user requests changes.

- **L1 Contract Addresses table**: update all addresses from the RPC response,
  on-chain queries, and any additional addresses provided by the user.

  - Mainnet: use `https://etherscan.io/address/0xADDR` link format
  - Testnet: use `https://sepolia.etherscan.io/address/0xADDR` link format
  - For contracts that are not deployed on this network, use `N/A`

- **L2 Contract Addresses table**: update if any canonical protocol contract
  addresses changed (check the `protocolContractAddresses` from the RPC
  response). SponsoredFPC is always "Not deployed" on mainnet.

Also grep for any old addresses that may appear elsewhere in the docs:

```bash
grep -r "<old_address>" docs/
```

Re-verify every figure against its source of truth before writing it — never
carry values forward from the previous release or transcribe them by hand.
Follow the "Re-verify every figure against its source of truth" subsection of
`/release-docs` Step 9: EIP-55 checksum every address with
`cast to-check-sum-address`, convert on-chain hex with `cast to-dec`, read the
rollup version from `getVersion()` on each network's rollup, confirm the L1
chain id with `cast chain-id`, refresh the governance parameters table from the
Governance / Governance Proposer / Tally Slashing Proposer contracts on-chain,
and diff against any human-owned deployment data (resolving discrepancies on
chain, then reconciling with the owner).

### Step 5: Review Operator Docs Content (Optional)

Ask the user if any content changes are needed in `docs/docs-operate/`:

- New or changed configuration options, environment variables, or CLI flags
- Updated setup instructions or prerequisites
- New or modified troubleshooting entries
- Operator changelog updates (if not handled by `/updating-changelog`)

If the user has content changes, apply them to the source files in
`docs/docs-operate/`. If no content changes are needed, skip to Step 5a.

### Step 5a: Regenerate Node API Reference

The Node JSON-RPC API reference is auto-generated from TypeScript source. It
must be regenerated from the release tag's source files to ensure the versioned
docs reflect the actual API at that release.

```bash
cd docs
yarn generate:node-api-reference
```

This writes to `docs/docs-operate/operators/reference/node-api-reference.md`
using the source files from the currently checked-out tag. The generator parses
`yarn-project/stdlib/src/interfaces/aztec-node.ts` and
`yarn-project/stdlib/src/interfaces/aztec-node-admin.ts` directly (no
yarn-project build needed, but `yarn-project/node_modules/` must be installed
so `npx tsx` can resolve `typescript` — run `yarn install` from `yarn-project`
if needed).

Verify the output lists the expected number of methods and has no ungrouped
methods warnings.

### Step 5b: Regenerate Operator CLI Reference

The operator-facing CLI reference (`docs/docs-operate/operators/reference/cli-reference.md`)
is auto-generated from `aztec start --help`. Regenerate it so the doc matches
the CLI shipped with the release.

Pass the release version with `-v` so the script verifies the locally-installed
`aztec` CLI matches before running. The mismatch is fatal in non-interactive
mode (use `-f` to bypass).

```bash
cd docs
yarn generate:operator-cli-reference -v v<new_version>
```

If `aztec --version` reports a different version, install the matching one
first with `aztec-up v<new_version>` and retry.

The script captures `aztec start --help`, retries on the dockerized-CLI
stdout-truncation race, and writes the file. Verify the resulting file is
~950+ lines and ends with `Starts Aztec TXE with options`.

### Step 6: Build and Validate

Set the environment variables matching the release type so the build
preprocessor resolves version placeholders correctly in the operator docs:

- **Mainnet**: `MAINNET_TAG=<new_version> RELEASE_TYPE=mainnet`
- **Testnet**: `TESTNET_TAG=<new_version> RELEASE_TYPE=testnet`

**IMPORTANT:** `COMMIT_TAG` must include the `v` prefix (e.g., `v4.1.2`). The
preprocessor uses this for git tag references and GitHub URLs.

```bash
cd docs && <TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> COMMIT_TAG=v<nodeVersion> yarn build
```

Where `<TAG_VAR>` is `MAINNET_TAG` for mainnet or `TESTNET_TAG` for testnet.

Fix any issues reported by the build:

- Broken redirect targets (from `validate_redirect_targets.sh`)
- Broken API reference links (from `validate_api_ref_links.sh`)
- Spellcheck errors

Iterate until the build passes.

### Step 7: Read Old Version and Cut Network Versioned Docs

**Before cutting**, read `docs/network_version_config.json` and record the
current version for this release type. This is the old version that will be
cleaned up in Step 8. Save this value — the config will be overwritten next.

```bash
cat docs/network_version_config.json
```

For example, if the config shows `"mainnet": "v4.1.2"` and you are releasing
`v4.2.0` for mainnet, the old version is `v4.1.2`.

Now create a versioned snapshot of the network/operator docs. The version string
must always be prefixed with `v` (e.g. `v4.1.2`, not `4.1.2`).

```bash
cd docs
<TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> yarn docusaurus docs:version:network v<new_version>
```

Then update the version config and reconcile:

```bash
scripts/update_docs_versions.sh network <release_type> v<new_version>
```

Verify the results:

- `docs/network_version_config.json` has the new version under the correct
  release type (the old version is no longer mapped to this release type)
- `docs/network_versioned_docs/version-v<new_version>/` exists with resolved
  macros (check that `#release_version` was replaced with the actual version
  string and `#release_network` was replaced with `mainnet` or `testnet`)
- `docs/network_versioned_sidebars/version-v<new_version>-sidebars.json` exists

**Note:** At this point `network_versions.json` may still list the old version
as an unmapped extra (its directory still exists). This is cleaned up in Step 8.

### Step 8: Clean Up Old Network Version

Use the old version recorded at the start of Step 7.

**If this is the first release for this release type** (no previous version
existed in the config), skip this step.

**Ask the user for confirmation** before deleting. If approved, remove:

- `docs/network_versioned_docs/version-<old_version>/`
- `docs/network_versioned_sidebars/version-<old_version>-sidebars.json`

Then re-run the reconciliation script so that `network_versions.json` drops the
old version (its directory no longer exists):

```bash
scripts/update_docs_versions.sh network
```

Verify that both `network_version_config.json` and `network_versions.json` no
longer reference the old version.

### Step 9: Move Changes to `next` Branch

```bash
git stash
git checkout next && git pull origin next
git stash pop
```

Check for stash conflicts. Then report to the user:

- `git status` and `git diff --stat` to show what changed
- List all modified/added/deleted files
- Flag any conflicts or unexpected changes
- Let the user know the changes are ready to be committed and a PR can be opened

## Key Points

- **Mainnet and testnet only**: This skill does not support devnet or nightly
  releases. Network operator docs only have mainnet and testnet versions. If
  devnet is detected, abort and direct the user to `/release-docs`.
- **Tag must be checked out**: The operator docs source in `docs/docs-operate/`
  must reflect the release tag, not `next`. Always checkout the tag before
  building and cutting versioned docs.
- **Always query the network first**: The RPC response is the source of truth
  for version and L1/L2 contract addresses.
- **Some addresses are not in the RPC**: Contracts like Staking Registry,
  Reward Booster, Tally Slashing Proposer, and others must be queried on-chain,
  obtained from deployment output, or confirmed unchanged by the user.
- **Lightweight prerequisites**: This skill does not require nargo or a
  yarn-project build. It does need: the locally-installed `aztec` CLI to match
  the release version (for Step 5b), `yarn` (for the docs build), `curl`/`jq`
  (for the RPC query), and `cast` (for on-chain address queries).
- **Node API reference is auto-generated**: Run `yarn generate:node-api-reference`
  (Step 5a) before building. The generator parses TypeScript source directly, so
  no yarn-project build is required — but `yarn-project/node_modules/` must exist
  (run `yarn install` from `yarn-project` if missing).
- **Operator CLI reference is auto-generated**: Run `yarn generate:operator-cli-reference`
  (Step 5b) before building. The script runs `aztec start --help` and prepends
  the hand-curated frontmatter/intro. Requires the matching `aztec` CLI version
  to be installed locally.
- **Build must pass**: Do not cut versioned docs until `yarn build` succeeds.
- **COMMIT_TAG needs `v` prefix**: The preprocessor uses COMMIT_TAG for GitHub
  URLs and git tag references. Omitting the `v` will break links in versioned
  docs.
- **User confirmation required**: Ask before deleting old versioned docs and
  before making content changes to operator docs.
- **Changes land on `next`**: All changes are stashed and moved to the `next`
  branch at the end, ready for a PR.
- **Network version config only**: This skill modifies
  `network_version_config.json` and `network_versions.json`. It does not touch
  `developer_version_config.json` or `developer_versions.json`.
