---
name: release-docs
description: Build and update the developer documentation site for a new release
argument-hint: <RPC_URL>
---

# Release Docs

Update the Aztec developer documentation for a new release. Queries the network
for current info, updates version defaults, contract addresses, migration notes,
builds the docs, cuts a versioned snapshot, and prepares changes on `main`.

Supports **devnet**, **testnet**, and **mainnet** releases. The release type is
auto-detected from the version string (Step 1); if it does not self-identify, ask
the user to confirm.

## Usage

```
/release-docs https://v4-devnet-3.aztec-labs.com
/release-docs https://testnet-v6.rpc2.aztec-labs.com
```

Some endpoints need an API key. `testnet-v6.rpc2.aztec-labs.com` does, and so do the
mainnet Kong gateways — `canonical.mainnet.rpc.aztec-labs.com` answers `401 No API key
found in request` without one. Only the *testnet* `*.rpc.aztec-labs.com` hosts are
currently keyless. A key issued for one gateway does not necessarily work on another.

Export it **before starting the session**, since these commands inherit the environment
as it was at launch:

```bash
export AZTEC_NODE_API_KEY=<key>
```

Reading it from the environment keeps it out of the skill's command line and the
transcript; it does not keep it out of your shell history. See Step 1 for which header
each gateway wants.

## Workflow

### Step 1: Query Network Info and Detect Release Type

Fetch node info from the provided RPC URL:

```bash
# Some RPCs require an API key, and the two gateway families disagree on the header:
# the `*.rpc.aztec-labs.com` Kong gateways read `x-aztec-api-key` (see
# spartan/terraform/modules/rpc-gateway/variables.tf and the yarn-project
# `aztec-node-rpc` skill), while `*.rpc2.aztec-labs.com` is AWS API Gateway and reads
# `x-api-key`. Sending both is accepted by both — verified: rpc2 answers 403 to the
# Kong header alone, and the Kong hosts ignore the extra one.
#
# Export the key BEFORE starting the session: these commands inherit the environment
# as it was at launch, so exporting in another terminal afterwards will not reach them.
# Sourcing a restricted file inside the snippet works too, which is what the
# `aztec-node-rpc` skill does.
#
#   export AZTEC_NODE_API_KEY=<key>
#
# This keeps the key out of the skill's command line and the transcript. It does not
# keep it out of your shell history — use a secrets file if that matters.
#
# `${AUTH[@]+...}` rather than a bare `"${AUTH[@]}"`: expanding an empty array under
# `set -u` is an unbound-variable error on macOS's bash 3.2.
AUTH=()
[ -n "${AZTEC_NODE_API_KEY:-}" ] && AUTH=(
  -H "x-api-key: ${AZTEC_NODE_API_KEY}"
  -H "x-aztec-api-key: ${AZTEC_NODE_API_KEY}"
)

# No `| jq .result` here: on a rejected request that prints a bare `null` and hides the
# status line and body you need to diagnose it. `%{stderr}` keeps the status off stdout,
# which jq is reading; without it jq chokes on the trailer even when the call succeeds.
# Rejection looks different per gateway: rpc2 (AWS) answers 403 {"message":"Forbidden"},
# Kong answers 401 {"message":"No API key found in request"}. Either way that is a missing
# or wrong key for THAT endpoint, not an endpoint that is down.
curl -sS -w '%{stderr}[http %{http_code}]\n' -X POST -H 'Content-Type: application/json' \
  ${AUTH[@]+"${AUTH[@]}"} \
  -d '{"method":"aztec_getNodeInfo"}' <RPC_URL> | jq '.result // .'
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

**Run all work on the tag, not `main`.** Cut on the tag so the snapshot
reflects what shipped. Then stash, switch to `main`, pop. Backport any newer
docs from `main` into the snapshot as an explicit step _after_ the cut.

### Unversioned root pages

Pages under `docs/docs/` (`networks.md`, `index.md`) are configured "no
versioning" in `docusaurus.config.js` and aren't snapshotted. Edits land
directly on `main` and become live. Treat them as post-release-live: if `main`
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

The address is a hash of the SponsoredFPC contract class and a zero salt, so derive it from
the tag checked out in Step 2 (needs `yarn-project` built, as in Step 6):

```bash
cd yarn-project && node --input-type=module -e "
import { getSponsoredFPCAddress } from '@aztec-labs/cli/cli-utils';
console.log((await getSponsoredFPCAddress()).toString());
"
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

**Do this AFTER the cut, not here, if you are cutting a version that does not yet
exist.** `docusaurus.config.js` reads this file at load and validates every version
named in it against the directories that exist. Naming the new version before
Step 11 has created its directory makes every docusaurus command fail with:

```
[ERROR] Invalid docs option "versions": unknown versions (vX.Y.Z) found.
        Available version names are: current, <previous>
```

including `docs:version` itself — so the config update blocks the cut that would
satisfy it. Either leave this file alone until after Step 11, or revert it for the
duration of the cut and restore it afterwards. This is the same constraint that
already defers the network config below; it applies equally to the developer one.

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
./scripts/aztecjs_reference_generation/update_docs.sh current
```

This creates/updates the API docs in:

- `docs/static/aztec-nr-api/<release_type>/` (e.g. `mainnet/`, `testnet/`)
- `docs/static/typescript-api/<release_type>/`
- `docs/docs-developers/docs/aztec-js/aztec_js_reference.md`

`docs/bootstrap.sh` fails CI when the Aztec.js reference drifts, so in practice it
should already be current; run it anyway so a release never ships a stale page.

**Prerequisites — you MUST build dependencies before generating API docs:**

1. **Initialize submodules.** A fresh checkout or a `git worktree` does NOT
   populate them:
   ```bash
   git submodule update --init --recursive
   ```
2. **Build the TS dependency chain** with `make yarn-project` from the repo root.
   It provisions the labs toolchain and compiles the contract artifacts before
   building yarn-project, which is what TypeDoc needs to resolve cross-package
   types. A trap that wastes a lot of time:
   - Do **not** run the repo-root `./bootstrap.sh` for this: it also builds the
     `spartan` target (k8s infra) which fails without helm/terraform and aborts
     the whole build. `make yarn-project` skips spartan.
   ```bash
   make yarn-project
   ```
3. **Use the release-matched nargo for the aztec-nr docs.** `generate:aztec-nr-api`
   runs `nargo doc`; a mismatched/older `nargo` on PATH fails with cryptic errors
   (e.g. `error: Non-ASCII character in comment`). Use the pin-matched compiler:
   `labs-aztec-toolchain/bin/nargo` (provisioned by the build, and the script's
   default when no `nargo` is on PATH), or `aztec-nargo` from the installed CLI
   (step 4). The script prefers a `nargo` found on PATH, so make sure a stray
   global `nargo` doesn't shadow the right one.
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

**The scraped output contains the generating machine's home directory.** `--help`
prints defaults derived from `$HOME` (e.g. `aztec-wallet --data-dir` shows
`(default: "/Users/<you>/.aztec/wallet")`), so whoever runs the generator has their
username baked into the published reference. Running in a container does not fix this,
it only changes whose name leaks: `main` currently ships
`(default: "/home/aztec-dev/.aztec/wallet")` because the generator ran as the CI build
container's `aztec-dev` user. Normalise the paths to `~/.aztec/...` by hand, then check
before committing — from `docs/`, since Step 7 starts with `cd docs`:

```bash
grep -rnE '/home/|/Users/' docs-developers/docs/cli/
```

Grep for the literal path prefixes, not `"$HOME"`: `$HOME` expands to *your* home, so it
cannot match a path baked in on another machine — which is exactly the case that
reaches `main`. Do not rely on spellcheck either: it only fires when the username
happens not to be a dictionary word.

### Step 7b: Generate Node API Reference Docs

Regenerate the Node JSON-RPC API reference documentation. This script parses the
TypeScript interface definitions and Zod schemas in `yarn-project/stdlib/src/interfaces/`
to produce a complete markdown reference for the `aztec_` and `aztecAdmin_` RPC methods.

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

3. Ensure `## TBD` remains at the top of the **source** file with a blank line
   separating it from the next heading. The source keeps the (now usually
   empty) `## TBD` heading as the working bucket for future notes — but the
   **versioned snapshot must not ship it**: after the cut (Step 11), delete the
   whole `## TBD` section — heading and any entries still under it — along with any
   `## Unreleased` sections, from
   `developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md`.
   The triage above deliberately leaves unshipped items there, and the cut copies them
   verbatim, so this is what stops them publishing under the new version. See Step 11.

   **Decide by ancestry, not by date.** Ported and cherry-picked commits keep their
   original author dates, so an entry can describe work dated weeks before the tag
   that is not in it. The only reliable test:

   ```bash
   git merge-base --is-ancestor <commit> v<new_version> && echo in-tag || echo NOT-in-tag
   ```

   An item whose commit is not an ancestor of the tag has not shipped in this release,
   even if it is on `main` — leave it under `## TBD`. In one rehearsal 4 of 21 items
   failed this test and 2 existed only on an unmerged branch. Writing them under the
   new version tells developers to migrate to APIs their release does not have.

4. Check for missing migration items by analyzing the diff between the previous
   release tag and the new one:

   ```bash
   git diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/
   ```

5. Present draft entries for user review before adding them

### Step 9: Resolve Missing Contract Addresses & Update Network Info

The `networks.md` L1 table includes contracts that are **not** returned by
`aztec_getNodeInfo`. Before updating the tables, resolve these in three tiers.

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

When a value read on-chain comes back as hex (e.g. a rollup version from
`getVersion()`), convert it with `cast to-dec <hex>` — never by eye. A
hand-converted rollup version has shipped wrong before.

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
deployment script output (`docs/node_modules/@aztec-foundation/l1-artifacts/l1-contracts/script/deploy/DeployAztecL1Contracts.s.sol`
prints JSON with all addresses); ask the user if they have it.

`l1-contracts` is not in this repo — it stayed in AztecProtocol/aztec-packages
and reaches us only as the `@aztec-foundation/l1-artifacts` npm package, which
ships the whole Solidity tree (sources, `script/`, and compiled `out/` ABIs).
Read it from `docs/node_modules/` after `yarn install` in `docs/` rather than
cloning aztec-packages.

The revision you get is the one pinned in `docs/package.json` and resolved by
`docs/yarn.lock`, because the install happens in `docs/`. That pin is not free to
drift: per `docs/CLAUDE.md` it must equal `BB_VERSION` in
`labs-aztec-toolchain/bootstrap.sh`, and CI fails `check_pin_drift` if it does not.
`labs-aztec-toolchain/pins.mjs` checks the `yarn-project/package.json` resolutions
entry against `BB_VERSION` too, so all three should agree. Compare against
`BB_VERSION` rather than against `yarn-project`: it is the value both pins are
checked against, so it tells you which one drifted.

```bash
grep '"@aztec-foundation/l1-artifacts"' docs/package.json
grep '^BB_VERSION=' labs-aztec-toolchain/bootstrap.sh
```

Equal means `docs/node_modules/` holds the l1-contracts revision this tag was built
against, and reading from there keeps the "everything comes from the tag" rule
intact. Unequal should be impossible on a tag that passed CI; if you see it, stop
rather than guess which is right.

This package is also what the Solidity examples compile against:
`docs/examples/solidity/foundry.toml` remaps `@aztec/` and `@oz/` into it. So a Solidity
`@aztec/core/...` import is a Foundry remapping, not an npm scope, and is NOT part
of the `@aztec-labs` scope migration.

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

- **Network Technical Information table**: the **Version** row, the rollup version,
  and the RPC endpoint.

  The `Version` row is the field most often missed. It was left at `5.1.0` for both
  columns through the v5.2.0 release and again in a v6 rehearsal, while the rollup
  version next to it was updated both times — leaving a v6 rollup version beside a
  v5 build. The page tells readers it is authoritative ("the build a given network is
  currently running"), so a stale value is what someone pins against. Read it from the
  live network, not from the version config:

  ```bash
  curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}' \
    <public RPC> | jq -r '.result.nodeVersion'
  ```

  Check **both** columns while you are here, not only the one you are releasing — the
  other may have been left stale by an earlier release, and this table is where a
  reader compares them.

  The RPC endpoint must be the **public** one, not the endpoint you ran this release
  against. The `rpc2.aztec-labs.com` and `canonical.*.rpc.aztec-labs.com` hosts are for
  operators and tooling and require an API key; `networks.md` and the getting-started
  guides are read by external developers who do not have one. Publishing a gated host
  there makes the guide's first command fail for every reader (`403` from rpc2, `401
  No API key found in request` from the canonical gateways). Not every Aztec-run host
  is gated — some older per-version ones still answer without a key — so test the
  specific URL rather than assuming either way.

  Use the third-party provider, as the mainnet column already does:

  | Network | Public RPC (docs) | Operator RPC (not for docs) |
  | --- | --- | --- |
  | Mainnet | `https://aztec-mainnet.drpc.org` | `canonical.mainnet.rpc.aztec-labs.com` |
  | Testnet | `https://aztec-testnet.drpc.org` | `testnet-v<N>.rpc2.aztec-labs.com` |

  Verify before writing it down — it must answer without a key, and report the version
  you are cutting:

  ```bash
  curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}' \
    <public RPC for this release type> | jq -r '.result.nodeVersion'
  ```
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

#### Re-verify every figure against its source of truth

Every value in `networks.md` — both columns, all tables — is re-derived at
release time from a source of truth: the node RPC, an on-chain call, or the
tag's tooling. Never carry a value forward from the previous release and never
transcribe one by hand. Concretely:

- **EIP-55 checksums.** Run every L1 address through
  `cast to-check-sum-address <addr>` before writing it into the tables (both
  the link text and the href). RPC responses return lowercase; the docs use
  checksummed casing.
- **Decimal conversions.** Anything read on-chain comes back as hex; convert
  with `cast to-dec <hex>`, never by eye (see the rollup-version note in the
  mental model above).
- **Rollup version.** Read it from the rollup itself on each network —
  `cast call <ROLLUP> "getVersion()(uint256)" --rpc-url <L1_RPC>` — and
  cross-check the RPC's `rollupVersion`. If the network's nodes have not yet
  upgraded (pre-release workflow), the target rollup's on-chain value wins.
- **L1 chain id.** `cast chain-id --rpc-url <L1_RPC>` must equal both the
  docs' **L1 Chain ID** row and the node RPC's `l1ChainId`.
- **Governance parameters table.** This table goes stale silently — query it
  on-chain for **both** columns, every release:
  - *Proposer Quorum*: `cast call <GOVERNANCE_PROPOSER> "QUORUM_SIZE()(uint256)"`
    and `"ROUND_SIZE()(uint256)"` (e.g. 600/1000 mainnet, 60/100 testnet).
  - *Voting Delay / Voting Duration / Execution Delay*:
    `cast call <GOVERNANCE> "getConfiguration()"` and decode against the
    `Configuration` struct in
    `docs/node_modules/@aztec-foundation/l1-artifacts/l1-contracts/src/governance/interfaces/IGovernance.sol`
    (see the Tier 2 note above on where l1-contracts lives). Beware: some time
    fields are stored compressed in 256-second units — decode via the struct
    definition, then sanity-convert to days/hours (e.g. `675 * 256s = 172800s
    = 2 days`).
  - *Slashing Quorum / Slashing Round Size*: from the Tally Slashing Proposer —
    `"QUORUM()(uint256)"`, `"ROUND_SIZE()(uint256)"` (slots), and
    `"ROUND_SIZE_IN_EPOCHS()(uint256)"`. Express the round as
    `<epochs> epochs (<slots> slots)`.
- **Cross-check human-owned data.** If the network/protocol team has a parallel
  update in flight (a PR or forum post with the deployment addresses), diff
  every value against it. Resolve any discrepancy by querying the chain — not
  by preferring either document — and reconcile with the owner before shipping.

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

- Update `NODE_URL` to the **public** testnet RPC, and keep it **identical** to the
  RPC endpoint in `docs/docs/networks.md` (Step 9). These two are maintained
  separately, so a `networks.md` change that isn't mirrored here leaves the guide's
  first command pointing at the wrong host. See Step 9 for why this must be the
  third-party endpoint and not the Aztec-run one: readers have no API key, and the
  guide never tells them to set one.
- The source page names the FPC by its `contracts:SponsoredFPC` alias rather than hardcoding
  an address, so there is nothing to update here from Step 4. Older versioned snapshots still
  hardcode `SPONSORED_FPC_ADDRESS` and do need it (see below).
- Update the install command and any hardcoded version references to the new version.
- Review the page for correctness: CLI commands, FPC registration, fee payment
  instructions, block explorer links.
- **Update every versioned snapshot, not just the source.** Testnet is a single
  live network, so `NODE_URL` and `SPONSORED_FPC_ADDRESS` must be current in *all*
  versioned `getting_started_on_testnet.md` files, not only `docs/docs-developers/`
  and the version being cut. Every snapshot directory present under
  `docs/developer_versioned_docs/` is served (including an older version that is the
  site default, for example the current mainnet docs version), so a stale one leaves
  the default guide's first commands pointing at a dead host and FPC. Apply the same
  `NODE_URL` and `SPONSORED_FPC_ADDRESS` (Step 4) to every
  `docs/developer_versioned_docs/version-*/getting_started_on_testnet.md`, then verify:
  `grep -Ern 'NODE_URL=|SPONSORED_FPC_ADDRESS=' docs/developer_versioned_docs/version-*/getting_started_on_testnet.md`
  shows the current RPC and canonical FPC.

Also:

- Update any testnet RPC URLs or addresses in operator docs under `docs/docs-operate/`
- Review the testnet section of `docs/docs/networks.md` for accuracy

### Step 10b: Check the operator changelog covers this release

**File:** `docs/docs-operate/operators/reference/changelog/v<major>.md`, plus the
`## Version history` list in that directory's `index.md`.

This is maintained per-PR by `/updating-changelog`, not by this skill — but it is cut
into the network snapshot in Step 11, so a gap here publishes a page that announces
itself as the new version and then lists an older one as the newest release. Operators
read this page to decide whether to upgrade, so a stale one is worse than none.

**Check `origin/main`, not the working tree.** Step 2 checks out the release tag, and
the changelog page is written per-PR on `main` — for the first release of a major it
usually lands after the tag is cut, so it is legitimately absent from the tag. Looking
at the checkout would report a gap that is not one, and fixing it in a tag checkout
writes the page somewhere it will never be merged.

```bash
major=$(python3 -c "import json;print(json.load(open('.release-please-manifest.json'))['.'].split('.')[0])")
git fetch origin main
git show origin/main:docs/docs-operate/operators/reference/changelog/v${major}.md >/dev/null \
  && echo "page present" || echo "MISSING: v${major}.md"
git show origin/main:docs/docs-operate/operators/reference/changelog/index.md | grep -n '^### ' | head -3
git show origin/main:docs/sidebars-operate.js | grep -n "changelog/v${major}"
```

All three must hold on `origin/main`:

1. `v<major>.md` exists.
2. `index.md` carries a `### ` entry for this release's major (and minor, if the
   series already has more than one — entries are per-minor: `v5.2.0`, `v4.3.x`).
   Do not require the exact version string: an rc or patch is covered by its minor's
   entry.
3. `docs/sidebars-operate.js` lists `operators/reference/changelog/v<major>` — the
   sidebar enumerates changelog pages explicitly, so a page that is not listed is
   published but unreachable from the nav.

If any fails, write it on `main` first (`/updating-changelog`, or by hand from the
commit range) and merge it, then pick it up here through Step 12's reconcile along
with the rest of the `main` changes. Do not cut around it, and do not write it into
the tag checkout.

This has already shipped wrong once: no `v6.md` existed at all when v6.0.0-rc.1 was
rehearsed, because `/updating-changelog` had been diffing against `next` since the
migration and failing instead of running.

### Step 11: Cut Versioned Docs

**Prerequisite — preprocess before cutting.** `docs:version` snapshots from
`processed-docs/` (the resolved path the docs plugins serve, see
`docusaurus.config.js`), *not* the raw `docs-*` source. So you must run
`yarn preprocess` (or a full `yarn build`) with `RELEASE_TYPE`, the matching
`*_TAG` and `COMMIT_TAG` (all three, see below) *before* cutting, or the snapshot
captures stale/empty content. This is why a freshly cut snapshot already has macros resolved (no raw
`#release_version`/`#include_code`). The "verify no raw placeholders remain"
check later in this step confirms the preprocess took effect.

**`#include_code` freezes against the working-tree source.** Snippets resolve
from whatever code is checked out when you preprocess, so to freeze the release's
code the working tree must be at the release tag's source (or re-resolve the
snapshot's `#include_code` from the tag afterward — what the
`re-resolve <prev_version> snapshot include_code from the tag` commit did).
Cutting against `main`'s code silently freezes the wrong snippets.

Create a versioned snapshot of the developer docs:

Set the environment variables matching the release type:

- **Devnet**: `DEVNET_TAG=<new_version> RELEASE_TYPE=devnet`
- **Testnet**: `TESTNET_TAG=<new_version> RELEASE_TYPE=testnet`
- **Mainnet**: `MAINNET_TAG=<new_version> RELEASE_TYPE=mainnet`

**Set `COMMIT_TAG=v<new_version>` as well, on every release type — on the
`yarn preprocess` run, not on `docs:version`.** `docs:version` only copies
`processed-docs/`; the macros are already resolved by then, so a `COMMIT_TAG=` on
that command line does nothing. It is easy to miss because it is not named per
release type, and the failure is silent: `include_version.js` defaults it to `next`,
and `#include_version_without_prefix` falls back to `latest` when the tag does not
start with `v`. Both are plausible values, so the cut looks correctly processed and
the build passes, but neither is usable:

- `#include_aztec_version` resolves to `next` — both in `Nargo.toml` git
  dependencies, where it is not a ref in `aztec-labs-eng/aztec-nr` so `aztec compile`
  fails with `fatal: Remote branch next not found in upstream origin`, and in npm
  installs as `@aztec-labs/aztec.js@next`, which is not a dist-tag, so `yarn add`
  fails outright.
- `#include_version_without_prefix` resolves to `latest`, which is NOT the release.
  At the v6 rehearsal `@aztec-labs/aztec.js@latest` was an August nightly, older than
  the rc being cut and wire-incompatible with it (`-32702` reorg errors at runtime),
  while `@aztec-foundation/l1-artifacts@latest` was `0.0.1-commit.b66364b`.

Unset, this leaves dozens of unusable references across the tutorials in one cut.
Only Step 15 catches it, and only partly: the build validates links and spelling, not
whether a dependency resolves. Verify after preprocess and before cutting, from
`docs/` — every count must be `0`:

```bash
cd docs
COMMIT_TAG=v<new_version> <TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> yarn preprocess
grep -rcE 'tag *= *"next"|@next\b|@latest|VERSION=latest|aztec\.network/latest' \
  processed-docs/docs-developers/docs/tutorials/ | grep -v ':0$'
```

Both spacings of `tag = "next"` appear in the sources, so match the spaced form too;
grepping only `tag="next"` misses most of the Nargo dependencies.

**Important:** The version string passed to `docs:version` must always be prefixed
with `v` (e.g. `v4.1.0-rc.2`, not `4.1.0-rc.2`).

```bash
cd docs
<TAG_VAR>=<new_version> RELEASE_TYPE=<release_type> yarn docusaurus docs:version:developer v<new_version>
```

Then write the version mapping — **this is the Step 5 developer config update,
deferred to here.** The directory now exists, so naming the version no longer breaks
docusaurus:

```bash
scripts/update_docs_versions.sh developer <release_type> v<new_version>
```

Both arguments are required. With only the instance name the script reconciles
existing entries and prints `WARNING: Version ... not in the config file. Update ...
manually` — it does not add the new one, `lastVersion` stays on the previous release,
and the snapshot you just cut is served as an unlabelled extra version.

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

**Strip the `## TBD` section from the cut snapshot — this is not cosmetic.** The
source keeps `## TBD` as the working bucket, and Step 8 deliberately leaves items
there that have NOT shipped in this release. The cut copies the file wholesale, so
those items land in the snapshot and publish under the new version unless you remove
them. In one rehearsal the section carried ~4,000 characters describing an unmerged
oracle and APIs absent from the tag.

So Step 8's triage and this strip are a pair: triage decides what has not shipped,
and this is what stops it shipping anyway. Remove the whole `## TBD` section (and any
`## Unreleased (...)`), empty or not, from
`developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md`,
then confirm:

```bash
grep -n '^## ' developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md | head -3
```

The first heading must be the new version.

#### Hardcoded version references

Grep source and the new snapshot for the old version and update each hit. Skip
historical refs (migration-note headings, changelog entries, "in vX, Y was
removed" prose).

```bash
cd docs && grep -rn "<old_version>" src/ docs-developers/ docs-operate/ docs/ \
  developer_versioned_docs/version-v<new_version>/ \
  network_versioned_docs/version-v<new_version>/
```

Known hits:
`developer_versioned_docs/version-v<new_version>/docs/aztec-js/wallet-sdk/{wallet,dapp}_integration.md`
(`yarn add @aztec/*@<version>`).

### Step 12: Reconcile `main` Docs Changes Into the New Version

The new version is cut from the **release tag**, which is older than `main`. Any
documentation work that merged into `main` after the tag was created may therefore be
**absent** from the freshly cut snapshot. This is a commonly missed step,
because the divergence is invisible if you only diff the working tree (which is
checked out at the tag in Step 2) against the snapshot you just cut from it.

Three distinct classes of change can be missed — **check all three**:

- **Source (current) docs and sidebars** — `docs/docs-developers/` (→
  `developer_versioned_docs/`), `docs/docs-operate/` (→ `network_versioned_docs/`),
  `docs/sidebars-developer.js`, and `docs/sidebars-operate.js` are snapshot inputs.
  Anything added on `main` since the tag may be missing from the new snapshot. A source
  file at `docs/docs-developers/docs/X` maps to
  `developer_versioned_docs/version-v<new_version>/docs/X`. (`docs/docs-participate/`,
  `docs/src/`, and the `docs/docs/` root pages are NOT versioned; changes there land live
  on `main` and are out of scope for this reconcile.)
- **Existing versioned snapshots on `main`** — fixes that were applied _directly_
  to the previous version's snapshot (e.g.
  `docs/developer_versioned_docs/version-<prev_version>/...`). These were carried
  into the previous version on `main` but will not exist in a snapshot cut from the
  tag, because the tag predates them.
- **Build tooling and config** — `docs/scripts/` (the validators and generators
  `yarn build` runs) and `docs/docusaurus.config.js`. These are not published content and
  are not snapshotted, so they are not part of the release; the tag simply carries
  whatever version existed when it was cut. A tag older than a repair runs the *broken*
  copy, and the damage surfaces as broken documentation rather than as broken tooling.
  Take `origin/main`'s copies:

  ```bash
  git diff --name-only v<new_version>..origin/main -- docs/scripts/ docs/docusaurus.config.js
  # for each repair (not for changes that support post-tag features):
  git show origin/main:docs/<file> > docs/<file>
  ```

  Port repairs, not features: a generator change that adds support for an API introduced
  after the tag has nothing to generate from this tag's source, so leave it.

  `docusaurus.config.js` matters more than it looks because `editUrl` is baked into every
  rendered page. Cutting v6.0.0-rc.1 emitted 124 pages whose "Edit this page" link pointed
  at `AztecProtocol/aztec-packages/edit/next/...` — a repo and branch that no longer
  exist — because the repair had landed on `main` after the tag. Grep the built output,
  not just the sources:

  ```bash
  grep -rl 'github.com/AztecProtocol' build/ | head
  ```

Always compare against `origin/main`, **not** the working tree, so the divergence
is actually visible:

1. List every docs commit on `main` that is **not** in the release tag — this is
   the complete set of changes the new snapshot may be missing:

   ```bash
   git fetch origin
   git log --oneline --no-merges v<new_version>..origin/main -- docs/
   ```

   Skip version cuts, nightly auto-cuts, and template-only changes; review the rest.

2. See what `main` changed in the **source docs** relative to the tag, and port the
   relevant changes into the new versioned snapshot:

   ```bash
   git diff v<new_version>..origin/main -- \
     docs/docs-developers/ docs/docs-operate/ \
     docs/sidebars-developer.js docs/sidebars-operate.js
   ```

3. See what `main` changed **directly in the previous versioned snapshot with the same major version number**, and
   apply the equivalent fix to the same file in the new snapshot wherever that file
   also exists there. **If this release type has no previous version** (a first cut, or
   the type is absent from the version config), skip this sub-step: there is no prior
   snapshot to diff against (same first-cut guard as Step 16). Steps 5 and 11 have
   already overwritten the local version
   configs with the new version, so resolve `<prev_version>` (the previous version
   for this release type, including its `v` prefix) from `origin/main`, **not** the
   working tree:

   ```bash
   git show origin/main:docs/developer_version_config.json
   git show origin/main:docs/network_version_config.json
   ```

   Then diff the previous snapshot against the tag:

   ```bash
   git diff v<new_version>..origin/main -- \
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

6. Treat sidebar changes as part of the same backport. If you reconcile a docs layout
   from `main`, update the matching file under `developer_versioned_sidebars/` or
   `network_versioned_sidebars/` from the same final sidebar source. Never combine
   reconciled `main` pages with the tag-generated sidebar. When adopting the `main`
   sidebar wholesale, load both configs in Node and assert deep semantic equality;
   a successful Docusaurus build does not catch a stale sidebar when legacy pages still exist.

### Step 13: Run `yarn build` and Fix Issues

**Run after the cut (Step 11).** Docusaurus validates `lastVersion` against
existing versioned dirs, so a build before the snapshot exists fails — the
config points to a version that hasn't been cut yet. Running it here, after
Step 12's reconcile, also validates the backported content.

**A wall of "invalid redirect targets" means the validator is broken, not the docs.**
If `validate_redirect_targets.sh` rejects most or all targets, read one of the rejected
values: when it still carries its `to = "` prefix, the script's `sed` never substituted
and is handing the validator whole TOML lines instead of paths. The cause is a tag that
predates the portability repairs — `sed -E 's/^\s*to\s*=.../'` matches nothing under
BSD `sed` (macOS), which does not support `\s`, so every line passes through unchanged.
Fix it by taking `origin/main`'s `docs/scripts/`, per Step 12's third class; do not chase
the individual redirects. Confirm the flavour with `sed --version` — BSD answers
`illegal option`. A 150-target site reported this as 185 broken links.

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

**viem is versioned off the release line.** The packages depend on upstream `viem` (e.g.
`viem@2.57.1`), which has no `5.0.0-rc.1`-style version on npm, so never rewrite it to the
release version. Tutorials and examples that have not been migrated yet still import the old
`@aztec/viem@2.38.2` fork; never rewrite that pin to the release version either. CI won't
catch a wrong pin: the import type-checks against the auto-linked workspace copy. Tutorials
whose example code imports viem (token/aave/uniswap bridges) must list it at its own version
in their install command. Find the pin:

```bash
grep -rh '"viem": "' yarn-project/*/package.json | head -1
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

`yarn build` (Step 13) only checks links and spelling, not whether the documented
commands run. Before shipping, exercise the new version against a real network.

**Run this in a subagent** (long-running, install-heavy). Validate the **cut snapshot**
content (`developer_versioned_docs/version-v<new_version>/docs/...`), not `main` (except the
Aztec.js examples, which are source-only; see task 4). Tasks:

1. **Install the release and start a local network.** `# background; wait until ready` is a
   comment, not backgrounding; actually background it and poll until the node answers, or
   the subagent hangs:

   ```bash
   VERSION=<new_version> bash -i <(curl -sL https://install.aztec.network)
   aztec --version                          # must equal <new_version>
   aztec start --local-network > /tmp/local-network.log 2>&1 &
   until curl -sf -X POST -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"node_getNodeInfo","params":[],"id":1}' \
     http://localhost:8080 | grep -q nodeVersion; do sleep 5; done
   ```
   If port 8080 is taken, start on a different `--port`/`--admin-port` and point the wallet
   at it with `--node-url`.

2. **Validate the getting-started guide that matches the release type** (mirror the Steps
   10/14 branch), walking it as written and running every documented command:
   - **devnet / nightly** → `getting_started_on_local_network.md`, against the task-1 local network.
   - **testnet / mainnet** → `getting_started_on_testnet.md`, against that network's live RPC.
     A local network can't exercise it (it needs a funded account). Verify the read-only
     steps; only run funded transactions if a funded account is available, and never spend
     more than necessary.

3. **Walk every tutorial** under
   `developer_versioned_docs/version-v<new_version>/docs/tutorials/**/*.md`. Glob the whole
   tree, not just the `contract_tutorials`/`js_tutorials` subdirs; loose tutorials like
   `testing_governance_rollup_upgrade.md` sit directly under `tutorials/`. Contract
   compile/deploy/interact flows run against the task-1 local network regardless of release
   type. Record any drift (renamed command, changed flag, stale address, different output).

4. **Run the Aztec.js examples** in `docs/examples/ts/` against the local network. These are
   **source-only**: they are not part of any versioned snapshot, so they validate the
   release tag's example code, not the cut snapshot. Type-check all via `bootstrap.sh`,
   execute the runner-supported set via `aztecjs_runner/run.sh`, and list skipped examples
   with reasons. To test against the published release (not the workspace copies auto-linked
   in `lib.sh`), temporarily rewrite each example's `@aztec-labs/*` config dep to
   `npm:@aztec-labs/*@<new_version>`, keeping special pins like viem.

Report pass/fail per guide/tutorial/example with the exact doc line for each failure. Fix
guide/tutorial drift in both the snapshot **and** the source docs; for the Aztec.js
examples (source-only, task 4) there is no snapshot copy, so fix only the source. Then
re-run Step 13 and the affected check. If the validation can't run (sandbox lacks this RC,
infra down), say so and list what was skipped.

### Step 16: Clean Up Old Versions

#### Developer docs

Identify the previous developer docs version for this release type from
`docs/developer_version_config.json` (look for the old entry being replaced).

**Delete nothing that another release type still points at.** Release types share
version strings whenever they were last released together, so the version you are
replacing is often still the *current* version for another type — and deleting it
removes that type's live docs. This is the normal state when testnet forks onto a new
major ahead of mainnet: testnet moves to `v6.0.0-rc.1` while mainnet stays on `v5.2.0`,
the value testnet just vacated. Deleting `version-v5.2.0` there would take out mainnet,
which is also the site default (`lastVersion: mainnetDeveloperVersion || ...`), so the
bare URL would serve nothing. Check every entry in **both** configs before deleting:

```bash
python3 -c "
import json
for inst in ('developer','network'):
    c=json.load(open(f'docs/{inst}_version_config.json'))
    print(inst, c)
"
```

If the old version still appears as any type's value in either config, skip the delete
and say so — there is nothing to clean up. The old snapshot stops being referenced only
once every type has moved off it.

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

### Step 17: Move Changes to `main` Branch

```bash
git stash
git checkout main && git pull origin main
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
- **Re-derive, never carry forward**: every address, version, chain id, and
  governance parameter in `networks.md` is re-checked at release time against
  its source of truth (RPC, on-chain call, or tag tooling) — checksummed with
  `cast to-check-sum-address`, converted with `cast to-dec`, and cross-checked
  against any human-owned deployment data (see the "Re-verify every figure"
  subsection of Step 9).
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
- **Changes land on `main`**: All changes are stashed and moved to the `main` branch
  at the end, ready for a PR.
- **Reconcile against `main` after cutting**: The new version is cut from the release
  tag, which predates docs changes merged into `main`. After the cut, diff the tag
  against `origin/main` and backport relevant changes — both to source docs **and** to
  the previous versioned snapshot, including matching sidebar changes (see Step 12).
  This is the most commonly missed step.
- **API ref docs**: Generated in Step 6 into `docs/static/typescript-api/` and
  `docs/static/aztec-nr-api/` with stable folder names (`mainnet`, `testnet`,
  `devnet`, `nightly`). The `#api_ref_version` macro resolves to the matching
  folder name for each release type (see `include_version.js`).
- **Update `docs/README.md`**: If any new generation scripts, build steps, or
  tooling changes were added during the release, update `docs/README.md` to
  document them (e.g. new `yarn generate:*` commands).
