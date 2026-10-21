---
name: release-docs
description: Build and update the developer documentation site for a new release
argument-hint: <RPC_URL>
---

# Release Docs

Update the Aztec developer documentation for a new release. Queries the network
for current info, updates version defaults, contract addresses and migration notes,
cuts a versioned snapshot in a temporary worktree, builds and validates it, and
carries the results back to the destination branch as one commit. Nothing is pushed.

Supports **devnet**, **testnet**, and **mainnet** releases. The release type is
auto-detected from the version string (Step 1); if it does not self-identify, ask
the user to confirm.

## Usage

```
/release-docs https://aztec-testnet.drpc.org
/release-docs https://testnet-v6.rpc2.aztec-labs.com
```

Prefer the network's public, keyless endpoint (the one `networks.md` publishes:
`https://aztec-testnet.drpc.org`, `https://aztec-mainnet.drpc.org`). The operator
endpoints (`testnet-v<N>.rpc2.aztec-labs.com`, `canonical.mainnet.rpc.aztec-labs.com`)
need an API key; use one only when the public endpoint does not answer or does not yet
report the release. The key is read from `AZTEC_NODE_API_KEY`, which must be exported
before the session starts (commands inherit the environment as it was at launch). Never
paste the key into the conversation or onto a command line.

## Release model

- **Labs versions live in `labs/`.** The docs and the code their snippets show come from
  aztec-node (Labs), checked out here as the `labs/` submodule. This repository has its
  own tags with the same names (`v6.0.0-rc.1`, …) on unrelated commits, so a Labs version
  is only ever addressed inside the submodule: `git -C labs …` or `git -C "$CUT/labs" …`.
  A root checkout of `v6…` is the Foundation tree.
- **The cut runs in its own worktree** (`$CUT`), created from the destination commit,
  with `labs/` at the Labs tag. The destination checkout is not touched until Step 17.
- **Release inputs**, recorded in the commit that lands the cut (Step 17):

  | Input | Source |
  | --- | --- |
  | Content revision | aztec-node `docs/` at the tag, merged onto the destination by `scripts/labs_docs_sync.sh --release` |
  | Labs code revision | `labs/` at the tag, built standalone with the tag's pinned toolchain |
  | Foundation dependency revision | `@aztec-foundation/l1-artifacts` and `BB_VERSION` at the tag |
  | Destination | the branch and commit the cut started from |

- **State** lives in `~/.cache/aztec-docs-cut/v<new_version>/`: `env.sh` (sourced by every
  command block from Step 2 on, since shell state does not carry over between commands),
  the worktree, the CLI's home, the local network and logs.
- **Owner approval.** A step marked **Owner approval required.** stops until the owner
  says yes: pushes, pull requests, messages, and transactions on a live network.
- **Never stash.** Every worktree of this repository shares one stash stack. Step 17 says
  how each change travels.

### v5 releases

v5 is released from this repository's `v5*` tags, which predate the move: the docs and the
code sit at the root and there is no `labs/`. Check the tag out in its own worktree (a root
`git worktree add <dir> v5.x.y`; v5 tags exist only here) and follow the skill as it stands
in that worktree. Which docs content a v5 cut starts from is not settled (the `docs/` on this
repository's `v5` branch is stale): ask the owner before starting.

## Workflow

### Step 1: Query Network Info and Detect Release Type

```bash
# The two gateway families read different headers: Kong (*.rpc.aztec-labs.com) reads
# x-aztec-api-key, AWS (*.rpc2.aztec-labs.com) reads x-api-key; each ignores the other.
# ${AUTH[@]+...}: expanding an empty array under set -u fails in macOS's bash 3.2.
AUTH=()
[ -n "${AZTEC_NODE_API_KEY:-}" ] && AUTH=(
  -H "x-api-key: ${AZTEC_NODE_API_KEY}"
  -H "x-aztec-api-key: ${AZTEC_NODE_API_KEY}"
)
# The status goes to stderr so a rejection stays visible instead of a bare null.
curl -sS -w '%{stderr}[http %{http_code}]\n' -X POST -H 'Content-Type: application/json' \
  ${AUTH[@]+"${AUTH[@]}"} \
  -d '{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}' <RPC_URL> | jq '.result // .'
```

- dRPC serves only the legacy `node_` namespace: on error `-32601`, repeat with
  `node_getNodeInfo`.
- `403 {"message":"Forbidden"}` (rpc2) or `401 No API key found in request` (Kong) means a
  missing or wrong key for that endpoint, not an endpoint that is down.

Parse the response to extract:

- `nodeVersion` (e.g. `6.0.0-rc.3`)
- L1 contract addresses from `l1ContractAddresses`: registry, rollup, inbox, outbox,
  fee juice, staking asset, fee juice portal, fee asset handler, coin issuer,
  reward distributor, governance proposer, governance, and GSE (`gseAddress`, newer
  nodes only)
- L2 protocol contract addresses from `protocolContractAddresses`: instance registry,
  class registry, multi-call entrypoint, fee juice
- `rollupVersion`
- `l1ChainId`

The other contracts in `networks.md` (Slasher, Reward Booster, Staking Registry, Tally
Slashing Proposer, Honk Verifier, Slash Payload Cloneable, …) are resolved in Step 9.

**Detect release type** from the version string:

- Contains `devnet` → `devnet`
- Contains `testnet` → `testnet`
- Contains `mainnet` → `mainnet`
- Otherwise (`rc` tags included) ask the user: an `rc` can be a testnet or a mainnet release

Store all values for the following steps.

#### Pre-release workflow

If the user wants docs for a target version that differs from the `nodeVersion` the
RPC returns (the network still runs `6.0.0-rc.1` and the docs are for `6.0.0-rc.3`),
confirm the target version and use it as `<new_version>` throughout. Its Labs tag must
still exist. Contract addresses from the RPC reflect the current network; ask the user
whether any will change at upgrade time.

### Step 2: Prepare the Cut Worktree

#### 2a. The Labs tag must exist

```bash
git -C labs fetch --depth 1 origin tag v<new_version>
git -C labs tag -l v<new_version>
```

**Abort if the fetch fails**: the release has not been tagged.

#### 2b. Record the destination

Run from the destination checkout: the branch the cut lands on (`next`, or the docs
branch being prepared). It must be clean apart from the expected ` M labs`.

```bash
git diff --quiet --ignore-submodules=all && git diff --cached --quiet --ignore-submodules=all \
  || echo "commit or discard the changes first"
LABS_TAG=v<new_version>
STATE=$HOME/.cache/aztec-docs-cut/$LABS_TAG
CUT=$STATE/worktree
CLI_HOME=$STATE/cli-home
mkdir -p "$STATE" "$CLI_HOME"
cat >"$STATE/env.sh" <<EOF
LABS_TAG=$LABS_TAG
STATE=$STATE
CUT=$CUT
CLI_HOME=$CLI_HOME
DEST_ROOT=$(git rev-parse --show-toplevel)
DEST=$(git rev-parse HEAD)
DEST_BRANCH=$(git branch --show-current)
docs_env() { COMMIT_TAG=$LABS_TAG LABS_REF=$LABS_TAG RELEASE_TYPE=<release_type> <TAG_VAR>=<new_version> NARGO=$CUT/labs/labs-aztec-toolchain/bin/nargo BB=$CUT/labs/labs-aztec-toolchain/bin/bb "\$@"; }
aztec_cli() { env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME HOME=$CLI_HOME PATH=$CLI_HOME/.aztec/current/bin:$CLI_HOME/.aztec/bin:\$PATH "\$@"; }
EOF
```

`<TAG_VAR>` is `DEVNET_TAG`, `TESTNET_TAG` or `MAINNET_TAG`, and its value has no `v`.
`docs_env` runs a docs command with the release variables; `aztec_cli` runs the release
CLI (Step 3) with its own home. `COMMIT_TAG` keeps its `v`: `#include_aztec_version`
emits it as a git ref, and `#include_version_without_prefix` falls back to `latest` when
it lacks one.

#### 2c. Create the worktree, with `labs/` at the tag

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
git worktree add -b "docs-cut/$LABS_TAG" "$CUT" "$DEST"
cd "$CUT" && labs-patches/bootstrap.sh apply
git -C "$CUT/labs" fetch --depth 1 origin tag "$LABS_TAG"
git -C "$CUT/labs" checkout --detach "$LABS_TAG"
```

`apply` initializes `labs/`; the checkout then drops the Foundation's patch series, so
`labs/` is the pristine tag. Do not run `apply` again in the cut (it moves `labs/` back to
the gitlink and the series), and run no root `make` target there (they build `labs/` in
Foundation mode).

#### 2d. Merge the tag's docs

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT"
scripts/labs_docs_sync.sh --release "$LABS_TAG" sync "$LABS_TAG"
git commit -m "docs: sync from aztec-node@$LABS_TAG"
echo "SYNC=$(git rev-parse HEAD)" >>"$STATE/env.sh"
```

The sync merges aztec-node's `docs/` changes between the destination's `docs/.labs-sync`
and the tag into the destination's `docs/`, keeping this repository's own changes. On a
conflict it prints the paths and changes nothing: make those files agree with the tag
where both sides edited the same lines, commit, and rerun. A lone `docs/yarn.lock`
conflict takes aztec-node's lockfile; run `(cd docs && yarn install)` before committing.

#### 2e. Keep the destination's published versions and live pages

The sync also rolls back what the destination changed after the tag in files that are
not release inputs: the unversioned pages and the existing snapshots. Take those from the
destination, so that every release result copied back in Step 17 starts from the
destination's copy:

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT"
git restore --source="$DEST" --staged --worktree -- \
  docs/docs docs/docs-participate \
  docs/developer_versioned_docs docs/network_versioned_docs \
  docs/developer_versioned_sidebars docs/network_versioned_sidebars \
  docs/developer_versions.json docs/network_versions.json \
  docs/developer_version_config.json docs/network_version_config.json \
  docs/static/aztec-nr-api docs/static/typescript-api
git diff --cached --quiet || git commit -m "docs: keep the destination's published versions and live pages"
echo "SYNCED=$(git rev-parse HEAD)" >>"$STATE/env.sh"
```

The release inputs stay at the tag: `docs/docs-developers/`, `docs/docs-operate/`, the
two sidebars, `docs/examples/` (the snippets' sources) and the l1-artifacts pin. Tooling
(`docs/scripts/`, `docs/src/`, `docusaurus.config.js`) stays as the sync left it; Step 12
reconciles it.

#### 2f. Build `labs/` at the tag

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
cd "$CUT/labs" && env -u root -u ci3 AZTEC_TOOLCHAIN_FND_ROOT= make yarn-project
cd "$CUT/docs" && yarn install --immutable
```

This is aztec-node's own build: an empty `AZTEC_TOOLCHAIN_FND_ROOT` selects pinned mode,
which downloads `bb` and `nargo` at the tag's `BB_VERSION`/`NOIR_VERSION`, and clearing
`root`/`ci3` keeps this repository's ci3 out of it. Do **not** run the root
`./bootstrap.sh`, `make labs-yarn-project` or `make docs`.

#### 2g. Check the environment before preprocessing

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT"
scripts/labs_docs_sync.sh --release "$LABS_TAG" check
git -C labs show "$LABS_TAG:labs-aztec-toolchain/bootstrap.sh" | grep -E '^(BB|NOIR)_VERSION='
cat labs/labs-aztec-toolchain/bin/.pin
docs_env sh -c '"$NARGO" --version; "$BB" --version; echo "LABS_REF=$LABS_REF COMMIT_TAG=$COMMIT_TAG"'
node -p 'require("./docs/node_modules/@aztec-foundation/l1-artifacts/package.json").version'
```

All of these must hold; stop at the first that does not:

- `check` prints `labs docs sync: ok`: `docs/.labs-sync` and `labs/` HEAD are the tag,
  `labs/` is pristine, and `docs/package.json`'s l1-artifacts equals the tag's `BB_VERSION`.
- `.pin` records `bb=` and `noir=` equal to the tag's `BB_VERSION` and `NOIR_VERSION`.
  (`nargo --version` prints only its cargo version, so the pin record is the check.)
- `bb --version` prints `BB_VERSION`.
- The installed l1-artifacts version equals `BB_VERSION`.
- `LABS_REF` and `COMMIT_TAG` are `v<new_version>`: snippet links to aztec-node name
  `LABS_REF`, else `COMMIT_TAG`, else `docs/.labs-sync`.

### Unversioned root pages

Pages under `docs/docs/` (`networks.md`, `index.md`) are not versioned: they are live
on the destination. Step 2e gave the cut the destination's copies; edit those, bump the
version fields, and never revert to the tag's older copy. Step 17 copies `networks.md` back.

### Step 3: Install the Release CLI

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME HOME="$CLI_HOME" VERSION=<new_version> \
  bash -i <(curl -fsSL https://install.aztec.network)
aztec_cli aztec --version
```

The version must equal `<new_version>`; abort otherwise. The installer runs with
`HOME` set to `$CLI_HOME`, so its node, foundry, nargo and shell-profile edits stay out of
the real home; it is the official installer, fetched over TLS.

### Step 4: Get Sponsored FPC Address

The address is a hash of the SponsoredFPC contract class and a zero salt
(`SPONSORED_FPC_SALT`), so derive it from the tag's code built in Step 2f:

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/labs/yarn-project"
node --input-type=module -e "
import { getSponsoredFPCAddress } from '@aztec-labs/cli/cli-utils';
console.log((await getSponsoredFPCAddress()).toString());
"
```

Update it wherever it appears in the versioned docs. The Sponsored FPC is deployed on
testnet and devnet; for mainnet, mark the SponsoredFPC row "Not deployed" in the L2
table. If the address changes for a testnet release, tell the owner the new address must
be funded on testnet.

### Step 5: Update Version Configs

**Developer docs:** `docs/developer_version_config.json` maps release types to versions
(with `v`):

```json
{
  "mainnet": "v5.2.0",
  "testnet": "v6.0.0-rc.1"
}
```

The preprocessor (`include_version.js`) reads its defaults from this file.

**Write the new version only after the cut (Step 11).** `docusaurus.config.js` validates
every version named here against the directories that exist, so naming one that has no
directory yet makes every docusaurus command fail, `docs:version` included:

```
[ERROR] Invalid docs option "versions": unknown versions (vX.Y.Z) found.
        Available version names are: current, <previous>
```

Step 11 writes it with `scripts/update_docs_versions.sh` once the directory exists; the
network config follows the same rule.

### Step 6: Generate API Reference Docs

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/docs"
docs_env yarn generate:aztec-nr-api <new_version>
docs_env yarn generate:typescript-api <new_version>
docs_env ./scripts/aztecjs_reference_generation/update_docs.sh current
```

This writes:

- `docs/static/aztec-nr-api/<release_type>/`
- `docs/static/typescript-api/<release_type>/`
- `docs/docs-developers/docs/aztec-js/aztec_js_reference.md`

The generators read `labs/` at the tag: `nargo doc` over `labs/noir-projects/aztec-nr`,
TypeDoc over the built `labs/yarn-project`, and the Aztec.js reference from
`labs/yarn-project/aztec.js/src`. An explicit `NARGO` wins over `PATH` in
`generate_aztec_nr_docs.sh`; confirm its `Using nargo:` line names the cut's
`labs/labs-aztec-toolchain/bin/nargo`. A mismatched nargo fails with errors such as
`error: Non-ASCII character in comment`. The output folders are named by
`RELEASE_TYPE`, which `docs_env` sets.

### Step 7: Generate CLI Reference Docs

The scripts scrape `--help` from the installed CLI, so it must be the release (Step 3):

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/docs"
docs_env aztec_cli ./scripts/cli_reference_generation/generate_all_cli_docs.sh --force current
grep -rnE '/home/|/Users/' docs-developers/docs/cli/
```

This updates `aztec_cli_reference.md`, `aztec_wallet_cli_reference.md` and
`aztec_up_cli_reference.md` in `docs/docs-developers/docs/cli/`. Do not hand-edit them,
with one exception: `--help` prints defaults derived from `$HOME` (`aztec-wallet
--data-dir` shows `(default: "<home>/.aztec/wallet")`), so the scrape contains
`$CLI_HOME`. Normalise those paths to `~/.aztec/...`; the grep must then print nothing.

### Step 7b: Generate Node API Reference Docs

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/docs"
docs_env yarn generate:node-api-reference
```

This parses the interfaces and Zod schemas in `labs/yarn-project/stdlib/src/interfaces/`
at the tag and writes `docs/docs-operate/operators/reference/node-api-reference.md`
(generated: do not hand-edit). The network snapshot (Step 11) includes it.

### Step 8: Update Migration Notes

**File:** `docs/docs-developers/docs/resources/migration_notes.md` (in the cut)

The labs clone is shallow; fetch the release range before any history command. When
the previous release is not a Labs tag (v5 and earlier are tags of this repository),
use `--shallow-since=<date of that release>` instead of `--shallow-exclude`, and skip
the diff in item 4.

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
git -C "$CUT/labs" fetch --depth 1 origin tag v<old_version>
git -C "$CUT/labs" fetch --shallow-exclude=v<old_version> origin tag "$LABS_TAG"
```

1. **Triage existing TBD items.** Not every item under `## TBD` belongs to this release.
   For each entry decide whether it:

   - shipped in this release → move it under the new `## <new_version>` heading;
   - targets a future major → move it under `## Unreleased (v<next_major>)` (create it
     between `## TBD` and the new version heading);
   - is still TBD → leave it.

   Present the proposed triage to the user for confirmation before rearranging.

   **Decide by ancestry, not by date.** Ported and cherry-picked commits keep their
   original author dates, so an entry can describe work dated before the tag that is not
   in it. The test:

   ```bash
   git -C "$CUT/labs" merge-base --is-ancestor <commit> "$LABS_TAG" && echo in-tag || echo NOT-in-tag
   ```

   An item whose commit is not an ancestor of the tag has not shipped, even if it is on
   aztec-node `main`: leave it under `## TBD`. In one rehearsal 4 of 21 items failed this
   test. A commit older than the fetched range is reported as unknown, not as absent:
   fetch more history before deciding.

2. Create the `## <new_version>` heading below `## TBD` (and below any `## Unreleased`
   sections) and move the shipped items under it.

3. Keep `## TBD` at the top of the **source** file, followed by a blank line. The
   **snapshot** must not ship it: Step 11 strips it.

4. Look for missing items in the code diff between the releases:

   ```bash
   git -C "$CUT/labs" diff v<old_version> "$LABS_TAG" -- yarn-project/ noir-projects/
   ```

5. Present draft entries for user review before adding them.

The destination's copy of this file needs the same triage: it is a shared source repair
(Step 17), and its `## TBD` usually holds later entries, so expect to apply it by hand.

### Step 8b: Sweep the Docs for the Release's Syntax Changes

The migration notes record what broke, but nothing applies those changes to the rest of
the docs: hand-written snippets, prose that names APIs, and pages nobody touched since the
tag drift silently. CI only protects code that compiles (`#include_code` snippets and
`docs/examples/`), so this sweep targets everything else. Run it **before the cut**
(Step 11) so the snapshot is already correct.

**1. Enumerate the release's syntax changes.** The source of truth is the migration-notes
diff over the tag range in aztec-node, not the GitHub release body (hand-written prose)
and not the `## <version>` headings (entries get filed under the wrong one):

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
git -C "$CUT/labs" diff v<old_version> "$LABS_TAG" -- docs/docs-developers/docs/resources/migration_notes.md
```

Parse every added `### [Component] …` entry and its `**Migration:**` diff block into
`(component, old syntax, new syntax)` triples. Cross-check against breaking commits that
never got a migration note:

```bash
git -C "$CUT/labs" log --oneline "v<old_version>..$LABS_TAG" --grep='!:' -- yarn-project/ noir-projects/
```

aztec-node marks breaking changes only with the conventional-commit `!`, never a
`BREAKING CHANGE:` trailer, so `--grep='!:'` is the complete filter.

**2. Locate candidate usages.** For each triple, grep the cut's source docs:

```bash
cd ~/.cache/aztec-docs-cut/v<new_version>/worktree/docs
grep -rn "<old_symbol>" docs-developers/ docs-operate/ docs-participate/ docs/ examples/
```

Prioritize surfaces with no compiler gate: hand-written code blocks (most of them in
`docs-developers/docs/aztec-nr/` and `docs-operate/`), prose that names functions or flags,
and install or CLI commands. A hit in an `#include_code` target or `docs/examples/` usually
means the build already fails; treat those as cross-checks.

**3. Adjudicate every candidate; do not fix from grep hits alone.** A symbol grep is noisy
and blind to signature drift (a function can keep its name while its arguments change):

- Verify against the source at the tag:
  `git -C "$CUT/labs" show "$LABS_TAG:<path>"` (the aztec-node path, without `labs/`).
- Leave third-party SDK snippets alone; they document someone else's API.
- Skip historical references: migration-note entries, changelog prose, and "in vX, Y was
  removed" sentences are supposed to name the old syntax.
- Skip generated files (`aztec_js_reference.md`, the CLI references,
  `node-api-reference.md`); Steps 6 to 7b regenerate them.
- Check for semantic drift the diff implies where the symbol survives: renamed
  arguments, new required parameters, changed return shapes.

**4. Fix and report.** Fix the cut's source docs (they flow into the snapshot); fixes the
destination also needs are shared source repairs (Step 17). Present a summary table:
`component | old → new | files fixed | candidates dismissed and why`, and list anything
that could not be verified.

### Step 9: Resolve Missing Contract Addresses & Update Network Info

The `networks.md` L1 table includes contracts that `aztec_getNodeInfo` does not return.
Resolve them in three tiers. Determine the L1 RPC from `l1ChainId`: `1` → Ethereum
mainnet, `11155111` → Sepolia. The Rollup and Registry addresses come from Step 1.

**When the rollup version changed**, the network did a rollup upgrade: the per-rollup
contracts are redeployed (Rollup, Inbox, Outbox, Fee Juice Portal, Slasher, Reward Booster,
Tally Slashing Proposer, Honk Verifier, Slash Payload Cloneable; all in the RPC or reachable
from the new Rollup), while governance and shared contracts persist (Registry, Governance,
GSE, Staking Asset, Fee Juice, Coin Issuer, Reward Distributor, Governance Proposer, Fee
Asset Handler, Staking Registry, Slash Factory). Re-resolve the per-rollup set; for the rest
confirm the existing values still hold (`cast code <addr>` returns bytecode).

Convert on-chain hex with `cast to-dec <hex>`, never by eye: a hand-converted rollup
version has shipped wrong before.

#### Tier 1: Query on-chain from known contracts

```bash
# GSE: skip when the RPC returned gseAddress
cast call <ROLLUP_ADDRESS> "getGSE()(address)" --rpc-url <L1_RPC>
cast call <ROLLUP_ADDRESS> "getSlasher()(address)" --rpc-url <L1_RPC>
cast call <REGISTRY_ADDRESS> "getGovernance()(address)" --rpc-url <L1_RPC>
# Honk Verifier
cast call <ROLLUP_ADDRESS> "getEpochProofVerifier()(address)" --rpc-url <L1_RPC>
# Reward Booster: third field of (rewardDistributor, sequencerBps, booster, checkpointReward)
cast call <ROLLUP_ADDRESS> "getRewardConfig()(address,uint256,address,uint96)" --rpc-url <L1_RPC>
# Tally Slashing Proposer: the Slasher's PROPOSER
cast call <SLASHER_ADDRESS> "PROPOSER()(address)" --rpc-url <L1_RPC>
# Slash Payload Cloneable: the proposer's payload implementation
cast call <PROPOSER_ADDRESS> "SLASH_PAYLOAD_IMPLEMENTATION()(address)" --rpc-url <L1_RPC>
```

#### Tier 2: From deployment output (if available)

Only contracts with no public getter remain: **Staking Registry**. Obtain it from the
deployment script's output (`DeployAztecL1Contracts.s.sol` prints JSON with all
addresses); ask the user if they have it.

The release's L1 contract sources are the `@aztec-foundation/l1-artifacts` package
installed in the cut (`$CUT/docs/node_modules/@aztec-foundation/l1-artifacts/l1-contracts/`),
whose version Step 2g checked against the tag's `BB_VERSION`. It ships the Solidity tree
(`src/`, `script/`, compiled `out/`). This repository's own `l1-contracts/` is the
Foundation's development tree, not the release's: do not read it for a release.

The same package is what the Solidity examples compile against
(`docs/examples/solidity/foundry.toml` remaps `@aztec/` and `@oz/` into it), so a Solidity
`@aztec/core/...` import is a Foundry remapping, not an npm scope.

#### Tier 3: Manual / confirm unchanged

No on-chain getter. Ask the user for new addresses, or confirm the existing
`networks.md` values still hold (`cast code <addr>`):

- **Slash Factory** (governance-level; `N/A` when the release does not deploy it)
- **Register New Rollup Version Payload**

#### Update the tables

**File:** `docs/docs/networks.md` (the destination's copy, from Step 2e)

Update the column matching the release type (**Testnet** or **Alpha (Mainnet)**).
Devnet releases do not update this file.

- **Network Technical Information table**: the **Version** row, the rollup version, and
  the RPC endpoint.

  The `Version` row is the field most often missed: it stayed at `5.1.0` through the
  v5.2.0 release and again in a v6 rehearsal while the rollup version beside it moved.
  Read it from the live network, and check **both** columns:

  ```bash
  curl -s -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}' \
    <public RPC> | jq -r '.result.nodeVersion'
  ```

  (On dRPC's `-32601`, use `node_getNodeInfo`.)

  The RPC endpoint must be the **public** one. External readers have no key, so a gated
  host there makes the guide's first command fail for every reader:

  | Network | Public RPC (docs) | Operator RPC (not for docs) |
  | --- | --- | --- |
  | Mainnet | `https://aztec-mainnet.drpc.org` | `canonical.mainnet.rpc.aztec-labs.com` |
  | Testnet | `https://aztec-testnet.drpc.org` | `testnet-v<N>.rpc2.aztec-labs.com` |

  Verify with the command above, without a key, that it answers and reports the
  version being cut.
- **L1 Contract Addresses table**: every address from the RPC, the on-chain queries and
  the user. Link format: `https://etherscan.io/address/0xADDR` (mainnet),
  `https://sepolia.etherscan.io/address/0xADDR` (testnet); `N/A` where not deployed.
- **L2 Contract Addresses table**: the SponsoredFPC address from Step 4, and any change in
  `protocolContractAddresses`.

Then grep the cut for the network's old addresses:

```bash
grep -r "<old_address>" ~/.cache/aztec-docs-cut/v<new_version>/worktree/docs/
```

#### Re-verify every figure against its source of truth

Every value in `networks.md`, both columns and all tables, is re-derived at release time
from the node RPC, an on-chain call, or the tag's tooling. Never carry a value forward
or transcribe one by hand:

- **EIP-55 checksums.** `cast to-check-sum-address <addr>` for every L1 address (link text
  and href); the RPC returns lowercase.
- **Decimal conversions.** `cast to-dec <hex>`.
- **Rollup version.** `cast call <ROLLUP> "getVersion()(uint256)" --rpc-url <L1_RPC>` on
  each network, cross-checked with the RPC's `rollupVersion`. Before the nodes upgrade
  (pre-release workflow), the target rollup's on-chain value wins.
- **L1 chain id.** `cast chain-id --rpc-url <L1_RPC>` must equal the page's **L1 Chain ID**
  row and the RPC's `l1ChainId`.
- **Governance parameters**, both columns, every release:
  - *Proposer Quorum*: `cast call <GOVERNANCE_PROPOSER> "QUORUM_SIZE()(uint256)"` and
    `"ROUND_SIZE()(uint256)"`.
  - *Voting Delay / Voting Duration / Execution Delay*:
    `cast call <GOVERNANCE> "getConfiguration()(((uint256,uint256),uint256,uint256,uint256,uint256,uint256,uint256,uint256))" --rpc-url <L1_RPC>`
    returns the `Configuration` struct of
    `l1-artifacts/l1-contracts/src/governance/interfaces/IGovernance.sol`, in order:
    `(lockDelay, lockAmount)`, `votingDelay`, `votingDuration`, `executionDelay`,
    `gracePeriod`, `quorum`, `requiredYeaMargin`, `minimumVotes`. The getter decompresses
    storage, so the times are seconds (`172800` = 2 days).
  - *Slashing Quorum / Slashing Round Size*: from the Tally Slashing Proposer,
    `"QUORUM()(uint256)"`, `"ROUND_SIZE()(uint256)"` (slots) and
    `"ROUND_SIZE_IN_EPOCHS()(uint256)"`; write the round as `<epochs> epochs (<slots> slots)`.
- **Human-owned data.** If the network team has a parallel update in flight (a PR or forum
  post with addresses), diff every value against it, resolve discrepancies on chain, and
  reconcile with the owner before shipping.

### Step 10: Update Getting Started Page

**For devnet releases:** `docs/docs-developers/getting_started_on_local_network.md`

- Update `SPONSORED_FPC_ADDRESS`, `NODE_URL` if the RPC changed, and any other hardcoded
  address or URL of the old devnet.
- Review the page: version references, CLI commands, FPC registration.

**For testnet releases:** `docs/docs-developers/getting_started_on_testnet.md`

- `NODE_URL` is the **public** testnet RPC and identical to the endpoint in
  `docs/docs/networks.md` (Step 9); the two are maintained separately.
- The source page names the FPC by its `contracts:SponsoredFPC` alias, so Step 4 changes
  nothing there. Older snapshots hardcode `SPONSORED_FPC_ADDRESS` and do need it.
- Update the install command and any hardcoded version.
- Review CLI commands, FPC registration, fee payment instructions and explorer links.
- **Update every versioned snapshot, not just the source.** Testnet is one live network,
  so `NODE_URL` and `SPONSORED_FPC_ADDRESS` must be current in every
  `docs/developer_versioned_docs/version-*/getting_started_on_testnet.md` (each served
  snapshot, including an older one that is the site default). Then:

  ```bash
  cd ~/.cache/aztec-docs-cut/v<new_version>/worktree
  grep -Ern 'NODE_URL=|SPONSORED_FPC_ADDRESS=' docs/developer_versioned_docs/version-*/getting_started_on_testnet.md
  ```

  These edits to existing snapshots are shared source repairs (Step 17).

Also update testnet RPC URLs and addresses in `docs/docs-operate/`, and review the testnet
section of `docs/docs/networks.md`.

### Step 10b: Check the Operator Changelog Covers This Release

**File:** `docs/docs-operate/operators/reference/changelog/v<major>.md`, plus the
`## Version history` list in that directory's `index.md`.

`/updating-changelog` maintains it per PR on the destination; Step 11 cuts it into the
network snapshot, so a gap publishes a page that announces the new version and lists an
older one as the newest release. Check the **destination commit**: for the first release
of a major the page usually lands after the tag.

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
major=$(jq -r '."."' "$CUT/labs/.release-please-manifest.json" | cut -d. -f1)
git -C "$DEST_ROOT" show "$DEST:docs/docs-operate/operators/reference/changelog/v$major.md" >/dev/null \
  && echo "page present" || echo "MISSING: v$major.md"
git -C "$DEST_ROOT" show "$DEST:docs/docs-operate/operators/reference/changelog/index.md" | grep -n '^### ' | head -3
git -C "$DEST_ROOT" show "$DEST:docs/sidebars-operate.js" | grep -n "changelog/v$major"
```

The major is the Labs version from `labs/.release-please-manifest.json`; the root manifest
versions the Foundation. All three must hold:

1. The page exists (a major with several releases may use a minor-qualified name such as
   `v5.2.md`; check that name).
2. `index.md` has a `### ` entry for this release's major (and minor, once the series has
   more than one); an rc or patch is covered by its minor's entry.
3. `docs/sidebars-operate.js` lists the page; an unlisted page is published but has no
   nav entry.

**Owner approval required.** If any check fails, stop and report which. The page must
land on the destination first (`/updating-changelog`, or by hand from the commit range),
through a PR the owner opens and merges; then restart from Step 2 so the cut picks it up.
Do not cut around it, and do not write it only into the cut.

### Step 11: Cut Versioned Docs

`docs:version` snapshots `processed-docs/` (the resolved tree the docs plugins serve),
not the raw `docs-*` source, so preprocess first with every release variable. Snippets
resolve against the working tree, which is why the cut's `docs/examples/` and `labs/` are
at the tag.

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/docs"
docs_env yarn preprocess
grep -rcE 'tag *= *"next"|@next\b|@latest|VERSION=latest|aztec\.network/latest' \
  processed-docs/docs-developers/docs/tutorials/ | grep -v ':0$'
grep -rhoE 'github\.com/AztecProtocol/aztec-packages(/(blob|tree)/[^/)"]+|/?", *tag *= *"[^"]+")' processed-docs/ |
  sort | uniq -c
```

- The first grep must print nothing. Without `COMMIT_TAG`, `#include_aztec_version`
  resolves to `next` (a ref `aztec-labs-eng/aztec-nr` lacks, and not an npm dist-tag) and
  `#include_version_without_prefix` to `latest` (an older nightly at the v6 rehearsal,
  wire-incompatible with the rc). The build validates neither. Both spacings of
  `tag = "next"` occur, hence the pattern.
- The second lists every link and Nargo `git` dependency into this repository with its
  ref, which must be `v<l1-artifacts version>` or `next`. A ref of `v<new_version>` comes
  from `#include_aztec_version` in a hand-written URL or dependency: this repository's tag
  of that name is missing (there is no `v6.0.0-rc.3`) or a different commit. Point it at
  the l1-artifacts version (Foundation code such as `l1-contracts/` and `barretenberg/`),
  or at aztec-node for Labs code. Old migration-note entries are historical; leave them.
  `master` resolves only through GitHub's redirect to `next`: write `next`.

#### 11a. Snippet parity

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT"
docs_env scripts/labs_docs_parity.sh "$LABS_TAG"
```

It must print `rendering parity: ok` and `link provenance: … 0 failed`:

- **Source content.** aztec-node's own preprocessor at the tag renders the cut's content
  byte-identically to this repository's, and every snippet link names aztec-node at
  `v<new_version>` (or aztec-packages at the l1-artifacts version) with lines equal to
  the snippet.

#### 11b. Cut

The version string always has the `v` prefix:

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/docs"
docs_env yarn docusaurus docs:version:developer "$LABS_TAG"
scripts/update_docs_versions.sh developer <release_type> "$LABS_TAG"
```

This is the deferred Step 5 update. Both arguments are required: with the instance name
alone the script only reconciles, prints `WARNING: Version ... not in the config file`,
and leaves `lastVersion` on the previous release.

For **mainnet** and **testnet**, also cut the network docs. First record the current
network version for this release type (Step 16 needs it):

```bash
cat network_version_config.json
docs_env yarn docusaurus docs:version:network "$LABS_TAG"
scripts/update_docs_versions.sh network <release_type> "$LABS_TAG"
```

Verify the new version appears in both `developer_version_config.json` and
`network_version_config.json`.

**Strip the `## TBD` section from the snapshot; it is not cosmetic.** Step 8 leaves
unshipped items there and the cut copies the file wholesale; in one rehearsal it carried
~4,000 characters about an unmerged oracle. Remove the whole `## TBD` section and any
`## Unreleased (...)`, empty or not, from
`developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md`:

```bash
grep -n '^## ' developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md | head -3
```

The first heading must be the new version. Then no macro may survive in the snapshot;
this prints nothing:

```bash
grep -rnE '@next|@latest|VERSION=latest|tag *= *"next"|#include_aztec_version|#release_version|#release_network|#include_code' \
  developer_versioned_docs/version-v<new_version>/ network_versioned_docs/version-v<new_version>/
```

#### Hardcoded version references

Grep the source and the new snapshot for the old version and update each hit, except
historical references (migration-note headings, changelog entries, "in vX, Y was removed"):

```bash
grep -rn "<old_version>" src/ docs-developers/ docs-operate/ docs/ \
  developer_versioned_docs/version-v<new_version>/ network_versioned_docs/version-v<new_version>/
```

Known hits:
`developer_versioned_docs/version-v<new_version>/docs/aztec-js/wallet-sdk/{wallet,dapp}_integration.md`
(`yarn add @aztec/*@<version>`).

### Step 12: Reconcile Destination Changes Into the New Version

The snapshot holds the tag's content; the destination may have newer documentation that
belongs in it. This is the most commonly missed step. Compare against the recorded commits,
not the working tree:

1. **Labs docs commits the tag lacks.** When the tag is older than the destination's
   `docs/.labs-sync`, list aztec-node's docs commits in between (skip version cuts and
   template-only changes; review the rest). When the tag is newer, there is nothing here.

   ```bash
   . ~/.cache/aztec-docs-cut/v<new_version>/env.sh
   pin=$(git -C "$DEST_ROOT" show "$DEST:docs/.labs-sync")
   git -C "$CUT/labs" fetch --shallow-exclude="$LABS_TAG" origin "$pin"
   git -C "$CUT/labs" log --oneline --no-merges "$LABS_TAG..$pin" -- docs/
   ```

2. **Source docs and sidebars**, the snapshot inputs:

   ```bash
   git -C "$CUT" diff "$SYNCED" "$DEST" -- docs/docs-developers/ docs/docs-operate/ \
     docs/sidebars-developer.js docs/sidebars-operate.js
   ```

   `docs/docs-developers/docs/X` maps to `developer_versioned_docs/version-v<new_version>/docs/X`,
   `docs/docs-operate/` to `network_versioned_docs/version-v<new_version>/`.

3. **Fixes made directly to the previous snapshot of the same major** after the tag. Skip
   when this release type has no previous version (a first cut). `<prev_version>` (with
   its `v`) comes from the destination's config:

   ```bash
   git -C "$DEST_ROOT" show "$DEST:docs/developer_version_config.json"
   git -C "$DEST_ROOT" show "$DEST:docs/network_version_config.json"
   git -C "$CUT" diff "$SYNC" "$SYNCED" -- \
     docs/developer_versioned_docs/version-<prev_version>/ docs/network_versioned_docs/version-<prev_version>/
   ```

   Apply the equivalent fix to the same file in the new snapshot where it exists.

4. **Build tooling and config**: `docs/scripts/`, `docs/src/` and
   `docs/docusaurus.config.js` are not published content, and the sync left them as the tag
   had them. A tag older than a repair runs the broken copy, and the damage shows up as broken
   documentation. Take the destination's copy of each repair, not of changes that support
   post-tag features, and never of `docs/src/preprocess/` (Step 11a pins rendering to the
   tag's preprocessor):

   ```bash
   git -C "$CUT" diff --stat "$SYNCED" "$DEST" -- docs/scripts/ docs/src/ docs/docusaurus.config.js
   git -C "$CUT" restore --source="$DEST" -- docs/<file>
   ```

5. For each candidate from 1 to 3, confirm it is valid for the release: compare API
   signatures, function names and trait definitions with the source at the tag
   (`git -C "$CUT/labs" show "$LABS_TAG:<path>"`). Skip nightly-only changes and APIs the
   release lacks.

6. Backport into `developer_versioned_docs/version-v<new_version>/` (and the network
   snapshot where applicable). Present what was found, backported and skipped, for user
   confirmation.

7. Sidebar changes are part of the same backport. When reconciling a layout, update the
   matching file under `developer_versioned_sidebars/` or `network_versioned_sidebars/`
   from the same final sidebar source; never combine reconciled pages with the
   tag-generated sidebar. When adopting a sidebar wholesale, load both configs in Node and
   assert deep equality: the build passes with a stale sidebar while legacy pages exist.

### Step 13: Build and Fix Issues

Run after the cut: docusaurus validates `lastVersion` against the versioned directories.

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT/docs"
docs_env yarn build >"$STATE/build.log" 2>&1; echo "dev build: $?"
CONTEXT=production docs_env yarn build >"$STATE/build-production.log" 2>&1; echo "production build: $?"
"$CUT/scripts/labs_docs_warnings.sh" "$STATE/build.log" "$STATE/build-production.log"
grep -rlE 'github\.com/aztec-labs-eng/aztec-node/edit/' build/ | head
```

Both builds must exit 0 and the warning extract must be empty; a warning that cannot be
fixed goes to the owner. Edit links must name `AztecProtocol/aztec-packages/edit/next/docs/`,
so the last grep prints nothing. Fix and iterate:

- broken redirect targets (`validate_redirect_targets.sh`), broken API reference links
  (`validate_api_ref_links.sh`), spelling.
- **A wall of invalid redirect targets means the validator is broken, not the docs.** If a
  rejected value still carries its `to = "` prefix, `sed` never substituted: the tag predates
  the portability repair, and BSD `sed` (macOS) lacks `\s`. Take the destination's
  `docs/scripts/` per Step 12 item 4. `sed --version` fails on BSD.
- **`rc` tags can be mainnet.** The API generators fall back to `testnet` for `rc` strings
  without `RELEASE_TYPE`; `docs_env` sets it.
- **viem is versioned off the release line.** The packages depend on upstream `viem`, which
  has no `6.0.0-rc.1`-style version; examples not yet migrated import the
  `@aztec/viem@2.38.2` fork. Never rewrite either pin to the release version; CI will not
  catch it (the import type-checks against the linked workspace). Tutorials whose code
  imports viem (token, aave and uniswap bridges) list it at its own version:

  ```bash
  grep -rh '"viem": "' ~/.cache/aztec-docs-cut/v<new_version>/worktree/labs/yarn-project/*/package.json | head -1
  ```

### Step 14: Review Getting Started Page

**Devnet:** read `docs/docs-developers/getting_started_on_local_network.md` once more.
**Testnet:** read `docs/docs-developers/getting_started_on_testnet.md`, the testnet section
of `docs/docs/networks.md`, and any updated operator docs. Verify:

- CLI commands use the correct version and flags
- fee payment instructions are accurate
- block explorer links are correct
- the SponsoredFPC address matches Step 4
- `NODE_URL` matches the RPC endpoint in `networks.md`

Present a summary of the review to the user for approval.

### Step 15: Functional Validation: Run the Guides, Tutorials, and Examples

The build checks links and spelling, not whether the documented commands run. Validate
the **cut snapshot** (`developer_versioned_docs/version-v<new_version>/docs/...`), except
the Aztec.js examples, which are source-only. Long-running and install-heavy.

1. **Start a local network of the release** (installed in Step 3):

   ```bash
   . ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT"
   CLI_HOME="$CLI_HOME" .claude/skills/release-docs/local_network.sh start <new_version> "$STATE"
   . "$STATE/network.env"
   ```

   It claims its ports in `~/.agents/ports.md`, runs in its own process group with a data
   directory under `$STATE`, and waits up to `READY_TIMEOUT` seconds (default 600) for the
   node to report `<new_version>`. `network.env` exports `AZTEC_NODE_URL` (read by
   `aztec-wallet` and the examples runner) and `ETHEREUM_HOST`.

2. **Walk the getting-started guide of the release type**, running every command as
   written, through `aztec_cli` so the wallet's data stays under `$CLI_HOME`:
   - **devnet / nightly**: `getting_started_on_local_network.md`, against the local
     network.
   - **testnet / mainnet**: `getting_started_on_testnet.md`, against the public RPC. A local
     network cannot exercise it (it needs a funded account): run the read-only steps.
     **Owner approval required.** Any step that sends a transaction to the live network
     (deploying an account, a funded transaction) runs only after the owner says yes, with an
     account the owner provides, spending no more than needed.

3. **Walk every tutorial** under
   `developer_versioned_docs/version-v<new_version>/docs/tutorials/**/*.md`, the whole tree
   (`testing_governance_rollup_upgrade.md` sits directly under `tutorials/`). Contract
   compile, deploy and interact flows run against the local network for every release type.
   Record drift: renamed commands, changed flags, stale addresses, different output.

4. **Run the Aztec.js examples** in `docs/examples/ts/` against the local network. They are
   in no snapshot, so they validate the tag's example code. Type-check them all via
   `bootstrap.sh`, execute the runner-supported set with `aztecjs_runner/run.sh` (it reads
   `AZTEC_NODE_URL` and `ETHEREUM_HOST`), and list skipped examples with reasons; an example
   that hardcodes `localhost:8080` or `localhost:8545` cannot reach this network. To test the
   published release instead of the workspace packages `lib.sh` links, temporarily rewrite
   each example's `@aztec-labs/*` dependency to `npm:@aztec-labs/*@<new_version>`, keeping
   special pins such as viem.

5. **Stop the network**, which kills only its process group and releases its ports:

   ```bash
   . ~/.cache/aztec-docs-cut/v<new_version>/env.sh && cd "$CUT"
   .claude/skills/release-docs/local_network.sh stop "$STATE"
   ```

Report pass or fail per guide, tutorial and example, with the exact doc line of each
failure. Fix guide and tutorial drift in the snapshot **and** the cut's source (a shared
source repair, Step 17); the examples have no snapshot copy, so fix only the source. Then
rerun Step 13. If validation cannot run, say so and list what was skipped.

### Step 16: Clean Up Old Versions

Work in the cut (`cd ~/.cache/aztec-docs-cut/v<new_version>/worktree/docs`) and append
every removed path to `$STATE/deleted.txt`: Step 17 removes the same paths on the
destination.

#### Developer docs

Identify the previous developer version for this release type from
`developer_version_config.json` as it was before Step 11 (`git show "$SYNCED:docs/developer_version_config.json"`).

**Delete nothing that another release type still points at.** Types share a version
whenever they were last released together, so the version being replaced is often still
current for another type. When testnet moves to `v6.0.0-rc.1` while mainnet stays on
`v5.2.0`, deleting `version-v5.2.0` removes mainnet's docs, which are also the site default
(`lastVersion: mainnetDeveloperVersion || ...`). Check every entry of both configs:

```bash
jq -c . developer_version_config.json network_version_config.json
```

If the old version is still any type's value in either config, skip the delete and say so.
A first cut of a release type has nothing to clean up.

**Ask the user for confirmation** before deleting. If approved, remove with `git rm -r`:

- `docs/developer_versioned_docs/version-<old_version>/`
- `docs/developer_versioned_sidebars/version-<old_version>-sidebars.json`
- the old entry in `developer_version_config.json`
- any version-named API docs under `docs/static/aztec-nr-api/` or
  `docs/static/typescript-api/` (the release-type folders are overwritten, not deleted)

#### Remove stale release type entries from version configs

If an entry in `developer_version_config.json` or `network_version_config.json` names a
version whose directory no longer exists, remove that entry: `update_docs_versions.sh`
reconciles one release type at a time and does not remove other types' orphans.

#### Network/operator docs (mainnet and testnet only)

Use the old network version recorded in Step 11b; skip on a first network release of this
type, and apply the same guard. **Ask the user for confirmation**, then remove:

- `docs/network_versioned_docs/version-<old_network_version>/`
- `docs/network_versioned_sidebars/version-<old_network_version>-sidebars.json`

and reconcile so `network_versions.json` drops it:

```bash
scripts/update_docs_versions.sh network
```

Verify neither `network_version_config.json` nor `network_versions.json` names the old
version.

### Step 17: Carry the Results Back to the Destination

First check that the destination's `docs/` has not moved since Step 2b, then record the
cut on its branch and list every change the cut made after Step 2e:

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
git -C "$DEST_ROOT" diff --quiet "$DEST" -- docs || echo "destination docs/ moved: stop and restart the cut"
cd "$CUT" && git add -A -- docs && git commit -m "docs: cut $LABS_TAG"
git -C "$CUT" diff --name-status "$SYNCED" HEAD -- docs
```

Sort every listed path into exactly one class:

1. **Release results**, copied per named path. Directories are synced with
   `rsync --delete`, files copied, and the Step 16 deletions run explicitly:

   ```bash
   . ~/.cache/aztec-docs-cut/v<new_version>/env.sh
   for d in developer_versioned_docs/version-$LABS_TAG network_versioned_docs/version-$LABS_TAG \
       static/aztec-nr-api/<release_type> static/typescript-api/<release_type>; do
     [ -d "$CUT/docs/$d" ] && rsync -a --delete "$CUT/docs/$d/" "$DEST_ROOT/docs/$d/"
   done
   for f in developer_versioned_sidebars/version-$LABS_TAG-sidebars.json \
       network_versioned_sidebars/version-$LABS_TAG-sidebars.json \
       developer_versions.json network_versions.json \
       developer_version_config.json network_version_config.json docs/networks.md; do
     [ -f "$CUT/docs/$f" ] && cp "$CUT/docs/$f" "$DEST_ROOT/docs/$f"
   done
   [ ! -s "$STATE/deleted.txt" ] || xargs git -C "$DEST_ROOT" rm -r -q -- <"$STATE/deleted.txt"
   ```

2. **Shared source repairs**: edits to files the destination also has and needs (source
   fixes from Steps 8, 8b, 10, 12 and 15, edits to existing snapshots). Carry them as
   reviewed hunks; the cut shares this repository's objects, so `-3` can merge them:

   ```bash
   git -C "$CUT" diff "$SYNCED" HEAD -- <file>... >"$STATE/shared-repairs.patch"
   git -C "$DEST_ROOT" apply -3 "$STATE/shared-repairs.patch"
   ```

   Read the patch before applying it, and resolve conflicts by hand (the migration notes
   usually conflict, Step 8). Never copy a source directory wholesale: the cut's copy is
   the tag's and would revert the destination's later work.

3. **Release-only changes** stay in the cut: `docs/.labs-sync`, the tag's content from the
   sync, `package.json`/`yarn.lock`, generated source pages (`aztec_js_reference.md`, the CLI
   references, `node-api-reference.md`), and tooling taken for the cut.

Commit on the destination, naming the four release inputs:

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
git -C "$DEST_ROOT" add -- <the paths of classes 1 and 2>
git -C "$DEST_ROOT" commit -F - <<EOF
docs: cut $LABS_TAG docs (<release_type>)

Content: aztec-node docs at $LABS_TAG ($(git -C "$CUT/labs" rev-parse HEAD)), merged onto $DEST
Labs code: aztec-node $LABS_TAG, built standalone (bb <BB_VERSION>, noir <NOIR_VERSION>)
Foundation dependency: @aztec-foundation/l1-artifacts <BB_VERSION>
Destination: $DEST_BRANCH at $DEST
EOF
```

Then, from the destination's `docs/`, rerun `yarn install --immutable`, `yarn test`,
`CONTEXT=production yarn build` (warning extract empty) and
`../scripts/labs_docs_sync.sh check`.

**Owner approval required.** Report `git -C "$DEST_ROOT" show --stat HEAD`, the classes
with their paths, and anything left unresolved. Pushing the branch and opening a PR are
the owner's call.

### Step 18: Tear Down

```bash
. ~/.cache/aztec-docs-cut/v<new_version>/env.sh
"$DEST_ROOT/.claude/skills/release-docs/local_network.sh" stop "$STATE"
git -C "$CUT" submodule deinit -f labs
git -C "$DEST_ROOT" worktree remove "$CUT"
```

The branch `docs-cut/v<new_version>` stays as the record of the cut until the destination
commit has merged. `$STATE` holds the CLI's home and logs; remove it once the release is out.

## Key Points

- **Always query the network first**: the RPC is the source of truth for the version and
  the contract addresses.
- **Re-derive, never carry forward**: every figure in `networks.md` is re-checked against
  its source (RPC, on-chain call, the tag's tooling), checksummed with
  `cast to-check-sum-address` and converted with `cast to-dec` (Step 9).
- **The Labs tag must exist**, and is only ever read through `labs/`.
- **One worktree per cut**: content, code and toolchain all come from the tag, and the
  environment check (Step 2g) proves it before anything is preprocessed.
- **CLI version must match**: the installed CLI generates the CLI reference and runs the
  local network.
- **Cut before building**: the authoritative build runs after the cut (Step 13).
- **Parity before the cut**: snippets render as aztec-node renders them, with links that
  name the tag (Step 11a).
- **Functionally validate before shipping**: guides, tutorials and examples against a local
  network of the release (Step 15).
- **User confirmation required** before deleting versioned docs and before adding
  migration notes.
- **Reconcile against the destination after cutting** (Step 12): the most commonly missed
  step.
- **Changes land on the destination as one commit** that names the release inputs; the
  owner decides on pushing.
- **API reference docs** use stable folders per release type; `#api_ref_version` resolves
  to the matching folder (`include_version.js`).
- **Update `docs/README.md`** when a release adds generation scripts or build steps.
