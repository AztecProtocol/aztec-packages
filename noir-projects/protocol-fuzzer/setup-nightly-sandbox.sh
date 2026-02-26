#!/usr/bin/env bash
#
# Sets up the nightly Aztec sandbox for use with the protocol fuzzer.
#
# What this script does:
#   1. Starts a dated nightly sandbox container with fast 5s L2 slots
#   2. Fixes the wallet CLI (installs missing inquirer npm package)
#   3. Finds the matching aztec-packages commit and compiles both contracts
#   4. Starts the Node.js bridge server (persistent HTTP API for the fuzzer)
#   5. Installs an aztec-wallet wrapper for CLI fallback mode
#
set -euo pipefail

CONTAINER_NAME="aztec-sandbox-nightly"
IMAGE="${NIGHTLY_IMAGE:-aztecprotocol/aztec:5.0.0-nightly.20260224}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTRACTS_DIR="${REPO_ROOT}/noir-projects/protocol-fuzzer/contracts"
NIGHTLY_BUILD_DIR="/tmp/nightly-build"
WRAPPER_PATH="${HOME}/.local/bin/aztec-wallet"

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

log()  { echo "==> $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }

# wait_for_http URL MAX_SECONDS [INTERVAL]
# Polls until any HTTP response (even 4xx/5xx) is received.
wait_for_http() {
    local url=$1 max=$2 interval=${3:-5} elapsed=0
    while [ $elapsed -lt "$max" ]; do
        local code
        code=$(curl -so /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
        [ -n "$code" ] && [ "$code" != "000" ] && return 0
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done
    return 1
}

# --------------------------------------------------------------------------- #
# 1. Start the nightly sandbox
# --------------------------------------------------------------------------- #

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log "Stopping existing container..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    sleep 2
fi
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

log "Starting nightly sandbox (${IMAGE})..."
# Fast slots: AZTEC_SLOT_DURATION=5 (default 36) with timetable enforcement off.
# Don't pass --block-time to anvil — the deploy script sets it via RPC.
docker run -d --rm --name "$CONTAINER_NAME" \
    -p 8080:8080 -p 8545:8545 -p 8089:8089 \
    -e LOG_LEVEL=info \
    -e ETHEREUM_SLOT_DURATION=5 \
    -e AZTEC_SLOT_DURATION=5 \
    -e AZTEC_EPOCH_DURATION=4 \
    -e SEQ_ENFORCE_TIME_TABLE=false \
    --entrypoint "" \
    "$IMAGE" \
    bash -c '/opt/foundry/bin/anvil --host 0.0.0.0 --port 8545 & \
    sleep 2 && node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --local-network --l1-rpc-urls http://127.0.0.1:8545'

log "Waiting for PXE..."
elapsed=0
while [ $elapsed -lt 180 ]; do
    logs=$(docker logs "$CONTAINER_NAME" 2>&1 || true)
    if echo "$logs" | grep -q "Started PXE connected to chain"; then
        log "PXE is ready (${elapsed}s)"
        break
    fi
    sleep 5; elapsed=$((elapsed + 5))
done
[ $elapsed -ge 180 ] && die "PXE did not start within 180s. Check: docker logs $CONTAINER_NAME"

# --------------------------------------------------------------------------- #
# 2. Fix the wallet CLI (missing inquirer)
# --------------------------------------------------------------------------- #

log "Installing missing inquirer npm package..."
docker exec "$CONTAINER_NAME" bash -c '
    mkdir -p /tmp/inquirer-fix && cd /tmp/inquirer-fix
    npm init -y > /dev/null 2>&1
    npm install inquirer@10 > /dev/null 2>&1
    for pkg in node_modules/*; do
        name=$(basename "$pkg")
        [ ! -e "/usr/src/yarn-project/node_modules/$name" ] && cp -r "$pkg" /usr/src/yarn-project/node_modules/
    done
'
docker exec "$CONTAINER_NAME" node --no-warnings \
    /usr/src/yarn-project/cli-wallet/dest/bin/index.js --version >/dev/null 2>&1 \
    || die "Wallet CLI is broken after inquirer fix"

# --------------------------------------------------------------------------- #
# 3. Find nightly commit, compile contracts
# --------------------------------------------------------------------------- #

log "Identifying nightly commit..."
NIGHTLY_NOIR_HASH=$(docker exec "$CONTAINER_NAME" \
    /usr/src/noir/noir-repo/target/release/nargo --version 2>&1 \
    | grep -oP '[0-9a-f]{40}' | head -1)
[ -z "$NIGHTLY_NOIR_HASH" ] && die "Could not extract noir hash from nargo --version"
log "Nightly noir hash: ${NIGHTLY_NOIR_HASH}"

cd "$REPO_ROOT"
NIGHTLY_COMMIT=""
while read -r hash; do
    sub=$(git ls-tree "$hash" noir/noir-repo 2>/dev/null | awk '{print $3}')
    if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
        NIGHTLY_COMMIT="$hash"
        log "Matched: $(git log --oneline -1 "$hash")"
        break
    fi
done < <(git log origin/next --format='%H' -200)
[ -z "$NIGHTLY_COMMIT" ] && die "No commit on origin/next matches noir hash ${NIGHTLY_NOIR_HASH}. Try: git fetch --all"

log "Extracting aztec-nr from ${NIGHTLY_COMMIT}..."
rm -rf "$NIGHTLY_BUILD_DIR"
mkdir -p "${NIGHTLY_BUILD_DIR}/side_effect_contract/src" \
         "${NIGHTLY_BUILD_DIR}/parent_contract/src"

git archive "$NIGHTLY_COMMIT" -- noir-projects/aztec-nr/ noir-projects/noir-protocol-circuits/ \
    | tar -x -C "$NIGHTLY_BUILD_DIR" --strip-components=1

# Copy contract sources; fix dependency paths (3 levels → 1 level)
for contract in side_effect_contract parent_contract; do
    [ ! -f "${CONTRACTS_DIR}/${contract}/src/main.nr" ] && \
        die "Contract source not found: ${CONTRACTS_DIR}/${contract}/src/main.nr"
    cp "${CONTRACTS_DIR}/${contract}/src/main.nr" "${NIGHTLY_BUILD_DIR}/${contract}/src/"
    sed 's|path = "../../../aztec-nr/|path = "../aztec-nr/|g' \
        "${CONTRACTS_DIR}/${contract}/Nargo.toml" > "${NIGHTLY_BUILD_DIR}/${contract}/Nargo.toml"
done
cp "${CONTRACTS_DIR}/Nargo.toml" "${NIGHTLY_BUILD_DIR}/Nargo.toml"

log "Copying build directory into container..."
docker cp "$NIGHTLY_BUILD_DIR" "${CONTAINER_NAME}:/tmp/nightly-build"

# Compile, transpile, strip prefix, and copy each contract artifact.
# Package name → artifact base name (nargo uses the contract name, not the package).
declare -A ARTIFACTS=(
    [side_effect_contract]="side_effect_contract-SideEffect"
    [parent_contract]="parent_contract-Parent"
)

for pkg in side_effect_contract parent_contract; do
    artifact="${ARTIFACTS[$pkg]}"
    log "Building ${pkg}..."

    docker exec -w /tmp/nightly-build "$CONTAINER_NAME" bash -c "
        set -e
        /usr/src/noir/noir-repo/target/release/nargo compile \
            --silence-warnings --inliner-aggressiveness 0 --package ${pkg}
        /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process \
            -i target/${artifact}.json
        jq '.functions |= map(.name |= sub(\"^__aztec_nr_internals__\"; \"\"))' \
            target/${artifact}.json > /tmp/${artifact}.json
    "

    docker cp "${CONTAINER_NAME}:/tmp/${artifact}.json" \
        "${CONTRACTS_DIR}/target/${artifact}.json"
    log "  → contracts/target/${artifact}.json"
done

# --------------------------------------------------------------------------- #
# 4. Start the bridge server
# --------------------------------------------------------------------------- #

# bb-avm may have crashed the HTTP server; wait for it to recover.
log "Waiting for PXE HTTP endpoint..."
wait_for_http http://localhost:8080 120 || die "PXE HTTP endpoint did not recover"

log "Importing test accounts..."
docker exec "$CONTAINER_NAME" node --no-warnings \
    /usr/src/yarn-project/cli-wallet/dest/bin/index.js import-test-accounts \
    > /dev/null 2>&1

BRIDGE_SRC="${REPO_ROOT}/noir-projects/protocol-fuzzer/bridge.mjs"
[ ! -f "$BRIDGE_SRC" ] && die "Bridge source not found: ${BRIDGE_SRC}"

log "Starting bridge server..."
docker cp "$BRIDGE_SRC" "${CONTAINER_NAME}:/usr/src/yarn-project/bridge.mjs"
docker exec -d "$CONTAINER_NAME" \
    bash -c 'cd /usr/src/yarn-project && exec node --no-warnings bridge.mjs > /tmp/bridge.log 2>&1'

if wait_for_http http://localhost:8089/health 60 2; then
    log "Bridge is ready on port 8089"
else
    echo "WARNING: Bridge did not start — use --connection cli as fallback" >&2
    echo "  Check: docker exec $CONTAINER_NAME cat /tmp/bridge.log" >&2
fi

# --------------------------------------------------------------------------- #
# 5. Install aztec-wallet wrapper (for --connection cli fallback)
# --------------------------------------------------------------------------- #

mkdir -p "$(dirname "$WRAPPER_PATH")"
cat > "$WRAPPER_PATH" <<WRAPPER
#!/usr/bin/env bash
exec docker exec ${CONTAINER_NAME} node --no-warnings \\
    /usr/src/yarn-project/cli-wallet/dest/bin/index.js "\$@"
WRAPPER
chmod +x "$WRAPPER_PATH"

# --------------------------------------------------------------------------- #
# Done
# --------------------------------------------------------------------------- #

echo ""
log "Nightly sandbox is ready!"
echo ""
echo "  Container:  ${CONTAINER_NAME}"
echo "  Image:      ${IMAGE}"
echo "  Bridge:     http://localhost:8089"
echo "  Slot time:  5s (default 36s)"
echo ""
echo "  cd noir-projects/protocol-fuzzer"
echo "  RUST_LOG=debug cargo run -- side-effect --max-steps 5"
echo "  cargo test -- --ignored --nocapture"
echo ""
echo "  To stop: docker stop ${CONTAINER_NAME}"
