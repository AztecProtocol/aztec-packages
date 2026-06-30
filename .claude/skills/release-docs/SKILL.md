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
auto-detected from the version string (Step 1); if it does not self-identify, ask
the user to confirm.

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
- L1 contract addresses from `l1ContractAddresses`: registry, rollup, inbox, outbox,
  fee juice, staking asset, fee juice portal, fee asset handler, coin issuer,
  reward distributor, governance proposer, governance, slash factory
- L2 protocol contract addresses from `protocolContractAddresses`: instance registry,
  class registry, multi-call entrypoint, fee juice
- `rollupVersion`
- `l1ChainId`

**Note:** The RPC response may not include all contracts listed in `networks.md`.
Some addresses (like `gseAddress`) have been added to the RPC response over time,
so always check whether an address is already present before querying on-chain.
Contracts like Reward Booster, Staking Registry, Tally Slashing Proposer, Honk
Verifier, and others must be resolved separately in Step 9.

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
- **Abort if the tag doesn't exist** — the release hasn't been tagged yet.

#### Pre-release workflow

If the user provides a target version that differs from the `nodeVersion`
returned by the RPC (e.g. the network is still running `4.1.3` but the user
wants to prepare docs for `4.2.0`), this is a **pre-release** docs preparation.
Ask the user to confirm the target version, then use that version instead of
`nodeVersion` throughout the remaining steps. The git tag for the target version
must still exist. Contract addresses from the RPC reflect the _current_ network
state (the old version); they are still valid if the upgrade reuses the same
contracts, but ask the user to confirm whether any addresses will change at
upgrade time.

**Run all work on the tag, not `next`.** Cut on the tag so the snapshot
reflects what shipped. Then stash, switch to `next`, pop. Backport any newer
docs from `next` into the snapshot as an explicit step _after_ the cut.

### Unversioned root pages

Pages under `docs/docs/` (`networks.md`, `index.md`) are configured "no
versioning" in `docusaurus.config.js` and aren't snapshotted. Edits land
directly on `next` and become live. Treat them as post-release-live: if `next`
already has a newer version, port it in and bump the version field rather than
reverting to the tag's older copy.

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

Store the address and update it wherever it appears in the versioned docs.

**Note:** The Sponsored FPC is deployed on testnet and devnet. For mainnet releases,
mark the SponsoredFPC row as "Not deployed" in the L2 Contract Addresses table.
If the Sponsored FPC address changes for a testnet release, send a reminder that the new address must be funded on testnet.

### Step 5: Update Version Configs

**Developer docs:** `docs/developer_version_config.json`

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

**Network/operator docs** are updated separately in Step 11 after the version
snapshot is created (the config update requires the versioned docs directory to exist).

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

**Prerequisites — you MUST build dependencies before generating API docs:**

1. **Initialize submodules.** A fresh checkout or a `git worktree` does NOT
   populate them, and the noir portal deps won't resolve without it:
   ```bash
   git submodule update --init --recursive
   ```
2. **Build the TS dependency chain** with `make yarn-project` from the repo root.
   It builds bb → noir → l1-contracts → yarn-project, which is what TypeDoc needs
   to resolve cross-package types. Two traps that waste a lot of time:
   - Do **not** run the repo-root `./bootstrap.sh` for this: it also builds the
     `spartan` target (k8s infra) which fails without helm/terraform and aborts
     the whole build. `make yarn-project` skips spartan.
   - `cd yarn-project && yarn && yarn build` on its own fails with `Manifest not
     found` for `../noir/packages/acvm_js`, because noir's TS packages aren't
     built yet. `make yarn-project` builds them first.
   ```bash
   make yarn-project
   ```
3. **Use the release-matched nargo for the aztec-nr docs.** `generate:aztec-nr-api`
   runs `nargo doc`; a mismatched/older `nargo` on PATH fails with cryptic errors
   (e.g. `error: Non-ASCII character in comment`). Use the tag-matched compiler:
   `aztec-nargo` from the installed CLI (step 4), or the `noir-repo` build at the
   tag, not a stray global `nargo`. The script prefers a `nargo` found on PATH,
   so put the right one first (e.g. prepend the installed CLI's bin dir).
4. **Install the aztec CLI** matching the release version (provides `aztec-nargo`):
   ```bash
   VERSION=<nodeVersion> bash -i <(curl -sL https://install.aztec.network/<nodeVersion>)
   ```

If generation fails, check that the tag has the required source code, that
submodules are initialized, and that dependencies have been built. The build
step (Step 13) will validate that API reference links resolve correctly.

### Step 7: Generate CLI Reference Docs

Regenerate the CLI reference from the installed CLI. The scripts scan `--help`
output from each binary, so the **installed aztec CLI must match the release
version** (Step 3) or the docs will document the wrong command set.

```bash
cd docs
./scripts/cli_reference_generation/generate_all_cli_docs.sh --force current
```

This updates the CLI reference files in `docs/docs-developers/docs/cli/`:

- `aztec_cli_reference.md`
- `aztec_wallet_cli_reference.md`
- `aztec_up_cli_reference.md`

These files are auto-generated — do not hand-edit them.

### Step 7b: Generate Node API Reference Docs

Regenerate the Node JSON-RPC API reference documentation. This script parses the
TypeScript interface definitions and Zod schemas in `yarn-project/stdlib/src/interfaces/`
to produce a complete markdown reference for the `node_` and `nodeAdmin_` RPC methods.

**Prerequisite:** `yarn-project` must be built (already done in Step 6 prerequisites).

```bash
cd docs
yarn generate:node-api-reference
```

This updates `docs/docs-operate/operators/reference/node-api-reference.md`.

The file is auto-generated — do not hand-edit it. When cutting network versioned
docs (Step 11), the generated content is included in the snapshot automatically.

### Step 8: Update Migration Notes

**File:** `docs/docs-developers/docs/resources/migration_notes.md`

1. **Triage existing TBD items.** Not all items under `## TBD` necessarily belong
   to the current release. Review each entry and decide whether it:

   - Shipped in this release → move it under the new `## <new version>` heading
   - Targets a future major version → move it under a new `## Unreleased (v<next_major>)`
     heading (create this heading if it doesn't exist, placed between `## TBD` and
     the new version heading)
   - Is still genuinely TBD → leave it under `## TBD`

   Present the proposed triage to the user for confirmation before rearranging.

2. Create the new `## <new version>` heading below `## TBD` (and below any
   `## Unreleased` sections). Move the items identified in step 1 under it.

3. Ensure `## TBD` remains at the top with a blank line separating it from the
   next heading.

4. Check for missing migration items by analyzing the diff between the previous
   release tag and the new one:

   ```bash
   git diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/
   ```

5. Present draft entries for user review before adding them

### Step 9: Resolve Missing Contract Addresses & Update Network Info

The `networks.md` L1 table includes contracts that are **not** returned by
`node_getNodeInfo`. Before updating the tables, resolve these in three tiers.

Determine the L1 RPC URL from the `l1ChainId`: `1` → Ethereum mainnet,
`11155111` → Sepolia. The Rollup and Registry addresses are already known from
the RPC response.

**Mental model when the rollup version changed.** Compare the RPC `rollupVersion`
against the value currently in `networks.md`. If it changed, the network did a
rollup upgrade: the per-rollup contracts are redeployed (Rollup, Inbox, Outbox,
Fee Juice Portal, Slasher, Reward Booster, Tally Slashing Proposer, Honk Verifier,
Slash Payload Cloneable, all in the RPC or reachable from the new Rollup), while
governance/shared contracts persist (Registry, Governance, GSE, Staking Asset, Fee
Juice, Coin Issuer, Reward Distributor, Governance Proposer, Fee Asset Handler,
Staking Registry, Slash Factory). Re-resolve the per-rollup set; for the rest,
confirm the existing values still hold (e.g. `cast code <addr>` returns bytecode).

#### Tier 1: Query on-chain from known contracts

First check whether the RPC response already includes `gseAddress` in
`l1ContractAddresses` — newer node versions return it directly. If present,
use it and skip the on-chain query for GSE.

```bash
# GSE (Governance Staking Escrow) — from Rollup (skip if already in RPC response)
cast call <ROLLUP_ADDRESS> "getGSE()(address)" --rpc-url <L1_RPC>

# Slasher — from Rollup
cast call <ROLLUP_ADDRESS> "getSlasher()(address)" --rpc-url <L1_RPC>

# Governance — from Registry
cast call <REGISTRY_ADDRESS> "getGovernance()(address)" --rpc-url <L1_RPC>

# Honk Verifier — from Rollup
cast call <ROLLUP_ADDRESS> "getEpochProofVerifier()(address)" --rpc-url <L1_RPC>

# Reward Booster — 3rd field of the Rollup's reward config
#   returns (rewardDistributor, sequencerBps, booster, checkpointReward)
cast call <ROLLUP_ADDRESS> "getRewardConfig()(address,uint256,address,uint96)" --rpc-url <L1_RPC>

# Tally Slashing Proposer — the Slasher's PROPOSER (use the Slasher resolved above)
cast call <SLASHER_ADDRESS> "PROPOSER()(address)" --rpc-url <L1_RPC>

# Slash Payload Cloneable — the proposer's payload implementation
cast call <PROPOSER_ADDRESS> "SLASH_PAYLOAD_IMPLEMENTATION()(address)" --rpc-url <L1_RPC>
```

#### Tier 2: From deployment output (if available)

Only contracts with no public getter remain here. Obtain them from the Forge
deployment script output (`l1-contracts/script/deploy/DeployAztecL1Contracts.s.sol`
prints JSON with all addresses); ask the user if they have it.

- **Staking Registry**

Reward Booster, Tally Slashing Proposer, Honk Verifier, and Slash Payload
Cloneable used to live here / in Tier 3, but are now resolvable on-chain (Tier 1).

#### Tier 3: Manual / confirm unchanged

No on-chain getter. Ask the user for new addresses, or confirm the existing
`networks.md` values still hold. These are governance-level and are not
redeployed by a rollup upgrade, so they usually carry over (verify with
`cast code <addr>`, which returns bytecode if the contract still exists).

- **Slash Factory** (governance-level; if a release no longer deploys it, mark `N/A`)
- **Register New Rollup Version Payload**

#### Update the tables

**File:** `docs/docs/networks.md`

Update the column matching the release type (**Testnet** or **Alpha (Mainnet)**)
in the tables. (The Devnet column was removed from `networks.md` — devnet
releases no longer update this file.)

- **Network Technical Information table**: version, RPC endpoint, rollup version
- **L1 Contract Addresses table**: all addresses from the RPC response, on-chain
  queries, and any additional addresses provided by the user
  - Mainnet: use `https://etherscan.io/address/0xADDR` link format
  - Testnet: use `https://sepolia.etherscan.io/address/0xADDR` link format
  - For contracts not deployed on this network, use `N/A`
- **L2 Contract Addresses table**: update the SponsoredFPC address from step 4.
  Also check `protocolContractAddresses` from the RPC response for any changes
  to canonical L2 addresses (instance registry, class registry, multi-call
  entrypoint, fee juice).

Also grep for any other files referencing old addresses for this network and update:

```bash
grep -r "<old_address>" docs/
```

### Step 10: Update Getting Started Page

**For devnet releases:**

**File:** `docs/docs-developers/getting_started_on_local_network.md`

- Update `SPONSORED_FPC_ADDRESS` in the environment variables section
- Update `NODE_URL` if the RPC URL changed
- Update any other hardcoded addresses or URLs referencing the old devnet
- Review the page for correctness: version references, CLI commands, FPC registration

**For testnet releases:**

**File:** `docs/docs-developers/getting_started_on_testnet.md` (snapshotted into the
versioned docs at cut time in Step 11)

- Update `NODE_URL` to the testnet RPC endpoint, and keep it **identical** to the
  RPC endpoint in `docs/docs/networks.md` (Step 9). These two are maintained
  separately, so a `networks.md` RPC change that isn't mirrored here leaves the
  guide's first command pointing at a dead host.
- Update `SPONSORED_FPC_ADDRESS` from Step 4.
- Update the install command and any hardcoded version references to the new version.
- Review the page for correctness: CLI commands, FPC registration, fee payment
  instructions, block explorer links.

Also:

- Update any testnet RPC URLs or addresses in operator docs under `docs/docs-operate/`
- Review the testnet section of `docs/docs/networks.md` for accuracy

### Step 11: Cut Versioned Docs

**Prerequisite — preprocess before cutting.** `docs:version` snapshots from
`processed-docs/` (the resolved path the docs plugins serve, see
`docusaurus.config.js`), *not* the raw `docs-*` source. So you must run
`yarn preprocess` (or a full `yarn build`) with the same `RELEASE_TYPE`/`*_TAG`
env vars used below *before* cutting, or the snapshot captures stale/empty
content. This is why a freshly cut snapshot already has macros resolved (no raw
`#release_version`/`#include_code`). The "verify no raw placeholders remain"
check later in this step confirms the preprocess took effect.

**`#include_code` freezes against the working-tree source.** Snippets resolve
from whatever code is checked out when you preprocess, so to freeze the release's
code the working tree must be at the release tag's source (or re-resolve the
snapshot's `#include_code` from the tag afterward — what the
`re-resolve <prev_version> snapshot include_code from the tag` commit did).
Cutting against `next`'s code silently freezes the wrong snippets.

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

Then update the versions files:

```bash
scripts/update_docs_versions.sh developer
```

For **mainnet** and **testnet** releases, also cut and configure the network/operator docs.

**Before cutting**, read `docs/network_version_config.json` and record the
current version for this release type. This is the old network version needed
for cleanup in Step 16. Save this value — the config will be overwritten next.

```bash
cat docs/network_version_config.json
```

Then cut and update the config:

```bash
<TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> yarn docusaurus docs:version:network v<new_version>
scripts/update_docs_versions.sh network <release_type> v<new_version>
```

Verify the new version appears in both `docs/developer_version_config.json` and
`docs/network_version_config.json`.

Also verify that macros were resolved in the network versioned snapshot — check
that `docs/network_versioned_docs/version-v<new_version>/` contains no raw
`#release_version` or `#release_network` placeholders.

#### Hardcoded version references

Grep source and the new snapshot for the old version and update each hit. Skip
historical refs (migration-note headings, changelog entries, "in vX, Y was
removed" prose).

```bash
cd docs && grep -rn "<old_version>" src/ docs-developers/ docs-operate/ docs/ \
  developer_versioned_docs/version-v<new_version>/ \
  network_versioned_docs/version-v<new_version>/
```

Known hits: `src/clientModules/docsgpt.js` (`heroDescription`),
`developer_versioned_docs/version-v<new_version>/docs/aztec-js/wallet-sdk/{wallet,dapp}_integration.md`
(`yarn add @aztec/*@<version>`).

### Step 12: Reconcile `next` Docs Changes Into the New Version

The new version is cut from the **release tag**, which is older than `next`. Any
documentation work that merged into `next` after the tag was created may therefore be
**absent** from the freshly cut snapshot. This is a commonly missed step,
because the divergence is invisible if you only diff the working tree (which is
checked out at the tag in Step 2) against the snapshot you just cut from it.

Two distinct classes of change can be missed — **check both**:

- **Source (current) docs** — `docs/docs-developers/`, `docs/docs-operate/`,
  `docs/docs-participate/`, `docs/src/`. Edits here only reach a version when that
  version is cut, so anything added on `next` since the tag is missing from the new
  snapshot.
- **Existing versioned snapshots on `next`** — fixes that were applied _directly_
  to the previous version's snapshot (e.g.
  `docs/developer_versioned_docs/version-<prev_version>/...`). These were carried
  into the previous version on `next` but will not exist in a snapshot cut from the
  tag, because the tag predates them.

Always compare against `origin/next`, **not** the working tree, so the divergence
is actually visible:

1. List every docs commit on `next` that is **not** in the release tag — this is
   the complete set of changes the new snapshot may be missing:

   ```bash
   git fetch origin
   git log --oneline --no-merges v<new_version>..origin/next -- docs/
   ```

   Skip version cuts, nightly auto-cuts, and template-only changes; review the rest.

2. See what `next` changed in the **source docs** relative to the tag, and port the
   relevant changes into the new versioned snapshot:

   ```bash
   git diff v<new_version>..origin/next -- \
     docs/docs-developers/ docs/docs-operate/ docs/docs-participate/ docs/src/
   ```

3. See what `next` changed **directly in the previous versioned snapshot with the same major version number**, and
   apply the equivalent fix to the same file in the new snapshot wherever that file
   also exists there. Steps 5 and 11 have already overwritten the local version
   configs with the new version, so resolve `<prev_version>` (the previous version
   for this release type, including its `v` prefix) from `origin/next`, **not** the
   working tree:

   ```bash
   git show origin/next:docs/developer_version_config.json
   git show origin/next:docs/network_version_config.json
   ```

   Then diff the previous snapshot against the tag:

   ```bash
   git diff v<new_version>..origin/next -- \
     docs/developer_versioned_docs/version-<prev_version>/ \
     docs/network_versioned_docs/version-<prev_version>/
   ```

4. For files that differ, confirm the change is valid for the release version —
   compare API signatures, function names, and trait definitions against the actual
   source code at the tag. Skip changes that are nightly-only or introduce APIs not
   present in the release:

   ```bash
   git show v<new_version>:<path_to_source_file>
   ```

5. Backport the relevant changes into
   `docs/developer_versioned_docs/version-v<new_version>/` (and the network snapshot
   where applicable). Present a summary of what was found, what was backported, and
   what was intentionally skipped, for user confirmation.

### Step 13: Run `yarn build` and Fix Issues

**Run after the cut (Step 11).** Docusaurus validates `lastVersion` against
existing versioned dirs, so a build before the snapshot exists fails — the
config points to a version that hasn't been cut yet. Running it here, after
Step 12's reconcile, also validates the backported content.

**`rc` tags are still mainnet.** Always pass `RELEASE_TYPE=mainnet` explicitly
for rc-suffixed mainnet builds. The API-doc generation scripts fall back to
`testnet` for `rc` strings when `RELEASE_TYPE` is unset.

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

**`@aztec/viem` is versioned off the release line.** It mirrors upstream `viem` (e.g.
`@aztec/viem@2.38.2`) and has no `5.0.0-rc.1`-style version on npm, so never rewrite it to
the release version. CI won't catch a wrong pin: the import type-checks against the
auto-linked workspace copy. Tutorials whose example code imports it (token/aave/uniswap
bridges) must list `@aztec/viem` at its own version in their install command (readers may
substitute plain `viem` at the same version). Find the pin:

```bash
grep -rh '"viem": "npm:@aztec/viem@' yarn-project/*/package.json | head -1
```

```bash
cd docs && <TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> COMMIT_TAG=v<nodeVersion> yarn build
```

Fix any issues reported by the build:

- Broken redirect targets (from `validate_redirect_targets.sh`)
- Broken API reference links (from `validate_api_ref_links.sh`)
- Spellcheck errors

Iterate until the build passes.

**Known non-fatal warning:** the build prints a broken-anchor warning for
`#aztec-validator-keys%7Cvalkeys` in the generated CLI reference, on every version
(mainnet, testnet, current). It comes from a `validator-keys|valkeys` command alias
the CLI-ref generator anchors badly, `onBrokenAnchors` is set to `warn`, so the
build still succeeds. Don't chase it as a release-cut regression.

### Step 14: Review Getting Started Page

**For devnet releases:** Read through `docs/docs-developers/getting_started_on_local_network.md`
one final time after all changes are complete.

**For testnet releases:** Read through `docs/docs-developers/getting_started_on_testnet.md`,
the testnet section of `docs/docs/networks.md`, and any updated operator docs.

In both cases verify:

- CLI commands use the correct version and flags
- Fee payment instructions are accurate
- Block explorer links are correct
- The SponsoredFPC address matches step 4
- `NODE_URL` matches the RPC endpoint in `networks.md` (testnet/devnet)

Present a summary of the review to the user for approval.

### Step 15: Functional Validation — Run the Guides, Tutorials, and Examples

`yarn build` (Step 13) only checks links and spelling — not whether the documented
commands run. Before shipping, exercise the new version against a real local network.

**Run this in a subagent** (long-running, install-heavy). Validate the **cut snapshot**
content (`developer_versioned_docs/version-v<new_version>/`), not `next`. Tasks:

1. **Start a local network on the new version:**

   ```bash
   VERSION=<new_version> bash -i <(curl -sL https://install.aztec.network)
   aztec --version              # must equal <new_version>
   aztec start --local-network  # background; wait until ready
   ```

2. **Walk the guides and tutorials as written**, executing every documented command:
   the getting-started guides (`getting_started_on_local_network.md` local,
   `getting_started_on_testnet.md` testnet) and every tutorial under
   `docs/tutorials/{contract,js}_tutorials/`. Record any drift (renamed command,
   changed flag, stale address, different output).

3. **Run the Aztec.js examples** in `docs/examples/ts/`: type-check all via
   `bootstrap.sh`, execute the runner-supported set via `aztecjs_runner/run.sh`, and list
   skipped examples with reasons. To test against the published release (not the workspace
   copies auto-linked in `lib.sh`), temporarily rewrite each example's `@aztec/*` config
   dep to `npm:@aztec/*@<new_version>`, keeping special pins like `@aztec/viem`.

Report pass/fail per guide/tutorial/example with the exact doc line for each failure. Fix
drift in snapshot **and** source, then re-run Step 13 and the affected check. If the
validation can't run (sandbox lacks this RC, infra down), say so and list what was skipped.

### Step 16: Clean Up Old Versions

#### Developer docs

Identify the previous developer docs version for this release type from
`docs/developer_version_config.json` (look for the old entry being replaced).

**Note:** For testnet, there may not be an old developer docs version to clean up if
this is the first testnet developer docs cut. In that case, skip this part.

**Ask the user for confirmation** before deleting. If approved, remove:

- `docs/developer_versioned_docs/version-<old_version>/`
- `docs/developer_versioned_sidebars/version-<old_version>-sidebars.json`
- The old entry from `developer_version_config.json`
- Any old API docs in `docs/static/aztec-nr-api/<old_version>/`
- Any old API docs in `docs/static/typescript-api/<old_version>/`

#### Remove stale release type entries from version configs

If a release type entry in `developer_version_config.json` or
`network_version_config.json` points to a version whose versioned docs directory
no longer exists (e.g. an old testnet entry that was superseded by a unified
mainnet release), remove that entry from the config. The reconciliation script
(`update_docs_versions.sh`) only manages directory-to-config consistency for a
single release type at a time — it will not remove orphaned entries for other
release types automatically.

#### Network/operator docs (mainnet and testnet only)

If a network version was cut in Step 11, use the old network version recorded
at the start of that step.

**If this is the first network release for this release type** (no previous
version existed in the config), skip this part.

**Ask the user for confirmation** before deleting. If approved, remove:

- `docs/network_versioned_docs/version-<old_network_version>/`
- `docs/network_versioned_sidebars/version-<old_network_version>-sidebars.json`

Then re-run the reconciliation script so that `network_versions.json` drops the
old version (its directory no longer exists):

```bash
scripts/update_docs_versions.sh network
```

Verify that `network_version_config.json` and `network_versions.json` no longer
reference the old version.

### Step 17: Move Changes to `next` Branch

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
- **Cut before building**: The authoritative `yarn build` runs *after* the cut
  (Step 13) — it validates `lastVersion` against the new versioned dir, so it
  cannot run before the snapshot exists. Don't ship until that post-cut build passes.
- **Functionally validate before shipping**: run the guides, tutorials, and Aztec.js
  examples on a real local network of the new version (Step 15) — the build only checks
  links and spelling, not whether the documented commands work.
- **User confirmation required**: Ask before deleting old versioned docs and before
  adding migration note entries.
- **Changes land on `next`**: All changes are stashed and moved to the `next` branch
  at the end, ready for a PR.
- **Reconcile against `next` after cutting**: The new version is cut from the release
  tag, which predates docs changes merged into `next`. After the cut, diff the tag
  against `origin/next` and backport relevant changes — both to source docs **and** to
  the previous versioned snapshot (see Step 12). This is the most commonly missed step.
- **API ref docs**: Generated in Step 6 into `docs/static/typescript-api/` and
  `docs/static/aztec-nr-api/` with stable folder names (`mainnet`, `testnet`,
  `devnet`, `nightly`). The `#api_ref_version` macro resolves to the matching
  folder name for each release type (see `include_version.js`).
- **Update `docs/README.md`**: If any new generation scripts, build steps, or
  tooling changes were added during the release, update `docs/README.md` to
  document them (e.g. new `yarn generate:*` commands).
