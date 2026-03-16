#!/usr/bin/env bash
# Auto-resume T1 audit with usage monitoring.
# Waits INITIAL_DELAY, launches audit, monitors for rate-limit failures,
# kills if usage appears exhausted, then polls until usage resets and resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_SCRIPT="$SCRIPT_DIR/run-vm2-audits.sh"
LOG_DIR="$SCRIPT_DIR/../auto-resume-logs"
mkdir -p "$LOG_DIR"

INITIAL_DELAY="${1:-14400}"  # default 4 hours (seconds)
JOBS="${2:-40}"
TIER="${3:-1}"
CHECK_INTERVAL=180           # check usage every 3 minutes while running
RESET_POLL_INTERVAL=600      # check every 10 minutes for reset
FAILURE_THRESHOLD=5          # consecutive failures before assuming rate-limited
MAX_CYCLES=20                # safety: don't loop forever

MAIN_LOG="$LOG_DIR/auto-resume-$(date +%Y%m%d-%H%M%S).log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$MAIN_LOG"; }

count_completed() {
    local results_dir
    results_dir="$(cd "$SCRIPT_DIR/../../audit-results" && pwd)"
    ls "$results_dir"/*.md 2>/dev/null | grep -v SUMMARY | wc -l
}

# Check recent audit log for consecutive failures (rate limit signal)
check_rate_limited() {
    local audit_log="$SCRIPT_DIR/../../audit-results/audit-run.log"
    if [[ ! -f "$audit_log" ]]; then
        return 1  # not rate limited
    fi
    # Count recent failures in last 20 lines of log
    local recent_failures
    recent_failures=$(tail -40 "$audit_log" 2>/dev/null | grep -c "FAIL\|ERROR\|timed out\|rate.limit\|usage.limit\|capacity\|overloaded" || true)
    if (( recent_failures >= FAILURE_THRESHOLD )); then
        return 0  # looks rate limited
    fi
    return 1
}

# Try a quick claude session to see if usage has reset
test_usage_available() {
    local result
    result=$(env -u CLAUDECODE timeout 30 claude -p "Reply with exactly: OK" --model sonnet 2>&1) || true
    if echo "$result" | grep -qi "OK"; then
        return 0  # usage available
    fi
    return 1  # still limited
}

run_audit_cycle() {
    local cycle=$1
    local completed_before
    completed_before=$(count_completed)
    log "CYCLE $cycle: Starting audit. Completed so far: $completed_before"

    # Launch audit in background
    env -u CLAUDECODE "$AUDIT_SCRIPT" -T "$TIER" -j "$JOBS" >> "$MAIN_LOG" 2>&1 &
    local audit_pid=$!
    log "CYCLE $cycle: Audit PID=$audit_pid"

    # Monitor while audit runs
    while kill -0 "$audit_pid" 2>/dev/null; do
        sleep "$CHECK_INTERVAL"

        if ! kill -0 "$audit_pid" 2>/dev/null; then
            break  # audit finished naturally
        fi

        local completed_now
        completed_now=$(count_completed)
        log "CYCLE $cycle: Progress check - $completed_now completed"

        if check_rate_limited; then
            log "CYCLE $cycle: Rate limit detected! Killing audit (PID=$audit_pid)"
            kill "$audit_pid" 2>/dev/null || true
            # Kill any child claude processes
            pkill -P "$audit_pid" 2>/dev/null || true
            sleep 5
            # More aggressive cleanup
            pgrep -f "run-vm2-audits" | xargs kill 2>/dev/null || true
            local completed_after
            completed_after=$(count_completed)
            log "CYCLE $cycle: Stopped at $completed_after completed (was $completed_before at start)"
            return 1  # signal: rate limited
        fi
    done

    wait "$audit_pid" 2>/dev/null || true
    local completed_after
    completed_after=$(count_completed)
    log "CYCLE $cycle: Audit finished naturally. $completed_after completed total."
    return 0  # finished
}

wait_for_reset() {
    log "Waiting for usage reset (checking every ${RESET_POLL_INTERVAL}s)..."
    while true; do
        sleep "$RESET_POLL_INTERVAL"
        log "Testing if usage is available..."
        if test_usage_available; then
            log "Usage is available again!"
            return 0
        fi
        log "Still rate-limited, will check again in ${RESET_POLL_INTERVAL}s"
    done
}

# --- Main ---

log "=== Auto-resume audit started ==="
log "Initial delay: ${INITIAL_DELAY}s, Jobs: $JOBS, Tier: T$TIER"
log "Waiting ${INITIAL_DELAY}s before first run..."
sleep "$INITIAL_DELAY"

cycle=0
while (( cycle < MAX_CYCLES )); do
    cycle=$((cycle + 1))

    completed=$(count_completed)
    # Rough check: T1 has ~12 skills × 63 files = 756 total
    if (( completed >= 750 )); then
        log "Looks like we're done! $completed sessions completed."
        break
    fi

    if run_audit_cycle "$cycle"; then
        log "Audit completed successfully on cycle $cycle"
        break
    else
        log "Audit stopped (likely rate limited). Waiting for reset..."
        wait_for_reset
    fi
done

log "=== Auto-resume audit finished ==="
