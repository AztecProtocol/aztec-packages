# Protocol Fuzzer: Running with Nightly Docker Sandbox

> **For local development** (no Docker), use `setup-local.sh` instead. It starts
> anvil, the Aztec node, compiles contracts, and launches the bridge — all on the
> host. See `README.md` for quick-start instructions.

## Overview

The protocol fuzzer has two state machines:

- **token**: Fuzzes the Token contract (mint/burn/transfer, public and private).
  Works with any Aztec sandbox -- no special setup needed.
- **side-effect**: Fuzzes note lifecycle, nullifier emission, and cross-contract calls via
  custom `SideEffect` and `Parent` contracts. **Requires the nightly sandbox.**

Both machines talk to the sandbox via a persistent Node.js HTTP bridge (`wallet-bridge.mjs`)
that keeps a single CLIWallet instance alive across requests.

## Why the nightly sandbox?

The side-effect machine deploys custom contracts that must be version-compatible with the
sandbox (PXE, sequencer, L1 contracts), the wallet CLI, and the compiled artifact format.

The `latest` Docker image ships an older nargo that stack-overflows on current aztec-nr.
Dated nightly images (e.g. `5.0.0-nightly.20260224`) have a matching nargo but the wallet
is broken (missing `inquirer` npm package). The contracts must be compiled against the
**nightly's aztec-nr**, not the repo's current branch, because oracle interfaces may differ
between versions (the setup script auto-detects when they match).

## Quick Start (automated)

`setup-nightly-sandbox.sh` handles everything: starts the container with fast 5-second
slots, fixes the wallet, identifies the nightly commit, compiles both contracts, and
starts the bridge server. Test accounts are imported automatically by the fuzzer on each run.

```bash
cd noir-projects/labs/protocol-fuzzer
bash setup-nightly-sandbox.sh
```

By default the script uses the last tested nightly tag (`KNOWN_GOOD_TAG` in the script).
To try a newer nightly, use `find-latest-nightly.sh` to query Docker Hub:

```bash
bash find-latest-nightly.sh                # prints e.g. 5.0.0-nightly.20260225
bash setup-nightly-sandbox.sh --latest     # auto-discovers and uses the newest tag
NIGHTLY_IMAGE=aztecprotocol/aztec:5.0.0-nightly.20260225 bash setup-nightly-sandbox.sh  # specific tag
```

Then run the fuzzer:

```bash
# Side-effect machine
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

## Performance

Transaction throughput is dominated by the Aztec L2 slot duration -- each send must wait
for the next block. Four things bring per-transaction time from ~35s down to ~4-5s:

1. **Fast slots.** The setup script starts the sandbox with 5-second L1/L2 slot durations
   (default 36s/12s). On v5 images, the local sandbox owns its local chain and uses the
   automine sequencer, so it does not need a sequencer timetable override.
2. **Persistent bridge.** `wallet-bridge.mjs` keeps a single Node.js wallet instance alive inside
   the container. Without it, each operation would shell out to the CLI wallet, paying a
   ~1.5s Node.js cold-start every time.
3. **Parallel batching.** The fuzzer buffers consecutive non-conflicting sends and fires
   them concurrently so they land in the same block. A batch of N sends takes the same
   time as a single send. Use `--max-batch-size` to tune (default: 8).
4. **Simulated proofs (default).** Client-side proof generation is off by default (`--prove`
   enables it). With the nightly sandbox's simulated proofs the difference is modest (~18%
   faster without), but with real provers the savings would be larger.

Benchmark (side-effect machine, 100 steps, 5s slots, batching enabled):

| | No proofs (default) | `--prove` |
|---|---|---|
| Wall clock | ~2m53s | ~3m25s |
| Per step (avg) | ~1.7s | ~2.1s |

## Manual Step-by-Step Setup

If the automated script doesn't work, follow these steps.

### 1. Identify the nightly commit

Match the nightly image's nargo hash to an aztec-packages commit:

```bash
docker run --rm --entrypoint "" aztecprotocol/aztec:5.0.0-nightly.20260224 \
  /usr/src/noir/noir-repo/target/release/nargo --version
# e.g. 7d07e187fb04d79f5a7cf41501d2c12bc2b1d5d2

NIGHTLY_NOIR_HASH="7d07e187fb04d79f5a7cf41501d2c12bc2b1d5d2"

# If it matches your repo's noir submodule, use HEAD directly:
REPO_HASH=$(git ls-tree HEAD noir/noir-repo | awk '{print $3}')
if [ "$REPO_HASH" = "$NIGHTLY_NOIR_HASH" ]; then
  echo "Match! Use HEAD for aztec-nr"
  NIGHTLY_COMMIT=HEAD
else
  # Search origin/next newest-first for a commit with matching noir hash
  git log origin/next --format='%H' -200 | while read hash; do
    sub=$(git ls-tree $hash noir/noir-repo 2>/dev/null | awk '{print $3}')
    if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
      echo "MATCH: $(git log --oneline -1 $hash)"
      break
    fi
  done
fi
```

### 2. Start the nightly sandbox

```bash
docker run -d --rm --name aztec-sandbox-nightly \
  -p 8080:8080 -p 8545:8545 -p 8089:8089 \
  -e LOG_LEVEL=info \
  -e ETHEREUM_SLOT_DURATION=5 \
  -e AZTEC_SLOT_DURATION=5 \
  -e AZTEC_EPOCH_DURATION=4 \
  --entrypoint "" \
  aztecprotocol/aztec:5.0.0-nightly.20260224 \
  bash -c '/opt/foundry/bin/anvil --host 0.0.0.0 --port 8545 & \
  sleep 2 && node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --local-network --l1-rpc-urls http://127.0.0.1:8545'
```

**Important:** Do NOT pass `--block-time` to anvil. The L1 deployment script sets
`anvil_setBlockTimestampInterval` to match `ETHEREUM_SLOT_DURATION`. Passing `--block-time`
with a different value causes chain time to race ahead of wall-clock time, breaking the
sequencer.

**Note:** Port 8089 is exposed for the bridge server (step 5).

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

### 4. Compile contract artifacts

Compile both contracts inside the container.

#### 4a. Extract aztec-nr and copy contract sources

```bash
NIGHTLY_COMMIT=HEAD  # or the commit hash from step 1

# Extract aztec-nr and protocol-circuits
mkdir -p /tmp/nightly-build/side_effect_contract/src
mkdir -p /tmp/nightly-build/parent_contract/src
git archive $NIGHTLY_COMMIT -- noir-projects/labs/aztec-nr/ noir-projects/fnd/noir-protocol-circuits/ \
  | tar -x -C /tmp/nightly-build --strip-components=1

# Copy contract sources; fix dependency paths (3 levels -> 1 level deep)
for contract in side_effect_contract parent_contract; do
  cp contracts/${contract}/src/main.nr /tmp/nightly-build/${contract}/src/
  sed 's|path = "../../../aztec-nr/|path = "../aztec-nr/|g' \
    contracts/${contract}/Nargo.toml > /tmp/nightly-build/${contract}/Nargo.toml
done
cp contracts/Nargo.toml /tmp/nightly-build/
```

#### 4b. Compile, transpile, strip prefix

```bash
docker cp /tmp/nightly-build aztec-sandbox-nightly:/tmp/nightly-build

declare -A ARTIFACTS=(
  [side_effect_contract]="side_effect_contract-SideEffect"
  [parent_contract]="parent_contract-Parent"
)

for pkg in side_effect_contract parent_contract; do
  artifact="${ARTIFACTS[$pkg]}"

  docker exec -w /tmp/nightly-build aztec-sandbox-nightly bash -c "
    set -e
    /usr/src/noir/noir-repo/target/release/nargo compile \
        --silence-warnings --inliner-aggressiveness 0 --package ${pkg}
    /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process \
        -i target/${artifact}.json
  "

  docker cp "aztec-sandbox-nightly:/tmp/nightly-build/target/${artifact}.json" \
    "contracts/target/${artifact}.json"
done
```

### 5. Start the bridge server

The bridge server (`wallet-bridge.mjs`) runs inside the container and provides a persistent
HTTP API that the fuzzer calls:

```bash
docker cp wallet-bridge.mjs aztec-sandbox-nightly:/usr/src/yarn-project/wallet-bridge.mjs

docker exec -d aztec-sandbox-nightly \
  bash -c 'cd /usr/src/yarn-project && exec node --no-warnings wallet-bridge.mjs > /tmp/bridge.log 2>&1'

# Wait for it to start
curl -s http://localhost:8089/health  # {"ok":true}
```

### 6. Run the fuzzer

Test accounts are imported automatically by the fuzzer on each run.

```bash
RUST_LOG=debug cargo run -- side-effect --max-steps 5
```

## Contracts

### SideEffect contract (`contracts/side_effect_contract/`)

Custom contract for testing note lifecycle and nullifier operations:
- `call_create_note` / `call_create_and_complete_partial_note` -- create notes
- `call_destroy_note` -- get notes sorted by value ASC, destroy the smallest
- `call_view_notes_many` / `call_get_notes_many` -- query notes (returns `[u128; 2]`)
- `emit_nullifier` / `test_settled_nullifier_inclusion` -- nullifier operations
- `test_note_inclusion` -- prove note exists in the tree

### Parent contract (`contracts/parent_contract/`)

Forwards private calls to the SideEffect contract for cross-contract call testing:
- `forward_call_create_note`
- `forward_call_destroy_note`
- `forward_test_note_inclusion`
- `forward_emit_nullifier`
- `forward_test_settled_nullifier_inclusion`

The fuzzer randomly chooses between direct calls and via-parent calls to exercise
both code paths.

## Troubleshooting

### "ECONNREFUSED" on startup
The sandbox isn't running. Start it per step 2.

### "Bridge not reachable at http://localhost:8089"
The bridge server isn't running. Start it per step 5.

### "Contract class mismatch" on deploy
Artifact compiled with wrong nargo version. Recompile inside the nightly container (step 4b).

### "Oracle callback X not found" on deploy/send
Contract compiled against wrong aztec-nr. Re-extract the nightly source (step 4a).

### "Contract ... not found" on deploy
The artifact path is a host path but the wallet runs inside Docker. Use a container path
(e.g. `/tmp/side_effect_contract-SideEffect.json`).

### "Unknown function sync_private_state"
Contract compiled against repo's current aztec-nr (generates `sync_state`). Recompile
against the nightly's aztec-nr.

### "Contract's public bytecode has not been transpiled"
Run `bb-avm aztec_process` (step 4b).

### "Private function X must have a verification key"
Run `bb-avm aztec_process` (step 4b) -- it generates both transpiled bytecode and VKs.

### "Constructor method initialize not found"
The internal prefix wasn't stripped. Ensure `bb-avm aztec_process` ran successfully in step 4b.

### Wallet "inquirer not found" error
Run step 3.

### "Method not found: aztec_getCurrentBaseFees"
Using the host `aztec-wallet` (`~/.aztec/bin/`) which is the `latest` version. The bridge
uses the container's wallet SDK directly, so this shouldn't happen with the bridge.

### "Slot mismatch with rollup contract"
The L1 contracts were deployed with different slot durations than the node expects. This
happens when using the old `nightly` tag (Jan 2026) with `AZTEC_SLOT_DURATION` env vars.
Use a dated nightly (`5.0.0-nightly.YYYYMMDD`) instead.

### "Block proposal initialize deadline cannot be negative"
The slot duration is too short for the sequencer timetable. 5 seconds works on older images;
lower values may not. From v5, `SEQ_ENFORCE_TIME_TABLE` is gone and this error no longer
applies to the local sandbox: the local network runs the automine sequencer, which has no
slot timetable.

## Architecture Notes

### Why the bridge

Each CLI wallet invocation spawns a fresh Node.js process (~1.5s cold-start). The
bridge loads the wallet SDK once and accepts HTTP requests, avoiding this overhead
on every operation.

### How the bridge works

`wallet-bridge.mjs` runs inside the container and lazily initializes a `CLIWallet` instance
on the first request. The Rust fuzzer resolves aliases (`accounts:test0`,
`contracts:test0`) to hex addresses before sending them to the bridge via HTTP POST.

### Build pipeline

1. `nargo compile` -- raw artifact JSON with `__aztec_nr_internals__` prefixed names
2. `bb-avm aztec_process` -- transpiles public bytecode to AVM, strips internal prefixes, and generates private VKs

### Version matrix (as of 2026-02-25)

| Component | latest image | dated nightly (20260224) | repo (next branch) |
|-----------|-------------|--------------------------|-------------------|
| nargo | beta.11 | beta.19 | beta.19 |
| aztec-nr API | old | current | current |
| wallet CLI | works | broken (missing inquirer) | N/A |
| slot duration env vars | untested | supported | N/A |

### Key paths inside the nightly container

| Tool | Path |
|------|------|
| nargo | `/usr/src/noir/noir-repo/target/release/nargo` |
| bb-avm | `/usr/src/barretenberg/cpp/build/bin/bb-avm` |
| wallet CLI | `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js` |
| sandbox CLI | `node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js` |
| anvil | `/opt/foundry/bin/anvil` |
| bridge server | `/usr/src/yarn-project/wallet-bridge.mjs` |
| bridge log | `/tmp/bridge.log` |

## Stopping

```bash
docker stop aztec-sandbox-nightly
```

To clean up wallet state for a fresh run, also remove `~/.aztec/wallet/`.
