#!/bin/bash
# Run ACIR formal proof tests sequentially with time/memory limits.
# Usage: ./run_tests.sh [TIME_LIMIT_SEC] [MEM_LIMIT_GB]
# Example: ./run_tests.sh 600 16

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
BIN="$REPO_ROOT/barretenberg/cpp/build-smt/bin/acir_formal_proofs_tests"

TIME_LIMIT="${1:-300}"
MEM_LIMIT_GB="${2:-8}"
MEM_LIMIT_KB=$((MEM_LIMIT_GB * 1024 * 1024))

if [ ! -f "$BIN" ]; then
  echo "ERROR: Test binary not found at $BIN"
  echo "Build it first: cd barretenberg/cpp && cmake --preset smt-verification -DACIR_FORMAL_PROOFS=ON && cd build-smt && ninja acir_formal_proofs_tests"
  exit 1
fi

TESTS=(
  "acir_formal_proofs.uint_terms_add"
  "acir_formal_proofs.uint_terms_and"
  "acir_formal_proofs.uint_terms_and32"
  "acir_formal_proofs.uint_terms_div"
  "acir_formal_proofs.uint_terms_eq"
  "acir_formal_proofs.uint_terms_lt"
  "acir_formal_proofs.uint_terms_mod"
  "acir_formal_proofs.uint_terms_mul"
  "acir_formal_proofs.uint_terms_or"
  "acir_formal_proofs.uint_terms_or32"
  "acir_formal_proofs.uint_terms_shl8"
  "acir_formal_proofs.uint_terms_shl32"
  "acir_formal_proofs.uint_terms_shr"
  "acir_formal_proofs.uint_terms_sub"
  "acir_formal_proofs.uint_terms_xor"
  "acir_formal_proofs.uint_terms_xor32"
  "acir_formal_proofs.uint_terms_not"
  "acir_formal_proofs.field_terms_add"
  "acir_formal_proofs.field_terms_div"
  "acir_formal_proofs.field_terms_eq"
  "acir_formal_proofs.field_terms_mul"
  "acir_formal_proofs.integer_terms_div"
  "acir_formal_proofs.non_uniqueness_for_truncate_field_to_u64"
  "acir_formal_proofs.non_uniqueness_for_truncate_u64_to_u8"
  "acir_formal_proofs.non_uniqueness_for_truncate_i64_to_u8"
  "AcirFormalProofs.SignedAdd"
  "AcirFormalProofs.SignedAnd"
  "AcirFormalProofs.SignedEq"
  "AcirFormalProofs.SignedMod"
  "AcirFormalProofs.SignedMul"
  "AcirFormalProofs.SignedOr"
  "AcirFormalProofs.SignedShl"
  "AcirFormalProofs.SignedShr"
  "AcirFormalProofs.SignedSub"
  "AcirFormalProofs.SignedXor"
  "AcirFormalProofs.SignedNot"
)

RESULTS_FILE="/tmp/acir_test_results.txt"
echo "TEST|EXIT_CODE|WALL_TIME|PEAK_MEM_KB|STATUS" > "$RESULTS_FILE"

echo "Running ${#TESTS[@]} tests (timeout: ${TIME_LIMIT}s, mem limit: ${MEM_LIMIT_GB}GB)"
echo ""

total=${#TESTS[@]}
i=0

for test in "${TESTS[@]}"; do
  i=$((i + 1))
  echo "[$i/$total] Running: $test"

  OUTPUT=$(bash -c "ulimit -v $MEM_LIMIT_KB 2>/dev/null; timeout ${TIME_LIMIT}s /usr/bin/time -v \"$BIN\" --gtest_filter=\"$test\" 2>&1") || true
  EXIT_CODE=${PIPESTATUS[0]:-$?}

  # Extract wall clock time
  WALL_TIME=$(echo "$OUTPUT" | grep "Elapsed (wall clock) time" | sed 's/.*: //')
  if [ -z "$WALL_TIME" ]; then
    WALL_TIME="N/A"
  fi

  # Extract peak memory (KB)
  PEAK_MEM=$(echo "$OUTPUT" | grep "Maximum resident set size" | sed 's/.*: //')
  if [ -z "$PEAK_MEM" ]; then
    PEAK_MEM="N/A"
  fi

  # Determine status
  if [ "$EXIT_CODE" -eq 0 ]; then
    STATUS="PASSED"
  elif [ "$EXIT_CODE" -eq 124 ]; then
    STATUS="TIMEOUT"
  elif [ "$EXIT_CODE" -eq 137 ]; then
    STATUS="OOM"
  else
    STATUS="FAILED($EXIT_CODE)"
  fi

  echo "  -> $STATUS (time: $WALL_TIME, mem: ${PEAK_MEM}KB)"
  echo "$test|$EXIT_CODE|$WALL_TIME|$PEAK_MEM|$STATUS" >> "$RESULTS_FILE"
done

echo ""
echo "=== RESULTS ==="
column -t -s'|' "$RESULTS_FILE"
