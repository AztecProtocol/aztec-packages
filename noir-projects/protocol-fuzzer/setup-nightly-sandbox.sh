#!/usr/bin/env bash
#
# Sets up the nightly Aztec sandbox for use with the protocol fuzzer.
#
# What this script does:
#   1. Starts a dated nightly sandbox Docker container (anvil + node)
#      with 5-second L2 slots for faster fuzzing (~5s/tx vs ~35s default)
#   2. Waits for the PXE to become ready
#   3. Fixes the wallet CLI (installs missing inquirer npm package)
#   4. Extracts aztec-nr source for contract compilation
#   5. Compiles both contracts inside the container (nargo + bb-avm)
#   6. Imports test accounts
#   7. Starts the Node.js bridge server (persistent HTTP API for the fuzzer)
#   8. Installs an aztec-wallet wrapper script so CLI calls are forwarded
#      into the container transparently (prove controlled by --prove flag)
#
set -euo pipefail

CONTAINER_NAME="aztec-sandbox-nightly"
IMAGE="${NIGHTLY_IMAGE:-aztecprotocol/aztec:5.0.0-nightly.20260224}"
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

wait_for_pxe() {
    local max_wait=180
    local elapsed=0
    log "Waiting up to ${max_wait}s for PXE to start..."
    while [ $elapsed -lt $max_wait ]; do
        # grep -q with pipefail causes SIGPIPE (exit 141) on docker logs;
        # capture logs first to avoid the broken-pipe issue.
        local logs
        logs=$(docker logs "$CONTAINER_NAME" 2>&1 || true)
        if echo "$logs" | grep -q "Started PXE connected to chain"; then
            log "PXE is ready (${elapsed}s)"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
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

# Remove leftover stopped container (if not using --rm)
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

log "Starting nightly sandbox container (${IMAGE})..."
# Fast slots: AZTEC_SLOT_DURATION=5 (default 36) reduces block mining wait.
# SEQ_ENFORCE_TIME_TABLE=false disables the sequencer's slot-headroom check,
# allowing shorter slots than the default 36s without rejection.
# The L1 deployment script sets anvil's block timestamp
# interval to match ETHEREUM_SLOT_DURATION, so we don't pass --block-time
# to anvil (automine handles it).
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

# Find the latest commit on origin/next that has the matching noir submodule.
# We search from newest to oldest so we get a commit where aztec-nr and
# protocol-circuits have had time to stabilize after a noir update.
NIGHTLY_COMMIT=""
while read -r hash; do
    sub=$(git ls-tree "$hash" noir/noir-repo 2>/dev/null | awk '{print $3}')
    if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
        NIGHTLY_COMMIT="$hash"
        log "Matched nightly commit: $(git log --oneline -1 "$hash")"
        break
    fi
done < <(git log origin/next --format='%H' -200)

if [ -z "$NIGHTLY_COMMIT" ]; then
    # Fallback: search all branches for the commit that introduced the hash
    while read -r hash msg; do
        sub=$(git ls-tree "$hash" noir/noir-repo 2>/dev/null | awk '{print $3}')
        if [ "$sub" = "$NIGHTLY_NOIR_HASH" ]; then
            NIGHTLY_COMMIT="$hash"
            log "Matched nightly commit (fallback): $hash $msg"
            break
        fi
    done < <(git log --all --oneline --diff-filter=M -- noir/noir-repo)
fi

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
    docker exec -w /tmp/nightly-build "$CONTAINER_NAME" \
        /usr/src/noir/noir-repo/target/release/nargo compile \
        --silence-warnings --inliner-aggressiveness 0 --package "$contract_pkg"

    log "Transpiling and stripping prefix for ${artifact}..."
    docker exec "$CONTAINER_NAME" \
        /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process \
        -i "/tmp/nightly-build/target/${artifact}.json"

    docker exec "$CONTAINER_NAME" bash -c "
        json=/tmp/nightly-build/target/${artifact}.json
        jq '.functions |= map(.name |= sub(\"^__aztec_nr_internals__\"; \"\"))' \"\$json\" > \"\${json}.tmp\"
        mv \"\${json}.tmp\" \"\$json\"
    "

    docker exec "$CONTAINER_NAME" cp \
        "/tmp/nightly-build/target/${artifact}.json" \
        "/tmp/${artifact}.json"

    docker cp "${CONTAINER_NAME}:/tmp/${artifact}.json" \
        "${REPO_ROOT}/noir-projects/protocol-fuzzer/contracts/target/${artifact}.json"
    log "Artifact copied to contracts/target/${artifact}.json"
done

# --------------------------------------------------------------------------- #
# 6. Import test accounts
# --------------------------------------------------------------------------- #

# bb-avm uses ~330MB and may crash the HTTP server; wait for it to recover
log "Waiting for Aztec Server HTTP endpoint to be ready..."
http_wait=0
while [ $http_wait -lt 120 ]; do
    # PXE returns 405 on GET (expects POST); any HTTP response means it's up
    http_code=$(curl -so /dev/null -w '%{http_code}' http://localhost:8080 2>/dev/null || true)
    if [ -n "$http_code" ] && [ "$http_code" != "000" ]; then
        break
    fi
    sleep 5
    http_wait=$((http_wait + 5))
done

log "Importing test accounts..."
docker exec "$CONTAINER_NAME" node --no-warnings \
    /usr/src/yarn-project/cli-wallet/dest/bin/index.js import-test-accounts \
    > /dev/null 2>&1

# --------------------------------------------------------------------------- #
# 7. Start the bridge server
# --------------------------------------------------------------------------- #

BRIDGE_SRC="${REPO_ROOT}/noir-projects/protocol-fuzzer/bridge.mjs"
if [ ! -f "$BRIDGE_SRC" ]; then
    die "Bridge source not found at ${BRIDGE_SRC}"
fi

log "Copying bridge.mjs into container..."
docker cp "$BRIDGE_SRC" "${CONTAINER_NAME}:/usr/src/yarn-project/bridge.mjs"

log "Starting bridge server..."
docker exec -d "$CONTAINER_NAME" \
    bash -c 'cd /usr/src/yarn-project && exec node --no-warnings bridge.mjs > /tmp/bridge.log 2>&1'

# Wait for the bridge to be ready
bridge_wait=0
while [ $bridge_wait -lt 60 ]; do
    bridge_code=$(curl -so /dev/null -w '%{http_code}' http://localhost:8089/health 2>/dev/null || true)
    if [ "$bridge_code" = "200" ]; then
        log "Bridge is ready on port 8089"
        break
    fi
    sleep 2
    bridge_wait=$((bridge_wait + 2))
done

if [ "$bridge_code" != "200" ]; then
    warn "Bridge did not start within 60s — falling back to CLI mode (BRIDGE_URL=none)"
    warn "Check: docker exec $CONTAINER_NAME cat /tmp/bridge.log"
fi

# --------------------------------------------------------------------------- #
# 8. Install aztec-wallet wrapper script
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

# The wrapper forwards all arguments to the container's wallet CLI.
# Proof generation is controlled by the fuzzer's --prove flag (which passes
# -p native or -p none). Do NOT add -p here to avoid duplicate flags.
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
echo "  Bridge:     http://localhost:8089 (default, ~1.7s faster per call)"
echo "  Wallet:     ${WRAPPER_PATH} (CLI fallback: --connection cli)"
echo "  Artifacts:  /tmp/side_effect_contract-SideEffect.json (container)"
echo "              /tmp/parent_contract-Parent.json (container)"
echo "  Slot time:  5s (timetable enforcement off; default 36s)"
echo ""
echo "Run the fuzzer (bridge mode is the default):"
echo ""
echo "  cd noir-projects/protocol-fuzzer"
echo ""
echo "  # Token machine"
echo "  RUST_LOG=debug cargo run -- token --max-steps 5"
echo ""
echo "  # Side-effect machine"
echo "  RUST_LOG=debug cargo run -- side-effect --max-steps 5"
echo ""
echo "  # Integration smoke tests"
echo "  cargo test -- --ignored --nocapture"
echo ""
echo "  # To use CLI fallback instead of bridge:"
echo "  RUST_LOG=debug cargo run -- side-effect --connection cli --max-steps 5"
echo ""
echo "  # Make sure ${WRAPPER_DIR} is on your PATH for CLI mode:"
echo "  export PATH=\"${WRAPPER_DIR}:\$PATH\""
echo ""
echo "To stop: docker stop ${CONTAINER_NAME}"
