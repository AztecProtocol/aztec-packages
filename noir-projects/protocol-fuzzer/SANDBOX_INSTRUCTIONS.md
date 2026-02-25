# Protocol Fuzzer: Running with Nightly Docker Sandbox

## Overview

The protocol fuzzer has two state machines:

- **token**: Fuzzes the Token contract (mint/burn/transfer, public and private).
  Works with any Aztec sandbox — no special setup needed.
- **side-effect**: Fuzzes note lifecycle, nullifier emission, and cross-contract calls via
  custom `SideEffect` and `Parent` contracts. **Requires the nightly sandbox.**

Both machines invoke `aztec-wallet` CLI commands against a running Aztec sandbox.

## Why the nightly sandbox?

The side-effect machine deploys custom contracts that must be version-compatible with the
sandbox (PXE, sequencer, L1 contracts), the wallet CLI, and the compiled artifact format.

The `latest` Docker image ships an older nargo that stack-overflows on current aztec-nr.
The `nightly` image has a matching nargo but its wallet is broken (missing `inquirer` npm
package). The contracts must be compiled against the **nightly's aztec-nr**, not the repo's
current branch, because oracle interfaces differ between versions.

## Quick Start (automated)

`setup-nightly-sandbox.sh` handles everything: starts the container, fixes the wallet,
identifies the nightly commit, compiles both contracts, imports test accounts, and installs
the wallet wrapper.

```bash
cd noir-projects/protocol-fuzzer
bash setup-nightly-sandbox.sh
```

Then run the fuzzer:

```bash
# Side-effect machine (artifacts default to /tmp/ inside the container)
RUST_LOG=debug cargo run -- side-effect --max-steps 5

# Token machine (works with any sandbox)
RUST_LOG=debug cargo run -- token --max-steps 5

# Integration smoke tests
cargo test -- --ignored --nocapture
```

To replay a specific failure seed:

```bash
cargo run -- side-effect --max-steps 100000 --seed 0x5a7211231dcd6500
```

## Manual Step-by-Step Setup

If the automated script doesn't work, follow these steps.

### 1. Identify the nightly commit

Match the nightly image's nargo hash to an aztec-packages commit:

```bash
docker run --rm --entrypoint "" aztecprotocol/aztec:nightly \
  /usr/src/noir/noir-repo/target/release/nargo --version
# e.g. 67478b2f9d7c6239686e8de8a82f2719e54fbd40

NIGHTLY_NOIR_HASH="67478b2f9d7c6239686e8de8a82f2719e54fbd40"
git log --all --oneline --diff-filter=M -- noir/noir-repo | while read hash msg; do
  sub=$(git ls-tree $hash noir/noir-repo 2>/dev/null | awk '{print $3}')
  if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
    echo "MATCH: $hash $msg"
    break
  fi
done
# As of 2026-02-18, the match is commit 681ca9b5c9
```

### 2. Start the nightly sandbox

```bash
docker run -d --rm --name aztec-sandbox-nightly \
  -p 8080:8080 -p 8545:8545 \
  -e LOG_LEVEL=info \
  --entrypoint "" \
  aztecprotocol/aztec:nightly \
  bash -c '/opt/foundry/bin/anvil --host 0.0.0.0 --port 8545 & \
  sleep 2 && node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --local-network --l1-rpc-urls http://127.0.0.1:8545'
```

Wait for PXE startup:

```bash
docker logs aztec-sandbox-nightly 2>&1 | grep "PXE.*Started"
curl -so /dev/null -w '%{http_code}' http://localhost:8080  # 405 = ready
```

### 3. Fix the wallet (missing inquirer)

```bash
docker exec aztec-sandbox-nightly bash -c '
  mkdir -p /tmp/inquirer-fix && cd /tmp/inquirer-fix
  npm init -y > /dev/null 2>&1
  npm install inquirer@10 > /dev/null 2>&1
  # Only copy packages that do NOT already exist. Overwriting nightly-bundled
  # packages (e.g. @aztec/*) breaks the sandbox.
  for pkg in node_modules/*; do
    name=$(basename "$pkg")
    [ ! -e "/usr/src/yarn-project/node_modules/$name" ] && cp -r "$pkg" /usr/src/yarn-project/node_modules/
  done
'
```

### 4. Import test accounts

```bash
docker exec aztec-sandbox-nightly node --no-warnings \
  /usr/src/yarn-project/cli-wallet/dest/bin/index.js import-test-accounts
```

### 5. Compile contract artifacts

Compile both contracts inside the container.

#### 5a. Extract nightly aztec-nr and copy contract sources

```bash
NIGHTLY_COMMIT=681ca9b5c9

# Extract aztec-nr and protocol-circuits from the nightly commit
mkdir -p /tmp/nightly-build/side_effect_contract/src
mkdir -p /tmp/nightly-build/parent_contract/src
git archive $NIGHTLY_COMMIT -- noir-projects/aztec-nr/ noir-projects/noir-protocol-circuits/ \
  | tar -x -C /tmp/nightly-build --strip-components=1

# Copy contract sources; fix dependency paths (3 levels -> 1 level deep)
for contract in side_effect_contract parent_contract; do
  cp contracts/${contract}/src/main.nr /tmp/nightly-build/${contract}/src/
  sed 's|path = "../../../aztec-nr/|path = "../aztec-nr/|g' \
    contracts/${contract}/Nargo.toml > /tmp/nightly-build/${contract}/Nargo.toml
done
cp contracts/Nargo.toml /tmp/nightly-build/
```

#### 5b. Compile inside the container

```bash
docker cp /tmp/nightly-build aztec-sandbox-nightly:/tmp/nightly-build

for pkg in side_effect_contract parent_contract; do
  docker exec -w /tmp/nightly-build aztec-sandbox-nightly \
    /usr/src/noir/noir-repo/target/release/nargo compile \
    --silence-warnings --inliner-aggressiveness 0 --package "$pkg"
done
```

#### 5c. Transpile + generate VKs, strip prefix, copy artifacts

```bash
declare -A ARTIFACTS=(
  [side_effect_contract]="side_effect_contract-SideEffect"
  [parent_contract]="parent_contract-Parent"
)

for pkg in side_effect_contract parent_contract; do
  artifact="${ARTIFACTS[$pkg]}"

  # Transpile public bytecode + generate private VKs
  docker exec aztec-sandbox-nightly \
    /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process \
    -i "/tmp/nightly-build/target/${artifact}.json"

  # Strip __aztec_nr_internals__ prefix
  docker exec aztec-sandbox-nightly bash -c "
    json=/tmp/nightly-build/target/${artifact}.json
    jq '.functions |= map(.name |= sub(\"^__aztec_nr_internals__\"; \"\"))' \"\$json\" > \"\${json}.tmp\"
    mv \"\${json}.tmp\" \"\$json\"
  "

  # Copy to standard container path and to host
  docker exec aztec-sandbox-nightly cp \
    "/tmp/nightly-build/target/${artifact}.json" "/tmp/${artifact}.json"
  docker cp "aztec-sandbox-nightly:/tmp/${artifact}.json" \
    "contracts/target/${artifact}.json"
done
```

### 6. Set up the wallet wrapper and run

The fuzzer calls `aztec-wallet` directly. With the nightly sandbox, commands must run
inside the container. Create a wrapper at `~/.local/bin/aztec-wallet`:

```bash
#!/usr/bin/env bash
exec docker exec aztec-sandbox-nightly node --no-warnings \
  /usr/src/yarn-project/cli-wallet/dest/bin/index.js "$@"
```

Make it executable and ensure `~/.local/bin` is on PATH before `~/.aztec/bin`.

Run the fuzzer (artifact paths default to `/tmp/` inside the container):

```bash
RUST_LOG=debug cargo run -- side-effect --max-steps 5
```

## Contracts

### SideEffect contract (`contracts/side_effect_contract/`)

Custom contract for testing note lifecycle and nullifier operations:
- `call_create_note` / `call_create_and_complete_partial_note` — create notes
- `call_destroy_note` — get notes sorted by value ASC, destroy the smallest
- `call_view_notes_many` / `call_get_notes_many` — query notes (returns `[u128; 2]`)
- `emit_nullifier` / `test_nullifier_inclusion` — nullifier operations
- `test_note_inclusion` — prove note exists in the tree

### Parent contract (`contracts/parent_contract/`)

Forwards private calls to the SideEffect contract for cross-contract call testing:
- `forward_call_create_note`
- `forward_call_destroy_note`
- `forward_test_note_inclusion`
- `forward_emit_nullifier`
- `forward_test_nullifier_inclusion`

The fuzzer randomly chooses between direct calls and via-parent calls to exercise
both code paths.

## Troubleshooting

### "ECONNREFUSED" on startup
The sandbox isn't running. Start it per step 2.

### "Contract class mismatch" on deploy
Artifact compiled with wrong nargo version. Recompile inside the nightly container (step 5b).

### "Oracle callback X not found" on deploy/send
Contract compiled against wrong aztec-nr. Re-extract the nightly source (step 5a).

### "Contract ... not found" on deploy
The artifact path is a host path but the wallet runs inside Docker. Use a container path
(e.g. `/tmp/side_effect_contract-SideEffect.json`).

### "Unknown function sync_private_state"
Contract compiled against repo's current aztec-nr (generates `sync_state`). Recompile
against the nightly's aztec-nr.

### "Contract's public bytecode has not been transpiled"
Run `bb-avm aztec_process` (step 5c).

### "Private function X must have a verification key"
Run `bb-avm aztec_process` (step 5c) — it generates both transpiled bytecode and VKs.

### "Constructor method initialize not found"
The `__aztec_nr_internals__` prefix wasn't stripped. Run the `jq` step in 5c.

### Wallet "inquirer not found" error
Run step 3.

### "Method not found: node_getCurrentBaseFees"
Using the host `aztec-wallet` (`~/.aztec/bin/`) which is the `latest` version. Use the
container wallet via the wrapper (step 6).

## Architecture Notes

### Build pipeline

1. `nargo compile` — raw artifact JSON with `__aztec_nr_internals__` prefixed names
2. `bb-avm aztec_process` — transpiles public bytecode to AVM + generates private VKs
3. `jq` strip prefix — removes `__aztec_nr_internals__` from function names

### Version matrix (as of 2026-02-18)

| Component | latest image | nightly image | repo (next branch) |
|-----------|-------------|---------------|-------------------|
| nargo | beta.11 | beta.18 | beta.18 |
| aztec-nr API | old | RetrievedNote, destroy_note_unsafe | ConfirmedNote, destroy_note |
| wallet CLI | works | broken (missing inquirer) | N/A |

### Key paths inside the nightly container

| Tool | Path |
|------|------|
| nargo | `/usr/src/noir/noir-repo/target/release/nargo` |
| bb-avm | `/usr/src/barretenberg/cpp/build/bin/bb-avm` |
| wallet CLI | `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js` |
| sandbox CLI | `node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js` |
| anvil | `/opt/foundry/bin/anvil` |

## Stopping

```bash
docker stop aztec-sandbox-nightly
```

To clean up wallet state for a fresh run, also remove `~/.aztec/wallet/`.
