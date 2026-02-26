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
#   6. Imports test accounts
#   7. Installs an aztec-wallet wrapper script so CLI calls are forwarded
#      into the container transparently
#
set -euo pipefail

CONTAINER_NAME="aztec-sandbox-nightly"
IMAGE="aztecprotocol/aztec:nightly"
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
        if docker logs "$CONTAINER_NAME" 2>&1 | grep -q "Started PXE connected to chain"; then
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

log "Starting nightly sandbox container..."
docker run -d --rm --name "$CONTAINER_NAME" \
    -p 8080:8080 -p 8545:8545 \
    -e LOG_LEVEL=info \
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
done < <(git log --all --oneline --diff-filter=M -- noir/noir-repo)

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
echo "  Wallet:     ${WRAPPER_PATH}"
echo "  Artifacts:  /tmp/side_effect_contract-SideEffect.json (container)"
echo "              /tmp/parent_contract-Parent.json (container)"
echo ""
echo "Make sure ${WRAPPER_DIR} is on your PATH (before ~/.aztec/bin):"
echo ""
echo "  export PATH=\"${WRAPPER_DIR}:\$PATH\""
echo ""
echo "Then run the fuzzer:"
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
echo "To stop: docker stop ${CONTAINER_NAME}"
