#!/usr/bin/env bash
#
# Extract logs for a specific test from a log file.
#
# Usage: extract-test-logs.sh <log-file> <test-name>
#
# Output:
#   - Success: Extracted log lines to stdout, exit 0
#   - Test not found: Error message to stderr, exit 1
#   - File not found: Error message to stderr, exit 2
#
# Example:
#   ./extract-test-logs.sh /tmp/abc123.log "does not prune if proof lands"
#

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <log-file> <test-name>" >&2
  echo "Example: $0 /tmp/abc123.log 'my test name'" >&2
  exit 1
fi

LOG_FILE="$1"
TEST_NAME="$2"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "ERROR: Log file not found: $LOG_FILE" >&2
  exit 2
fi

# Find the line number where the test starts (|| true to handle no match with set -e)
START=$(grep -n "Running test $TEST_NAME" "$LOG_FILE" | head -1 | cut -d: -f1 || true)

if [[ -z "$START" ]]; then
  echo "ERROR: Test not found in logs: '$TEST_NAME'" >&2
  echo "Available tests in this log:" >&2
  grep "Running test " "$LOG_FILE" | head -10 | sed 's/^/  /' >&2
  exit 1
fi

# Find the line number where the next test starts (if any)
END=$(awk "NR>$START && /Running test /{print NR; exit}" "$LOG_FILE")

# Extract the test's logs
if [[ -z "$END" ]]; then
  # Test is last in file, extract to end
  sed -n "${START},\$p" "$LOG_FILE"
else
  # Extract up to (but not including) the next test marker
  sed -n "${START},$((END-1))p" "$LOG_FILE"
fi
