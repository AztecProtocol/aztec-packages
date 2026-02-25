#!/usr/bin/env bash
# test-helpers.sh — Shared Docker lifecycle helpers for ClaudeBox tests.
# Source this file, don't execute it directly.

CLAUDEBOX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${CLAUDE_REPO_DIR:-$(cd "$CLAUDEBOX_DIR/../.." && pwd)}"
DOCKER_IMAGE="${CLAUDEBOX_DOCKER_IMAGE:-aztecprotocol/devbox:3.0}"

# Track resources for cleanup
_TEST_CONTAINERS=()
_TEST_NETWORKS=()
_TEST_TMPDIRS=()

gen_id() { head -c 8 /dev/urandom | xxd -p; }
gen_uuid() { python3 -c "import uuid; print(uuid.uuid4())"; }

# Create a private Docker network. Echoes its name.
create_test_network() {
    local name="cbtest-net-$(gen_id)"
    docker network create "$name" >/dev/null
    _TEST_NETWORKS+=("$name")
    echo "$name"
}

# Start the MCP sidecar on a private network (no exposed ports, just like production).
# Usage: start_test_sidecar <network> <workspace_dir> [extra -e KEY=VAL ...]
# Sets: SIDECAR_AUTH_TOKEN, SIDECAR_NAME, SIDECAR_MCP_URL
start_test_sidecar() {
    local network="$1" workspace="$2"
    shift 2
    local name="cbtest-sidecar-$(gen_id)"
    local auth_token
    auth_token=$(gen_uuid)

    export SIDECAR_AUTH_TOKEN="$auth_token"
    export SIDECAR_NAME="$name"
    export SIDECAR_MCP_URL="http://${name}:9801/mcp/${auth_token}"

    local args=(
        run -d
        --name "$name"
        --network "$network"
        -v "$REPO_DIR/.git:/reference-repo/.git:ro"
        -v "$workspace:/workspace:rw"
        -v "$CLAUDEBOX_DIR:/opt/claudebox:ro"
        -e "MCP_PORT=9801"
        -e "MCP_AUTH_TOKEN=$auth_token"
        -e "CLAUDEBOX_LOG_ID=test-$(gen_id)"
        -e "CLAUDEBOX_LOG_URL=http://test.example.com/test"
        -e "CLAUDEBOX_USER=test-runner"
    )
    for arg in "$@"; do args+=(-e "$arg"); done

    args+=(--entrypoint /opt/claudebox/mcp-sidecar.ts "$DOCKER_IMAGE")

    docker "${args[@]}" >/dev/null
    _TEST_CONTAINERS+=("$name")
}

# Wait for sidecar health via docker exec (private network, no host port).
# Usage: wait_for_health [timeout_seconds]
wait_for_health() {
    local timeout="${1:-15}"
    local deadline=$((SECONDS + timeout))
    while [ $SECONDS -lt $deadline ]; do
        if docker exec "$SIDECAR_NAME" curl -sf http://127.0.0.1:9801/health 2>/dev/null | grep -q ok; then
            return 0
        fi
        sleep 0.5
    done
    echo "FAIL: sidecar health check timed out" >&2
    docker logs "$SIDECAR_NAME" >&2
    return 1
}

# Run a test script inside a container on the same private network.
# Usage: run_test_container <network> <workspace_dir> <script_path> [extra -e KEY=VAL ...]
# Returns the container exit code.
run_test_container() {
    local network="$1" workspace="$2" script="$3"
    shift 3
    local name="cbtest-runner-$(gen_id)"

    local args=(
        run --rm
        --name "$name"
        --network "$network"
        -v "$REPO_DIR/.git:/reference-repo/.git:ro"
        -v "$workspace:/workspace:rw"
        -v "$CLAUDEBOX_DIR:/opt/claudebox:ro"
        -e "MCP_URL=$SIDECAR_MCP_URL"
    )
    for arg in "$@"; do args+=(-e "$arg"); done

    args+=(--entrypoint "/opt/claudebox/$script" "$DOCKER_IMAGE")

    docker "${args[@]}"
}

# Create a workspace with a git repo seeded from the host via alternates.
# Echoes the workspace path (parent of aztec-packages/).
create_test_workspace() {
    local tmpdir
    tmpdir=$(mktemp -d "/tmp/cbtest-XXXXXX")
    _TEST_TMPDIRS+=("$tmpdir")
    local ws="$tmpdir/workspace"
    mkdir -p "$ws/aztec-packages"
    (
        cd "$ws/aztec-packages"
        git init --quiet
        mkdir -p .git/objects/info
        echo "$REPO_DIR/.git/objects" > .git/objects/info/alternates
        [ -f "$REPO_DIR/.git/packed-refs" ] && cp "$REPO_DIR/.git/packed-refs" .git/packed-refs
        if [ -d "$REPO_DIR/.git/refs/remotes" ]; then
            mkdir -p .git/refs/remotes
            cp -r "$REPO_DIR/.git/refs/remotes/"* .git/refs/remotes/ 2>/dev/null || true
        fi
        git remote add origin https://github.com/AztecProtocol/aztec-packages.git 2>/dev/null || true
        git checkout --detach origin/next 2>/dev/null
    ) >/dev/null 2>&1
    echo "$ws"
}

# Tear down all tracked test resources.
test_cleanup() {
    for c in "${_TEST_CONTAINERS[@]}"; do
        docker stop -t 2 "$c" 2>/dev/null || true
        docker rm -f "$c" 2>/dev/null || true
    done
    for n in "${_TEST_NETWORKS[@]}"; do
        docker network rm "$n" 2>/dev/null || true
    done
    for d in "${_TEST_TMPDIRS[@]}"; do
        rm -rf "$d"
    done
}
