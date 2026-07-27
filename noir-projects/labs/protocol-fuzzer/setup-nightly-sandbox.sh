#!/usr/bin/env bash
#
# Sets up the nightly Aztec sandbox for use with the protocol fuzzer.
#
# What this script does:
#   1. Starts the nightly sandbox Docker container (anvil + node)
#   2. Waits for the PXE to become ready
#   3. Fixes the wallet CLI (installs missing inquirer npm package)
#   4. Extracts the nightly commit's aztec-nr source for contract compilation
#   5. Compiles both contracts inside the container (nargo + bb-avm)
#   6. Starts the bridge server (the fuzzer imports test accounts on each run)
#   7. Installs an aztec-wallet wrapper script so CLI calls are forwarded
#      into the container transparently
#
set -euo pipefail

CONTAINER_NAME="aztec-sandbox-nightly"
# Last nightly tag verified to work with the current contract source code.
KNOWN_GOOD_TAG="5.0.0-nightly.20260402"
WRAPPER_DIR="${HOME}/.local/bin"
WRAPPER_PATH="${WRAPPER_DIR}/aztec-wallet"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NIGHTLY_BUILD_DIR="/tmp/nightly-build"

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

log()  { echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Image selection priority:
#   1. NIGHTLY_IMAGE env var -- use an explicit full image reference
#   2. --latest flag -- query Docker Hub for the newest dated nightly tag
#   3. Default -- use KNOWN_GOOD_TAG (last manually verified tag)
if [ -n "${NIGHTLY_IMAGE:-}" ]; then
    IMAGE="$NIGHTLY_IMAGE"
    log "Using user-specified image: ${IMAGE}"
elif [ "${1:-}" = "--latest" ]; then
    LATEST_TAG=$("${SCRIPT_DIR}/find-latest-nightly.sh") \
        || { log "Docker Hub query failed, falling back to known-good tag"; LATEST_TAG="$KNOWN_GOOD_TAG"; }
    IMAGE="aztecprotocol/aztec:${LATEST_TAG}"
    if [ "$LATEST_TAG" = "$KNOWN_GOOD_TAG" ]; then
        log "Latest nightly matches known-good: ${IMAGE}"
    else
        log "Latest nightly: ${IMAGE} (known-good: ${KNOWN_GOOD_TAG})"
    fi
else
    IMAGE="aztecprotocol/aztec:${KNOWN_GOOD_TAG}"
    log "Using known-good image: ${IMAGE}"
fi

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

wait_for_pxe() {
    local max_wait=300
    log "Waiting up to ${max_wait}s for PXE HTTP endpoint (port 8080)..."
    if wait_for_http http://localhost:8080 "$max_wait" 5; then
        log "PXE is ready"
        return 0
    fi
    die "PXE did not start within ${max_wait}s. Check: docker logs $CONTAINER_NAME"
}

# --------------------------------------------------------------------------- #
# 1. Start the nightly sandbox
# --------------------------------------------------------------------------- #

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log "Container ${CONTAINER_NAME} is already running, stopping it..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    sleep 2
fi
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

log "Starting nightly sandbox container..."
# Fast slots: AZTEC_SLOT_DURATION=5 (default 36) with timetable enforcement off.
# Don't pass --block-time to anvil -- the deploy script sets it via RPC.
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

wait_for_pxe

# --------------------------------------------------------------------------- #
# 2. Fix the wallet CLI (missing inquirer)
# --------------------------------------------------------------------------- #

log "Installing missing inquirer npm package (wallet fix)..."
docker exec "$CONTAINER_NAME" bash -c '
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

# Verify the wallet works
docker exec "$CONTAINER_NAME" node --no-warnings \
    /usr/src/yarn-project/cli-wallet/dest/bin/index.js --version >/dev/null 2>&1 \
    || die "Wallet CLI is broken after inquirer fix"
log "Wallet CLI is working"

# --------------------------------------------------------------------------- #
# 3. Identify the nightly commit and extract aztec-nr source
# --------------------------------------------------------------------------- #

log "Identifying nightly commit..."
NIGHTLY_NOIR_HASH=$(docker exec "$CONTAINER_NAME" \
    /usr/src/noir/noir-repo/target/release/nargo --version 2>&1 \
    | grep -oP '[0-9a-f]{40}' | head -1)

if [ -z "$NIGHTLY_NOIR_HASH" ]; then
    die "Could not extract noir hash from nightly nargo --version"
fi
log "Nightly noir hash: ${NIGHTLY_NOIR_HASH}"

cd "$REPO_ROOT"
NIGHTLY_COMMIT=""
while read -r hash msg; do
    sub=$(git ls-tree "$hash" noir/noir-repo 2>/dev/null | awk '{print $3}')
    if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
        NIGHTLY_COMMIT="$hash"
        log "Matched nightly commit: $hash $msg"
        break
    fi
# Search recent origin/next commits (newest first) for matching noir submodule hash
done < <(git log origin/next --oneline -1000)

if [ -z "$NIGHTLY_COMMIT" ]; then
    die "Could not find aztec-packages commit matching noir hash ${NIGHTLY_NOIR_HASH}.
Try: git fetch --all"
fi

log "Extracting nightly aztec-nr from commit ${NIGHTLY_COMMIT}..."
rm -rf "$NIGHTLY_BUILD_DIR"
mkdir -p "${NIGHTLY_BUILD_DIR}/side_effect_contract/src"
mkdir -p "${NIGHTLY_BUILD_DIR}/parent_contract/src"

git archive "$NIGHTLY_COMMIT" -- noir-projects/aztec-nr/ noir-projects/noir-protocol-circuits/ \
    | tar -x -C "$NIGHTLY_BUILD_DIR" --strip-components=1

# --------------------------------------------------------------------------- #
# 4. Copy contract source and Nargo.toml files
# --------------------------------------------------------------------------- #

CONTRACTS_DIR="${REPO_ROOT}/noir-projects/protocol-fuzzer/contracts"

for contract in side_effect_contract parent_contract; do
    if [ ! -f "${CONTRACTS_DIR}/${contract}/src/main.nr" ]; then
        die "Contract source not found at ${CONTRACTS_DIR}/${contract}/src/main.nr"
    fi
    cp "${CONTRACTS_DIR}/${contract}/src/main.nr" "${NIGHTLY_BUILD_DIR}/${contract}/src/main.nr"
    # Fix dependency paths: contracts are now 1 level deep (not 3) relative to aztec-nr
    sed 's|path = "../../../aztec-nr/|path = "../aztec-nr/|g' \
        "${CONTRACTS_DIR}/${contract}/Nargo.toml" > "${NIGHTLY_BUILD_DIR}/${contract}/Nargo.toml"
done

cp "${CONTRACTS_DIR}/Nargo.toml" "${NIGHTLY_BUILD_DIR}/Nargo.toml"

# --------------------------------------------------------------------------- #
# 5. Compile, transpile, and strip prefix inside the container
# --------------------------------------------------------------------------- #

log "Copying build directory into container..."
docker cp "$NIGHTLY_BUILD_DIR" "${CONTAINER_NAME}:/tmp/nightly-build"

# Map package names to artifact base names (nargo uses the contract name, not the package name)
declare -A ARTIFACT_NAMES=(
    [side_effect_contract]="side_effect_contract-SideEffect"
    [parent_contract]="parent_contract-Parent"
)

for contract_pkg in side_effect_contract parent_contract; do
    artifact="${ARTIFACT_NAMES[$contract_pkg]}"

    log "Compiling ${contract_pkg}..."
    docker exec -w /tmp/nightly-build "$CONTAINER_NAME" bash -c "
        set -e
        /usr/src/noir/noir-repo/target/release/nargo compile \
            --silence-warnings --inliner-aggressiveness 0 --package ${contract_pkg}
        /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process \
            -i target/${artifact}.json
    "

    docker cp "${CONTAINER_NAME}:/tmp/nightly-build/target/${artifact}.json" \
        "${CONTRACTS_DIR}/target/${artifact}.json"
    log "Artifact copied to contracts/target/${artifact}.json"
done

# --------------------------------------------------------------------------- #
# 6. Start the bridge server (test accounts are imported by the fuzzer on each run)
# --------------------------------------------------------------------------- #

# bb-avm uses ~330MB and may crash the HTTP server; wait for it to recover
log "Waiting for Aztec Server HTTP endpoint to be ready..."
wait_for_http http://localhost:8080 120 || die "PXE HTTP endpoint did not recover"

BRIDGE_SRC="${REPO_ROOT}/noir-projects/protocol-fuzzer/wallet-bridge.mjs"
if [ ! -f "$BRIDGE_SRC" ]; then
    die "Bridge source not found: ${BRIDGE_SRC}"
fi

log "Starting bridge server..."
docker cp "$BRIDGE_SRC" "${CONTAINER_NAME}:/usr/src/yarn-project/wallet-bridge.mjs"
docker exec -d "$CONTAINER_NAME" \
    bash -c 'cd /usr/src/yarn-project && exec node --no-warnings wallet-bridge.mjs > /tmp/bridge.log 2>&1'

if wait_for_http http://localhost:8089/health 60 2; then
    log "Bridge is ready on port 8089"
else
    die "Bridge did not start. Check: docker exec $CONTAINER_NAME cat /tmp/bridge.log"
fi

# --------------------------------------------------------------------------- #
# 7. Install aztec-wallet wrapper script
# --------------------------------------------------------------------------- #

mkdir -p "$WRAPPER_DIR"

if [ -f "$WRAPPER_PATH" ]; then
    # Back up existing wrapper if it's not ours
    if ! grep -q "$CONTAINER_NAME" "$WRAPPER_PATH" 2>/dev/null; then
        BACKUP="${WRAPPER_PATH}.bak.$(date +%s)"
        log "Backing up existing ${WRAPPER_PATH} to ${BACKUP}"
        mv "$WRAPPER_PATH" "$BACKUP"
    fi
fi

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
echo "  Wallet:     ${WRAPPER_PATH}"
echo "  Slot time:  5s (default 36s)"
echo ""
echo "Make sure ${WRAPPER_DIR} is on your PATH (before ~/.aztec/bin):"
echo ""
echo "  export PATH=\"${WRAPPER_DIR}:\$PATH\""
echo ""
echo "Then run the fuzzer:"
echo ""
echo "  cd noir-projects/protocol-fuzzer"
echo ""
echo "  # Side-effect machine"
echo "  RUST_LOG=debug cargo run -- side-effect --max-steps 5"
echo ""
echo "  # Integration smoke tests"
echo "  cargo test -- --ignored --nocapture"
echo ""
echo "To stop: docker stop ${CONTAINER_NAME}"
