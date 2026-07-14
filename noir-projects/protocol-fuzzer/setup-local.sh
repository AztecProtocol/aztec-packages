#!/usr/bin/env bash
#
# Sets up a local Aztec sandbox for use with the protocol fuzzer.
# No Docker required -- everything runs on the host.
#
# Prerequisites:
#   cd $REPO_ROOT && ./bootstrap.sh build yarn-project
#
# What this script does:
#   1. Checks prerequisites (nargo, bb, anvil, node, jq, yarn-project build)
#   2. Kills any existing processes on ports 8545/8080/8089
#   3. Starts anvil (L1) and the Aztec node + PXE
#   4. Compiles contracts (nargo + transpile + VK generation)
#   5. Starts the bridge server
#
# Options:
#   --skip-compile   Skip contract compilation (reuse existing artifacts)
#
set -euo pipefail

SKIP_COMPILE=false
for arg in "$@"; do
    case "$arg" in
        --skip-compile) SKIP_COMPILE=true ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="${SCRIPT_DIR}/contracts"

# Binaries (overridable via env vars)
NARGO="${NARGO:-${REPO_ROOT}/noir/noir-repo/target/release/nargo}"
BB="${BB:-${REPO_ROOT}/barretenberg/cpp/build/bin/bb}"
ANVIL="${ANVIL:-/opt/foundry/bin/anvil}"
TRANSPILER="${TRANSPILER:-${REPO_ROOT}/avm-transpiler/target/release/avm-transpiler}"

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

log()  { echo "==> $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }

# PIDs of background processes we start -- killed if the script fails partway through.
BG_PIDS=()
SETUP_COMPLETE=false
cleanup() {
    if [ "$SETUP_COMPLETE" = true ]; then
        return
    fi
    if [ ${#BG_PIDS[@]} -gt 0 ]; then
        log "Setup failed -- stopping background processes: ${BG_PIDS[*]}"
        kill "${BG_PIDS[@]}" 2>/dev/null || true
        wait "${BG_PIDS[@]}" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# kill_on_port PORT -- kill any process listening on this TCP port
kill_on_port() {
    local port=$1 pids
    pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        log "Killing process(es) on port ${port}: ${pids}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        # Wait for the port to be fully released (up to 10s).
        local elapsed=0
        while lsof -ti "tcp:${port}" >/dev/null 2>&1 && [ $elapsed -lt 10 ]; do
            sleep 1
            elapsed=$((elapsed + 1))
        done
    fi
}

# wait_for_url PID URL MAX_SECONDS LOG_FILE
# Polls URL every 2s. Bails early if PID dies, printing last 30 lines of LOG_FILE.
wait_for_url() {
    local pid=$1 url=$2 max=$3 logfile=$4 elapsed=0
    while [ $elapsed -lt "$max" ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "--- last 30 lines of ${logfile} ---"
            tail -30 "$logfile"
            die "Process ${pid} exited unexpectedly"
        fi
        local code
        code=$(curl -so /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
        [ -n "$code" ] && [ "$code" != "000" ] && return 0
        sleep 2
        elapsed=$((elapsed + 2))
    done
    die "Timed out after ${max}s waiting for ${url}. Check ${logfile}"
}

# --------------------------------------------------------------------------- #
# 1. Check prerequisites
# --------------------------------------------------------------------------- #

log "Checking prerequisites..."

missing=()
[ -x "$NARGO" ]  || missing+=("nargo (expected at ${NARGO})")
[ -x "$BB" ]     || missing+=("bb (expected at ${BB})")
[ -x "$ANVIL" ]  || missing+=("anvil (expected at ${ANVIL})")
command -v node >/dev/null  || missing+=("node")
command -v jq >/dev/null    || missing+=("jq")
command -v curl >/dev/null  || missing+=("curl")

if [ ${#missing[@]} -gt 0 ]; then
    die "Missing prerequisites: ${missing[*]}
  Run the full bootstrap to build everything:
    cd ${REPO_ROOT} && ./bootstrap.sh build yarn-project"
fi

# Determine which tool to use for artifact processing (transpilation + prefix stripping).
# bb aztec_process (new) does it all in one step; avm-transpiler (old) needs separate steps.
USE_BB_AZTEC_PROCESS=false
if "$BB" aztec_process 2>&1 | grep -q "contract artifact"; then
    USE_BB_AZTEC_PROCESS=true
    log "Using: bb aztec_process"
elif [ -x "$TRANSPILER" ]; then
    log "Using: avm-transpiler + jq prefix strip + bb write_vk"
else
    die "No artifact processor found.
  Option A: Rebuild bb with AVM support
  Option B: Build the avm-transpiler:
    cd ${REPO_ROOT}/avm-transpiler && cargo build --release"
fi

# Verify yarn-project is properly built. A partial build (swc-only, no generate steps)
# will have dest/ dirs but missing generated files, causing runtime crashes.
YP="${REPO_ROOT}/yarn-project"
missing_build=()
[ -d "${YP}/cli-wallet/dest" ]                                  || missing_build+=("cli-wallet/dest")
[ -f "${YP}/cli/dest/config/generated/networks.js" ]            || missing_build+=("cli/generated/networks.js")
[ -f "${YP}/ethereum/dest/generated/l1-contracts-defaults.js" ] || missing_build+=("ethereum/generated/l1-contracts-defaults.js")
[ -f "${YP}/noir-protocol-circuits-types/dest/vk_tree.js" ]     || missing_build+=("noir-protocol-circuits-types/vk_tree.js")
if [ ${#missing_build[@]} -gt 0 ]; then
    die "yarn-project is not fully built (missing: ${missing_build[*]}).
  Run the full bootstrap first:
    cd ${REPO_ROOT} && ./bootstrap.sh build yarn-project"
fi

log "All prerequisites OK"

# --------------------------------------------------------------------------- #
# 2. Kill existing processes on our ports
# --------------------------------------------------------------------------- #

log "Checking for port conflicts..."
kill_on_port 8545
kill_on_port 8080
kill_on_port 8089

# --------------------------------------------------------------------------- #
# 3. Start anvil
# --------------------------------------------------------------------------- #

log "Starting anvil on port 8545..."
"$ANVIL" --host 0.0.0.0 --port 8545 > /tmp/anvil-local.log 2>&1 &
ANVIL_PID=$!
BG_PIDS+=("$ANVIL_PID")
sleep 1
if ! kill -0 "$ANVIL_PID" 2>/dev/null; then
    die "Anvil failed to start. Check /tmp/anvil-local.log"
fi
log "Anvil running (PID ${ANVIL_PID})"

# --------------------------------------------------------------------------- #
# 4. Start Aztec node and wait for PXE
# --------------------------------------------------------------------------- #

log "Starting Aztec node on port 8080..."
(
    cd "${REPO_ROOT}/yarn-project"
    ETHEREUM_SLOT_DURATION=5 \
    AZTEC_SLOT_DURATION=5 \
    AZTEC_EPOCH_DURATION=4 \
    SEQ_ENFORCE_TIME_TABLE=false \
    LOG_LEVEL=info \
    node --no-warnings ./aztec/dest/bin/index.js start \
        --local-network \
        --l1-rpc-urls http://127.0.0.1:8545 \
        > /tmp/aztec-node-local.log 2>&1
) &
NODE_PID=$!
BG_PIDS+=("$NODE_PID")

log "Waiting for PXE on port 8080 (up to 300s)..."
wait_for_url "$NODE_PID" http://localhost:8080 300 /tmp/aztec-node-local.log
log "PXE is ready"

# --------------------------------------------------------------------------- #
# 5. Compile contracts
# --------------------------------------------------------------------------- #

# Map package names to artifact base names (nargo uses the contract name, not the package name)
declare -A ARTIFACT_NAMES=(
    [side_effect_contract]="side_effect_contract-SideEffect"
    [parent_contract]="parent_contract-Parent"
)

if [ "$SKIP_COMPILE" = true ]; then
    log "Skipping contract compilation (--skip-compile)"
    for contract_pkg in side_effect_contract parent_contract; do
        artifact="${ARTIFACT_NAMES[$contract_pkg]}"
        json_path="${CONTRACTS_DIR}/target/${artifact}.json"
        [ -f "$json_path" ] || die "Artifact not found: ${json_path} (cannot --skip-compile without prior build)"
    done
else
    mkdir -p "${CONTRACTS_DIR}/target"

    for contract_pkg in side_effect_contract parent_contract; do
        artifact="${ARTIFACT_NAMES[$contract_pkg]}"
        json_path="${CONTRACTS_DIR}/target/${artifact}.json"

        log "Compiling ${contract_pkg}..."
        (cd "$CONTRACTS_DIR" && "$NARGO" compile --silence-warnings --inliner-aggressiveness 0 --package "$contract_pkg")

        if [ "$USE_BB_AZTEC_PROCESS" = true ]; then
            log "Processing ${artifact} with bb aztec_process..."
            "$BB" aztec_process -i "$json_path"
        else
            log "Transpiling ${artifact}..."
            "$TRANSPILER" "$json_path" "$json_path"

            log "Stripping __aztec_nr_internals__ prefix..."
            jq '.functions |= map(.name |= sub("^__aztec_nr_internals__"; ""))' "$json_path" > "${json_path}.tmp"
            mv "${json_path}.tmp" "$json_path"

            # Generate verification keys for private functions.
            log "Generating VKs for private functions..."
            vk_tmp_dir=$(mktemp -d)
            func_count=$(jq '.functions | length' "$json_path")
            for (( i=0; i<func_count; i++ )); do
                make_vk=$(jq -e ".functions[$i] | (.custom_attributes | index(\"public\") == null) and (.is_unconstrained == false)" "$json_path" 2>/dev/null || true)
                if [ "$make_vk" = "true" ]; then
                    fname=$(jq -r ".functions[$i].name" "$json_path")
                    log "  VK: ${fname}"
                    jq -r ".functions[$i].bytecode" "$json_path" \
                        | base64 -d | gunzip \
                        | "$BB" write_vk --scheme chonk -b - -o "$vk_tmp_dir" -v 2>/dev/null
                    vk_b64=$(base64 -w 0 < "$vk_tmp_dir/vk")
                    jq --arg vk "$vk_b64" --argjson idx "$i" \
                        '.functions[$idx].verification_key = $vk' "$json_path" > "${json_path}.tmp"
                    mv "${json_path}.tmp" "$json_path"
                fi
            done
            rm -rf "$vk_tmp_dir"
        fi

        log "Built ${artifact}"
    done
fi

# --------------------------------------------------------------------------- #
# 6. Start bridge
# --------------------------------------------------------------------------- #

# Verify node is still alive after compilation
if ! kill -0 "$NODE_PID" 2>/dev/null; then
    die "Aztec node died during contract compilation. Check /tmp/aztec-node-local.log"
fi

# Clear stale wallet state from previous runs (avoids "block hash not found" errors).
rm -rf "${HOME}/.aztec/wallet"

# Symlink yarn-project/node_modules next to wallet-bridge.mjs so its @aztec/* imports
# resolve. Keeping the symlink under noir-projects/ avoids polluting yarn-project/.
ln -sfn "${REPO_ROOT}/yarn-project/node_modules" "${SCRIPT_DIR}/node_modules"

log "Starting bridge server on port 8089..."
(cd "${SCRIPT_DIR}" && exec node --no-warnings wallet-bridge.mjs > /tmp/bridge-local.log 2>&1) &
BRIDGE_PID=$!
BG_PIDS+=("$BRIDGE_PID")

wait_for_url "$BRIDGE_PID" http://localhost:8089/health 60 /tmp/bridge-local.log
log "Bridge is ready (PID ${BRIDGE_PID})"

# --------------------------------------------------------------------------- #
# Done
# --------------------------------------------------------------------------- #

echo ""
log "Local sandbox is ready!"
echo ""
echo "  Anvil:      http://localhost:8545  (PID ${ANVIL_PID}, log: /tmp/anvil-local.log)"
echo "  Aztec node: http://localhost:8080  (PID ${NODE_PID}, log: /tmp/aztec-node-local.log)"
echo "  Bridge:     http://localhost:8089  (PID ${BRIDGE_PID}, log: /tmp/bridge-local.log)"
echo "  Slot time:  5s"
echo ""
echo "Run the fuzzer:"
echo ""
echo "  cd ${SCRIPT_DIR}"
echo "  RUST_LOG=debug cargo run -- side-effect --artifacts-dir ${CONTRACTS_DIR}/target --max-steps 5"
echo ""
echo "To stop all services:"
echo "  kill ${ANVIL_PID} ${NODE_PID} ${BRIDGE_PID}"
echo ""

SETUP_COMPLETE=true
