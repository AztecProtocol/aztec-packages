# Protocol Fuzzer: Running with Nightly Docker Sandbox

## Overview

The protocol fuzzer has two state machines:

- **token** (default): Fuzzes the Token contract (mint/burn/transfer, public and private).
  Works with any Aztec sandbox (including `latest`) — no special setup needed beyond
  having `aztec-wallet` on PATH and a running sandbox.
- **side-effect**: Fuzzes note lifecycle and nullifier emission (side effects) on a custom
  `SideEffect` contract. **Requires the nightly sandbox** — the rest of this document
  covers that setup.

Both machines invoke `aztec-wallet` CLI commands against a running Aztec sandbox. The
`side-effect` machine deploys a custom `side_effect_contract` (in `protocol-fuzzer/contracts/side_effect_contract/`).

## Why the nightly sandbox?

The side-effect machine deploys a custom contract, which needs three things to be
version-compatible:
1. The **sandbox** (PXE + sequencer + L1 contracts)
2. The **wallet CLI** (sends transactions via the sandbox)
3. The **compiled contract artifact** (bytecode format must match the sandbox)

The `latest` Docker image (installed via `aztec-up`) ships nargo beta.11, which
**stack-overflows** when compiling contracts against the current aztec-nr libraries.
The `nightly` Docker image has nargo beta.18, matching the repo's noir submodule.

However, the nightly image's wallet is broken (missing `inquirer` npm package), and
the `latest` wallet can't talk to the nightly sandbox (API mismatch). Additionally,
the contract must be compiled against the **nightly's version of aztec-nr**, not the
repo's current `next` branch version, because the oracle interfaces differ.

## Prerequisites

- Docker
- Rust toolchain (for building the fuzzer itself)
- The `aztec-packages` repo checked out (only needed if recompiling the contract artifact — step 5)

## Step-by-Step Setup

### 1. Identify the nightly commit

The nightly Docker image was built from a specific aztec-packages commit. Find it by
matching the nargo version hash:

```bash
# Get the noir commit hash from the nightly image
docker run --rm --entrypoint "" aztecprotocol/aztec:nightly \
  /usr/src/noir/noir-repo/target/release/nargo --version
# Look for the git version hash, e.g. 67478b2f9d7c6239686e8de8a82f2719e54fbd40

# Find the matching aztec-packages commit
NIGHTLY_NOIR_HASH="67478b2f9d7c6239686e8de8a82f2719e54fbd40"  # update this
git log --all --oneline --diff-filter=M -- noir/noir-repo | while read hash msg; do
  sub=$(git ls-tree $hash noir/noir-repo 2>/dev/null | awk '{print $3}')
  if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
    echo "MATCH: $hash $msg"
    break
  fi
done
# As of 2026-02-13, the match is commit 681ca9b5c9
```

### 2. Start the nightly sandbox

The nightly image's `--local-network` flag requires an L1 RPC URL. Start anvil
inside the container:

```bash
docker run -d --rm --name aztec-sandbox-nightly \
  -p 8080:8080 -p 8545:8545 \
  -e LOG_LEVEL=info \
  --entrypoint "" \
  aztecprotocol/aztec:nightly \
  bash -c '/opt/foundry/bin/anvil --host 0.0.0.0 --port 8545 --block-time 12 & \
  sleep 2 && node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --local-network --l1-rpc-urls http://127.0.0.1:8545'
```

Wait ~2 minutes for startup. The PXE starts after ~90 seconds, but the HTTP server
takes a bit longer. Verify both are ready:

```bash
# PXE should be up:
docker logs aztec-sandbox-nightly 2>&1 | grep "PXE.*Started"
# Should show: Started PXE connected to chain 31337 version ...

# HTTP server should respond (405 is expected — it wants POST, not GET):
curl -so /dev/null -w '%{http_code}' http://localhost:8080
```

Key details:
- `--entrypoint ""` overrides the default entrypoint
- anvil lives at `/opt/foundry/bin/anvil`
- Port 8080 = PXE/node API, port 8545 = anvil (L1)

### 3. Fix the wallet inside the container

The nightly image is missing the `inquirer` npm package. Install it:

```bash
docker exec aztec-sandbox-nightly bash -c '
  mkdir -p /tmp/inquirer-fix && cd /tmp/inquirer-fix
  npm init -y > /dev/null 2>&1
  npm install inquirer@10 2>&1 | tail -3
  # IMPORTANT: only copy packages that do NOT already exist to avoid overwriting
  # nightly-bundled @aztec/* packages with incompatible versions
  for pkg in node_modules/*; do
    name=$(basename "$pkg")
    [ ! -e "/usr/src/yarn-project/node_modules/$name" ] && cp -r "$pkg" /usr/src/yarn-project/node_modules/
  done
  for scope in node_modules/@*; do
    [ -d "$scope" ] || continue
    scope_name=$(basename "$scope")
    mkdir -p "/usr/src/yarn-project/node_modules/$scope_name"
    for pkg in "$scope"/*; do
      name=$(basename "$pkg")
      [ ! -e "/usr/src/yarn-project/node_modules/$scope_name/$name" ] && cp -r "$pkg" "/usr/src/yarn-project/node_modules/$scope_name/"
    done
  done
  echo "done"
'
```

Verify it works:

```bash
docker exec aztec-sandbox-nightly node --no-warnings \
  /usr/src/yarn-project/cli-wallet/dest/bin/index.js --help
```

### 4. Import test accounts

```bash
docker exec aztec-sandbox-nightly node --no-warnings \
  /usr/src/yarn-project/cli-wallet/dest/bin/index.js import-test-accounts
```

### 5. Side-effect contract artifact

A pre-built artifact is checked into git at
`contracts/target/side_effect_contract-SideEffect.json`. If it matches the current
nightly image, **skip to step 6**.

If the nightly image has been updated, recompile the artifact using the steps below.
The contract must be compiled against the nightly commit's aztec-nr (not the repo's
current version) and processed with the nightly's `bb-avm`.

#### 5a. Extract nightly-matching source and copy contract files

The contract source and `Nargo.toml` files are checked into
`contracts/side_effect_contract/` and already match the nightly's aztec-nr API
(e.g. `RetrievedNote`, `destroy_note_unsafe`, `protocol_types::address::AztecAddress`).

```bash
NIGHTLY_COMMIT=681ca9b5c9  # from step 1

# Extract aztec-nr and protocol-circuits from the nightly commit
mkdir -p /tmp/nightly-build/contracts/test/side_effect_contract/src
git archive $NIGHTLY_COMMIT -- noir-projects/aztec-nr/ noir-projects/noir-protocol-circuits/ \
  | tar -x -C /tmp/nightly-build --strip-components=1

# Copy contract source and Nargo.toml files into the build directory
cp contracts/side_effect_contract/src/main.nr /tmp/nightly-build/contracts/test/side_effect_contract/src/
cp contracts/side_effect_contract/Nargo.toml /tmp/nightly-build/contracts/test/side_effect_contract/
cp contracts/Nargo.toml /tmp/nightly-build/
```

#### 5b. Compile inside the nightly container

```bash
# Copy build directory into the container
docker cp /tmp/nightly-build aztec-sandbox-nightly:/tmp/nightly-build

# Compile with the nightly's nargo
docker exec -w /tmp/nightly-build aztec-sandbox-nightly \
  /usr/src/noir/noir-repo/target/release/nargo compile \
  --silence-warnings --inliner-aggressiveness 0 --package side_effect_contract
```

#### 5c. Transpile + generate VKs with bb-avm

```bash
docker exec aztec-sandbox-nightly \
  /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process \
  -i /tmp/nightly-build/target/side_effect_contract-SideEffect.json
```

This single command handles both AVM transpilation of public functions and
verification key generation for private functions.

#### 5d. Strip the `__aztec_nr_internals__` prefix

```bash
docker exec aztec-sandbox-nightly bash -c '
  json=/tmp/nightly-build/target/side_effect_contract-SideEffect.json
  jq ".functions |= map(.name |= sub(\"^__aztec_nr_internals__\"; \"\"))" "$json" > "${json}.tmp"
  mv "${json}.tmp" "$json"
'
```

#### 5e. Copy artifact to the standard locations

```bash
# Copy to the standard container path (same as the pre-built docker cp in step 6)
docker exec aztec-sandbox-nightly cp \
  /tmp/nightly-build/target/side_effect_contract-SideEffect.json \
  /tmp/side_effect_contract-SideEffect.json

# Copy to host and commit so others don't need to recompile
docker cp aztec-sandbox-nightly:/tmp/side_effect_contract-SideEffect.json \
  noir-projects/protocol-fuzzer/contracts/target/side_effect_contract-SideEffect.json
```

### 6. Running the fuzzer

The fuzzer deploys the contract itself — no manual deploy step is needed.

**Important**: The fuzzer calls `aztec-wallet` directly via shell commands. With the
nightly sandbox, the wallet must run inside the Docker container. Create a wrapper at
`~/.local/bin/aztec-wallet` (or anywhere on PATH) that forwards commands into the
container:

```bash
#!/usr/bin/env bash
exec docker exec aztec-sandbox-nightly node --no-warnings \
  /usr/src/yarn-project/cli-wallet/dest/bin/index.js "$@"
```

Make it executable: `chmod +x ~/.local/bin/aztec-wallet`

Since the wallet runs inside the container, the artifact must also be inside the
container. Copy it in and set `SIDE_EFFECT_ARTIFACT_PATH` to the container-internal path:

```bash
# Copy the pre-built artifact into the container
docker cp noir-projects/protocol-fuzzer/contracts/target/side_effect_contract-SideEffect.json \
  aztec-sandbox-nightly:/tmp/side_effect_contract-SideEffect.json

cd noir-projects/protocol-fuzzer

# Run the fuzzer (side-effect mode)
SIDE_EFFECT_ARTIFACT_PATH=/tmp/side_effect_contract-SideEffect.json \
  RUST_LOG=debug cargo run -- --machine side-effect --max-steps 5

# Run the integration test
SIDE_EFFECT_ARTIFACT_PATH=/tmp/side_effect_contract-SideEffect.json \
  RUST_LOG=debug cargo test side_effect_machine_smoke -- --ignored --nocapture
```

If you recompiled the artifact (step 5), it's already at this path inside the
container — skip the `docker cp`.

## Troubleshooting

### "ECONNREFUSED" on startup

The sandbox isn't running. Start it per step 2.

### "Contract class mismatch" on deploy

The artifact was compiled with a different nargo version than the sandbox expects.
Recompile inside the nightly container (step 5b).

### "Oracle callback X not found" on deploy/send

The contract was compiled against the wrong version of aztec-nr. The contract source
must use the nightly commit's aztec-nr API, not the repo's current `next` branch.
Re-extract the nightly source (step 5a) and update the contract source to match the
nightly's aztec-nr API.

### "Unknown function sync_private_state"

The contract was compiled against the repo's current aztec-nr which generates
`sync_state`. The nightly PXE expects `sync_private_state`. Recompile against
the nightly's aztec-nr.

### "Contract's public bytecode has not been transpiled"

The artifact wasn't transpiled. Run `bb-avm aztec_process` (step 5c).

### "Private function X must have a verification key"

The artifact is missing VKs. Run `bb-avm aztec_process` (step 5c), which generates
both transpiled bytecode and VKs.

### "Constructor method initialize not found"

The `__aztec_nr_internals__` prefix wasn't stripped. Run step 5d.

### Wallet "inquirer not found" error

Run step 3 to install the missing npm package.

### "Method not found: node_getCurrentBaseFees"

You're using the host `aztec-wallet` (from `~/.aztec/bin/`) which is the `latest`
version. It can't talk to the nightly sandbox. Use the wallet inside the container
(step 3) or the wrapper script (step 6).

## Architecture Notes

### Build pipeline

The full contract build pipeline is:

1. `nargo compile` - produces raw artifact JSON with `__aztec_nr_internals__` prefixed names
2. `bb-avm aztec_process` - transpiles public function bytecode to AVM format AND generates
   verification keys for private functions (replaces the old separate transpiler + VK steps)
3. `jq` strip prefix - removes `__aztec_nr_internals__` from function names

The official build script is `noir-projects/noir-contracts/bootstrap.sh` which uses
separate `$TRANSPILER` and `$BB` binaries, but `bb-avm aztec_process` combines both.

### Version matrix (as of 2026-02-13)

| Component | latest image | nightly image | repo (next branch) |
|-----------|-------------|---------------|-------------------|
| nargo | beta.11 | beta.18 | beta.18 |
| aztec-nr API | old | sync_private_state, RetrievedNote, destroy_note_unsafe | sync_state, ConfirmedNote, destroy_note |
| PXE wallet fn | sync_state (?) | sync_private_state | N/A |
| wallet CLI | works | broken (missing inquirer) | N/A |

### Key paths inside the nightly container

| Tool | Path |
|------|------|
| nargo | `/usr/src/noir/noir-repo/target/release/nargo` |
| bb-avm | `/usr/src/barretenberg/cpp/build/bin/bb-avm` |
| wallet CLI | `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js` |
| sandbox CLI | `node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js` |
| anvil | `/opt/foundry/bin/anvil` |
| pre-compiled contracts | `/usr/src/yarn-project/noir-contracts.js/artifacts/` |

## Stopping

```bash
docker stop aztec-sandbox-nightly
```

To clean up wallet state for a fresh run, also remove `~/.aztec/wallet/`.
