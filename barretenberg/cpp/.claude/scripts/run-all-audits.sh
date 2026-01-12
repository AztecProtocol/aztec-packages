#!/bin/bash
#
# run-all-audits.sh - Run all vm2-audit-* skills in parallel
#
# Usage:
#   ./run-all-audits.sh [OPTIONS]
#
# Options:
#   -j, --jobs N        Maximum parallel jobs (default: 4)
#   -o, --output DIR    Output directory (default: ./audit-results)
#   -s, --skill SKILL   Run only specific skill(s) (can be repeated)
#   -t, --target PATH   Target path/file to audit (default: pil/vm2)
#   -m, --model MODEL   Model to use (default: sonnet)
#   --summarize-only    Only run summarizer on existing results
#   --no-summarize      Skip the summarizer step
#   --multi-model-summary  Run extra multi-model validation (Gemini/GPT via PAL MCP)
#   -h, --help          Show this help message
#
# Environment Variables:
#   EXTRA_MULTI_MODEL_SUMMARY=1  Enable multi-model validation (same as --multi-model-summary)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
MAX_JOBS=4
OUTPUT_DIR="./audit-results"
TARGET_PATH="pil/vm2"
MODEL="sonnet"
SPECIFIC_SKILLS=()
SUMMARIZE_ONLY=false
NO_SUMMARIZE=false
EXTRA_MULTI_MODEL_SUMMARY="${EXTRA_MULTI_MODEL_SUMMARY:-false}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SKILLS_DIR="$SCRIPT_DIR/../skills"

# Dynamically discover all vm2-audit-* skills from the skills directory
ALL_SKILLS=()
for dir in "$SKILLS_DIR"/vm2-audit-*/; do
    if [[ -d "$dir" ]]; then
        skill_name=$(basename "$dir")
        ALL_SKILLS+=("$skill_name")
    fi
done

# Sort for consistent ordering
IFS=$'\n' ALL_SKILLS=($(sort <<<"${ALL_SKILLS[*]}")); unset IFS

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -j|--jobs)
            MAX_JOBS="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -s|--skill)
            SPECIFIC_SKILLS+=("$2")
            shift 2
            ;;
        -t|--target)
            TARGET_PATH="$2"
            shift 2
            ;;
        -m|--model)
            MODEL="$2"
            shift 2
            ;;
        --summarize-only)
            SUMMARIZE_ONLY=true
            shift
            ;;
        --no-summarize)
            NO_SUMMARIZE=true
            shift
            ;;
        --multi-model-summary)
            EXTRA_MULTI_MODEL_SUMMARY=true
            shift
            ;;
        -h|--help)
            head -20 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Determine which skills to run
if [[ ${#SPECIFIC_SKILLS[@]} -gt 0 ]]; then
    SKILLS_TO_RUN=("${SPECIFIC_SKILLS[@]}")
else
    SKILLS_TO_RUN=("${ALL_SKILLS[@]}")
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Log file for overall progress
LOG_FILE="$OUTPUT_DIR/audit-run.log"

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Function to run a single skill
run_skill() {
    local skill="$1"
    local output_file="$OUTPUT_DIR/${skill}.md"
    local status_file="$OUTPUT_DIR/.${skill}.status"
    local start_time=$(date +%s)

    echo "running" > "$status_file"

    # Build the prompt for the skill
    local prompt="Run the /${skill} audit on ${TARGET_PATH}. Provide a thorough audit report with findings categorized by severity (Critical, High, Medium, Low). Include file locations and line numbers for each finding."

    # Run claude with the skill
    if claude -p "$prompt" \
        --model "$MODEL" \
        --allowedTools "Read,Glob,Grep,Bash,Write,Edit" \
        --output-format text \
        > "$output_file" 2>&1; then
        echo "success" > "$status_file"
    else
        echo "failed" > "$status_file"
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo "$duration" >> "$status_file"
}

# Function to show progress
show_progress() {
    local total=${#SKILLS_TO_RUN[@]}
    local completed=0
    local failed=0
    local running=0
    local running_skills=()

    for skill in "${SKILLS_TO_RUN[@]}"; do
        local status_file="$OUTPUT_DIR/.${skill}.status"
        if [[ -f "$status_file" ]]; then
            local status=$(head -1 "$status_file")
            case "$status" in
                success) ((++completed)) ;;
                failed) ((++failed)); ((++completed)) ;;
                running) ((++running)); running_skills+=("${skill#vm2-audit-}") ;;
            esac
        fi
    done

    local elapsed=$(($(date +%s) - OVERALL_START))
    local running_list=""
    if [[ ${#running_skills[@]} -gt 0 ]]; then
        running_list=" [${running_skills[*]}]"
    fi
    echo -e "${BLUE}[${elapsed}s] Progress: ${completed}/${total} completed, ${running} running, ${failed} failed${running_list}${NC}"
}

# Background progress monitor
progress_monitor() {
    while true; do
        sleep 30
        # Check if we should still be running
        if [[ ! -f "$OUTPUT_DIR/.monitor_running" ]]; then
            break
        fi
        show_progress
    done
}

# Track last announced completions to detect new ones
declare -A ANNOUNCED_COMPLETIONS

# Function to announce newly completed skills
announce_completions() {
    for skill in "${SKILLS_TO_RUN[@]}"; do
        local status_file="$OUTPUT_DIR/.${skill}.status"
        if [[ -f "$status_file" && -z "${ANNOUNCED_COMPLETIONS[$skill]:-}" ]]; then
            local status=$(head -1 "$status_file")
            if [[ "$status" == "success" ]]; then
                local duration=$(tail -1 "$status_file" 2>/dev/null || echo "?")
                log "${GREEN}[DONE]${NC} $skill (${duration}s)"
                ANNOUNCED_COMPLETIONS[$skill]=1
            elif [[ "$status" == "failed" ]]; then
                local duration=$(tail -1 "$status_file" 2>/dev/null || echo "?")
                log "${RED}[FAIL]${NC} $skill (${duration}s)"
                ANNOUNCED_COMPLETIONS[$skill]=1
            fi
        fi
    done
}

# Export functions for parallel execution
export -f run_skill
export OUTPUT_DIR TARGET_PATH MODEL

# Skip to summarizer if --summarize-only
if [[ "$SUMMARIZE_ONLY" == "true" ]]; then
    log "${YELLOW}Skipping audit runs, going straight to summarizer...${NC}"
else
    # Print banner
    log ""
    log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}║              VM2 Audit Skills - Batch Runner                 ║${NC}"
    log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    log ""
    log "Configuration:"
    log "  Output directory: $OUTPUT_DIR"
    log "  Target path: $TARGET_PATH"
    log "  Model: $MODEL"
    log "  Max parallel jobs: $MAX_JOBS"
    log "  Skills to run: ${#SKILLS_TO_RUN[@]}"
    log ""
    log "Skills:"
    for skill in "${SKILLS_TO_RUN[@]}"; do
        log "  - $skill"
    done
    log ""
    log "${YELLOW}Starting audit runs...${NC}"
    log ""

    # Record start time
    OVERALL_START=$(date +%s)
    export OVERALL_START

    # Start background progress monitor
    touch "$OUTPUT_DIR/.monitor_running"
    progress_monitor &
    MONITOR_PID=$!

    # Run skills in parallel with job control
    job_count=0
    pids=()

    for skill in "${SKILLS_TO_RUN[@]}"; do
        # Start the skill in background
        log "${BLUE}[START]${NC} $skill"
        run_skill "$skill" &
        pids+=($!)
        ((++job_count))

        # If we've hit max jobs, wait for one to finish
        if [[ $job_count -ge $MAX_JOBS ]]; then
            wait -n 2>/dev/null || true
            ((--job_count)) || true
            announce_completions
            show_progress
        fi
    done

    # Wait for all remaining jobs with periodic progress updates
    log ""
    log "${YELLOW}Waiting for remaining ${job_count} jobs to complete...${NC}"
    while [[ $job_count -gt 0 ]]; do
        wait -n 2>/dev/null || true
        ((--job_count)) || true
        announce_completions
    done

    # Stop the background monitor
    rm -f "$OUTPUT_DIR/.monitor_running"
    kill $MONITOR_PID 2>/dev/null || true
    wait $MONITOR_PID 2>/dev/null || true

    OVERALL_END=$(date +%s)
    OVERALL_DURATION=$((OVERALL_END - OVERALL_START))

    # Print summary
    log ""
    log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}║                    Audit Runs Complete                       ║${NC}"
    log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    log ""
    log "Total time: ${OVERALL_DURATION}s"
    log ""

    # Show final status summary
    success_count=0
    fail_count=0
    for skill in "${SKILLS_TO_RUN[@]}"; do
        status_file="$OUTPUT_DIR/.${skill}.status"
        if [[ -f "$status_file" ]]; then
            status=$(head -1 "$status_file")
            case "$status" in
                success) ((++success_count)) ;;
                failed) ((++fail_count)) ;;
            esac
        fi
    done
    log "${GREEN}Successful:${NC} ${success_count}  ${RED}Failed:${NC} ${fail_count}"
fi

# Run summarizer unless --no-summarize
if [[ "$NO_SUMMARIZE" != "true" ]]; then
    log ""
    log "${YELLOW}Running summarizer...${NC}"

    SUMMARIZER_SCRIPT="$SCRIPT_DIR/summarize-audits.sh"
    if [[ -x "$SUMMARIZER_SCRIPT" ]]; then
        SUMMARIZER_ARGS=(-o "$OUTPUT_DIR" -m "$MODEL")
        if [[ "$EXTRA_MULTI_MODEL_SUMMARY" == "true" ]] || [[ "$EXTRA_MULTI_MODEL_SUMMARY" == "1" ]]; then
            SUMMARIZER_ARGS+=(--multi-model-summary)
        fi
        "$SUMMARIZER_SCRIPT" "${SUMMARIZER_ARGS[@]}"
    else
        log "${RED}Summarizer script not found or not executable: $SUMMARIZER_SCRIPT${NC}"
        log "Run: chmod +x $SUMMARIZER_SCRIPT"
    fi
fi

log ""
log "${GREEN}All done! Results in: $OUTPUT_DIR${NC}"
