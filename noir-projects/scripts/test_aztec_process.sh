#!/usr/bin/env bash
# Test the bb aztec_process command with various usage modes
set -euo pipefail

cd $(dirname $0)/../noir-contracts

bb=$(../../barretenberg/cpp/scripts/find-bb)

echo "Testing bb aztec_process command..."

# Test 1: Process a single contract file
echo "Test 1: Single file mode"
test_contract="target/token_contract-Token.json"
if [ ! -f "$test_contract" ]; then
  echo "Error: Test contract not found at $test_contract"
  exit 1
fi

# Create a temp file for testing
tmp_output=$(mktemp)
tmp_log=$(mktemp)
test_subdir=""
trap "rm -f $tmp_output $tmp_log; [ -n \"\$test_subdir\" ] && rm -rf \"\$test_subdir\"" EXIT

$bb aztec_process -i "$test_contract" -o "$tmp_output" > "$tmp_log" 2>&1

if ! grep -qE "(Transpil|Successfully processed)" "$tmp_log"; then
  echo "Error: Contract processing failed for single file"
  cat "$tmp_log"
  exit 1
fi

if [ ! -f "$tmp_output" ]; then
  echo "Error: Output file was not created"
  exit 1
fi

# Verify output is valid JSON
if ! jq empty "$tmp_output" 2>/dev/null; then
  echo "Error: Output is not valid JSON"
  exit 1
fi

# Verify verification keys were added to private functions
vk_count=$(jq '[.functions[] | select(.verification_key != null)] | length' "$tmp_output")
if [ "$vk_count" -eq 0 ]; then
  echo "Error: No verification keys were generated"
  exit 1
fi

echo "✓ Single file mode works (generated $vk_count verification keys)"

# Test 2: Process directory mode (in-place)
echo "Test 2: Directory mode"
# Create a test directory with a single contract
test_subdir=$(mktemp -d)
trap "rm -rf $test_subdir $tmp_output $tmp_log" EXIT
mkdir -p "$test_subdir/target"
cp "$test_contract" "$test_subdir/target/"
# Process directory and capture output while streaming to terminal
echo "  Running: bb aztec_process on test directory..."
(cd "$test_subdir" && $bb aztec_process 2>&1) | tee "$tmp_log"
output=$(cat "$tmp_log")

if ! echo "$output" | grep -q "Found.*contract artifact"; then
  echo "Error: Directory mode did not find contracts"
  echo "$output"
  exit 1
fi

if ! echo "$output" | grep -qE "(Transpil|Successfully processed)"; then
  echo "Error: Directory mode did not start processing contracts"
  echo "$output"
  exit 1
fi

echo "✓ Directory mode works"

# Test 3: Force regeneration flag
echo "Test 3: Force regeneration"
echo "  Running: bb aztec_process with --force flag..."
$bb aztec_process -i "$test_contract" -o "$tmp_output" -f 2>&1 | tee "$tmp_log"

if ! grep -q "Generating verification key" "$tmp_log"; then
  echo "Error: Force flag did not regenerate keys"
  exit 1
fi

echo "✓ Force regeneration works"

echo "All bb aztec_process tests passed!"
