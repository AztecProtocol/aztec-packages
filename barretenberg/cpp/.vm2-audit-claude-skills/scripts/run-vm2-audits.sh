#!/bin/bash
#
# run-vm2-audits.sh - Run vm2-audit-* skills in parallel with tier selection
#
# Usage:
#   ./run-vm2-audits.sh [OPTIONS]
#
# Options:
#   -T, --tier TIERS    Run specific tier(s): 1, 2, 3, 4, or combinations like "1,2" or "1-3"
#                       Default: all tiers. Examples:
#                         -T 1       Run Tier 1 (Critical) only
#                         -T 1,2     Run Tiers 1 and 2
#                         -T 1-3     Run Tiers 1 through 3
#   -j, --jobs N        Maximum parallel jobs (default: 4)
#   -o, --output DIR    Output directory (default: ./audit-results)
#   -s, --skill SKILL   Run only specific skill(s) (can be repeated)
#   -t, --target PATH   Target path/file to audit (default: pil/vm2)
#   -m, --model MODEL   Model to use (default: sonnet)
#   --summarize-only    Only run summarizer on existing results
#   --no-summarize      Skip the summarizer step
#   --multi-model-summary  Run extra multi-model validation (Gemini/GPT via PAL MCP)
#   --skill-improvements   Analyze audit agent efficiency and propose skill improvements after audits complete
#   --skill-improvements-only  Only run skill improvements analysis on existing results (skip audits and summarizer)
#   --list-skills       List available skills by tier and exit
#   -h, --help          Show this help message
#
# Tier Descriptions:
#   Tier 1 (Critical):  Must-run skills that find the most severe bugs
#   Tier 2 (High):      High-value skills, should run for thorough audits
#   Tier 3 (Moderate):  Good-to-have skills for comprehensive coverage
#   Tier 4 (Sanity):    Sanity-check skills, usually return clean results
#
# Environment Variables:
#   EXTRA_MULTI_MODEL_SUMMARY=1  Enable multi-model validation (same as --multi-model-summary)
#
# Examples:
#   ./run-vm2-audits.sh -T 1                    # Run Tier 1 only (fastest, critical bugs)
#   ./run-vm2-audits.sh -T 1,2                  # Run Tiers 1 and 2 (recommended)
#   ./run-vm2-audits.sh -T 1-3 -j 6             # Run Tiers 1-3 with 6 parallel jobs
#   ./run-vm2-audits.sh                         # Run all tiers (comprehensive)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default configuration
MAX_JOBS=4
OUTPUT_DIR="./audit-results"
TARGET_PATH="pil/vm2"
MODEL=""
MODEL_EXPLICIT=false
EFFORT=""
SPECIFIC_SKILLS=()
SELECTED_TIERS=()  # Empty means all tiers
SUMMARIZE_ONLY=false
NO_SUMMARIZE=false
LIST_SKILLS=false
EXTRA_MULTI_MODEL_SUMMARY="${EXTRA_MULTI_MODEL_SUMMARY:-false}"
SKILL_IMPROVEMENTS=false
SKILL_IMPROVEMENTS_ONLY=false

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SKILLS_DIR="$SCRIPT_DIR/../skills"

# Function to parse tier specification
parse_tiers() {
    local tier_spec="$1"
    local tiers=()

    # Handle comma-separated values
    IFS=',' read -ra PARTS <<< "$tier_spec"
    for part in "${PARTS[@]}"; do
        # Handle range (e.g., "1-3" or "0-2")
        if [[ "$part" =~ ^([0-4])-([0-4])$ ]]; then
            local start="${BASH_REMATCH[1]}"
            local end="${BASH_REMATCH[2]}"
            for ((i=start; i<=end; i++)); do
                tiers+=("$i")
            done
        # Handle single tier
        elif [[ "$part" =~ ^[0-4]$ ]]; then
            tiers+=("$part")
        else
            echo -e "${RED}Invalid tier specification: $part${NC}" >&2
            echo "Valid tiers: 0, 1, 2, 3, 4 (or ranges like 0-2, 1-3)" >&2
            exit 1
        fi
    done

    # Remove duplicates and sort
    printf '%s\n' "${tiers[@]}" | sort -u
}

# Dynamically discover all vm2-audit-* skills from the skills directory, organized by tier
declare -A TIER_SKILLS
TIER_SKILLS[0]=""
TIER_SKILLS[1]=""
TIER_SKILLS[2]=""
TIER_SKILLS[3]=""
TIER_SKILLS[4]=""
OTHER_SKILLS=""

for dir in "$SKILLS_DIR"/vm2-audit-*/; do
    if [[ -d "$dir" ]]; then
        skill_name=$(basename "$dir")
        # Extract tier from skill name (vm2-audit-t0-*, vm2-audit-t1-*, etc.)
        if [[ "$skill_name" =~ ^vm2-audit-t([0-4])- ]]; then
            tier="${BASH_REMATCH[1]}"
            TIER_SKILLS[$tier]="${TIER_SKILLS[$tier]} $skill_name"
        else
            OTHER_SKILLS="$OTHER_SKILLS $skill_name"
        fi
    fi
done

# Function to list skills by tier
list_skills() {
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              VM2 Audit Skills by Tier                        ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${CYAN}Tier 0 - Opcode Cross-Layer Consistency:${NC}"
    for skill in ${TIER_SKILLS[0]}; do
        echo "  - $skill"
    done
    echo "  Count: $(echo ${TIER_SKILLS[0]} | wc -w)"
    echo ""

    echo -e "${CYAN}Tier 1 - Critical (Must Have):${NC}"
    for skill in ${TIER_SKILLS[1]}; do
        echo "  - $skill"
    done
    echo "  Count: $(echo ${TIER_SKILLS[1]} | wc -w)"
    echo ""

    echo -e "${CYAN}Tier 2 - High Value (Should Have):${NC}"
    for skill in ${TIER_SKILLS[2]}; do
        echo "  - $skill"
    done
    echo "  Count: $(echo ${TIER_SKILLS[2]} | wc -w)"
    echo ""

    echo -e "${CYAN}Tier 3 - Moderate Value (Good to Have):${NC}"
    for skill in ${TIER_SKILLS[3]}; do
        echo "  - $skill"
    done
    echo "  Count: $(echo ${TIER_SKILLS[3]} | wc -w)"
    echo ""

    echo -e "${CYAN}Tier 4 - Sanity Checks (Optional):${NC}"
    for skill in ${TIER_SKILLS[4]}; do
        echo "  - $skill"
    done
    echo "  Count: $(echo ${TIER_SKILLS[4]} | wc -w)"
    echo ""

    if [[ -n "$OTHER_SKILLS" ]]; then
        echo -e "${YELLOW}Other (non-tiered):${NC}"
        for skill in $OTHER_SKILLS; do
            echo "  - $skill"
        done
        echo ""
    fi

    local total=0
    for t in 0 1 2 3 4; do
        total=$((total + $(echo ${TIER_SKILLS[$t]} | wc -w)))
    done
    echo -e "${GREEN}Total tiered skills: $total${NC}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -T|--tier)
            while IFS= read -r tier; do
                SELECTED_TIERS+=("$tier")
            done < <(parse_tiers "$2")
            shift 2
            ;;
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
            MODEL_EXPLICIT=true
            shift 2
            ;;
        -e|--effort)
            EFFORT="$2"
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
        --skill-improvements)
            SKILL_IMPROVEMENTS=true
            shift
            ;;
        --skill-improvements-only)
            SKILL_IMPROVEMENTS=true
            SKILL_IMPROVEMENTS_ONLY=true
            shift
            ;;
        --list-skills)
            LIST_SKILLS=true
            shift
            ;;
        -h|--help)
            head -40 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Set default model
if [[ -z "$MODEL" ]]; then
    MODEL="sonnet"
fi

SUMMARIZER_MODEL="${MODEL}"

# Handle --list-skills
if [[ "$LIST_SKILLS" == "true" ]]; then
    list_skills
    exit 0
fi

# Build list of skills to run
ALL_SKILLS=()

if [[ ${#SPECIFIC_SKILLS[@]} -gt 0 ]]; then
    # Use specific skills if provided
    ALL_SKILLS=("${SPECIFIC_SKILLS[@]}")
elif [[ ${#SELECTED_TIERS[@]} -gt 0 ]]; then
    # Use skills from selected tiers
    for tier in "${SELECTED_TIERS[@]}"; do
        for skill in ${TIER_SKILLS[$tier]}; do
            ALL_SKILLS+=("$skill")
        done
    done
else
    # Use all tiered skills
    for tier in 0 1 2 3 4; do
        for skill in ${TIER_SKILLS[$tier]}; do
            ALL_SKILLS+=("$skill")
        done
    done
fi

# Sort by expected duration (longest first) for better parallel scheduling.
# The JSON file is pre-sorted descending; skills not listed get appended alphabetically.
TIMING_FILE="$SCRIPT_DIR/skill-avg-durations.json"
if [[ -f "$TIMING_FILE" ]] && command -v jq &>/dev/null; then
    # Extract skill ordering from the pre-sorted JSON array
    ORDERED_SKILLS=()
    declare -A SKILL_SET
    for skill in "${ALL_SKILLS[@]}"; do SKILL_SET[$skill]=1; done

    # Add skills in timing-file order (longest first)
    while IFS= read -r skill; do
        if [[ -n "${SKILL_SET[$skill]:-}" ]]; then
            ORDERED_SKILLS+=("$skill")
            unset "SKILL_SET[$skill]"
        fi
    done < <(jq -r '.[].skill' "$TIMING_FILE")

    # Append any remaining skills (new ones not in timing file) alphabetically
    for skill in $(printf '%s\n' "${!SKILL_SET[@]}" | sort); do
        ORDERED_SKILLS+=("$skill")
    done
    ALL_SKILLS=("${ORDERED_SKILLS[@]}")
else
    # Fallback: alphabetical
    IFS=$'\n' ALL_SKILLS=($(sort <<<"${ALL_SKILLS[*]}")); unset IFS
fi

SKILLS_TO_RUN=("${ALL_SKILLS[@]}")

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

    # Verify skill exists
    local skill_file="$SKILLS_DIR/${skill}/SKILL.md"
    if [[ ! -f "$skill_file" ]]; then
        echo "Skill not found: $skill_file" > "$output_file"
        echo "failed" > "$status_file"
        echo "0" >> "$status_file"
        return
    fi

    # Read skill instructions and build a combined prompt (avoids loading all skills into system prompt)
    local skill_instructions
    skill_instructions="$(cat "$skill_file")"

    local abs_output_dir="$(cd "$OUTPUT_DIR" && pwd)"
    local task_prompt="COVERAGE RULE: First run \`find ${TARGET_PATH} -name '*.pil' | sort\` to get ALL files. Grep patterns in the instructions below are starting points, not exhaustive scope. Sweep ALL files.

${skill_instructions}

---

TASK: Run the ${skill} audit on ${TARGET_PATH}. Provide a thorough audit report with findings categorized by severity (Critical, High, Medium, Low). Include file locations and line numbers for each finding. Write the JSON findings file to: ${abs_output_dir}/${skill}.json"

    local claude_args=(-p --model "$MODEL" --allowedTools "Read,Glob,Grep,Bash,Write,Edit" --output-format text --disable-slash-commands)
    if [[ -n "$EFFORT" ]]; then
        claude_args+=(--effort "$EFFORT")
    fi

    if echo "$task_prompt" | env -u CLAUDECODE claude "${claude_args[@]}" \
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
                running) ((++running)); running_skills+=("${skill#vm2-audit-t?-}") ;;
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
export OUTPUT_DIR TARGET_PATH MODEL EFFORT SKILLS_DIR

# Skip to summarizer if --summarize-only, skip everything if --skill-improvements-only
if [[ "$SKILL_IMPROVEMENTS_ONLY" == "true" ]]; then
    log "${YELLOW}Skipping audit runs and summarizer, going straight to skill improvements...${NC}"
elif [[ "$SUMMARIZE_ONLY" == "true" ]]; then
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
    log "  Model: ${MODEL:-"(default)"}"
    log "  Max parallel jobs: $MAX_JOBS"
    if [[ ${#SELECTED_TIERS[@]} -gt 0 ]]; then
        log "  Selected tiers: ${SELECTED_TIERS[*]}"
    else
        log "  Selected tiers: all (1-4)"
    fi
    log "  Skills to run: ${#SKILLS_TO_RUN[@]}"
    log ""

    # Group skills by tier for display
    log "Skills by tier:"
    for tier in 0 1 2 3 4; do
        tier_count=0
        tier_skills=""
        for skill in "${SKILLS_TO_RUN[@]}"; do
            if [[ "$skill" =~ ^vm2-audit-t${tier}- ]]; then
                ((++tier_count))
                tier_skills="$tier_skills $skill"
            fi
        done
        if [[ $tier_count -gt 0 ]]; then
            case $tier in
                0) log "  ${CYAN}Tier 0 (Opcode):${NC} $tier_count skills" ;;
                1) log "  ${CYAN}Tier 1 (Critical):${NC} $tier_count skills" ;;
                2) log "  ${CYAN}Tier 2 (High):${NC} $tier_count skills" ;;
                3) log "  ${CYAN}Tier 3 (Moderate):${NC} $tier_count skills" ;;
                4) log "  ${CYAN}Tier 4 (Sanity):${NC} $tier_count skills" ;;
            esac
        fi
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

# Run summarizer unless --no-summarize or --skill-improvements-only
if [[ "$NO_SUMMARIZE" != "true" && "$SKILL_IMPROVEMENTS_ONLY" != "true" ]]; then
    log ""
    log "${YELLOW}Running summarizer...${NC}"

    SUMMARIZER_SCRIPT="$SCRIPT_DIR/summarize-audits.sh"
    if [[ -x "$SUMMARIZER_SCRIPT" ]]; then
        SUMMARIZER_ARGS=(-o "$OUTPUT_DIR" -m "$SUMMARIZER_MODEL")
        if [[ "$EXTRA_MULTI_MODEL_SUMMARY" == "true" ]] || [[ "$EXTRA_MULTI_MODEL_SUMMARY" == "1" ]]; then
            SUMMARIZER_ARGS+=(--multi-model-summary)
        fi
        "$SUMMARIZER_SCRIPT" "${SUMMARIZER_ARGS[@]}"
    else
        log "${RED}Summarizer script not found or not executable: $SUMMARIZER_SCRIPT${NC}"
        log "Run: chmod +x $SUMMARIZER_SCRIPT"
    fi
fi

# ============================================================================
# OPTIONAL: Skill improvements analysis
# ============================================================================

if [[ "$SKILL_IMPROVEMENTS" == "true" ]]; then
    log ""
    log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}║          Skill Improvements Analysis                        ║${NC}"
    log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    log ""

    IMPROVEMENTS_FILE="$OUTPUT_DIR/SKILL-IMPROVEMENTS-PROPOSAL.md"
    IMPROVEMENTS_LOG="$OUTPUT_DIR/.skill-improvements.log"
    IMPROVEMENTS_START=$(date +%s)

    # Gather timing data from status files
    TIMING_DATA=""
    for skill in "${SKILLS_TO_RUN[@]}"; do
        status_file="$OUTPUT_DIR/.${skill}.status"
        if [[ -f "$status_file" ]]; then
            status=$(head -1 "$status_file")
            duration=$(tail -1 "$status_file" 2>/dev/null || echo "?")
            TIMING_DATA="${TIMING_DATA}${skill}: status=${status}, duration=${duration}s\n"
        fi
    done

    # Build the prompt as a temp file to avoid arg-list-too-long
    IMPROVEMENTS_PROMPT_FILE=$(mktemp)
    trap "rm -f '$IMPROVEMENTS_PROMPT_FILE'" EXIT

    cat > "$IMPROVEMENTS_PROMPT_FILE" << 'PROMPT_HEADER'
You are analyzing the outputs of a batch of security audit agents to propose improvements to the audit skills (prompt templates) that drive them.

Your goal: produce SKILL-IMPROVEMENTS-PROPOSAL.md with actionable recommendations to make the audit skills faster, more precise, and less wasteful.

## Analysis approach

1. Read ALL the audit output .md files in the output directory to understand what each agent actually did.
2. Read the SKILL.md files in the skills directory to see the prompts that drove each agent.
3. Look for patterns of wasted effort: repeated file reads, redundant searches, overly broad scans, tangential analysis, false positive generation, boilerplate output for no-finding results.
4. Look for skills that consistently produce no findings or only false positives — consider whether they should be restructured or dropped.
5. Look for skills whose scope overlaps significantly — consider merging or deduplication.

## Output format for SKILL-IMPROVEMENTS-PROPOSAL.md

The report MUST follow this structure:

### 1. Cross-Cutting Improvements
A numbered list of concise action items that would improve efficiency across multiple skills. Each item: one sentence describing the action + which skills it applies to.

### 2. Per-Skill Assessment
A table or list covering each skill with:
- Skill name
- Duration (from timing data below)
- Output quality: useful / marginal / not useful
- One-line recommendation: keep as-is / improve (how) / merge with X / drop

### 3. Detailed Sections
One subsection per item from the two lists above, with:
- The problem observed (with evidence from the audit outputs)
- Proposed solution
- Expected impact

PROMPT_HEADER

    # Append timing data
    {
        echo ""
        echo "## Timing Data"
        echo '```'
        echo -e "$TIMING_DATA"
        echo '```'
        echo ""
        echo "## Directories"
        echo "- Audit outputs: $OUTPUT_DIR/"
        echo "- Skill definitions: $SKILLS_DIR/"
        echo ""
        echo "Read the .md output files and the SKILL.md files, then write the report to: ${OUTPUT_DIR}/SKILL-IMPROVEMENTS-PROPOSAL.md"
    } >> "$IMPROVEMENTS_PROMPT_FILE"

    log "${YELLOW}Launching skill improvements analysis agent...${NC}"

    if env -u CLAUDECODE claude -p - \
        --model "$SUMMARIZER_MODEL" \
        --allowedTools "Read,Glob,Grep,Bash,Write" \
        --output-format text \
        < "$IMPROVEMENTS_PROMPT_FILE" > "$IMPROVEMENTS_LOG" 2>&1; then
        IMPROVEMENTS_END=$(date +%s)
        IMPROVEMENTS_DURATION=$((IMPROVEMENTS_END - IMPROVEMENTS_START))
        log "${GREEN}Skill improvements analysis complete (${IMPROVEMENTS_DURATION}s)${NC}"
        log "  Report: $IMPROVEMENTS_FILE"
    else
        IMPROVEMENTS_END=$(date +%s)
        IMPROVEMENTS_DURATION=$((IMPROVEMENTS_END - IMPROVEMENTS_START))
        log "${RED}Skill improvements analysis failed (${IMPROVEMENTS_DURATION}s)${NC}"
        log "  Check log: $IMPROVEMENTS_LOG"
    fi

    rm -f "$IMPROVEMENTS_PROMPT_FILE"
fi

log ""
log "${GREEN}All done! Results in: $OUTPUT_DIR${NC}"
