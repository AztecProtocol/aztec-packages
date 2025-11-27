#!/bin/bash

mkdir -p proof_inputs

usage() {
  echo "Usage: $0 [OPTIONS] [TEST_NAME]"
  echo ""
  echo "Options:"
  echo "  --all    Run all tests in avm_proving_tests/"
  echo "  --help   Show this help message"
  echo ""
  echo "Arguments:"
  echo "  TEST_NAME  Name of the test (without .test.ts extension)"
  echo "             e.g., 'avm_minimal_proving' or 'avm_bulk'"
  echo ""
  echo "Examples:"
  echo "  $0 avm_minimal_proving    # Run single test"
  echo "  $0 --all                  # Run all tests"
  echo ""
  echo "Available tests:"
  ls src/avm_proving_tests/*.test.ts 2>/dev/null | xargs -n1 basename | sed 's/.test.ts$//'
  exit 0
}

run_test() {
  local test_file="$1"
  local test_name=$(basename "$test_file" .test.ts)

  echo "=== Running test: $test_name ==="

  # Record existing bb-* dirs before test
  ls -d /tmp/bb-* 2>/dev/null | sort > /tmp/before_test.txt || true

  # Run the test
  BB_SKIP_CLEANUP=1 yarn test "$test_file" || true

  # Record bb-* dirs after test
  ls -d /tmp/bb-* 2>/dev/null | sort > /tmp/after_test.txt || true

  # Find new dirs and copy avm_inputs.bin
  local count=0
  for dir in $(comm -13 /tmp/before_test.txt /tmp/after_test.txt); do
    if [ -f "$dir/avm_inputs.bin" ]; then
      cp "$dir/avm_inputs.bin" "proof_inputs/${test_name}_${count}_avm_inputs.bin"
      echo "Copied: $dir/avm_inputs.bin -> proof_inputs/${test_name}_${count}_avm_inputs.bin"
      count=$((count + 1))
    else
      echo "No avm_inputs.bin found in $dir"
      ls -la "$dir"
    fi
  done

  rm -f /tmp/before_test.txt /tmp/after_test.txt
}

# Parse arguments
if [ $# -eq 0 ]; then
  usage
fi

case "$1" in
  --help|-h)
    usage
    ;;
  --all)
    echo "Running all AVM proving tests..."
    for test_file in src/avm_proving_tests/*.test.ts; do
      run_test "$test_file"
    done
    ;;
  *)
    test_file="src/avm_proving_tests/$1.test.ts"
    if [ ! -f "$test_file" ]; then
      echo "Error: Test file not found: $test_file"
      echo ""
      echo "Available tests:"
      ls src/avm_proving_tests/*.test.ts 2>/dev/null | xargs -n1 basename | sed 's/.test.ts$//'
      exit 1
    fi
    run_test "$test_file"
    ;;
esac

echo ""
echo "=== Files in proof_inputs: ==="
ls -la proof_inputs/
