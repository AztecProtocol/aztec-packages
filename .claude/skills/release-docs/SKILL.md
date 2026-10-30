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

- **The docs are authored here; the code they quote is pinned.** `docs/aztec-node.json`
  pins the aztec-node (Labs) commit that `#include_code` snippets, the reference checks and
  the API generators read, together with its toolchain versions. They read it through a
  checkout of that commit, `$AZTEC_NODE_DIR` (default `docs/.aztec-node/tree`), which
  `docs/scripts/aztec_node.mts` keeps. The `labs/` prefix in snippet paths names that
  checkout, never the `labs/` submodule, which is the Foundation's build input.
- **Labs versions are only addressed in the checkout.** This repository has its own tags
  with the same names (`v6.0.0-rc.1`, …) on unrelated commits, so a Labs version is only
  ever a revision in `git -C "$AZTEC_NODE_DIR" …` or on aztec-node's remote. A root
  checkout of `v6…` is the Foundation tree.
- **Toolchain versions come from the pin.** Every bb, nargo, aztec CLI and `@aztec-labs/*`
  or `@aztec-foundation/*` version below comes from `node docs/scripts/aztec_node.mts env`
  (`AZTEC_VERSION`, `BB_VERSION`, `NOIR_VERSION`, `L1_ARTIFACTS_VERSION`, and `NARGO` and
  `BB` once provisioned). In the cut that is the release tag's.
- **The cut runs in its own worktree** (`$CUT`), created from the destination commit; it
  moves the cut's pin to the Labs tag. The destination checkout is not touched until Step 17,
  and its pin never moves: the destination's dev docs keep following their own pin.
- **Release inputs**, recorded in the commit that lands the cut (Step 17):

  | Input | Source |
  | --- | --- |
  | Content revision | this repository's `docs/` at the destination commit |
  | Labs code revision | the cut's pin, moved to the tag: its commit, and the published bb and nargo it names |
  | Foundation dependency revision | `@aztec-foundation/l1-artifacts` at the tag's `BB_VERSION` |
  | Snippet links into this repository | `DOCS_COMMIT`: the destination's base on `origin/next` |
  | Destination | the branch and commit the cut started from |

- **Snippet links.** Snippets under `labs/` link to aztec-node at the pinned commit; snippets
  from `docs/examples/` link to this repository at `DOCS_COMMIT`, which a release build
  requires (`include_code.js` refuses to preprocess a `RELEASE_TYPE` other than `nightly`
  without it). The cut never changes `docs/examples/`, so those links show the lines the
  snapshot quotes.
- **Examples build from the pin.** `docs/examples/bootstrap.sh` builds them with the pin's
  published toolchain against the default checkout, `docs/.aztec-node/tree`, which their
  Nargo.toml path dependencies name; it ignores `AZTEC_NODE_DIR`. In the cut that is a
  second checkout of the tag's commit, so the examples the snapshot quotes build and run
  at the tag (Step 15).
- **State** lives in `~/.cache/aztec-docs-cut/<cut>/`: `env.sh` (sourced by every
  command block from Step 2 on, since shell state does not carry over between commands),
  the worktree, the CLI's home, the local network and logs. `<cut>` is `v<new_version>`;
  a rehearsal or a second cut of a version this machine has already cut takes another
  name (`dryrun-v<new_version>`), and the cut's branch is `docs-cut/<cut>`. Step 2b refuses
  a `<cut>` whose state or branch exists, so no cut overwrites another's.
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

- On error `-32601` (dRPC used to serve only the legacy `node_` namespace), repeat with
  `node_getNodeInfo`.
- `403 {"message":"Forbidden"}` (rpc2) or `401 No API key found in request` (Kong) means a
  missing or wrong key for that endpoint, not an endpoint that is down.

Parse the response to extract:

- `nodeVersion` (e.g. `6.0.0-rc.3`)
- L1 contract addresses from `l1ContractAddresses`: registry, rollup, inbox, outbox,
  fee juice, staking asset, fee juice portal, fee asset handler (absent where none is
  deployed, as on mainnet), coin issuer,
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
- Otherwise (`rc` tags and plain versions included) ask the user which release types will
  read this version: an `rc` can be a testnet or a mainnet release, and one version can
  serve both (v6.0.0 did)

Store all values for the following steps.

#### Pre-release workflow

If the user wants docs for a target version that differs from the `nodeVersion` the
RPC returns (the network still runs `6.0.0-rc.1` and the docs are for `6.0.0-rc.3`),
confirm the target version and use it as `<new_version>` throughout. Its Labs tag must
still exist. Contract addresses from the RPC reflect the current network; ask the user
whether any will change at upgrade time.

#### One version, several release types

A snapshot renders one `RELEASE_TYPE`: its `#if(<type>)` branches, and the other types'
`#include_<type>_version` from their `<TAG_VAR>` or else the pre-cut config. When another
type will also read this version, its readers get the cut type's content. The v6.0.0
snapshot served testnet mainnet's governance timings, and a mainnet-only rehearsal's
testnet guide said `5.2.0` while testnet ran 6.0.0. **Owner approval required.** Count
the pages with release-type branches and get the owner's call on which type the shared
snapshot renders:

```bash
grep -rlE '#if\((devnet|testnet|mainnet|nightly)\)' docs/docs-developers/ docs/docs-operate/ | wc -l
```

Then set each other type's `<TAG_VAR>` in `docs_env` (2b) to the version its network
reports in Step 1, and run Step 11b's `update_docs_versions.sh` once per type.

### Step 2: Prepare the Cut Worktree

#### 2a. The Labs tag must exist

```bash
git ls-remote --exit-code --tags https://github.com/aztec-labs-eng/aztec-node.git refs/tags/v<new_version>
```

**Abort if it exits non-zero**: the release has not been tagged. Ask aztec-node's remote,
never this repository, whose `v6…` tags are unrelated.

#### 2b. Record the destination

Run from the destination checkout: the branch the cut lands on (`next`, or the docs
branch being prepared). It must be clean apart from the expected ` M labs`.

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
! git show-ref --verify -q "refs/heads/docs-cut/$CUT_ID" && mkdir -p "${STATE%/*}" && mkdir "$STATE" \
  || { echo "$STATE or docs-cut/$CUT_ID exists: pick another <cut>, or remove that cut first" >&2; exit 1; }
CUT=$STATE/worktree
CLI_HOME=$STATE/cli-home
mkdir "$CLI_HOME"
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
CLI_PATH=$CUT/docs/.aztec-node/cli/node_modules/.bin:$CUT/docs/.aztec-node/bin:$STATE/aztec-node/aztec-up/bin/0.0.1
INSTALLER_PATH=$CLI_HOME/.aztec/current/bin:$CLI_HOME/.aztec/bin
docs_env() {
  local pin; pin=\$(node "$CUT/docs/scripts/aztec_node.mts" env) || return 1
  eval "\$pin"
  COMMIT_TAG=$LABS_TAG RELEASE_TYPE=<release_type> <TAG_VAR>=<new_version> <OTHER_TAG_VARS> DOCS_COMMIT=$DOCS_COMMIT "\$@"
}
aztec_cli() {
  [ -x $CUT/docs/.aztec-node/cli/node_modules/.bin/aztec ] || { echo "no release CLI: run Step 3" >&2; return 1; }
  env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME -u NARGO_HOME -u AZTEC_HOME \\
    -u ANVIL_BIN -u FORGE_BIN -u CAST_BIN HOME=$CLI_HOME PATH=\$CLI_PATH:\$PATH "\$@"
}
EOF
```

`<TAG_VAR>` is `DEVNET_TAG`, `TESTNET_TAG` or `MAINNET_TAG`, and its value has no `v`.
`<OTHER_TAG_VARS>` sets the other types' tags to the versions their networks run
(`TESTNET_TAG=6.0.0`), or is empty; see "One version, several release types".
`docs_env` checks the cut's pin and checkout, exports the pin's versions and binaries
(`aztec_node.mts env`), and runs a docs command with the release variables; it fails
when the pin and the checkout disagree. `aztec_cli` runs the release CLI (Step 3) with its
own home, and `CLI_PATH` first on `PATH`; Step 15 sets `CLI_PATH=$INSTALLER_PATH` to run
the installer's layout instead. `COMMIT_TAG` keeps its `v`: `#include_aztec_version` emits it as a git ref, and
`#include_version_without_prefix` falls back to `latest` when it lacks one.

`DOCS_COMMIT` is the destination's base on `origin/next`, and the check above proves the
destination's `docs/examples/` equals it, so links to it resolve and show the snapshot's
lines. `AZTEC_NODE_DIR` puts the cut's checkout outside the worktree: nargo run anywhere
under `docs/` takes `docs/Nargo.toml` as its workspace, and nothing run in the checkout
(2d, Step 6) may see it.

#### 2c. Create the worktree and move its pin to the tag

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$DEST_ROOT" worktree add -b "docs-cut/$CUT_ID" "$CUT" "$DEST"
cd "$CUT/docs" && node scripts/aztec_node.mts pin "$LABS_TAG"
```

`pin` checks the tag's commit out into `$AZTEC_NODE_DIR` (a shallow clone without
aztec-node's own `docs/`), writes the commit and the tag's `BB_VERSION` and `NOIR_VERSION`
into `docs/aztec-node.json`, then prints every remaining drift with its fix and exits 1
on any. Expect one whenever the tag's bb differs from the destination's:
`docs/package.json pins @aztec-foundation/l1-artifacts …: set it to … and run yarn install`.
Take the version from the pin, install, provision the published binaries and commit:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.devDependencies["@aztec-foundation/l1-artifacts"] = require("./aztec-node.json").toolchain.l1Artifacts;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
yarn install
node scripts/aztec_node.mts provision nargo bb
node scripts/aztec_node.mts check
git add aztec-node.json package.json yarn.lock && git commit -m "docs: pin aztec-node $LABS_TAG"
echo "PINNED=$(git rev-parse HEAD)" >>"$STATE/env.sh"
```

`provision` installs bb from its npm package (checked against the registry's integrity)
and nargo from noir's release archive, at the pinned versions, into `docs/.aztec-node/bin`.
Never initialize `labs/` in the cut and run no root `make` target there: the cut reads
aztec-node only through its checkout, and those targets build `labs/` in Foundation mode
with nargo and bb this repository builds.

#### 2d. Install the tag's yarn-project from its published packages

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
pin=$(node scripts/aztec_node.mts env) || exit 1
eval "$pin"
cd "$AZTEC_NODE_DIR/yarn-project" && yarn install --immutable --mode=skip-build || exit 1
PUB=$STATE/published && rm -rf "$PUB" && mkdir -p "$PUB" || exit 1
yarn workspaces list --json --no-private >"$PUB/workspaces.jsonl" &&
  node -e 'for (const l of require("fs").readFileSync(0, "utf8").trim().split("\n")) { const w = JSON.parse(l); console.log(w.name, w.location); }' \
    <"$PUB/workspaces.jsonl" >"$PUB/workspaces.txt" && [ -s "$PUB/workspaces.txt" ] \
  || { echo "cannot list the public workspaces" >&2; exit 1; }
while read -r name location; do
  tgz=$(cd "$PUB" && npm pack -q "$name@$AZTEC_VERSION") || { echo "$name@$AZTEC_VERSION is not published" >&2; exit 1; }
  mkdir -p "$PUB/x/$location" && tar xzf "$PUB/$tgz" -C "$PUB/x/$location" --strip-components=1 &&
    rsync -a --ignore-existing "$PUB/x/$location/" "$location/" || { echo "cannot overlay $name" >&2; exit 1; }
done <"$PUB/workspaces.txt"
git -C "$AZTEC_NODE_DIR" status --porcelain
```

The published `@aztec-labs/*` packages are the tag's yarn-project as its release CI built
it: `src/` is the checkout's plus the files the build generates, `dest/` the compiled
output. `yarn install` takes every third-party dependency from the tag's lockfile, and the
loop adds what the build would have added, never overwriting a tracked file. All of it is
gitignored in aztec-node, so `status` prints nothing (2e checks it again: `aztec_node.mts`
refuses an edited or untracked file). Step 4 and TypeDoc (Step 6) read this tree; no bb or
nargo runs. At v6.0.0 it took 85 s and reproduced the SponsoredFPC address and the
TypeScript API byte for byte.

- Overlay the packages into their workspaces, never install them into `node_modules`:
  TypeDoc's `--excludeExternals` drops every re-export it resolves there.
- Keep the tag's lockfile: semver-resolved dependencies render different types (pino 9.14
  instead of the lock's 9.5 changes `foundation.md`).

If a workspace is not published at the tag, build it instead (aztec-node's own build, not
yet run by a cut): `cd "$AZTEC_NODE_DIR" && env -u root -u ci3 AZTEC_TOOLCHAIN_FND_ROOT= make yarn-project`.

#### 2e. Check the environment before preprocessing

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
node scripts/aztec_node.mts check && echo "pin: ok"
docs_env sh -c 'echo "$AZTEC_NODE_REF $AZTEC_NODE_COMMIT DOCS_COMMIT=$DOCS_COMMIT"; "$NARGO" --version; "$BB" --version'
node -p 'require("./node_modules/@aztec-foundation/l1-artifacts/package.json").version'
git -C "$CUT" diff --quiet "$DOCS_COMMIT" HEAD -- docs/examples && echo "examples: ok"
```

All of these must hold; stop at the first that does not:

- `check` prints `pin: ok`: the checkout is the pinned commit with no edited or untracked
  file, the pin's bb and noir equal the tag's `BB_VERSION` and `NOIR_VERSION`, and
  `docs/package.json`'s l1-artifacts equals `BB_VERSION`.
- `AZTEC_NODE_REF` is `v<new_version>` and `AZTEC_NODE_COMMIT` is the commit 2a's
  `ls-remote` printed. `NARGO` and `BB` are set (`env` exports them only once provisioned at
  the pinned versions) and print `nargo version = $NOIR_VERSION` and `$BB_VERSION`.
- The installed l1-artifacts version equals `BB_VERSION`.
- `examples: ok`: the cut's `docs/examples/` is `DOCS_COMMIT`'s.

### Unversioned root pages

Pages under `docs/docs/` (`networks.md`, `index.md`) are not versioned: they are live
on the destination, and the cut starts from the destination's copies: edit those and bump
the version fields. Step 17 copies `networks.md` back.

### Step 3: Install the Release CLI

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
node scripts/aztec_node.mts provision cli || exit 1
aztec_cli aztec --version
aztec_cli aztec-up --help >/dev/null && echo "aztec-up: ok"
```

`provision cli` installs `@aztec-labs/aztec` and `@aztec-labs/cli-wallet` at the pin's
`AZTEC_VERSION` (`v<new_version>` without its `v`) into `docs/.aztec-node/cli`, under
docs' yarn settings, as `examples/bootstrap.sh` does in CI. The CLI must report that
version; abort otherwise. `CLI_PATH` adds the pin's nargo and bb (2c) and the tag's
`aztec-up` script, which the npm packages do not ship. Third-party dependencies resolve
under the age gate, not from the release's lock, so only `--help` output is read from this
CLI (v6.0.0's matched byte for byte). Steps 3 and 7 need nothing more;
only Step 15 runs the `install.aztec.network` installer, with the owner's approval, because
the guides it validates do.

### Step 4: Get Sponsored FPC Address

The address is a hash of the SponsoredFPC contract class and a zero salt
(`SPONSORED_FPC_SALT`), so derive it from the tag's code installed in Step 2d:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$AZTEC_NODE_DIR/yarn-project"
node --input-type=module -e "
import { getSponsoredFPCAddress } from '@aztec-labs/cli/cli-utils';
console.log((await getSponsoredFPCAddress()).toString());
"
```

Update it wherever it appears in the versioned docs. The Sponsored FPC is deployed on
testnet and devnet; for mainnet, mark the SponsoredFPC row "Not deployed" in the L2
table.

SponsoredFPC is not a pinned standard contract, so any bytecode change between releases
moves its address, and the wallet resolves the guide's `contracts:SponsoredFPC` alias to
this computed address. **Owner approval required.** If it differs from the network's
SponsoredFPC row in `docs/docs/networks.md`, stop and report both addresses: the guide
works only once the new address is deployed and funded on that network, which the owner
arranges.

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
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn generate:typescript-api <new_version>
docs_env yarn generate:aztec-nr-api <new_version>
docs_env yarn generate:aztecjs-reference
```

This writes:

- `docs/static/typescript-api/<release_type>/`
- `docs/static/aztec-nr-api/<release_type>/`
- `docs/docs-developers/docs/aztec-js/aztec_js_reference.md`

The generators read the checkout at the tag: TypeDoc over the `yarn-project` Step 2d installed,
`nargo doc` over a copy of `noir-projects/aztec-nr` made outside `docs/` (so nargo cannot
take `docs/Nargo.toml` as its workspace), and the Aztec.js reference from
`yarn-project/aztec.js/src`. `generate_aztec_nr_docs.sh` takes `NARGO`, which `docs_env`
exports as the provisioned binary, and fails unless it prints
`nargo version = $NOIR_VERSION`; a mismatched nargo fails with errors such as
`error: Non-ASCII character in comment`. The output folders are named by `RELEASE_TYPE`,
which `docs_env` sets. `docs/bootstrap.sh` fails CI when the Aztec.js reference drifts from
the destination's pin (`update_docs.sh --check`); regenerating here makes the snapshot
match the tag, and the page stays in the cut (Step 17).

### Step 7: Generate CLI Reference Docs

The scripts scrape `--help` from the installed CLI, so it must be the release (Step 3):

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env aztec_cli ./scripts/cli_reference_generation/generate_all_cli_docs.sh --force current
grep -rn -e "$CLI_HOME" -e /home/ -e /Users/ docs-developers/docs/cli/ docs-operate/operators/reference/cli-reference.md
```

This updates `aztec_cli_reference.md`, `aztec_wallet_cli_reference.md` and
`aztec_up_cli_reference.md` in `docs/docs-developers/docs/cli/`, and the operators'
`aztec start` reference `docs/docs-operate/operators/reference/cli-reference.md`. Both
generators run the CLI under an environment allowlist and refuse to print or write a
capture that carries a key-shaped default (`docs/scripts/lib/key_defaults.sh`); afterwards
`docs/scripts/check_cli_defaults.sh` must exit 0. Do not hand-edit the pages. The scanner
writes defaults under the home directory as `~` (`aztec-wallet --data-dir` shows
`~/.aztec/wallet`), so the grep prints nothing.

### Step 7b: Generate Node API Reference Docs

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn generate:node-api-reference
```

This parses the interfaces and Zod schemas in the checkout's
`yarn-project/stdlib/src/interfaces/` at the tag with `docs/node_modules/typescript` and
writes `docs/docs-operate/operators/reference/node-api-reference.md` (generated: do not
hand-edit). The network snapshot (Step 11) includes it.

It warns about methods missing from `METHOD_GROUPS` in
`docs/scripts/node_api_reference_generation/generate_node_api_reference.mts`, which it
renders under "Other methods". Add each to its group and rerun; the destination needs the
same edit (a shared source repair, Step 17).

### Step 8: Update Migration Notes

**File:** `docs/docs-developers/docs/resources/migration_notes.md` (in the cut)

The checkout is shallow; fetch the release range before any history command:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$AZTEC_NODE_DIR" fetch --depth 1 origin tag v<old_version>
git -C "$AZTEC_NODE_DIR" fetch --shallow-exclude=v<old_version> origin tag "$LABS_TAG"
```

When the previous release is not a Labs tag (v5 and earlier are tags of this repository),
aztec-node has neither ref: replace both fetches with one dated by that tag here, read
`v<old_version>..$LABS_TAG` below (Step 8b) as `$LABS_TAG`, and skip the diff in item 4:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$AZTEC_NODE_DIR" fetch --shallow-since="$(git -C "$DEST_ROOT" log -1 --format=%cI v<old_version>)" origin tag "$LABS_TAG"
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
   git -C "$AZTEC_NODE_DIR" merge-base --is-ancestor <commit> "$LABS_TAG" && echo in-tag || echo NOT-in-tag
   ```

   An item whose commit is not an ancestor of the tag has not shipped, even if it is on
   aztec-node `main`: leave it under `## TBD`. In one rehearsal 4 of 21 items failed this
   test. A commit outside the fetched history prints `fatal: Not a valid commit name`
   before `NOT-in-tag`: that is unknown, not absent. Ask GitHub instead, which needs no
   history: `gh api "repos/aztec-labs-eng/aztec-node/compare/<commit>...$LABS_TAG" --jq .status`
   prints `ahead` or `identical` when the commit is in the tag, `diverged` or `behind` when
   it is not. Entries do not name their commit; without one, look for the entry's new
   syntax at the tag, which needs no history and prints nothing when it has not shipped:
   `git -C "$AZTEC_NODE_DIR" grep -n '<new symbol>' "$LABS_TAG" -- yarn-project noir-projects`.

2. Create the `## <new_version>` heading below `## TBD` (and below any `## Unreleased`
   sections) and move the shipped items under it.

3. Keep `## TBD` at the top of the **source** file, followed by a blank line. The
   **snapshot** must not ship it: Step 11 strips it.

4. Look for missing items in the code diff between the releases:

   ```bash
   git -C "$AZTEC_NODE_DIR" diff v<old_version> "$LABS_TAG" -- yarn-project/ noir-projects/
   ```

5. Present draft entries for user review before adding them.

The destination's copy of this file needs the same triage: it is a shared source repair
(Step 17). The cut started from it, so the patch applies unless the destination moved.

### Step 8b: Sweep the Docs for the Release's Syntax Changes

The migration notes record what broke, but nothing applies those changes to the rest of
the docs: hand-written snippets, prose that names APIs, and pages nobody touched since the
tag drift silently. CI only protects code that compiles (`#include_code` snippets and
`docs/examples/`), so this sweep targets everything else. Run it **before the cut**
(Step 11) so the snapshot is already correct.

**1. Enumerate the release's syntax changes.** The source of truth is the entries Step 8
filed under `## <new_version>` in this repository's migration notes, plus every section
between it and the previous release of this type (a mainnet `v6.0.0` after `v5.2.0` also
spans the `6.0.0-rc.*` sections), not the GitHub release body (hand-written prose). Parse every `### [Component] …` entry and its `**Migration:**`
diff block into `(component, old syntax, new syntax)` triples. Cross-check against
breaking commits in the tag range that never got a migration note:

```bash
git -C "$AZTEC_NODE_DIR" log --oneline "v<old_version>..$LABS_TAG" --grep='!:' -- yarn-project/ noir-projects/
```

aztec-node marks breaking changes only with the conventional-commit `!`, never a
`BREAKING CHANGE:` trailer, so `--grep='!:'` is the complete filter. It also matches the
body of port commits (`chore: port … from monorepo`), which list the breaking commits they
carry: read those bodies too.

**2. Locate candidate usages.** For each triple, grep the cut's source docs:

```bash
cd ~/.cache/aztec-docs-cut/<cut>/worktree/docs
grep -rn "<old_symbol>" docs-developers/ docs-operate/ docs-participate/ docs/ examples/
```

Prioritize surfaces with no compiler gate: hand-written code blocks (most of them in
`docs-developers/docs/aztec-nr/` and `docs-operate/`), prose that names functions or flags,
and install or CLI commands. A hit in an `#include_code` target or `docs/examples/` usually
means the build already fails; treat those as cross-checks.

**3. Adjudicate every candidate; do not fix from grep hits alone.** A symbol grep is noisy
and blind to signature drift (a function can keep its name while its arguments change):

- Verify against the source at the tag: `$AZTEC_NODE_DIR/<path>` (the snippet path
  without its `labs/` prefix), since the cut's checkout is the tag.
- Leave third-party SDK snippets alone; they document someone else's API.
- Skip historical references: migration-note entries, changelog prose, and "in vX, Y was
  removed" sentences are supposed to name the old syntax.
- Skip generated files (`aztec_js_reference.md`, the CLI references,
  `node-api-reference.md`); Steps 6 to 7b regenerate them.
- Check for semantic drift the diff implies where the symbol survives: renamed
  arguments, new required parameters, changed return shapes.

**4. Fix and report.** Fix the cut's source docs (they flow into the snapshot). A fix that
also holds at the destination's pin is a shared source repair (Step 17); one only the
release needs is a release-only change. Present a summary table:
`component | old → new | files fixed | candidates dismissed and why`, and list anything
that could not be verified.

### Step 9: Resolve Missing Contract Addresses & Update Network Info

The `networks.md` L1 table includes contracts that `aztec_getNodeInfo` does not return.
Resolve them in three tiers. Determine the L1 RPC from `l1ChainId`: `1` → Ethereum
mainnet (`https://eth.drpc.org`), `11155111` → Sepolia
(`https://ethereum-sepolia-rpc.publicnode.com`; drpc serves Sepolia only on a paid plan);
both are keyless. The Rollup and Registry addresses come from Step 1.

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
whose version Step 2e checked against the tag's `BB_VERSION`. It ships the Solidity tree
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

**File:** `docs/docs/networks.md` (the destination's copy, which the cut started from)

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
grep -r "<old_address>" ~/.cache/aztec-docs-cut/<cut>/worktree/docs/
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
    `"ROUND_SIZE()(uint256)"`. The same pair, with the slot length
    (`cast call <ROLLUP> "getSlotDuration()(uint256)"`), is the signaling round that
    `governance-participation.md` states per branch (`<slots> slots each (<minutes> at
    <seconds> per slot)`, `<quorum> or more signals`) and `governance/proposal-lifecycle.md`
    under `docs-participate` uses in its round examples and timeline.
  - *Voting Delay / Voting Duration / Execution Delay*:
    `cast call <GOVERNANCE> "getConfiguration()(((uint256,uint256),uint256,uint256,uint256,uint256,uint256,uint256,uint256))" --rpc-url <L1_RPC>`
    returns the `Configuration` struct of
    `l1-artifacts/l1-contracts/src/governance/interfaces/IGovernance.sol`, in order:
    `(lockDelay, lockAmount)`, `votingDelay`, `votingDuration`, `executionDelay`,
    `gracePeriod`, `quorum`, `requiredYeaMargin`, `minimumVotes`. The getter decompresses
    storage, so the voting delay, voting duration and execution delay are seconds
    (`172800` = 2 days).
  - *Governance withdrawal delay*: `votingDelay/5 + votingDuration + executionDelay`
    (`getWithdrawalDelay` in the same package's `ConfigurationLib.sol`; mainnet's
    259200/604800/172800 give ~9.6 days). Testnet's timings are re-derived the same way,
    and every page that states them follows: `networks.md`, `governance-participation.md`
    (its `#if(testnet)` branch), and `governance/proposal-lifecycle.md`, `token/voting.md`
    and `token/staking.md` under `docs-participate`.
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
  cd ~/.cache/aztec-docs-cut/<cut>/worktree
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
. ~/.cache/aztec-docs-cut/<cut>/env.sh
major=$(jq -r '."."' "$AZTEC_NODE_DIR/.release-please-manifest.json" | cut -d. -f1)
git -C "$DEST_ROOT" show "$DEST:docs/docs-operate/operators/reference/changelog/v$major.md" >/dev/null \
  && echo "page present" || echo "MISSING: v$major.md"
git -C "$DEST_ROOT" show "$DEST:docs/docs-operate/operators/reference/changelog/index.md" | grep -n '^### ' | head -3
git -C "$DEST_ROOT" show "$DEST:docs/sidebars-operate.js" | grep -n "changelog/v$major"
```

The major is the Labs version from the checkout's
`$AZTEC_NODE_DIR/.release-please-manifest.json`; the root manifest versions the Foundation.
All three must hold:

1. The page exists (a major with several releases may use a minor-qualified name such as
   `v5.2.md`; check that name).
2. `index.md` has a `### ` entry for this release's major (and minor, once the series has
   more than one); an rc or patch is covered by its minor's entry.
3. `docs/sidebars-operate.js` lists the page; an unlisted page is published but has no
   nav entry.

**Owner approval required.** If any check fails, stop and report which. The page must
land on the destination first (`/updating-changelog`, or by hand from the commit range),
through a PR the owner opens and merges; then restart from Step 2 (the destination has
moved), and the new cut starts with the page. Do not cut around it, and do not write it
only into the cut.

### Step 11: Cut Versioned Docs

`docs:version` snapshots `processed-docs/` (the resolved tree the docs plugins serve),
not the raw `docs-*` source, so preprocess first with every release variable. Snippets
under `labs/` resolve against the cut's checkout (the tag) and the rest against the cut's
`docs/examples/` (`DOCS_COMMIT`'s). A snippet whose file or marker the tag lacks fails
preprocessing: its page quotes code newer than the release. Edit that page in the cut for
the release (a release-only change, Step 17), or stop and ask the owner when it documents
a feature the release lacks.

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn preprocess
grep -rcE 'tag *= *"next"|@next\b|@latest|VERSION=latest|aztec\.network/latest' \
  processed-docs/docs-developers/docs/tutorials/ | grep -v ':0$'
grep -rhoE 'github\.com/AztecProtocol/aztec-packages(/(blob|tree)/[^/)"]+(/[^/)"#?]+){0,2}|/?", *tag *= *"[^"]+"(, *directory *= *"[^/"]+(/[^/"]+)?)?)|git clone [^`]*AztecProtocol/aztec-packages' processed-docs/ |
  sort | uniq -c
```

- The first grep must print nothing. Without `COMMIT_TAG`, `#include_aztec_version`
  resolves to `next` (a ref `aztec-labs-eng/aztec-nr` lacks, and not an npm dist-tag) and
  `#include_version_without_prefix` to `latest` (an older nightly at the v6 rehearsal,
  wire-incompatible with the rc). The build validates neither. Both spacings of
  `tag = "next"` occur, hence the pattern.
- The second lists every link, clone and Nargo `git` dependency into this repository with
  its ref and the start of its path (a clone's path is in the page's next `cd`). Hits under
  `processed-docs/docs-participate/` and `processed-docs/docs/` are unversioned and never
  reach a snapshot. Classify
  each by path, not by ref: `#include_aztec_version` in a hand-written URL renders
  `v<new_version>`, which looks right whenever the l1-artifacts version equals the release
  version (as at `v6.0.0-rc.1`), yet this repository's tag of that name holds no Labs code.
  - Under `noir-projects/` or `yarn-project/`: Labs code, so in the snapshot it names
    aztec-node (`https://github.com/aztec-labs-eng/aztec-node`) at the tag.
  - Under `docs/examples`: this repository's examples, which the snapshot quotes at
    `DOCS_COMMIT`. Clone steps are the usual hit: the source clones aztec-packages `next`,
    and the snapshot's clone must check out `DOCS_COMMIT` after cloning (fix the snapshot
    after 11b, not the source).
  - Under `l1-contracts/` or `barretenberg/`: Foundation code, whose ref is
    `#include_foundation_version` (`v<l1-artifacts version>`).
  - Anything else: `v<l1-artifacts version>` or `next`. `master` resolves only through
    GitHub's redirect to `next`: write `next`.

  `#include_foundation_version` and `#include_foundation_version_without_prefix` (no `v`)
  are documented in `docs/README.md`. Old migration-note entries are historical; leave them.

#### 11a. Snippet links

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env sh -c 'echo "aztec-node: $AZTEC_NODE_COMMIT  aztec-packages: $DOCS_COMMIT"'
grep -rhoE 'github\.com/aztec-labs-eng/aztec-node/blob/[^/)"]+' processed-docs/ | sort | uniq -c
grep -rhoE 'github\.com/AztecProtocol/aztec-packages/blob/[^/)"]+/docs/examples' processed-docs/ | sort | uniq -c
```

Every aztec-node link must name `AZTEC_NODE_COMMIT` and every `docs/examples` link
`DOCS_COMMIT`. `include_code.js` writes snippet links with exactly those commits, so any
other ref is a hand-written link: give a moving ref (`main`, `next`) the tag in the
snapshot after 11b.

#### 11b. Cut

The version string always has the `v` prefix:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
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

Repeat both `update_docs_versions.sh` lines for each other release type this version
serves. Verify the new version appears in both `developer_version_config.json` and
`network_version_config.json`.

**Strip the `## TBD` section from the snapshot; it is not cosmetic.** Step 8 leaves
unshipped items there and the cut copies the file wholesale; in one rehearsal it carried
~4,000 characters about an unmerged oracle. Remove the whole `## TBD` section and any
`## Unreleased (...)`, empty or not, from
`developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md`:

```bash
grep -n '^## ' developer_versioned_docs/version-v<new_version>/docs/resources/migration_notes.md | head -3
```

The first heading must be the new version. Then no macro and no moving Aztec version may
survive in the snapshot:

```bash
grep -rnE '@next|@latest|VERSION=latest|tag *= *"next"|#include_aztec_version|#include_foundation_version|#release_version|#release_network|#include_code' \
  developer_versioned_docs/version-v<new_version>/ network_versioned_docs/version-v<new_version>/
```

The only expected hits are third-party packages versioned on their own: at
`v6.0.0-rc.3`, the MCP servers in `ai_tooling.md` (`@aztec/mcp-server@latest`,
`noir-mcp-server@latest`). Fix every other hit.

Hand-written blocks can still carry this repository's `labs/` prefix, which does not exist
in an aztec-node checkout. Fix every hit:

```bash
grep -rn '\.\./labs/' developer_versioned_docs/version-v<new_version>/ network_versioned_docs/version-v<new_version>/
```

#### Hardcoded version references

Grep the source and the new snapshot for the old version and update each hit, except
historical references (migration-note headings, changelog entries, "in vX, Y was removed"):

```bash
grep -rn "<old_version>" src/ docs-developers/ docs-operate/ docs/ \
  developer_versioned_docs/version-v<new_version>/ network_versioned_docs/version-v<new_version>/
```

Known hit: the operator changelog page of the major, whose rc-specific notices
(`v6.0.0-rc.1 is Testnet only`) need the owner's call on whether they still hold.

### Step 12: Check the Content Against the Tag

The cut's pages are the destination's, written against the destination's pin
(`DEST_PIN_REF`); the snapshot must describe the tag. Snippets need no check, since they
were rendered from the tag (Step 11). Prose and hand-written code can still name APIs the
release lacks, or miss ones it changed. When the two pins differ, the code commits between
them are where to look:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
echo "destination pin: $DEST_PIN_REF  release: $LABS_TAG"
cmp=$(gh api "repos/aztec-labs-eng/aztec-node/compare/$LABS_TAG...$DEST_PIN_REF" \
  --jq '"\(.merge_base_commit.sha) \(.behind_by) \(.ahead_by)"') || exit 1
read -r base behind ahead <<<"$cmp"
since=$(gh api "repos/aztec-labs-eng/aztec-node/commits/$base" --jq .commit.committer.date) || exit 1
AZTEC_NODE_HISTORY=$STATE/aztec-node-history
rm -rf "$AZTEC_NODE_HISTORY" && git init -q "$AZTEC_NODE_HISTORY" &&
  git -C "$AZTEC_NODE_HISTORY" fetch -q --shallow-since="$since" https://github.com/aztec-labs-eng/aztec-node.git \
    tag "$LABS_TAG" tag "$DEST_PIN_REF" || exit 1
[ "$(git -C "$AZTEC_NODE_HISTORY" merge-base "$LABS_TAG" "$DEST_PIN_REF")" = "$base" ] &&
  [ "$(git -C "$AZTEC_NODE_HISTORY" rev-list --count "$DEST_PIN_REF..$LABS_TAG")" = "$behind" ] &&
  [ "$(git -C "$AZTEC_NODE_HISTORY" rev-list --count "$LABS_TAG..$DEST_PIN_REF")" = "$ahead" ] \
  || { echo "history down to $base is incomplete: GitHub counts $behind/$ahead" >&2; exit 1; }
git -C "$AZTEC_NODE_HISTORY" log --oneline --left-right --cherry-pick "$LABS_TAG...$DEST_PIN_REF" -- yarn-project/ noir-projects/
git -C "$AZTEC_NODE_HISTORY" log --oneline --left-right --cherry-pick --name-only "$LABS_TAG...$DEST_PIN_REF" -- docs/
```

Skip this step when the two refs name the same commit. `--cherry-pick` drops commits that
reached both sides as ports. The history goes into a checkout of its own, fetched afresh
down to the refs' merge base, which GitHub names without local history; fetching it into
`$AZTEC_NODE_DIR` instead keeps that checkout's earlier shallow boundaries (the merge base
goes missing) and shortens the history Step 8 fetched. The check compares the merge base
and both sides' counts with GitHub's; if only the counts differ, a merged branch predates
the merge base: fetch again with an earlier `--shallow-since`. Never fetch with `--shallow-exclude=<previous release>`: the
merge base is usually reachable from the previous release, so it is cut off and the range
lists both sides back to the boundary (v6.0.0 against `v6.0.0-rc.3`: 166/166 commits
instead of 57/2). Then:

1. **`>` commits are in the destination's pin but not in the release.** The source docs may
   describe them, and the snapshot must not. Start with the pages the second log names:
   aztec-node held the docs until they moved here, so a code change and its doc edit
   landed in one commit. Revert those hunks in the snapshot, removals included (a page
   that dropped a command the release still has gets it back). At v6.0.0 they were a log
   filter, an expiry rule, a removed CLI command and newer build images, none of them
   `!:`. Then the breaking ones (`!:` in the subject or in a port's body), then any that
   add, rename or change a public API. Grep the new snapshot for each symbol.
2. **`<` commits are in the release only.** Step 8b's sweep covers their breaking changes;
   check that every `!:` one was swept.
3. **Adjudicate every hit against `$AZTEC_NODE_DIR`**, the tag, as in Step 8b item 3. Fix
   the snapshot only: the source follows the destination's pin, so these fixes are
   release-only (Step 17).
4. Present what was found, fixed and skipped, for user confirmation.

### Step 13: Build and Fix Issues

Run after the cut: docusaurus validates `lastVersion` against the versioned directories.

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT/docs"
docs_env yarn build >"$STATE/build.log" 2>&1; echo "dev build: $?"
CONTEXT=production docs_env yarn build >"$STATE/build-production.log" 2>&1; echo "production build: $?"
scripts/check_warnings.sh "$STATE/build.log" "$STATE/build-production.log"
grep -rlE 'github\.com/aztec-labs-eng/aztec-node/edit/' build/ | head
```

Both builds must exit 0 and the warning extract must be empty; a warning that cannot be
fixed goes to the owner. Edit links must name `AztecProtocol/aztec-packages/edit/next/docs/`,
so the last grep prints nothing. Fix and iterate:

- broken redirect targets (`validate_redirect_targets.sh`), broken API reference links
  (`validate_api_ref_links.sh`), spelling.
- **`rc` tags can be mainnet.** The API generators fall back to `testnet` for `rc` strings
  without `RELEASE_TYPE`; `docs_env` sets it.
- **viem is versioned off the release line.** Depending on the tag, its packages pin either
  the `@aztec/viem` fork (`"viem": "npm:@aztec/viem@<fork version>"`) or upstream `viem`,
  never at the release version. Never rewrite a viem pin to the release version; CI will not
  catch it (the import type-checks against the linked workspace). Tutorials whose code
  imports viem (token, aave and uniswap bridges) list the package their snippets import.
  Take the version from the tag's packages, and keep the fork's version in the install line
  unless Step 15 fails with it:

  ```bash
  . ~/.cache/aztec-docs-cut/<cut>/env.sh
  grep -rh '"viem": "' "$AZTEC_NODE_DIR"/yarn-project/*/package.json | sort -u
  grep -rnE '(@aztec/)?viem@[0-9]' ~/.cache/aztec-docs-cut/<cut>/worktree/docs/docs-developers/docs/tutorials/
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

1. **Install the release as readers do, and start its local network.** **Owner approval
   required.** The guides and tutorials start with the installer and call what it installs
   (`aztec-nargo`, `aztec-forge`, `aztec-anvil`, `aztec-cast`, `aztec-up`), which the
   published CLI of Step 3 does not ship. Run the installer only after the owner says yes:

   ```bash
   . ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT"
   pin=$(node docs/scripts/aztec_node.mts env) || exit 1
   eval "$pin"
   env -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME -u NARGO_HOME -u NARGO -u AZTEC_HOME \
     HOME="$CLI_HOME" NON_INTERACTIVE=1 bash <(curl -fsSL "https://install.aztec.network/$AZTEC_VERSION")
   CLI_PATH=$INSTALLER_PATH aztec_cli aztec --version
   foundry=$(sed -n 's/^ENV FOUNDRY_VERSION=v//p' "$AZTEC_NODE_DIR/build-images/src/Dockerfile")
   for tool in anvil forge cast; do
     "$CLI_HOME/.aztec/current/internal-bin/$tool" --version 2>/dev/null | grep -qx "$tool Version: $foundry" \
       || { echo "$tool is not foundry $foundry" >&2; exit 1; }
   done
   CLI_HOME="$CLI_HOME" CLI_PATH="$INSTALLER_PATH" .claude/skills/release-docs/local_network.sh start <new_version> "$STATE"
   . "$STATE/network.env"
   ```

   The CLI must report `AZTEC_VERSION`. The installer runs with `HOME` set to `$CLI_HOME`,
   so its node, foundry, nargo and shell-profile edits stay out of the real home. Clearing
   `NARGO_HOME` and `AZTEC_HOME` keeps noirup and the toolchain under that home too (with
   `NARGO_HOME` set, noirup lands in the real home and the install fails), and clearing
   `NARGO` stops the installer from copying that binary in as the release's nargo.
   `NON_INTERACTIVE=1` skips the prompt and the closing `exec $SHELL`. foundryup refuses to
   install while any `anvil` runs on the host (`'anvil' is currently running`): wait for it
   to exit, and never stop another run's anvil. The release's L1 deployment needs the
   foundry its build image pins (v6.0.0 with forge 1.4.1 fails on `unexpected argument
   '--disable-external-identification'`); the check stops on any other, and `aztec_cli`
   and the network clear `ANVIL_BIN`, `FORGE_BIN` and `CAST_BIN` so the CLI resolves
   foundry from the installer's `internal-bin` first. For the rest of
   this step, run the release's commands as `CLI_PATH=$INSTALLER_PATH aztec_cli <command>`.
   The network claims its ports in `~/.agents/ports.md`, runs in its own process group with a data
   directory under `$STATE`, and waits up to `READY_TIMEOUT` seconds (default 600) for the
   node to report `<new_version>`. `network.env` exports `AZTEC_NODE_URL` (read by
   `aztec-wallet` and the examples runner) and `ETHEREUM_HOST`.

2. **Walk the getting-started guide of the release type**, running every command as
   written, through `CLI_PATH=$INSTALLER_PATH aztec_cli` so the wallet's data stays under
   `$CLI_HOME`:
   - **devnet / nightly**: `getting_started_on_local_network.md`, against the local
     network.
   - **testnet / mainnet**: `getting_started_on_testnet.md`, against the public RPC. A local
     network cannot exercise it (it needs a funded account): run the read-only steps.
     **Owner approval required.** Any step that sends a transaction to the live network
     (deploying an account, a funded transaction) runs only after the owner says yes, with an
     account the owner provides, spending no more than needed.

3. **Walk every tutorial** under
   `developer_versioned_docs/version-v<new_version>/docs/tutorials/**/*.md`, the whole tree.
   Contract compile, deploy and interact flows run against the local network for every
   release type. That includes the governance rollup upgrade tutorial
   (`testing_governance_rollup_upgrade.md`, directly under `tutorials/`): run the full
   upgrade, then its "Quick Test (Empty Payload)" path, with `$ETHEREUM_HOST` and
   `$AZTEC_NODE_URL` in place of its `localhost` URLs. Record drift: renamed commands,
   changed flags, stale addresses, different output.

4. **Build and run the Aztec.js examples at the tag**, in the cut, against the local network:

   ```bash
   . ~/.cache/aztec-docs-cut/<cut>/env.sh && . "$STATE/network.env" && cd "$CUT/docs"
   examples/bootstrap.sh compile-circuits
   examples/bootstrap.sh compile
   TXE_PORT=<a port claimed in ~/.agents/ports.md> examples/bootstrap.sh test-contracts
   docs_env examples/ts/aztecjs_runner/run.sh
   ```

   `examples/bootstrap.sh` provisions the tag's nargo, bb and CLI and fetches its commit into
   `$CUT/docs/.aztec-node/tree` (Release model), so the circuit and contracts compile and the
   TXE tests run at the tag (`recursive_verification` reads the circuit's artifact). `run.sh` installs the tag's packages into each example and runs it
   against `$AZTEC_NODE_URL`. The examples are the destination's: a failure here means the
   snapshot quotes code that does not work at the release. Report it with the example and
   the error. Never edit `docs/examples/` in the cut (Step 17 refuses it): a fix that also
   holds at the destination's pin lands on `next` first, and the cut restarts.

5. **Stop the network**, which kills only its process group and releases its ports:

   ```bash
   . ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$CUT"
   .claude/skills/release-docs/local_network.sh stop "$STATE"
   ```

Report pass or fail per guide, tutorial and example, with the exact doc line of each
failure. Fix guide and tutorial drift in the snapshot, and in the cut's source when the fix
also holds at the destination's pin (a shared source repair, Step 17). Then rerun Step 13.
If validation cannot run, say so and list what was skipped.

### Step 16: Clean Up Old Versions

Work in the cut (`cd ~/.cache/aztec-docs-cut/<cut>/worktree/docs`) and append
every removed path to `$STATE/deleted.txt`, one per line and written as listed below
(from the repository root, `docs/...`): Step 17 removes the same paths on the destination.
Config entries are not paths; the configs travel whole.

#### Developer docs

Identify the previous developer version for this release type from
`developer_version_config.json` as it was before Step 11 (`git show "$PINNED:docs/developer_version_config.json"`).

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

and reconcile so `developer_versions.json` drops it too:

```bash
scripts/update_docs_versions.sh developer
```

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

#### Redirect the deleted versions' paths

A version no network reads is served at its own name (`/developers/<old_version>/*`), and
the live sitemap lists those URLs. For each deleted version production served there, add
a redirect to `docs/netlify.toml`, next to the `/developers/testnet/*` rule, and the same for `/operate/<old_network_version>/*`:

```toml
[[redirects]]
    from = "/developers/<old_version>/*"
    to = "/developers/:splat"
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
  | sed -E 's#<loc>https?://[^/]+##; s#</loc>##' | grep '^/developers/<old_version>/' \
  | sed 's#^/developers/<old_version>/#/developers/#' >"$STATE/redirect-targets.txt"
FAIL_ON_ORPHAN=1 scripts/check_orphaned_urls.sh "$STATE/redirect-targets.txt"
```

Repeat it for `operate` and `<old_network_version>`.

### Step 17: Carry the Results Back to the Destination

First check that the destination's `docs/` has not moved since Step 2b, then record the
cut on its branch, check that it left `docs/examples/` as `DOCS_COMMIT` has it (the
snapshot's example links name that commit), and list every change the cut made after its
pin commit (Step 2c):

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
git -C "$DEST_ROOT" diff --quiet "$DEST" -- docs || { echo "destination docs/ moved: restart the cut" >&2; exit 1; }
cd "$CUT" && git add -- docs && git commit -m "docs: cut $LABS_TAG"
git -C "$CUT" diff --quiet "$DOCS_COMMIT" HEAD -- docs/examples \
  || { echo "the cut changed docs/examples: land the change on next and restart the cut" >&2; exit 1; }
git -C "$CUT" diff --name-status "$PINNED" HEAD -- docs
```

Sort every listed path into exactly one class:

1. **Release results**, copied per named path. Directories are synced with
   `rsync --delete`, files copied, and the Step 16 deletions run explicitly:

   ```bash
   . ~/.cache/aztec-docs-cut/<cut>/env.sh
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
   [ ! -s "$STATE/deleted.txt" ] || while IFS= read -r p; do
     git -C "$DEST_ROOT" rm -r -q -- "$p"
   done <"$STATE/deleted.txt"
   ```

   `git rm` stages the deletions; they are never passed to `git add` below.

2. **Shared source repairs**: edits to files the destination also has that hold at the
   destination's pin too (source fixes from Steps 8, 8b, 10 and 15, edits to existing
   snapshots). Carry them as reviewed hunks; the cut shares this repository's objects, so
   `-3` can merge them:

   ```bash
   git -C "$CUT" diff "$PINNED" HEAD -- <file>... >"$STATE/shared-repairs.patch"
   git -C "$DEST_ROOT" apply -3 "$STATE/shared-repairs.patch"
   ```

   Read the patch before applying it. Never copy a source directory wholesale: the cut's
   copy carries release-only edits.

3. **Release-only changes** stay in the cut: the pin commit (`docs/aztec-node.json`,
   `docs/package.json`, `docs/yarn.lock`), generated source pages (`aztec_js_reference.md`,
   the CLI references, `node-api-reference.md`), and source edits that only the release
   needs (Steps 8b, 11 and 12). The destination keeps its own pin and the pages generated
   from it.

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
docs: cut $LABS_TAG docs (<release_type>)

Content: docs/ at $DEST
Labs code: aztec-node $AZTEC_NODE_REF ($AZTEC_NODE_COMMIT), bb $BB_VERSION, noir $NOIR_VERSION (published)
Foundation dependency: @aztec-foundation/l1-artifacts $L1_ARTIFACTS_VERSION
Snippet links into this repository: $DOCS_COMMIT
Destination: $DEST_BRANCH at $DEST
EOF
```

Then rerun the destination's own checks. They must read the destination's pin, so drop
the cut's `AZTEC_NODE_DIR` first:

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh && cd "$DEST_ROOT/docs" && unset AZTEC_NODE_DIR
yarn install --immutable && yarn test
CONTEXT=production yarn build >"$STATE/destination-build.log" 2>&1; echo "production build: $?"
scripts/check_warnings.sh "$STATE/destination-build.log"
./bootstrap.sh check
```

**Owner approval required.** Report `git -C "$DEST_ROOT" show --stat HEAD`, the classes
with their paths, the release-only edits with the reason for each, the Step 12 findings,
the skipped Step 15 items, and anything left unresolved. Pushing the branch and opening a
PR are the owner's call.

### Step 18: Tear Down

```bash
. ~/.cache/aztec-docs-cut/<cut>/env.sh
"$DEST_ROOT/.claude/skills/release-docs/local_network.sh" stop "$STATE"
git -C "$DEST_ROOT" worktree remove "$CUT"
```

`worktree remove` refuses while the cut has uncommitted changes (Step 17 committed
everything); ignored files such as `docs/node_modules/` and `docs/.aztec-node/` go with it.
The branch `docs-cut/<cut>` stays as the record of the cut until the destination
commit has merged. `$STATE` holds the CLI's home, the checkout and the logs; remove it once
the release is out.

### Step 19: Refresh the Protected URL Snapshot

Run this once this release's developer and operator docs are live in production. A draft
or preview deploy does not
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

- **Always query the network first**: the RPC is the source of truth for the version and
  the contract addresses.
- **Re-derive, never carry forward**: every figure in `networks.md` is re-checked against
  its source (RPC, on-chain call, the tag's tooling), checksummed with
  `cast to-check-sum-address` and converted with `cast to-dec` (Step 9).
- **The Labs tag must exist**, and is only ever read through the cut's checkout
  (`$AZTEC_NODE_DIR`) or aztec-node's remote, never `labs/`.
- **One worktree per cut**: the content is the destination's, the code and the toolchain
  are the tag's through the cut's pin, and the environment check (Step 2e) proves it before
  anything is preprocessed. Versions come from the pin, never from memory.
- **CLI version must match**: the installed CLI generates the CLI reference and runs the
  local network.
- **Cut before building**: the authoritative build runs after the cut (Step 13).
- **Links before the cut**: aztec-node snippets link to the tag's commit, example snippets
  to `DOCS_COMMIT` (Step 11a).
- **Sweep the release's syntax changes into the docs before cutting**: enumerate breaking
  changes from the release's migration notes and `!:` commits, grep the hand-written docs
  for the old syntax, adjudicate each hit against the source at the tag, and fix confirmed
  drift (Step 8b). CI only protects `#include_code` snippets and `docs/examples/`.
- **Check the content against the tag after cutting** (Step 12): the pages follow the
  destination's pin, which may be ahead of the release.
- **Functionally validate before shipping**: guides, tutorials and the examples against a
  local network of the release (Step 15).
- **User confirmation required** before deleting versioned docs and before adding
  migration notes.
- **Changes land on the destination as one commit** that names the release inputs; the
  owner decides on pushing.
- **API reference docs** use stable folders per release type; `#api_ref_version` resolves
  to the matching folder (`include_version.js`).
- **Update `docs/README.md`** when a release adds generation scripts or build steps.
