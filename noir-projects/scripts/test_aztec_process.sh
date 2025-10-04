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

# Test 4: Verify VK correctness by comparing with noir-contracts bootstrap.sh generated VKs
echo "Test 4: Verify VK correctness"
echo "  Comparing aztec_process VKs with VKs from noir-contracts bootstrap.sh..."

# The test_contract was already processed by noir-contracts bootstrap.sh with the same method
# So we can compare the VKs that aztec_process generates with the ones already in the contract
original_vks=$(jq -c '[.functions[] | select(.verification_key != null) | {name, vk: .verification_key}]' "$test_contract")
new_vks=$(jq -c '[.functions[] | select(.verification_key != null) | {name, vk: .verification_key}]' "$tmp_output")

# Count VKs
original_count=$(echo "$original_vks" | jq 'length')
new_count=$(echo "$new_vks" | jq 'length')

if [ "$original_count" != "$new_count" ]; then
  echo "Error: VK count mismatch! Original: $original_count, New: $new_count"
  exit 1
fi

echo "  Comparing $original_count verification keys..."

# Compare each VK
mismatch_found=0
for i in $(seq 0 $((original_count - 1))); do
  func_name=$(echo "$original_vks" | jq -r ".[$i].name")
  original_vk=$(echo "$original_vks" | jq -r ".[$i].vk")
  new_vk=$(echo "$new_vks" | jq -r ".[$i].vk")

  if [ "$original_vk" != "$new_vk" ]; then
    echo "  ✗ Mismatch for function: $func_name"
    echo "    Original VK length: ${#original_vk}"
    echo "    New VK length: ${#new_vk}"
    mismatch_found=1
  else
    echo "  ✓ Match for function: $func_name"
  fi
done

if [ "$mismatch_found" -eq 1 ]; then
  echo "Error: VK mismatches found!"
  exit 1
fi

echo "✓ All VKs match noir-contracts bootstrap.sh output"

# Test 5: Verify transpilation was called
echo "Test 5: Verify transpilation"
echo "  Checking that transpiler was invoked..."

# The transpiler either transpiles the contract or marks it as already transpiled
# Check the transpiled flag
original_transpiled=$(jq -r '.transpiled // false' "$test_contract")
new_transpiled=$(jq -r '.transpiled // false' "$tmp_output")

if [ "$original_transpiled" == "$new_transpiled" ]; then
  echo "  ✓ Transpiled flag matches: $new_transpiled"
else
  echo "  ✗ Transpiled flag mismatch! Original: $original_transpiled, New: $new_transpiled"
  exit 1
fi

# Check that the contract structure is preserved
original_funcs=$(jq '[.functions[] | .name] | sort' "$test_contract")
new_funcs=$(jq '[.functions[] | .name] | sort' "$tmp_output")

if [ "$original_funcs" == "$new_funcs" ]; then
  echo "  ✓ All functions preserved through transpilation"
else
  echo "  ✗ Function list changed during transpilation!"
  exit 1
fi

echo "✓ Transpilation verified (contract structure preserved, transpiled=$new_transpiled)"

# Test 6: Verify cache is working
echo "Test 6: Verify caching works"
echo "  Running aztec_process twice to test cache..."

# First run (should use cache from previous tests)
time1_start=$(date +%s%N)
$bb aztec_process -i "$test_contract" -o "$tmp_output" > "$tmp_log" 2>&1
time1_end=$(date +%s%N)
time1=$((($time1_end - $time1_start) / 1000000)) # Convert to milliseconds

cached_count=$(grep -c "already in cache" "$tmp_log" || true)
generated_count=$(grep -c "Generating verification key:" "$tmp_log" || true)

if [ "$cached_count" -eq 0 ]; then
  echo "Error: No VKs were loaded from cache on second run"
  exit 1
fi

echo "  First run (with cache): ${time1}ms, ${cached_count} VKs from cache, ${generated_count} generated"

# Second run with force (should regenerate all)
time2_start=$(date +%s%N)
$bb aztec_process -i "$test_contract" -o "$tmp_output" -f > "$tmp_log" 2>&1
time2_end=$(date +%s%N)
time2=$((($time2_end - $time2_start) / 1000000))

forced_count=$(grep -c "Generating verification key:" "$tmp_log" || true)

if [ "$forced_count" -eq 0 ]; then
  echo "Error: Force flag did not regenerate any VKs"
  exit 1
fi

echo "  Second run (forced): ${time2}ms, 0 VKs from cache, ${forced_count} generated"

if [ "$time1" -gt "$time2" ]; then
  echo "Warning: Cached run was slower than forced run (may indicate cache not working)"
fi

echo "✓ Caching verified (${cached_count} VKs cached, ${forced_count} regenerated with --force)"

echo ""
echo "All bb aztec_process tests passed!"
