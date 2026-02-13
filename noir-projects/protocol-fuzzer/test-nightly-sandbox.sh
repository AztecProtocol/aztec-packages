#!/usr/bin/env bash
#
# Tests that setup-nightly-sandbox.sh produced a working environment.
#
# Checks:
#   1. Container is running and PXE is healthy
#   2. aztec-wallet wrapper forwards into the container
#   3. Side-effect contract artifact exists and has expected functions
#   4. Test accounts are accessible
#
# Usage:
#   ./test-nightly-sandbox.sh
#
set -euo pipefail

CONTAINER_NAME="aztec-sandbox-nightly"
ARTIFACT="/tmp/side_effect_contract-SideEffect.json"
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
# 3. Side-effect contract artifact
# --------------------------------------------------------------------------- #

echo "--- Side-effect contract artifact ---"

if docker exec "$CONTAINER_NAME" test -f "$ARTIFACT"; then
    pass "Artifact exists inside container at $ARTIFACT"
else
    fail "Artifact not found inside container at $ARTIFACT"
fi

# Check expected functions are present (no __aztec_nr_internals__ prefix)
expected_fns="initialize call_create_note call_destroy_note emit_nullifier"
artifact_fns=$(docker exec "$CONTAINER_NAME" node -e "
    const a = require('$ARTIFACT');
    console.log(a.functions.map(f => f.name).join(' '));
" 2>&1 || true)

for fn in $expected_fns; do
    if echo "$artifact_fns" | grep -qw "$fn"; then
        pass "Artifact has function: $fn"
    else
        fail "Artifact missing function: $fn (got: $artifact_fns)"
    fi
done

# No __aztec_nr_internals__ prefix remaining
if echo "$artifact_fns" | grep -q "__aztec_nr_internals__"; then
    fail "Artifact still has __aztec_nr_internals__ prefix"
else
    pass "No __aztec_nr_internals__ prefix in function names"
fi

# No utilityLog oracle (would break simulation)
has_utility_log=$(docker exec "$CONTAINER_NAME" node -e "
    const a = require('$ARTIFACT');
    console.log(JSON.stringify(a).includes('utilityLog'));
" 2>&1 || true)
if [ "$has_utility_log" = "false" ]; then
    pass "Artifact does not contain utilityLog oracle"
else
    fail "Artifact contains utilityLog oracle (compiled against wrong aztec-nr)"
fi

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
