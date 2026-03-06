#!/usr/bin/env bash
#
# Tests that setup-nightly-sandbox.sh produced a working environment.
#
# Checks:
#   1. Container is running and PXE is healthy
#   2. aztec-wallet wrapper forwards into the container
#   3. Contract artifacts exist and have expected functions
#   4. Test accounts are accessible
#
# Usage:
#   ./test-nightly-sandbox.sh
#
set -euo pipefail

CONTAINER_NAME="aztec-sandbox-nightly"
SIDE_EFFECT_ARTIFACT="/tmp/side_effect_contract-SideEffect.json"
PARENT_ARTIFACT="/tmp/parent_contract-Parent.json"
WRAPPER="${HOME}/.local/bin/aztec-wallet"

passed=0
failed=0

pass() { echo "  PASS: $*"; passed=$((passed + 1)); }
fail() { echo "  FAIL: $*" >&2; failed=$((failed + 1)); }
warn() { echo "  WARN: $*" >&2; }

# --------------------------------------------------------------------------- #
# 1. Container running & PXE healthy
# --------------------------------------------------------------------------- #

echo "--- Container & PXE ---"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    pass "Container ${CONTAINER_NAME} is running"
else
    fail "Container ${CONTAINER_NAME} is not running"
    echo "Run ./setup-nightly-sandbox.sh first."
    exit 1
fi

# Primary check: PXE HTTP endpoint responds (works regardless of log size)
pxe_status=$(docker exec "$CONTAINER_NAME" node -e \
    "fetch('http://localhost:8080').then(r=>console.log(r.status)).catch(()=>console.log('ERR'))" 2>&1)
if [ "$pxe_status" = "405" ] || [ "$pxe_status" = "200" ]; then
    pass "PXE HTTP endpoint is responding (status $pxe_status)"
else
    fail "PXE HTTP endpoint is not responding (got: $pxe_status)"
fi

# Secondary check: PXE started message in recent logs
if docker logs --tail 5000 "$CONTAINER_NAME" 2>&1 | grep -q "Started PXE connected to chain"; then
    pass "PXE startup confirmed in logs"
else
    # Not fatal — PXE could have started long ago and logs rotated
    warn "PXE startup message not found in recent logs (may have scrolled off)"
fi

# --------------------------------------------------------------------------- #
# 2. Wallet wrapper
# --------------------------------------------------------------------------- #

echo "--- Wallet wrapper ---"

if [ -x "$WRAPPER" ]; then
    pass "Wrapper exists at $WRAPPER and is executable"
else
    fail "Wrapper missing or not executable at $WRAPPER"
fi

if grep -q "$CONTAINER_NAME" "$WRAPPER" 2>/dev/null; then
    pass "Wrapper targets container $CONTAINER_NAME"
else
    fail "Wrapper does not reference $CONTAINER_NAME"
fi

wallet_version=$("$WRAPPER" --version 2>&1 || true)
if echo "$wallet_version" | grep -q "nightly"; then
    pass "Wallet returns nightly version: $wallet_version"
else
    fail "Wallet version unexpected: $wallet_version"
fi

# --------------------------------------------------------------------------- #
# 3. Contract artifacts
# --------------------------------------------------------------------------- #

check_artifact() {
    local name=$1
    local artifact_path=$2
    shift 2
    local expected_fns="$*"

    echo "--- ${name} artifact ---"

    if docker exec "$CONTAINER_NAME" test -f "$artifact_path"; then
        pass "Artifact exists inside container at $artifact_path"
    else
        fail "Artifact not found inside container at $artifact_path"
        return
    fi

    local artifact_fns
    artifact_fns=$(docker exec "$CONTAINER_NAME" node -e "
        const a = require('$artifact_path');
        console.log(a.functions.map(f => f.name).join(' '));
    " 2>&1 || true)

    for fn in $expected_fns; do
        if echo "$artifact_fns" | grep -qw "$fn"; then
            pass "${name} has function: $fn"
        else
            fail "${name} missing function: $fn (got: $artifact_fns)"
        fi
    done

    if echo "$artifact_fns" | grep -q "__aztec_nr_internals__"; then
        fail "${name} still has __aztec_nr_internals__ prefix"
    else
        pass "${name}: no __aztec_nr_internals__ prefix"
    fi

    local has_utility_log
    has_utility_log=$(docker exec "$CONTAINER_NAME" node -e "
        const a = require('$artifact_path');
        console.log(JSON.stringify(a).includes('utilityLog'));
    " 2>&1 || true)
    if [ "$has_utility_log" = "false" ]; then
        pass "${name} does not contain utilityLog oracle"
    else
        fail "${name} contains utilityLog oracle (compiled against wrong aztec-nr)"
    fi
}

check_artifact "SideEffect" "$SIDE_EFFECT_ARTIFACT" \
    initialize call_create_note call_destroy_note emit_nullifier

check_artifact "Parent" "$PARENT_ARTIFACT" \
    initialize forward_emit_nullifier forward_call_destroy_note

# --------------------------------------------------------------------------- #
# 4. Test accounts
# --------------------------------------------------------------------------- #

echo "--- Test accounts ---"

import_output=$("$WRAPPER" import-test-accounts 2>&1 || true)
if echo "$import_output" | grep -q "test0"; then
    pass "Test account test0 is available"
else
    fail "import-test-accounts did not show test0"
fi
if echo "$import_output" | grep -q "test2"; then
    pass "Test account test2 is available"
else
    fail "import-test-accounts did not show test2"
fi

# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #

echo ""
echo "Results: $passed passed, $failed failed"
[ $failed -eq 0 ] && exit 0 || exit 1
