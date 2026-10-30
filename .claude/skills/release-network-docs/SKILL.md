---
name: release-network-docs
description: Update network/operator documentation for a mainnet or testnet release without touching developer docs
argument-hint: <RPC_URL>
---

# Release Network Docs

Update the Aztec network/operator documentation for a new release. Queries the network
for current info, updates contract addresses, cuts a versioned snapshot of the operator
docs in a temporary worktree, builds it, and carries the results back to the destination
branch as one commit. Nothing is pushed.

This is a **lightweight alternative** to `/release-docs`. Use it when only the
network/operator docs need updating (new contract addresses, a network upgrade, config
changes) and the developer docs remain unchanged.

Supports **mainnet** and **testnet** releases only: the operator docs have no devnet or
nightly versions. The release type is detected from the version string (Step 1); if it
does not self-identify, ask the user to confirm.

**This skill does NOT:**

- generate developer API docs (aztec-nr or TypeScript) or the developer CLI references
- update the developer version config or cut developer versioned docs
- update migration notes
- build aztec-node or need nargo or bb

**It does** regenerate the Node JSON-RPC API reference (Step 5a, from the pinned
checkout's `yarn-project` source at the tag) and the operators' `aztec start` reference
(Step 5b, from the release CLI).

## RPC endpoints: public vs operator

| Network | Public (goes in docs) | Operator (needs a key) |
| --- | --- | --- |
| Mainnet | `https://aztec-mainnet.drpc.org` | `canonical.mainnet.rpc.aztec-labs.com` |
| Testnet | `https://aztec-testnet.drpc.org` | `testnet-v<N>.rpc2.aztec-labs.com` |

Query the public endpoint first. Use an operator endpoint only when the public one does
not answer or does not yet report the release; its key is read from `AZTEC_NODE_API_KEY`,
exported before the session starts (commands inherit the environment as it was at
launch). Never paste the key into the conversation or onto a command line. Whatever you
query, `networks.md` publishes only the public endpoint: readers have no key, and the
gated hosts reject them (`403` from rpc2, `401 No API key found in request` from the Kong
gateways).

## Usage

```
/release-network-docs https://aztec-mainnet.drpc.org
/release-network-docs https://aztec-testnet.drpc.org
```

## Release model

The rules of `/release-docs` (its "Release model" section) apply unchanged:

- The docs are authored here and quote the aztec-node commit `docs/aztec-node.json` pins,
  through its checkout `$AZTEC_NODE_DIR`, never the `labs/` submodule.
- A Labs version is a tag of aztec-node and is only ever addressed in that checkout
  (`git -C "$AZTEC_NODE_DIR" …`) or on aztec-node's remote; this repository's tags of the
  same name are unrelated Foundation commits.
- Toolchain and package versions come from the pin (`node docs/scripts/aztec_node.mts env`).
- The cut runs in its own worktree (`$CUT`) created from the destination commit and moves
  the cut's pin to the Labs tag; the destination, and its pin, are not touched until Step 10.
- A release build links `docs/examples/` snippets to this repository at `DOCS_COMMIT`, the
  destination's base on `origin/next`, and the cut never changes `docs/examples/`.
- State lives in `~/.cache/aztec-docs-cut/<cut>/`, whose `env.sh` every
  command block from Step 2 on sources. `<cut>` is `network-v<new_version>`, or another
  name (`dryrun-network-v<new_version>`) for a rehearsal or a second cut of the same
  version; the cut's branch is `docs-cut/<cut>`. Step 2b refuses a `<cut>` whose state or
  branch exists.
- A step marked **Owner approval required.** stops until the owner says yes.
- Never stash: every worktree of this repository shares one stash stack.

v5 releases come from this repository's own `v5*` tags; see `/release-docs` "v5 releases".

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

- `nodeVersion` (e.g. `5.2.0` or `6.0.0-rc.3`)
- L1 contract addresses from `l1ContractAddresses`: registry, rollup, inbox, outbox,
  fee juice, staking asset, fee juice portal, fee asset handler, coin issuer,
  reward distributor, governance proposer, governance, and GSE (`gseAddress`, newer
  nodes only)
- L2 protocol contract addresses from `protocolContractAddresses`: instance registry,
  class registry, multi-call entrypoint, fee juice
- `rollupVersion`
- `l1ChainId`

**Detect release type** from the version string:

- Contains `mainnet`, or is a plain semver like `5.2.0` → `mainnet`
- Contains `testnet` → `testnet`
- Contains `rc` → usually `testnet`; confirm with the user, since an rc can ship to mainnet
- Contains `devnet` → **abort**: network docs have no devnet version; use `/release-docs`
- Otherwise ask the user (`mainnet` or `testnet`)

### Step 2: Prepare the Cut Worktree

#### 2a. The Labs tag must exist

```bash
git ls-remote --exit-code --tags https://github.com/aztec-labs-eng/aztec-node.git refs/tags/v<nodeVersion>
```

**Abort if it exits non-zero**: the release has not been tagged. Ask aztec-node's remote,
never this repository, whose `v6…` tags are unrelated. Below, `<new_version>` is
`<nodeVersion>`, or the target version the user confirms when the network has not upgraded
yet.

#### 2b. Record the destination

Run from the destination checkout (the branch the cut lands on, usually `next`). It must
be clean apart from the expected ` M labs`.

```bash
cd "$(git rev-parse --show-toplevel)"
git diff --quiet --ignore-submodules=all && git diff --cached --quiet --ignore-submodules=all \
  || { echo "commit or discard the changes first" >&2; exit 1; }
git fetch origin next
DOCS_COMMIT=$(git merge-base HEAD origin/next)
git diff --quiet "$DOCS_COMMIT" HEAD -- docs/examples \
  || { echo "docs/examples differs from origin/next: land those changes on next first" >&2; exit 1; }
LABS_TAG=v<new_version>
CUT_ID=<cut>
STATE=$HOME/.cache/aztec-docs-cut/$CUT_ID
[ ! -e "$STATE" ] && ! git show-ref --verify -q "refs/heads/docs-cut/$CUT_ID" \
  || { echo "$STATE or docs-cut/$CUT_ID exists: pick another <cut>, or remove that cut first" >&2; exit 1; }
CUT=$STATE/worktree
CLI_HOME=$STATE/cli-home
mkdir -p "$STATE" "$CLI_HOME"
cat >"$STATE/env.sh" <<EOF
LABS_TAG=$LABS_TAG
CUT_ID=$CUT_ID
STATE=$STATE
CUT=$CUT
CLI_HOME=$CLI_HOME
DEST_ROOT=$(pwd)
DEST=$(git rev-parse HEAD)
DEST_BRANCH=$(printf %q "$(git branch --show-current)")
DEST_PIN_REF=$(node -p 'require("./docs/aztec-node.json").ref')
DOCS_COMMIT=$DOCS_COMMIT
export AZTEC_NODE_DIR=$STATE/aztec-node
docs_env() {
  local pin; pin=\$(node "$CUT/docs/scripts/aztec_node.mts" env) || return 1
  eval "\$pin"
  COMMIT_TAG=$LABS_TAG RELEASE_TYPE=<release_type> <TAG_VAR>=<new_version> DOCS_COMMIT=$DOCS_COMMIT "\$@"
}
aztec_cli() {
  [ -x $CLI_HOME/.aztec/current/bin/aztec ] || { echo "no release CLI in $CLI_HOME" >&2; return 1; }
  env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME -u NARGO_HOME -u AZTEC_HOME HOME=$CLI_HOME \\
    PATH=$CLI_HOME/.aztec/current/bin:$CLI_HOME/.aztec/bin:\$PATH "\$@"
}
EOF
```

`<TAG_VAR>` is `MAINNET_TAG` or `TESTNET_TAG`, and its value has no `v`; `COMMIT_TAG`
keeps its `v` (the preprocessor emits it as a git ref). `docs_env` checks the cut's pin
and checkout and exports the pin's versions before running a docs command; it fails when
they disagree. `AZTEC_NODE_DIR` keeps the cut's checkout outside the worktree, as
`/release-docs` Step 2b explains.

#### 2c. Create the worktree and move its pin to the tag

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$DEST_ROOT" worktree add -b "docs-cut/$CUT_ID" "$CUT" "$DEST"
cd "$CUT/docs" && node scripts/aztec_node.mts pin "$LABS_TAG"
```

`pin` checks the tag out into `$AZTEC_NODE_DIR`, writes its commit and toolchain into
`docs/aztec-node.json`, and prints every remaining drift with its fix. Expect
`docs/package.json pins @aztec-foundation/l1-artifacts …` whenever the tag's bb differs from
the destination's; take the version from the pin, install and commit:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.devDependencies["@aztec-foundation/l1-artifacts"] = require("./aztec-node.json").toolchain.l1Artifacts;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
yarn install
node scripts/aztec_node.mts check && echo "pin: ok"
git add aztec-node.json package.json yarn.lock && git commit -m "docs: pin aztec-node $LABS_TAG"
echo "PINNED=$(git rev-parse HEAD)" >>"$STATE/env.sh"
git -C "$CUT" diff --quiet "$DOCS_COMMIT" HEAD -- docs/examples && echo "examples: ok"
```

`check` must print `pin: ok` (the checkout is the tag's commit and clean, and the pin's bb
and `docs/package.json`'s l1-artifacts equal the tag's `BB_VERSION`), and `examples: ok`
must follow. Never initialize `labs/` in the cut and run no root `make` target there. The
release inputs (`docs/docs-operate/`, `docs/sidebars-operate.js`) are the destination's
content; `docs/docs/networks.md` and the existing snapshots are the destination's live
copies, which Step 10 copies back.

### Step 3: Identify and Resolve Missing Contract Addresses

The `networks.md` L1 table includes contracts that `aztec_getNodeInfo` does not return.
Resolve them in three tiers. Determine the L1 RPC from `l1ChainId`: `1` → Ethereum
mainnet (`https://eth.drpc.org`), `11155111` → Sepolia
(`https://ethereum-sepolia-rpc.publicnode.com`; drpc serves Sepolia only on a paid plan);
both are keyless. Convert on-chain hex with `cast to-dec`, never by eye.

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

Only **Staking Registry** has no public getter. Obtain it from the deployment script's
output (`DeployAztecL1Contracts.s.sol` prints JSON with all addresses); ask the user if
they have it.

The release's L1 contract sources are the `@aztec-foundation/l1-artifacts` package
installed in the cut (`$CUT/docs/node_modules/@aztec-foundation/l1-artifacts/l1-contracts/`,
with `src/`, `script/` and compiled `out/`), whose version Step 2c checked against the
tag's `BB_VERSION`. This repository's own `l1-contracts/` is the Foundation's development
tree, not the release's: do not read it for a release.

#### Tier 3: Manual / confirm unchanged

No on-chain getter. Ask the user for new addresses, or confirm the existing
`networks.md` values still hold (`cast code <addr>` returns bytecode):

- **Slash Factory** (`N/A` when the release does not deploy it)
- **Register New Rollup Version Payload**

Present a summary table showing which addresses came from the RPC, which were queried
on-chain, which came from deployment output, and which are unchanged. Get user
confirmation before proceeding.

### Step 4: Update Network Info and Contract Addresses

**File:** `docs/docs/networks.md` in the cut (the destination's copy, which the cut started from)

Update the column matching the release type (**Alpha (Mainnet)** or **Testnet**):

- **Network Technical Information table**: the **Version** row and the rollup version.
  The Version row is the field most often missed; read it from the public endpoint and
  check both columns. The RPC endpoint is the public one from the table above: change it
  only when the user provides a new public URL, after verifying it answers without a key
  and reports the version being cut. Keep bootnodes and block explorer links unless the
  user requests changes.
- **L1 Contract Addresses table**: every address from the RPC, the on-chain queries and
  the user. Link format: `https://etherscan.io/address/0xADDR` (mainnet),
  `https://sepolia.etherscan.io/address/0xADDR` (testnet); `N/A` where not deployed.
- **L2 Contract Addresses table**: any change in `protocolContractAddresses`. SponsoredFPC
  is "Not deployed" on mainnet.

Then grep the cut for the network's old addresses:

```bash
grep -r "<old_address>" ~/.cache/aztec-docs-cut/<cut>/worktree/docs/
```

Hits outside `docs/docs/networks.md` are shared source repairs (Step 10). When the public
testnet RPC changes, `NODE_URL` in every
`docs/developer_versioned_docs/version-*/getting_started_on_testnet.md` must follow
(`/release-docs` Step 10).

Re-verify every figure against its source of truth before writing it; never carry a value
forward or transcribe one by hand. Follow the "Re-verify every figure against its source of
truth" subsection of `/release-docs` Step 9: EIP-55 checksum every address with
`cast to-check-sum-address`, convert hex with `cast to-dec`, read the rollup version from
`getVersion()` on each network's rollup, confirm the L1 chain id with `cast chain-id`,
refresh the governance parameters from the Governance, Governance Proposer and Tally
Slashing Proposer contracts (Governance's `getConfiguration()` returns seconds) along with
the withdrawal delay and every page that states them, and diff
against any human-owned deployment data, resolving discrepancies on chain and then with the
owner.

### Step 5: Review Operator Docs Content (Optional)

Ask the user whether `docs/docs-operate/` needs content changes for the release:

- new or changed configuration options, environment variables or CLI flags
- updated setup instructions or prerequisites
- new or modified troubleshooting entries

Apply them to the cut's `docs/docs-operate/`. Changes the destination also needs are
shared source repairs (Step 10). If there are none, skip to Step 5a.

### Step 5a: Regenerate Node API Reference

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn generate:node-api-reference
```

It writes `docs/docs-operate/operators/reference/node-api-reference.md` from the
interfaces and Zod schemas in the checkout's `yarn-project/stdlib/src/interfaces/` at the
tag, reading TypeScript source directly with `docs/node_modules/typescript` (no build).
Verify the method totals it prints. It warns about methods missing from `METHOD_GROUPS` in
`docs/scripts/node_api_reference_generation/generate_node_api_reference.mts`, which it
renders under "Other methods": add each to its group and rerun; the destination needs the
same edit (a shared source repair, Step 10).

### Step 5b: Regenerate Operator CLI Reference

`docs/docs-operate/operators/reference/cli-reference.md` is `aztec start --help` of the
release CLI. Install the release into its own home, so nothing changes in the real one:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
pin=$(node scripts/aztec_node.mts env) || exit 1
eval "$pin"
env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME -u NARGO_HOME -u NARGO -u AZTEC_HOME \
  HOME="$CLI_HOME" NON_INTERACTIVE=1 bash <(curl -fsSL "https://install.aztec.network/$AZTEC_VERSION")
aztec_cli aztec --version
aztec_cli ./scripts/cli_reference_generation/generate_operator_cli_ref.sh -v "$LABS_TAG"
grep -n -e "$CLI_HOME" -e /home/ -e /Users/ docs-operate/operators/reference/cli-reference.md
```

`AZTEC_VERSION` is the pin's; `aztec --version` must print it, and the generator refuses a
mismatch. The generator runs the CLI under an environment allowlist and refuses to print
or write a capture that carries a key-shaped default (`docs/scripts/lib/key_defaults.sh`). The
installer runs with `HOME` set to `$CLI_HOME`, so its node, foundry, nargo and
shell-profile edits stay out of the real home. Clearing `NARGO_HOME` and `AZTEC_HOME`
keeps noirup and the toolchain under that home too (with `NARGO_HOME` set, noirup lands
in the real home and the install fails), and clearing `NARGO` stops the installer from
copying that binary in as the release's nargo. `NON_INTERACTIVE=1` skips the prompt and
the closing `exec $SHELL`, which would leave the terminal in a shell whose home is
`$CLI_HOME`. foundryup refuses to install while any `anvil` runs on the host
(`'anvil' is currently running`): wait for it to exit, and never stop another run's anvil.

The generator retries until the capture contains the help's last line, so the file ends
with `Starts Aztec TXE with options` and a closing fence. Help defaults derived from `$HOME`
contain `$CLI_HOME`: normalise them to `~/.aztec/...`, after which the grep prints nothing.

### Step 5c: Check the Operator Changelog Covers This Release

The snapshot (Step 7) includes `docs/docs-operate/operators/reference/changelog/`, which
`/updating-changelog` maintains on the destination; for the first release of a major the
page usually lands after the tag, so check the destination commit:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
major=$(jq -r '."."' "$AZTEC_NODE_DIR/.release-please-manifest.json" | cut -d. -f1)
git -C "$DEST_ROOT" show "$DEST:docs/docs-operate/operators/reference/changelog/v$major.md" >/dev/null \
  && echo "page present" || echo "MISSING: v$major.md"
git -C "$DEST_ROOT" show "$DEST:docs/docs-operate/operators/reference/changelog/index.md" | grep -n '^### ' | head -3
git -C "$DEST_ROOT" show "$DEST:docs/sidebars-operate.js" | grep -n "changelog/v$major"
```

The page exists (or its minor-qualified name, such as `v5.2.md`), `index.md` has a `### `
entry for this release's major (and minor, once the series has more than one), and the
sidebar lists the page. The cut started from the destination, so its copy is the
destination's.

**Owner approval required.** If any check fails, stop and report which: the page lands on
the destination first (`/updating-changelog`), through a PR the owner opens and merges,
and the cut restarts from Step 2 (the destination has moved).

### Step 6: Preprocess, Check and Build

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn build >"$STATE/build.log" 2>&1; echo "build: $?"
docs_env sh -c 'echo "aztec-node: $AZTEC_NODE_COMMIT  aztec-packages: $DOCS_COMMIT"'
grep -rhoE 'github\.com/aztec-labs-eng/aztec-node/blob/[^/)"]+' processed-docs/docs-operate/ processed-docs/docs/ | sort | uniq -c
grep -rhoE 'github\.com/AztecProtocol/aztec-packages(/(blob|tree)/[^/)"]+(/[^/)"#?]+){0,2}|/?", *tag *= *"[^"]+"(, *directory *= *"[^/"]+(/[^/"]+)?)?)|git clone [^`]*AztecProtocol/aztec-packages' \
  processed-docs/docs-operate/ processed-docs/docs/ | sort | uniq -c
```

- The build must exit 0. A snippet whose file or marker the tag lacks fails it: the page
  quotes code newer than the release (`/release-docs` Step 11 says what to do). Fix broken
  redirect targets (`validate_redirect_targets.sh`), broken API reference links
  (`validate_api_ref_links.sh`) and spelling, and iterate.
- Every aztec-node link must name `AZTEC_NODE_COMMIT`; `include_code.js` writes snippet
  links with it, so another ref is a hand-written link, and a moving one (`main`, `next`)
  gets the tag in the snapshot.
- Classify every hit of the last command by path, as `/release-docs` Step 11 does: Labs
  code (`noir-projects/`, `yarn-project/`) names aztec-node at the tag in the snapshot,
  `docs/examples` names `DOCS_COMMIT`, Foundation code (`l1-contracts/`, `barretenberg/`)
  takes `#include_foundation_version`, and anything else `v<l1-artifacts version>` or
  `next`.

The build preprocesses into `processed-docs/`, which the cut snapshots.

### Step 7: Cut Network Versioned Docs

Record the current network version for this release type first; Step 8 deletes it:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
cat network_version_config.json
docs_env yarn docusaurus docs:version:network "$LABS_TAG"
scripts/update_docs_versions.sh network <release_type> "$LABS_TAG"
grep -rnE '@next|@latest|VERSION=latest|tag *= *"next"|#include_aztec_version|#include_foundation_version|#release_version|#release_network|#include_code' \
  network_versioned_docs/version-v<new_version>/
```

The version string always has the `v` prefix. Verify:

- `network_version_config.json` maps the release type to the new version
- `network_versioned_docs/version-v<new_version>/` exists and the grep prints nothing (every
  macro resolved; `#release_network` became `mainnet` or `testnet`)
- `network_versioned_sidebars/version-v<new_version>-sidebars.json` exists

`network_versions.json` may still list the old version (its directory still exists) until
Step 8.

### Step 7a: Check the Operator Content Against the Tag

The cut's operator pages are the destination's, written against the destination's pin
(`DEST_PIN_REF`); the snapshot must describe the tag. When the two refs name different
commits, list the code between them, as `/release-docs` Step 12 does. `<old_version>` is
the network version Step 7 recorded, with its `v`; fetch both histories down to it:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
echo "destination pin: $DEST_PIN_REF  release: $LABS_TAG"
git -C "$AZTEC_NODE_DIR" fetch --depth 1 origin tag <old_version>
git -C "$AZTEC_NODE_DIR" fetch --shallow-exclude=<old_version> origin tag "$LABS_TAG" tag "$DEST_PIN_REF"
git -C "$AZTEC_NODE_DIR" log --oneline --left-right --cherry-pick "$LABS_TAG...$DEST_PIN_REF" -- yarn-project/
```

`>` commits are in the destination's pin but not in the release. For each that changes
what an operator sees (a configuration option, environment variable, CLI flag, default or
RPC method), grep `network_versioned_docs/version-v<new_version>/` for it and check it
against `$AZTEC_NODE_DIR` (the tag). Fix the snapshot only: those fixes are release-only
(Step 10). Present what was found, fixed and skipped. The generated references (Steps 5a
and 5b) already come from the tag.

When the previous version is not a Labs tag (v5 and earlier are tags of this repository),
use `--shallow-since=<date of that release>` instead of `--shallow-exclude`.

### Step 8: Clean Up Old Network Version

Work in `~/.cache/aztec-docs-cut/<cut>/worktree/docs`, use the old version
recorded in Step 7, and append every removed path to `$STATE/deleted.txt`, one per line
and written as listed below (from the repository root, `docs/...`); Step 10 removes the
same paths on the destination. On a first release of this type, skip.

**Delete nothing that another release type still points at.** Types share a version
whenever they were last released together, so the version being replaced is often still
current for another type; deleting it removes that type's live docs, and mainnet's are the
site default. Check every entry of both configs:

```bash
jq -c . developer_version_config.json network_version_config.json
```

If the old version is still any type's value in either config, skip the delete and say so.

**Ask the user for confirmation** before deleting. If approved, remove with `git rm -r`:

- `docs/network_versioned_docs/version-<old_version>/`
- `docs/network_versioned_sidebars/version-<old_version>-sidebars.json`

Then reconcile so `network_versions.json` drops it, and verify neither
`network_version_config.json` nor `network_versions.json` names the old version:

```bash
scripts/update_docs_versions.sh network
```

A version no network reads is served at its own name (`/operate/<old_version>/*`), and
the live sitemap lists those URLs. For each deleted version production served there, add
a redirect to `docs/netlify.toml`, next to the `/operate/testnet/*` rule:

```toml
[[redirects]]
    from = "/operate/<old_version>/*"
    to = "/operate/:splat"
    status = 301
```

Then check every live URL still resolves (the build must be current):

```bash
FAIL_ON_ORPHAN=1 scripts/check_orphaned_urls.sh https://docs.aztec.network/sitemap.xml
```

That matches a redirect's source only, not its target. Check the targets too, and add a
specific redirect above the wildcard for any page the default version lacks:

```bash
curl -fsSL https://docs.aztec.network/sitemap.xml | grep -oE '<loc>[^<]+</loc>' \
  | sed -E 's#<loc>https?://[^/]+##; s#</loc>##' | grep '^/operate/<old_version>/' \
  | sed 's#^/operate/<old_version>/#/operate/#' >"$STATE/redirect-targets.txt"
FAIL_ON_ORPHAN=1 scripts/check_orphaned_urls.sh "$STATE/redirect-targets.txt"
```

### Step 9: Final Build

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn build >"$STATE/build.log" 2>&1; echo "dev build: $?"
CONTEXT=production docs_env yarn build >"$STATE/build-production.log" 2>&1; echo "production build: $?"
scripts/check_warnings.sh "$STATE/build.log" "$STATE/build-production.log"
```

Both builds must exit 0 and the warning extract must be empty; a warning that cannot be
fixed goes to the owner.

### Step 10: Carry the Results Back to the Destination

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$DEST_ROOT" diff --quiet "$DEST" -- docs || { echo "destination docs/ moved: restart the cut" >&2; exit 1; }
cd "$CUT" && git add -A -- docs && git commit -m "docs: cut $LABS_TAG network docs"
git -C "$CUT" diff --quiet "$DOCS_COMMIT" HEAD -- docs/examples \
  || { echo "the cut changed docs/examples: land the change on next and restart the cut" >&2; exit 1; }
git -C "$CUT" diff --name-status "$PINNED" HEAD -- docs
```

Sort every listed path into exactly one class:

1. **Release results**, copied per named path, with the Step 8 deletions run explicitly:

   ```bash
   . ~/.cache/aztec-docs-cut/<cut>/env.sh
   d=network_versioned_docs/version-$LABS_TAG
   rsync -a --delete "$CUT/docs/$d/" "$DEST_ROOT/docs/$d/"
   for f in network_versioned_sidebars/version-$LABS_TAG-sidebars.json \
       network_versions.json network_version_config.json docs/networks.md; do
     cp "$CUT/docs/$f" "$DEST_ROOT/docs/$f"
   done
   [ ! -s "$STATE/deleted.txt" ] || while IFS= read -r p; do
     git -C "$DEST_ROOT" rm -r -q -- "$p"
   done <"$STATE/deleted.txt"
   ```

   `git rm` stages the deletions; they are never passed to `git add` below.

2. **Shared source repairs**: edits to files the destination also has that hold at the
   destination's pin too (Steps 4, 5 and 6; edits to existing snapshots). Carry them as
   reviewed hunks; read the patch before applying it:

   ```bash
   git -C "$CUT" diff "$PINNED" HEAD -- <file>... >"$STATE/shared-repairs.patch"
   git -C "$DEST_ROOT" apply -3 "$STATE/shared-repairs.patch"
   ```

3. **Release-only changes** stay in the cut: the pin commit (`docs/aztec-node.json`,
   `docs/package.json`, `docs/yarn.lock`), the regenerated `node-api-reference.md` and
   `cli-reference.md` sources, and source edits only the release needs (Steps 6 and 7a).

A destination commit cherry-picked into the cut also shows in this list: it is already on
the destination, so none of its changes is ever carried.

Commit on the destination, naming the release inputs; the commit runs only if `git add`
succeeds:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
pin=$(node "$CUT/docs/scripts/aztec_node.mts" env) || exit 1
eval "$pin"
git -C "$DEST_ROOT" add -- <the existing paths of classes 1 and 2> &&
git -C "$DEST_ROOT" commit -F - <<EOF
docs: cut $LABS_TAG network docs (<release_type>)

Content: docs/ at $DEST
Labs code: aztec-node $AZTEC_NODE_REF ($AZTEC_NODE_COMMIT) source (node API reference), CLI $AZTEC_VERSION (aztec start reference)
Foundation dependency: @aztec-foundation/l1-artifacts $L1_ARTIFACTS_VERSION
Snippet links into this repository: $DOCS_COMMIT
Destination: $DEST_BRANCH at $DEST
EOF
```

Then rerun the destination's own checks, without the cut's `AZTEC_NODE_DIR`:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$DEST_ROOT/docs" && unset AZTEC_NODE_DIR
yarn install --immutable && yarn test
CONTEXT=production yarn build >"$STATE/destination-build.log" 2>&1; echo "production build: $?"
scripts/check_warnings.sh "$STATE/destination-build.log"
./bootstrap.sh check
```

**Owner approval required.** Report `git -C "$DEST_ROOT" show --stat HEAD`, the classes
with their paths, the release-only edits with the reason for each, the Step 7a findings,
and anything left unresolved. Pushing the branch and opening a PR are the owner's call.

### Step 11: Tear Down

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$DEST_ROOT" worktree remove "$CUT"
```

`worktree remove` refuses while the cut has uncommitted changes (Step 10 committed
everything); ignored files such as `docs/node_modules/` go with it. The branch
`docs-cut/<cut>` stays as the record of the cut until the destination
commit has merged; remove `$STATE` (the CLI's home, the checkout and the logs) once the
release is out.

### Step 12: Refresh the Protected URL Snapshot

Run this once this release's operator docs are live in production. A draft or preview
deploy does not
count, because the snapshot records what docs.aztec.network serves. The script adds the
live sitemap's URLs to `docs/snapshots/published-urls.txt` and keeps every URL already
listed, so a retired page stays protected and keeps needing its redirect. The default
version is served at unversioned paths, so expect no `/v<new_version>/` URLs.

On a new branch from the branch the cut merged into:

```bash
cd docs && ./scripts/refresh_url_snapshot.sh
git diff -- snapshots/published-urls.txt
git commit -m "docs: refresh the published URL snapshot after v<new_version>" -- snapshots/published-urls.txt
```

Apart from the header's date, the diff only adds URLs. Pushing it is the owner's call.

## Key Points

- **Mainnet and testnet only**: abort on devnet and direct the user to `/release-docs`.
- **The Labs tag must exist**, and is only ever read through the cut's checkout or
  aztec-node's remote, never `labs/`. The operator pages are the destination's; the cut's
  pin moves to the tag in a dedicated worktree, and versions come from that pin.
- **Always query the network first**: the RPC is the source of truth for the version and
  the L1/L2 contract addresses; the missing ones come from on-chain getters, the
  deployment output or the user (Step 3).
- **`networks.md` publishes the public endpoint**, never an operator one.
- **Prerequisites**: `yarn`, `curl`/`jq`, `cast`, and the release CLI installed into the
  cut's own home (Step 5b). No aztec-node build, nargo or bb.
- **Build before cutting and after**: the cut snapshots the build's `processed-docs/`, and
  the final builds (Step 9) validate the snapshot.
- **User confirmation required** before deleting old versioned docs and before content
  changes to the operator docs.
- **Check the operator content against the tag** (Step 7a): the pages follow the
  destination's pin, which may be ahead of the release.
- **Network version config only**: this skill changes `network_version_config.json` and
  `network_versions.json`, never the developer configs.
- **Changes land on the destination as one commit**; the owner decides on pushing.
