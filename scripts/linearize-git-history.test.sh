#!/usr/bin/env bash
# Tests for linearize-git-history script
# Run from the repo root: ./scripts/linearize-git-history.test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/linearize-git-history"

# Copy the script to a temp location so we can use it across branch switches
TEMP_SCRIPT="/tmp/linearize-git-history-$$"
cp "$SCRIPT" "$TEMP_SCRIPT"
chmod +x "$TEMP_SCRIPT"
SCRIPT="$TEMP_SCRIPT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}TEST:${NC} $*"; }
log_pass() { echo -e "${GREEN}PASS:${NC} $*"; }
log_fail() { echo -e "${RED}FAIL:${NC} $*"; }

# Track test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Safe increment function (avoids exit code 1 when var=0)
incr() { (($1++)) || true; }

# Save original branch
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || git rev-parse HEAD)

cleanup() {
    log_info "Cleaning up..."
    git checkout "$ORIGINAL_BRANCH" --quiet 2>/dev/null || true
    git branch -D linearize-test-branch next-linear-git 2>/dev/null || true
    git branch -D $(git branch --list 'linearize-work-*') 2>/dev/null || true
    rm -f "$TEMP_SCRIPT" 2>/dev/null || true
}

trap cleanup EXIT

# Test function that runs linearization and reports results
run_linearize_test() {
    local test_name="$1"
    local start_ref="$2"
    local num_commits="$3"

    incr TESTS_RUN

    log_info "=========================================="
    log_info "Test: $test_name"
    log_info "Start ref: $start_ref"
    log_info "Num commits: $num_commits"
    log_info "=========================================="

    # Checkout the starting point
    if ! git checkout "$start_ref" -B linearize-test-branch --quiet 2>/dev/null; then
        log_fail "$test_name - Could not checkout $start_ref"
        incr TESTS_FAILED
        return 1
    fi

    # Count merge commits BEFORE linearization
    local fork_point
    fork_point=$(git rev-parse "HEAD~$num_commits" 2>/dev/null)
    if [[ -z "$fork_point" ]]; then
        log_fail "$test_name - Could not find fork point HEAD~$num_commits"
        incr TESTS_FAILED
        return 1
    fi

    local merges_before
    merges_before=$(git rev-list --merges "${fork_point}..HEAD" | wc -l | tr -d ' ')

    local first_parent_commits
    first_parent_commits=$(git rev-list --first-parent "${fork_point}..HEAD" | wc -l | tr -d ' ')

    local total_commits_before
    total_commits_before=$(git rev-list "${fork_point}..HEAD" | wc -l | tr -d ' ')

    log_info "BEFORE linearization:"
    log_info "  Fork point: $(git rev-parse --short "$fork_point")"
    log_info "  First-parent commits: $first_parent_commits"
    log_info "  Total commits (all): $total_commits_before"
    log_info "  Merge commits: $merges_before"

    # Run linearization
    local output
    if ! output=$("$SCRIPT" "$num_commits" 2>&1); then
        # Check if it failed due to cleanup (which is expected on some errors)
        if echo "$output" | grep -q "Done!"; then
            : # Actually succeeded
        else
            log_fail "$test_name - Script failed"
            echo "$output" | tail -20
            incr TESTS_FAILED
            git checkout "$ORIGINAL_BRANCH" --quiet 2>/dev/null || true
            return 1
        fi
    fi

    # Count merge commits AFTER linearization
    local merges_after
    merges_after=$(git rev-list --merges "${fork_point}..next-linear-git" 2>/dev/null | wc -l | tr -d ' ')

    local total_commits_after
    total_commits_after=$(git rev-list "${fork_point}..next-linear-git" 2>/dev/null | wc -l | tr -d ' ')

    # Extract stats from output
    local processed skipped flattened
    processed=$(echo "$output" | grep "Commits processed:" | awk '{print $NF}')
    skipped=$(echo "$output" | grep "Commits skipped:" | awk '{print $NF}')
    flattened=$(echo "$output" | grep "Merge-trains flattened:" | awk '{print $NF}')

    log_info "AFTER linearization:"
    log_info "  Total commits: $total_commits_after"
    log_info "  Merge commits: $merges_after"
    log_info "  Commits processed: $processed"
    log_info "  Commits skipped: $skipped"
    log_info "  Merge-trains flattened: $flattened"

    # Verify no merge commits in result
    if [[ "$merges_after" -eq 0 ]]; then
        log_pass "$test_name - Linear history achieved (0 merge commits)"
        incr TESTS_PASSED
    else
        log_fail "$test_name - Still has $merges_after merge commits"
        incr TESTS_FAILED
    fi

    # Print summary line for easy comparison
    echo ""
    echo "| $test_name | $num_commits | $merges_before | $merges_after | $total_commits_before | $total_commits_after | $processed | $skipped |"
    echo ""

    # Cleanup for next test
    git checkout "$ORIGINAL_BRANCH" --quiet 2>/dev/null || true
    git branch -D linearize-test-branch next-linear-git 2>/dev/null || true

    return 0
}

# Header for results table
echo ""
echo "| Test | Num Commits | Merges Before | Merges After | Total Before | Total After | Processed | Skipped |"
echo "|------|-------------|---------------|--------------|--------------|-------------|-----------|---------|"

# Test 1: Recent history (small)
run_linearize_test "Recent (20 commits)" "origin/next" 20

# Test 2: Medium history
run_linearize_test "Medium (50 commits)" "origin/next" 50

# Test 3: Larger history
run_linearize_test "Large (100 commits)" "origin/next" 100

# Test 4: From an older point in history (if available)
# Go back ~50 commits from HEAD and test from there
OLDER_REF=$(git rev-parse "origin/next~50" 2>/dev/null || echo "")
if [[ -n "$OLDER_REF" ]]; then
    run_linearize_test "Older point (30 commits)" "$OLDER_REF" 30
fi

# Test 5: Very recent (should be quick)
run_linearize_test "Very recent (10 commits)" "origin/next" 10

echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo "Tests run: $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [[ "$TESTS_FAILED" -eq 0 ]]; then
    log_pass "All tests passed!"
    exit 0
else
    log_fail "$TESTS_FAILED test(s) failed"
    exit 1
fi
