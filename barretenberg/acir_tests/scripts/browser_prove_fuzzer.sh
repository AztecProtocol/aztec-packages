#!/usr/bin/env bash
set -eu

# Fuzzer script that runs browser proving multiple times to test stability
# Usage: ./browser_prove_fuzzer.sh <test_name> <browser> [iterations]
# Example: ./browser_prove_fuzzer.sh a_1_mul webkit 100

source $(git rev-parse --show-toplevel)/ci3/source

TEST_NAME=${1:-}
BROWSER=${2:-webkit}
ITERATIONS=${3:-100}

if [ -z "$TEST_NAME" ]; then
  echo "Usage: $0 <test_name> <browser> [iterations]"
  echo "Example: $0 a_1_mul webkit 100"
  exit 1
fi

echo "========================================="
echo "Browser Prove Fuzzer"
echo "========================================="
echo "Test: $TEST_NAME"
echo "Browser: $BROWSER"
echo "Iterations: $ITERATIONS"
echo "========================================="

# Navigate to test directory
cd ../acir_tests/$TEST_NAME
export BROWSER=$BROWSER

# Launch browser server once (reuse for all iterations)
echo "Starting browser server..."
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo ""
    echo "Stopping browser server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    # Kill any remaining serve processes
    pkill -f "serve.*8080" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Kill any existing server on port 8080
pkill -f "serve.*8080" 2>/dev/null || true
sleep 1

# Start server in background
cd ../../browser-test-app
../node_modules/.bin/serve -n -L -p 8080 -c ../serve.json dest > /dev/null 2>&1 &
SERVER_PID=$!
cd ../acir_tests/$TEST_NAME

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..30}; do
  if nc -z localhost 8080 &>/dev/null; then
    echo "Server ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: Server failed to start after 30 seconds"
    exit 1
  fi
  sleep 1
done

# Run fuzzer
echo ""
echo "Starting fuzzer with $ITERATIONS iterations..."
echo ""

SUCCESS_COUNT=0
FAILURE_COUNT=0
FAILURES=()
START_TIME=$(date +%s)

for i in $(seq 1 $ITERATIONS); do
  ITER_START=$(date +%s.%N)

  # Run the browser test - capture output to temp file
  TMP_OUTPUT=$(mktemp)
  if ../../headless-test/bb.js.browser prove_and_verify -b target/program.json > "$TMP_OUTPUT" 2>&1; then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    STATUS="✓"
    rm -f "$TMP_OUTPUT"
  else
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    FAILURES+=("$i")
    STATUS="✗"

    # Show detailed failure information
    ITER_END=$(date +%s.%N)
    ELAPSED=$(($(date +%s) - START_TIME))
    echo ""
    echo "========================================="
    echo "FAILURE DETECTED AT ITERATION $i"
    echo "========================================="
    echo "Elapsed time: ${ELAPSED}s"
    echo "Success rate before failure: $(awk "BEGIN {printf \"%.1f\", 100.0 * $SUCCESS_COUNT / $i}")%"
    echo ""
    echo "Error output:"
    echo "----------------------------------------"
    cat "$TMP_OUTPUT"
    echo "----------------------------------------"
    rm -f "$TMP_OUTPUT"

    # Exit immediately on failure
    exit 1
  fi

  ITER_END=$(date +%s.%N)
  ITER_TIME=$(awk "BEGIN {print $ITER_END - $ITER_START}")

  # Print progress every iteration (or every 10 for large runs)
  if [ $ITERATIONS -le 20 ] || [ $((i % 10)) -eq 0 ] || [ $i -eq $ITERATIONS ]; then
    ELAPSED=$(($(date +%s) - START_TIME))
    AVG_TIME=$(awk "BEGIN {printf \"%.2f\", $ELAPSED / $i}")
    REMAINING=$((ITERATIONS - i))
    ETA=$(awk "BEGIN {printf \"%.0f\", $REMAINING * $AVG_TIME}")
    SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", 100.0 * $SUCCESS_COUNT / $i}")

    printf "[%3d/%3d] %s | Success: %3d | Failed: %3d | Rate: %5.1f%% | Elapsed: %4ds | Avg: %4.1fs | ETA: %4ds\n" \
      $i $ITERATIONS "$STATUS" $SUCCESS_COUNT $FAILURE_COUNT $SUCCESS_RATE $ELAPSED $AVG_TIME $ETA
  fi
done

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

# Print summary
echo ""
echo "========================================="
echo "FUZZER SUMMARY"
echo "========================================="
echo "Total iterations:  $ITERATIONS"
echo "Successful:        $SUCCESS_COUNT"
echo "Failed:            $FAILURE_COUNT"
echo "Success rate:      $(awk "BEGIN {printf \"%.2f\", 100.0 * $SUCCESS_COUNT / $ITERATIONS}")%"
echo "Total time:        ${TOTAL_TIME}s"
echo "Average per iter:  $(awk "BEGIN {printf \"%.3f\", $TOTAL_TIME / $ITERATIONS}")s"

if [ $FAILURE_COUNT -gt 0 ]; then
  echo ""
  echo "Failed iterations: ${FAILURES[@]}"
fi

echo "========================================="

# Exit with failure if any tests failed
if [ $FAILURE_COUNT -gt 0 ]; then
  exit 1
fi
