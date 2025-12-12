#!/usr/bin/env bash
# Test memory limit functionality
# Tests that BB_MAX_MEMORY env var works and memory limits are enforced
set -eu

cd "$(dirname "$0")/.."

# Only run on platforms that support setrlimit
if [[ "$OSTYPE" != "linux-gnu"* ]] && [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Memory limit tests only run on Linux/macOS (setrlimit support required)"
    exit 0
fi

BUILD_DIR=$(scripts/native-preset-build-dir)
BB_BIN="$BUILD_DIR/bin/bb"

if [[ ! -f "$BB_BIN" ]]; then
    echo "Error: bb binary not found at $BB_BIN"
    exit 1
fi

echo "Testing memory limit functionality..."

# Test 1: Check that default limit is set (16GB for regular commands)
echo "Test 1: Checking default memory limit is printed..."
output=$("$BB_BIN" --version 2>&1 || true)
if echo "$output" | grep -q "BB memory limit set to"; then
    echo "✓ Memory limit is being set"
    echo "$output" | grep "BB memory limit"
else
    echo "✗ Memory limit message not found"
    exit 1
fi

# Test 2: Check that BB_MAX_MEMORY=0 disables limits
echo ""
echo "Test 2: Checking BB_MAX_MEMORY=0 disables limits..."
output=$(BB_MAX_MEMORY=0 "$BB_BIN" --version 2>&1 || true)
if echo "$output" | grep -q "BB memory limit set to"; then
    echo "✗ Memory limit should not be set when BB_MAX_MEMORY=0"
    exit 1
else
    echo "✓ Memory limit disabled with BB_MAX_MEMORY=0"
fi

# Test 3: Check that BB_MAX_MEMORY override works
echo ""
echo "Test 3: Checking BB_MAX_MEMORY override..."
# Set to 1GB (1073741824 bytes)
output=$(BB_MAX_MEMORY=1073741824 "$BB_BIN" --version 2>&1 || true)
if echo "$output" | grep -q "BB memory limit set to 1"; then
    echo "✓ BB_MAX_MEMORY override works"
    echo "$output" | grep "BB memory limit"
else
    echo "✗ BB_MAX_MEMORY override failed"
    echo "Output: $output"
    exit 1
fi

# Test 4: Check that AVM commands get higher limit (128GB)
echo ""
echo "Test 4: Checking AVM commands get higher limit..."
# We can't easily test this without actually running an AVM command,
# but we can check that the binary doesn't crash
output=$(BB_MAX_MEMORY=137438953472 "$BB_BIN" --version 2>&1 || true)
if echo "$output" | grep -q "BB memory limit set to 128"; then
    echo "✓ Can set 128GB limit (AVM size)"
    echo "$output" | grep "BB memory limit"
else
    echo "✗ Failed to set 128GB limit"
    exit 1
fi

# Test 5: Check invalid BB_MAX_MEMORY value handling
echo ""
echo "Test 5: Checking invalid BB_MAX_MEMORY handling..."
output=$(BB_MAX_MEMORY=invalid "$BB_BIN" --version 2>&1 || true)
if echo "$output" | grep -q "Invalid BB_MAX_MEMORY value"; then
    echo "✓ Invalid BB_MAX_MEMORY value detected"
    echo "$output" | grep "Invalid BB_MAX_MEMORY"
else
    echo "✗ Invalid BB_MAX_MEMORY not properly handled"
    exit 1
fi

echo ""
echo "All memory limit tests passed! ✓"
