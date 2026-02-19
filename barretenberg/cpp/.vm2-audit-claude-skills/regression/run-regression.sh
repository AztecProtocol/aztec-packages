#!/bin/bash
#
# run-regression.sh - Test audit skills against known historical bugs
#
# Usage:
#   ./run-regression.sh [OPTIONS]
#
# Options:
#   -s, --skill SKILL   Test only this skill (repeatable for multiple skills)
#   -T, --tier N        Test all skills in tier N (e.g., -T 1)
#   -b, --bug BUG_ID    Test only this bug against its mapped skills
#   -m, --model MODEL   Model to use (default: sonnet)
#   -j, --jobs N        Maximum parallel jobs (default: 5)
#   --report-only       Only regenerate REPORT.md from existing results
#   --list              List all (skill, bug) pairs and exit
#   -h, --help          Show this help message
#
# Examples:
#   ./run-regression.sh                                    # Test all pairs
#   ./run-regression.sh -T 1                               # Test all Tier 1 skills
#   ./run-regression.sh --skill vm2-audit-t1-missing-boolean
#   ./run-regression.sh --bug alu-missing-booleans-shift
#   ./run-regression.sh --skill vm2-audit-t1-missing-boolean --bug alu-missing-booleans-shift
#   ./run-regression.sh --model opus --jobs 8

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Defaults
MAX_JOBS=5
MODEL="sonnet"
FILTER_SKILLS=()
FILTER_TIER=""
FILTER_BUG=""
REPORT_ONLY=false
LIST_ONLY=false

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_BASE="$SCRIPT_DIR/../skills"
SCRIPTS_BASE="$SCRIPT_DIR/../scripts"
RESULTS_DIR="$SCRIPT_DIR/results"
WORKDIR_BASE="$SCRIPT_DIR/.workdir"
BUGS_FILE="$SCRIPT_DIR/bugs.json"
BB_CPP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="$(cd "$BB_CPP_DIR/../.." && pwd)"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--skill) FILTER_SKILLS+=("$2"); shift 2 ;;
        -T|--tier)  FILTER_TIER="$2"; shift 2 ;;
        -b|--bug)   FILTER_BUG="$2"; shift 2 ;;
        -m|--model) MODEL="$2"; shift 2 ;;
        -j|--jobs)  MAX_JOBS="$2"; shift 2 ;;
        --report-only) REPORT_ONLY=true; shift ;;
        --list) LIST_ONLY=true; shift ;;
        -h|--help)
            head -24 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

# Validate bugs.json exists
if [[ ! -f "$BUGS_FILE" ]]; then
    echo -e "${RED}bugs.json not found at: $BUGS_FILE${NC}"
    exit 1
fi

BASELINE_COMMIT=$(jq -r '.baseline_commit' "$BUGS_FILE")
if [[ -z "$BASELINE_COMMIT" || "$BASELINE_COMMIT" == "null" ]]; then
    echo -e "${RED}baseline_commit is empty in bugs.json${NC}"
    exit 1
fi

log() { echo -e "$1"; }

# ─── Build the list of (skill, bug_id, commit) triples ───────────────────────

declare -a PAIRS_SKILL=()
declare -a PAIRS_BUG=()
declare -a PAIRS_COMMIT=()

while IFS=$'\t' read -r bug_id commit skills_csv; do
    IFS=',' read -ra skill_list <<< "$skills_csv"
    for skill in "${skill_list[@]}"; do
        skill=$(echo "$skill" | xargs)  # trim whitespace
        # Apply filters
        if [[ ${#FILTER_SKILLS[@]} -gt 0 ]]; then
            local match=false
            for fs in "${FILTER_SKILLS[@]}"; do
                if [[ "$skill" == "$fs" ]]; then match=true; break; fi
            done
            if [[ "$match" != "true" ]]; then continue; fi
        fi
        if [[ -n "$FILTER_TIER" && ! "$skill" =~ ^vm2-audit-t${FILTER_TIER}- ]]; then continue; fi
        if [[ -n "$FILTER_BUG" && "$bug_id" != "$FILTER_BUG" ]]; then continue; fi
        PAIRS_SKILL+=("$skill")
        PAIRS_BUG+=("$bug_id")
        PAIRS_COMMIT+=("$commit")
    done
done < <(jq -r '
    .baseline_commit as $base |
    .bugs[] |
    .id as $id |
    (if .introduced_after_baseline then .commit_before else $base end) as $commit |
    (.skills | join(",")) as $skills |
    "\($id)\t\($commit)\t\($skills)"
' "$BUGS_FILE")

TOTAL_PAIRS=${#PAIRS_SKILL[@]}

if [[ $TOTAL_PAIRS -eq 0 ]]; then
    echo -e "${YELLOW}No (skill, bug) pairs match the filters.${NC}"
    exit 0
fi

# ─── --list mode ──────────────────────────────────────────────────────────────

if [[ "$LIST_ONLY" == "true" ]]; then
    log "${CYAN}Regression test pairs (${TOTAL_PAIRS} total):${NC}"
    log ""
    printf "%-50s %-40s %s\n" "SKILL" "BUG" "COMMIT"
    printf "%-50s %-40s %s\n" "-----" "---" "------"
    for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
        printf "%-50s %-40s %s\n" "${PAIRS_SKILL[$i]}" "${PAIRS_BUG[$i]}" "${PAIRS_COMMIT[$i]:0:10}"
    done
    exit 0
fi

# ─── --report-only mode ──────────────────────────────────────────────────────

generate_report() {
    local report_file="$RESULTS_DIR/REPORT.md"
    log "${YELLOW}Generating report...${NC}"

    # Collect all unique skills that have results
    declare -A SKILL_BUGS         # skill -> space-separated bug IDs
    declare -A SKILL_DETECTED     # skill -> count of detected bugs
    declare -A SKILL_SEV_MATCH    # skill -> count of severity matches
    declare -A SKILL_FP           # skill -> total false positive count
    declare -A SKILL_TOTAL        # skill -> total bugs expected
    declare -A BUG_DETECTED_BY    # bug_id -> space-separated skills that detected it

    for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
        local skill="${PAIRS_SKILL[$i]}"
        local bug_id="${PAIRS_BUG[$i]}"
        local verdict_file="$RESULTS_DIR/${skill}--${bug_id}/verdict.json"

        # Initialize counters
        SKILL_BUGS[$skill]="${SKILL_BUGS[$skill]:-} $bug_id"
        SKILL_TOTAL[$skill]=$(( ${SKILL_TOTAL[$skill]:-0} + 1 ))

        if [[ ! -f "$verdict_file" ]]; then
            continue
        fi

        local detected=$(jq -r '.detected // false' "$verdict_file")
        local sev_match=$(jq -r '.severity_match // false' "$verdict_file")
        local fp_count=$(jq -r '.false_positive_count // 0' "$verdict_file")

        if [[ "$detected" == "true" ]]; then
            SKILL_DETECTED[$skill]=$(( ${SKILL_DETECTED[$skill]:-0} + 1 ))
            BUG_DETECTED_BY[$bug_id]="${BUG_DETECTED_BY[$bug_id]:-} $skill"
        fi
        if [[ "$sev_match" == "true" ]]; then
            SKILL_SEV_MATCH[$skill]=$(( ${SKILL_SEV_MATCH[$skill]:-0} + 1 ))
        fi
        SKILL_FP[$skill]=$(( ${SKILL_FP[$skill]:-0} + fp_count ))
    done

    # Write report
    cat > "$report_file" <<'HEADER'
# Regression Test Report

Generated by `run-regression.sh`. Tests each audit skill against known historical bugs.

HEADER

    echo "## Per-Skill Scorecards" >> "$report_file"
    echo "" >> "$report_file"

    # Get sorted unique skills
    local sorted_skills=($(printf '%s\n' "${!SKILL_TOTAL[@]}" | sort))

    for skill in "${sorted_skills[@]}"; do
        local total=${SKILL_TOTAL[$skill]:-0}
        local detected=${SKILL_DETECTED[$skill]:-0}
        local sev_match=${SKILL_SEV_MATCH[$skill]:-0}
        local fp=${SKILL_FP[$skill]:-0}

        echo "### $skill" >> "$report_file"
        echo "" >> "$report_file"
        echo "| Bug ID | Detected? | Severity Match? | False Positives |" >> "$report_file"
        echo "|--------|-----------|-----------------|-----------------|" >> "$report_file"

        for bug_id in ${SKILL_BUGS[$skill]}; do
            [[ -z "$bug_id" ]] && continue
            local verdict_file="$RESULTS_DIR/${skill}--${bug_id}/verdict.json"
            if [[ -f "$verdict_file" ]]; then
                local d=$(jq -r 'if .detected then "YES" else "NO" end' "$verdict_file")
                local s=$(jq -r 'if .severity_match then "YES" elif .detected then "NO" else "—" end' "$verdict_file")
                local f=$(jq -r '.false_positive_count // 0' "$verdict_file")
                local sev_detail=$(jq -r '.matched_severity // ""' "$verdict_file")
                if [[ -n "$sev_detail" && "$sev_detail" != "null" ]]; then
                    s="$s ($sev_detail)"
                fi
            else
                d="NOT RUN"
                s="—"
                f="—"
            fi
            echo "| $bug_id | $d | $s | $f |" >> "$report_file"
        done

        local det_pct=0
        if [[ $total -gt 0 ]]; then
            det_pct=$(( detected * 100 / total ))
        fi
        echo "| **Total** | **${detected}/${total} (${det_pct}%)** | **${sev_match}** | **${fp}** |" >> "$report_file"
        echo "" >> "$report_file"
    done

    # Coverage summary
    echo "## Coverage Summary" >> "$report_file"
    echo "" >> "$report_file"

    # Skills below 80%
    echo "### Skills below 80% detection" >> "$report_file"
    echo "" >> "$report_file"
    local any_below=false
    for skill in "${sorted_skills[@]}"; do
        local total=${SKILL_TOTAL[$skill]:-0}
        local detected=${SKILL_DETECTED[$skill]:-0}
        if [[ $total -gt 0 ]]; then
            local pct=$(( detected * 100 / total ))
            if [[ $pct -lt 80 ]]; then
                echo "- **$skill**: ${detected}/${total} (${pct}%)" >> "$report_file"
                any_below=true
            fi
        fi
    done
    if [[ "$any_below" != "true" ]]; then
        echo "- None — all skills at 80%+ detection" >> "$report_file"
    fi
    echo "" >> "$report_file"

    # Bugs with 0 detecting skills
    echo "### Bugs not detected by any skill" >> "$report_file"
    echo "" >> "$report_file"
    # Collect all unique bug IDs
    declare -A ALL_BUGS_SEEN
    for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
        ALL_BUGS_SEEN[${PAIRS_BUG[$i]}]=1
    done
    local any_undetected=false
    for bug_id in $(printf '%s\n' "${!ALL_BUGS_SEEN[@]}" | sort); do
        if [[ -z "${BUG_DETECTED_BY[$bug_id]:-}" ]]; then
            echo "- **$bug_id**" >> "$report_file"
            any_undetected=true
        fi
    done
    if [[ "$any_undetected" != "true" ]]; then
        echo "- None — all bugs detected by at least one skill" >> "$report_file"
    fi
    echo "" >> "$report_file"

    # False positive analysis
    echo "## False Positive Analysis" >> "$report_file"
    echo "" >> "$report_file"
    echo "| Skill | FP Count |" >> "$report_file"
    echo "|-------|----------|" >> "$report_file"
    for skill in "${sorted_skills[@]}"; do
        local fp=${SKILL_FP[$skill]:-0}
        if [[ $fp -gt 0 ]]; then
            echo "| $skill | $fp |" >> "$report_file"
        fi
    done
    echo "" >> "$report_file"

    log "${GREEN}Report written to: $report_file${NC}"
}

if [[ "$REPORT_ONLY" == "true" ]]; then
    generate_report
    exit 0
fi

# ─── Prepare worktrees ───────────────────────────────────────────────────────

# Collect unique commits needed
declare -A NEEDED_COMMITS
for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
    NEEDED_COMMITS[${PAIRS_COMMIT[$i]}]=1
done

prepare_worktree() {
    local commit="$1"
    local short="${commit:0:10}"
    local wt_dir="$WORKDIR_BASE/$short"

    if [[ -d "$wt_dir/barretenberg/cpp/pil" ]]; then
        # Already prepared — just make sure correct commit is checked out
        log "  ${CYAN}Worktree for $short already exists${NC}"
        return
    fi

    log "  ${BLUE}Creating worktree for $short ...${NC}"
    mkdir -p "$WORKDIR_BASE"

    # Use git worktree from the repo root
    if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "$wt_dir"; then
        # Worktree exists but incomplete — remove and recreate
        git -C "$REPO_ROOT" worktree remove --force "$wt_dir" 2>/dev/null || true
    fi

    git -C "$REPO_ROOT" worktree add --detach "$wt_dir" "$commit" 2>/dev/null

    # Copy current skills into the worktree (they don't exist in old commits)
    # Exclude regression workdir/results to avoid copying into ourselves
    local wt_bb_cpp="$wt_dir/barretenberg/cpp"
    rm -rf "$wt_bb_cpp/.vm2-audit-claude-skills"
    rsync -a --exclude='regression/.workdir' --exclude='regression/results' \
        "$SCRIPT_DIR/../" "$wt_bb_cpp/.vm2-audit-claude-skills/"

    log "  ${GREEN}Worktree ready: $short${NC}"
}

log ""
log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║           VM2 Audit Skills - Regression Testing             ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Configuration:"
log "  Model: $MODEL"
log "  Max parallel jobs: $MAX_JOBS"
log "  Baseline commit: $BASELINE_COMMIT"
log "  Total (skill, bug) pairs: $TOTAL_PAIRS"
log "  Unique commits needed: ${#NEEDED_COMMITS[@]}"
if [[ ${#FILTER_SKILLS[@]} -gt 0 ]]; then log "  Skill filter: ${FILTER_SKILLS[*]}"; fi
if [[ -n "$FILTER_TIER" ]]; then log "  Tier filter: T$FILTER_TIER"; fi
if [[ -n "$FILTER_BUG" ]]; then log "  Bug filter: $FILTER_BUG"; fi
log ""

# Prepare all worktrees (sequential — fast since it's just git operations)
log "${YELLOW}Preparing worktrees...${NC}"
for commit in "${!NEEDED_COMMITS[@]}"; do
    prepare_worktree "$commit"
done
log ""

# ─── Run (skill, bug) pairs ──────────────────────────────────────────────────

mkdir -p "$RESULTS_DIR"

# Write pairs to a manifest file so subshells can read it
MANIFEST_FILE="$RESULTS_DIR/.manifest.tsv"
: > "$MANIFEST_FILE"
for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
    printf '%s\t%s\t%s\n' "${PAIRS_SKILL[$i]}" "${PAIRS_BUG[$i]}" "${PAIRS_COMMIT[$i]}" >> "$MANIFEST_FILE"
done

run_pair() {
    local skill="$1"
    local bug_id="$2"
    local commit="$3"
    local short="${commit:0:10}"

    local pair_dir="$RESULTS_DIR/${skill}--${bug_id}"

    # Skip if verdict already exists (use --force or delete results to rerun)
    if [[ -f "$pair_dir/verdict.json" ]]; then
        return 0
    fi

    mkdir -p "$pair_dir"

    local wt_dir="$WORKDIR_BASE/$short"
    local wt_bb_cpp="$wt_dir/barretenberg/cpp"

    # Read skill instructions
    local skill_file="$SKILLS_BASE/${skill}/SKILL.md"
    if [[ ! -f "$skill_file" ]]; then
        echo '{"error": "skill not found"}' > "$pair_dir/verdict.json"
        return 1
    fi

    local skill_instructions
    skill_instructions="$(cat "$skill_file")"

    local target_path="pil/vm2"
    local abs_pair_dir="$(cd "$pair_dir" && pwd)"

    # Build prompt — skill instructions + JSON output requirement
    # The skill doesn't know about the specific bug — it should find it organically.
    local task_prompt="COVERAGE RULE: First run \`find ${target_path} -name '*.pil' | sort\` to get ALL files. Grep patterns in the instructions below are starting points, not exhaustive scope. Sweep ALL files.

${skill_instructions}

---

TASK: Run the ${skill} audit on ${target_path}. Provide a thorough audit report with findings categorized by severity (Critical, High, Medium, Low). Include file locations and line numbers for each finding.

OUTPUT REQUIREMENTS:
1. Write a markdown audit report.
2. Write a JSON findings file to: ${abs_pair_dir}/audit.json

The JSON file MUST have this structure:
\`\`\`json
{
  \"skill\": \"${skill}\",
  \"findings\": [
    {
      \"id\": \"finding-1\",
      \"title\": \"Short title\",
      \"severity\": \"Critical|High|Medium|Low\",
      \"files\": [\"pil/vm2/file.pil\"],
      \"description\": \"What the issue is and why it matters\",
      \"lines\": [123, 456]
    }
  ]
}
\`\`\`"

    local claude_args=(-p --model "$MODEL" --allowedTools "Read,Glob,Grep,Bash,Write,Edit" --output-format text --disable-slash-commands)

    # Run from the worktree's barretenberg/cpp directory
    # Unset CLAUDECODE to allow nested claude invocations
    local start_time=$(date +%s)
    if (cd "$wt_bb_cpp" && unset CLAUDECODE && echo "$task_prompt" | claude "${claude_args[@]}" > "$pair_dir/audit.md" 2>&1); then
        local exit_status="success"
    else
        local exit_status="failed"
    fi
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # ── Evaluate the output ──────────────────────────────────────────────
    evaluate_pair "$skill" "$bug_id" "$pair_dir" "$exit_status" "$duration"
}

evaluate_pair() {
    local skill="$1"
    local bug_id="$2"
    local pair_dir="$3"
    local exit_status="$4"
    local duration="$5"

    local audit_json="$pair_dir/audit.json"
    local verdict_file="$pair_dir/verdict.json"

    # If claude failed or no JSON output, write a failure verdict
    if [[ "$exit_status" != "success" || ! -f "$audit_json" ]]; then
        cat > "$verdict_file" <<EOF
{
  "skill": "$skill",
  "bug_id": "$bug_id",
  "detected": false,
  "severity_match": false,
  "false_positive_count": 0,
  "matched_findings": [],
  "unmatched_findings": [],
  "status": "$exit_status",
  "duration_seconds": $duration,
  "error": "no audit.json produced"
}
EOF
        return
    fi

    # Parse expected findings for this (skill, bug) pair
    local expected_keywords
    expected_keywords=$(jq -r --arg id "$bug_id" --arg sk "$skill" '
        .bugs[] | select(.id == $id) |
        .expected_findings[$sk].keywords // [] | .[]
    ' "$BUGS_FILE" 2>/dev/null)

    local expected_min_severity
    expected_min_severity=$(jq -r --arg id "$bug_id" --arg sk "$skill" '
        .bugs[] | select(.id == $id) |
        .expected_findings[$sk].min_severity // "low"
    ' "$BUGS_FILE" 2>/dev/null)

    local bug_files_json
    bug_files_json=$(jq -c --arg id "$bug_id" '.bugs[] | select(.id == $id) | .files' "$BUGS_FILE" 2>/dev/null)

    # Check each finding for keyword + file matches
    # A finding "matches" if:
    #   - It references at least one of the bug's files (substring match), AND
    #   - Its description or title contains at least one expected keyword (case-insensitive)
    local detected=false
    local severity_match=false
    local matched_severity=""
    local matched_findings="[]"
    local unmatched_findings="[]"

    if jq -e '.findings' "$audit_json" > /dev/null 2>&1; then
        local num_findings
        num_findings=$(jq '.findings | length' "$audit_json")

        local match_indices=()
        for f_idx in $(seq 0 $((num_findings - 1))); do
            local finding_files
            finding_files=$(jq -r ".findings[$f_idx].files[]?" "$audit_json" 2>/dev/null || true)
            local finding_title
            finding_title=$(jq -r ".findings[$f_idx].title // \"\"" "$audit_json" 2>/dev/null)
            local finding_desc
            finding_desc=$(jq -r ".findings[$f_idx].description // \"\"" "$audit_json" 2>/dev/null)
            local finding_severity
            finding_severity=$(jq -r ".findings[$f_idx].severity // \"\"" "$audit_json" 2>/dev/null)
            local combined_text
            combined_text=$(echo "$finding_title $finding_desc" | tr '[:upper:]' '[:lower:]')

            # Check file match (any bug file appears as substring in any finding file)
            local file_match=false
            for bug_file in $(jq -r '.[]' <<< "$bug_files_json" 2>/dev/null); do
                # Match if the bug file basename appears in the finding files
                local bug_basename
                bug_basename=$(basename "$bug_file")
                if echo "$finding_files" | grep -qi "$bug_basename" 2>/dev/null; then
                    file_match=true
                    break
                fi
            done

            if [[ "$file_match" != "true" ]]; then
                continue
            fi

            # Check keyword match (any keyword appears in title+description)
            local keyword_match=false
            while IFS= read -r kw; do
                [[ -z "$kw" ]] && continue
                local kw_lower
                kw_lower=$(echo "$kw" | tr '[:upper:]' '[:lower:]')
                if echo "$combined_text" | grep -q "$kw_lower" 2>/dev/null; then
                    keyword_match=true
                    break
                fi
            done <<< "$expected_keywords"

            if [[ "$keyword_match" == "true" ]]; then
                detected=true
                match_indices+=("$f_idx")

                # Check severity
                local sev_ok
                sev_ok=$(check_severity "$finding_severity" "$expected_min_severity")
                if [[ "$sev_ok" == "true" ]]; then
                    severity_match=true
                    matched_severity="$finding_severity"
                fi
            fi
        done

        # Build matched/unmatched findings arrays
        matched_findings="["
        local first=true
        for idx in "${match_indices[@]}"; do
            if [[ "$first" != "true" ]]; then matched_findings+=","; fi
            matched_findings+=$(jq -c ".findings[$idx]" "$audit_json")
            first=false
        done
        matched_findings+="]"

        # Unmatched = total findings minus matched
        local total_findings=$num_findings
        local matched_count=${#match_indices[@]}
        local fp_count=$((total_findings - matched_count))
    else
        local fp_count=0
    fi

    cat > "$verdict_file" <<EOF
{
  "skill": "$skill",
  "bug_id": "$bug_id",
  "detected": $detected,
  "severity_match": $severity_match,
  "matched_severity": $(if [[ -n "$matched_severity" ]]; then echo "\"$matched_severity\""; else echo "null"; fi),
  "false_positive_count": ${fp_count:-0},
  "matched_findings": $matched_findings,
  "status": "$exit_status",
  "duration_seconds": $duration
}
EOF
}

# Severity ordering: critical > high > medium > low
# Returns "true" if actual >= expected
check_severity() {
    local actual="$1"
    local expected="$2"

    declare -A SEV_RANK
    SEV_RANK[critical]=4
    SEV_RANK[high]=3
    SEV_RANK[medium]=2
    SEV_RANK[low]=1

    local actual_lower
    actual_lower=$(echo "$actual" | tr '[:upper:]' '[:lower:]')
    local actual_rank=${SEV_RANK[$actual_lower]:-0}
    local expected_rank=${SEV_RANK[$expected]:-0}

    if [[ $actual_rank -ge $expected_rank ]]; then
        echo "true"
    else
        echo "false"
    fi
}

# Export everything needed for background jobs
export -f run_pair evaluate_pair check_severity
export RESULTS_DIR WORKDIR_BASE BUGS_FILE SKILLS_BASE MODEL

# Run pairs with parallelism
OVERALL_START=$(date +%s)
log "${YELLOW}Running $TOTAL_PAIRS (skill, bug) pairs with $MAX_JOBS parallel jobs...${NC}"
log ""

job_count=0
pids=()
declare -A PID_TO_PAIR  # pid -> "skill\tbug_id"

announce_finished() {
    local p="$1"
    local pair_info="${PID_TO_PAIR[$p]}"
    local s="${pair_info%%	*}"
    local b="${pair_info#*	}"
    local vf="$RESULTS_DIR/${s}--${b}/verdict.json"
    if [[ -f "$vf" ]]; then
        local det
        det=$(jq -r 'if .detected then "DETECTED" else "MISSED" end' "$vf" 2>/dev/null || echo "???")
        if [[ "$det" == "DETECTED" ]]; then
            log "${GREEN}[DONE]${NC} ${s} × ${b} → ${GREEN}${det}${NC}"
        else
            log "${RED}[DONE]${NC} ${s} × ${b} → ${RED}${det}${NC}"
        fi
    else
        log "${RED}[DONE]${NC} ${s} × ${b} → ${RED}ERROR${NC}"
    fi
}

skipped_count=0
for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
    local_skill="${PAIRS_SKILL[$i]}"
    local_bug="${PAIRS_BUG[$i]}"
    local_commit="${PAIRS_COMMIT[$i]}"

    # Skip already-completed pairs
    if [[ -f "$RESULTS_DIR/${local_skill}--${local_bug}/verdict.json" ]]; then
        ((++skipped_count))
        continue
    fi

    log "${BLUE}[START]${NC} ${local_skill} × ${local_bug}"

    run_pair "$local_skill" "$local_bug" "$local_commit" &
    pid=$!
    pids+=($pid)
    PID_TO_PAIR[$pid]="${local_skill}	${local_bug}"
    ((++job_count))

    # Throttle
    if [[ $job_count -ge $MAX_JOBS ]]; then
        wait -n "${pids[@]}" 2>/dev/null || true
        # Find which pid(s) finished
        new_pids=()
        for p in "${pids[@]}"; do
            if kill -0 "$p" 2>/dev/null; then
                new_pids+=("$p")
            else
                announce_finished "$p"
            fi
        done
        pids=("${new_pids[@]}")
        job_count=${#pids[@]}
    fi
done

# Wait for remaining
for p in "${pids[@]}"; do
    wait "$p" 2>/dev/null || true
    announce_finished "$p"
done

OVERALL_END=$(date +%s)
OVERALL_DURATION=$((OVERALL_END - OVERALL_START))

log ""
log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║                 Regression Runs Complete                     ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Total time: ${OVERALL_DURATION}s (${skipped_count} skipped — already had results)"

# Quick summary
detected_count=0
missed_count=0
error_count=0
for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
    vf="$RESULTS_DIR/${PAIRS_SKILL[$i]}--${PAIRS_BUG[$i]}/verdict.json"
    if [[ -f "$vf" ]]; then
        if jq -e '.detected == true' "$vf" > /dev/null 2>&1; then
            ((++detected_count))
        else
            ((++missed_count))
        fi
    else
        ((++error_count))
    fi
done

log ""
log "${GREEN}Detected:${NC} ${detected_count}  ${RED}Missed:${NC} ${missed_count}  ${YELLOW}Errors:${NC} ${error_count}  Total: ${TOTAL_PAIRS}"
log ""

# Generate the report
generate_report

log ""
log "${GREEN}All done! Results in: $RESULTS_DIR${NC}"
