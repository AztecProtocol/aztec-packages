#!/bin/bash
#
# run-regression.sh - Test audit skills against known historical bugs
#
# Each skill runs ONCE PER PIL FILE, targeting a single gadget per session.
# Findings are then evaluated against bugs mapped to that (skill, pil_file).
#
# Usage:
#   ./run-regression.sh [OPTIONS]
#
# Options:
#   -s, --skill SKILL   Test only this skill (repeatable for multiple skills)
#   -T, --tier N        Test all skills in tier N (e.g., -T 1)
#   -b, --bug BUG_ID    Only evaluate this bug (runs only relevant PIL files)
#   -m, --model MODEL   Model to use (default: sonnet)
#   -j, --jobs N        Maximum parallel jobs (default: 5)
#   --report-only       Only regenerate REPORT.md from existing results
#   --list              List all skill runs and their mapped bugs, then exit
#   -h, --help          Show this help message
#
# Examples:
#   ./run-regression.sh                                    # Test all skills
#   ./run-regression.sh -T 1                               # Test all Tier 1 skills
#   ./run-regression.sh --skill vm2-audit-t1-missing-boolean
#   ./run-regression.sh --bug alu-missing-booleans-shift
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
            head -28 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
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

# ─── Utility: convert PIL path to a key for directory naming ──────────────
# pil/vm2/alu.pil → alu
# pil/vm2/bytecode/bc_hashing.pil → bytecode__bc_hashing
# pil/vm2/execution/addressing.pil → execution__addressing
pil_to_key() {
    echo "$1" | sed 's|^pil/vm2/||; s|\.pil$||; s|/|__|g'
}

# ─── Build runs: group by (skill, pil_file, commit) ──────────────────────
#
# Each "run" = one Claude session auditing a specific PIL file with a specific skill.
# A run is identified by "${skill}|||${pil_file}|||${commit}".
# After running, we evaluate its findings against all bugs mapped to that (skill, pil_file).

# Associative arrays keyed by "skill|||pil_file|||commit"
declare -A RUN_BUGS      # run_key -> space-separated bug IDs
declare -A RUN_COMMIT    # run_key -> full commit hash

# Flat arrays for report generation
declare -a PAIRS_SKILL=()
declare -a PAIRS_BUG=()
declare -a PAIRS_COMMIT=()
declare -a PAIRS_PIL=()   # which PIL file this pair targets

while IFS=$'\t' read -r bug_id commit skills_csv pil_files_csv; do
    IFS=',' read -ra skill_list <<< "$skills_csv"
    IFS=',' read -ra pil_list <<< "$pil_files_csv"

    for skill in "${skill_list[@]}"; do
        skill=$(echo "$skill" | xargs)  # trim whitespace
        # Apply skill filters
        if [[ ${#FILTER_SKILLS[@]} -gt 0 ]]; then
            match=false
            for fs in "${FILTER_SKILLS[@]}"; do
                if [[ "$skill" == "$fs" ]]; then match=true; break; fi
            done
            if [[ "$match" != "true" ]]; then continue; fi
        fi
        if [[ -n "$FILTER_TIER" && ! "$skill" =~ ^vm2-audit-t${FILTER_TIER}- ]]; then continue; fi
        if [[ -n "$FILTER_BUG" && "$bug_id" != "$FILTER_BUG" ]]; then continue; fi

        for pil_file in "${pil_list[@]}"; do
            pil_file=$(echo "$pil_file" | xargs)  # trim whitespace
            [[ -z "$pil_file" ]] && continue

            PAIRS_SKILL+=("$skill")
            PAIRS_BUG+=("$bug_id")
            PAIRS_COMMIT+=("$commit")
            PAIRS_PIL+=("$pil_file")

            run_key="${skill}|||${pil_file}|||${commit}"
            RUN_BUGS[$run_key]="${RUN_BUGS[$run_key]:-} $bug_id"
            RUN_COMMIT[$run_key]="$commit"
        done
    done
done < <(jq -r '
    .baseline_commit as $base |
    .bugs[] |
    .id as $id |
    (if .introduced_after_baseline then .commit_before else $base end) as $commit |
    (.skills | join(",")) as $skills |
    ((.pil_targets // [.files[] | select(endswith(".pil"))]) | join(",")) as $pils |
    "\($id)\t\($commit)\t\($skills)\t\($pils)"
' "$BUGS_FILE")

TOTAL_PAIRS=${#PAIRS_SKILL[@]}
TOTAL_RUNS=${#RUN_BUGS[@]}

if [[ $TOTAL_RUNS -eq 0 ]]; then
    echo -e "${YELLOW}No skill runs match the filters.${NC}"
    exit 0
fi

# ─── --list mode ──────────────────────────────────────────────────────────

# Helper to parse run_key "skill|||pil_file|||commit" into variables
# Usage: parse_run_key "$run_key" → sets RK_SKILL, RK_PIL, RK_COMMIT
parse_run_key() {
    local key="$1"
    RK_SKILL="${key%%|||*}"
    local rest="${key#*|||}"
    RK_PIL="${rest%%|||*}"
    RK_COMMIT="${rest#*|||}"
}

if [[ "$LIST_ONLY" == "true" ]]; then
    log "${CYAN}Skill runs (${TOTAL_RUNS} per-file sessions covering ${TOTAL_PAIRS} bug evaluations):${NC}"
    log ""
    for run_key in $(printf '%s\n' "${!RUN_BUGS[@]}" | sort); do
        parse_run_key "$run_key"
        bugs="${RUN_BUGS[$run_key]}"
        bug_count=$(echo $bugs | wc -w)
        pil_key=$(pil_to_key "$RK_PIL")
        printf "%-50s %-25s %s (%d bugs)\n" "$RK_SKILL" "$pil_key" "${RK_COMMIT:0:10}" "$bug_count"
        for b in $bugs; do
            printf "  - %s\n" "$b"
        done
    done
    exit 0
fi

# ─── Result directory naming ────────────────────────────────────────────────
# results/{skill}--{pil_key}--{commit_short}/
#   audit.json        — the single audit output
#   audit.md          — the markdown report
#   verdict-{bug}.json — per-bug evaluation verdict

run_dir_name() {
    local skill="$1"
    local pil_file="$2"
    local commit="$3"
    local pil_key
    pil_key=$(pil_to_key "$pil_file")
    echo "${skill}--${pil_key}--${commit:0:10}"
}

# ─── --report-only mode ──────────────────────────────────────────────────────

generate_report() {
    local report_file="$RESULTS_DIR/REPORT.md"
    log "${YELLOW}Generating report...${NC}"

    # Collect all unique skills that have results
    declare -A SKILL_BUGS         # skill -> space-separated bug IDs (unique)
    declare -A SKILL_DETECTED     # skill -> count of detected bugs
    declare -A SKILL_SEV_MATCH    # skill -> count of severity matches
    declare -A SKILL_TOTAL        # skill -> total bugs expected
    declare -A BUG_DETECTED_BY    # bug_id -> space-separated skills that detected it
    # Track per (skill, bug) detection: a bug is detected if ANY per-file run finds it
    declare -A SKILL_BUG_DETECTED   # "skill|||bug" -> true
    declare -A SKILL_BUG_SEV_MATCH  # "skill|||bug" -> true
    declare -A SKILL_BUG_SEV_DETAIL # "skill|||bug" -> severity string

    # First pass: collect best verdict per (skill, bug) across all PIL files
    for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
        local skill="${PAIRS_SKILL[$i]}"
        local bug_id="${PAIRS_BUG[$i]}"
        local commit="${PAIRS_COMMIT[$i]}"
        local pil_file="${PAIRS_PIL[$i]}"
        local rdir="$RESULTS_DIR/$(run_dir_name "$skill" "$pil_file" "$commit")"
        local verdict_file="$rdir/verdict-${bug_id}.json"

        local sb_key="${skill}|||${bug_id}"

        # Track unique bugs per skill (only add once)
        if [[ ! "${SKILL_BUGS[$skill]:-}" == *"$bug_id"* ]]; then
            SKILL_BUGS[$skill]="${SKILL_BUGS[$skill]:-} $bug_id"
            SKILL_TOTAL[$skill]=$(( ${SKILL_TOTAL[$skill]:-0} + 1 ))
        fi

        if [[ ! -f "$verdict_file" ]]; then
            continue
        fi

        local detected=$(jq -r '.detected // false' "$verdict_file")
        local sev_match=$(jq -r '.severity_match // false' "$verdict_file")

        # A bug is detected if ANY per-file run detects it
        if [[ "$detected" == "true" ]]; then
            SKILL_BUG_DETECTED[$sb_key]="true"
            if [[ "$sev_match" == "true" ]]; then
                SKILL_BUG_SEV_MATCH[$sb_key]="true"
                local sev_detail=$(jq -r '.matched_severity // ""' "$verdict_file")
                if [[ -n "$sev_detail" && "$sev_detail" != "null" ]]; then
                    SKILL_BUG_SEV_DETAIL[$sb_key]="$sev_detail"
                fi
            fi
        fi
    done

    # Second pass: aggregate per-skill stats
    for skill in $(printf '%s\n' "${!SKILL_TOTAL[@]}" | sort); do
        SKILL_DETECTED[$skill]=0
        SKILL_SEV_MATCH[$skill]=0
        for bug_id in ${SKILL_BUGS[$skill]}; do
            [[ -z "$bug_id" ]] && continue
            local sb_key="${skill}|||${bug_id}"
            if [[ "${SKILL_BUG_DETECTED[$sb_key]:-}" == "true" ]]; then
                SKILL_DETECTED[$skill]=$(( ${SKILL_DETECTED[$skill]} + 1 ))
                BUG_DETECTED_BY[$bug_id]="${BUG_DETECTED_BY[$bug_id]:-} $skill"
            fi
            if [[ "${SKILL_BUG_SEV_MATCH[$sb_key]:-}" == "true" ]]; then
                SKILL_SEV_MATCH[$skill]=$(( ${SKILL_SEV_MATCH[$skill]} + 1 ))
            fi
        done
    done

    # Write report
    cat > "$report_file" <<'HEADER'
# Regression Test Report

Generated by `run-regression.sh` (per-file mode). Each skill runs once per
relevant PIL file, then findings are evaluated against mapped bugs.
A bug is "detected" if ANY per-file run for that skill finds it.

HEADER

    echo "## Per-Skill Scorecards" >> "$report_file"
    echo "" >> "$report_file"

    # Get sorted unique skills
    local sorted_skills=($(printf '%s\n' "${!SKILL_TOTAL[@]}" | sort))

    for skill in "${sorted_skills[@]}"; do
        local total=${SKILL_TOTAL[$skill]:-0}
        local detected=${SKILL_DETECTED[$skill]:-0}
        local sev_match=${SKILL_SEV_MATCH[$skill]:-0}

        echo "### $skill" >> "$report_file"
        echo "" >> "$report_file"
        echo "| Bug ID | Detected? | Severity Match? | Detecting File |" >> "$report_file"
        echo "|--------|-----------|-----------------|----------------|" >> "$report_file"

        for bug_id in ${SKILL_BUGS[$skill]}; do
            [[ -z "$bug_id" ]] && continue
            local sb_key="${skill}|||${bug_id}"
            local d="NO"
            local s="—"
            local detecting_file="—"

            if [[ "${SKILL_BUG_DETECTED[$sb_key]:-}" == "true" ]]; then
                d="YES"
                s="NO"
                if [[ "${SKILL_BUG_SEV_MATCH[$sb_key]:-}" == "true" ]]; then
                    local sev_detail="${SKILL_BUG_SEV_DETAIL[$sb_key]:-}"
                    s="YES"
                    if [[ -n "$sev_detail" ]]; then
                        s="YES ($sev_detail)"
                    fi
                fi
                # Find which PIL file detected it
                for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
                    if [[ "${PAIRS_SKILL[$i]}" == "$skill" && "${PAIRS_BUG[$i]}" == "$bug_id" ]]; then
                        local rdir="$RESULTS_DIR/$(run_dir_name "$skill" "${PAIRS_PIL[$i]}" "${PAIRS_COMMIT[$i]}")"
                        if [[ -f "$rdir/verdict-${bug_id}.json" ]]; then
                            local vdet=$(jq -r '.detected // false' "$rdir/verdict-${bug_id}.json" 2>/dev/null)
                            if [[ "$vdet" == "true" ]]; then
                                detecting_file=$(pil_to_key "${PAIRS_PIL[$i]}")
                                break
                            fi
                        fi
                    fi
                done
            else
                # Check if any results exist at all
                local has_results=false
                for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
                    if [[ "${PAIRS_SKILL[$i]}" == "$skill" && "${PAIRS_BUG[$i]}" == "$bug_id" ]]; then
                        local rdir="$RESULTS_DIR/$(run_dir_name "$skill" "${PAIRS_PIL[$i]}" "${PAIRS_COMMIT[$i]}")"
                        if [[ -f "$rdir/verdict-${bug_id}.json" ]]; then
                            has_results=true
                            break
                        fi
                    fi
                done
                if [[ "$has_results" != "true" ]]; then
                    d="NOT RUN"
                fi
            fi
            echo "| $bug_id | $d | $s | $detecting_file |" >> "$report_file"
        done

        local det_pct=0
        if [[ $total -gt 0 ]]; then
            det_pct=$(( detected * 100 / total ))
        fi
        echo "| **Total** | **${detected}/${total} (${det_pct}%)** | **${sev_match}** | |" >> "$report_file"
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

    log "${GREEN}Report written to: $report_file${NC}"
}

if [[ "$REPORT_ONLY" == "true" ]]; then
    generate_report
    exit 0
fi

# ─── Prepare worktrees ───────────────────────────────────────────────────────

# Collect unique commits needed
declare -A NEEDED_COMMITS
for run_key in "${!RUN_COMMIT[@]}"; do
    NEEDED_COMMITS[${RUN_COMMIT[$run_key]}]=1
done

prepare_worktree() {
    local commit="$1"
    local short="${commit:0:10}"
    local wt_dir="$WORKDIR_BASE/$short"

    if [[ -d "$wt_dir/barretenberg/cpp/pil" ]]; then
        log "  ${CYAN}Worktree for $short already exists${NC}"
        return
    fi

    log "  ${BLUE}Creating worktree for $short ...${NC}"
    mkdir -p "$WORKDIR_BASE"

    if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "$wt_dir"; then
        git -C "$REPO_ROOT" worktree remove --force "$wt_dir" 2>/dev/null || true
    fi

    git -C "$REPO_ROOT" worktree add --detach "$wt_dir" "$commit" 2>/dev/null

    # Copy current skills into the worktree (they don't exist in old commits)
    local wt_bb_cpp="$wt_dir/barretenberg/cpp"
    rm -rf "$wt_bb_cpp/.vm2-audit-claude-skills"
    rsync -a --exclude='regression/.workdir' --exclude='regression/results' \
        "$SCRIPT_DIR/../" "$wt_bb_cpp/.vm2-audit-claude-skills/"

    log "  ${GREEN}Worktree ready: $short${NC}"
}

log ""
log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║     VM2 Audit Skills - Regression Testing (Per-File)        ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Configuration:"
log "  Model: $MODEL"
log "  Max parallel jobs: $MAX_JOBS"
log "  Baseline commit: $BASELINE_COMMIT"
log "  Per-file sessions: $TOTAL_RUNS (covering $TOTAL_PAIRS bug evaluations)"
log "  Unique commits needed: ${#NEEDED_COMMITS[@]}"
if [[ ${#FILTER_SKILLS[@]} -gt 0 ]]; then log "  Skill filter: ${FILTER_SKILLS[*]}"; fi
if [[ -n "$FILTER_TIER" ]]; then log "  Tier filter: T$FILTER_TIER"; fi
if [[ -n "$FILTER_BUG" ]]; then log "  Bug filter: $FILTER_BUG"; fi
log ""

# Prepare all worktrees
log "${YELLOW}Preparing worktrees...${NC}"
for commit in "${!NEEDED_COMMITS[@]}"; do
    prepare_worktree "$commit"
done
log ""

# ─── Run skills (one run per skill + pil_file + commit) ──────────────────

mkdir -p "$RESULTS_DIR"

run_skill() {
    local skill="$1"
    local pil_file="$2"
    local commit="$3"
    local short="${commit:0:10}"
    local rdir="$RESULTS_DIR/$(run_dir_name "$skill" "$pil_file" "$commit")"

    # Skip if audit already exists (delete results dir to rerun)
    if [[ -f "$rdir/audit.json" ]]; then
        return 0
    fi

    mkdir -p "$rdir"

    local wt_dir="$WORKDIR_BASE/$short"
    local wt_bb_cpp="$wt_dir/barretenberg/cpp"

    # Read skill instructions
    local skill_file="$SKILLS_BASE/${skill}/SKILL.md"
    if [[ ! -f "$skill_file" ]]; then
        echo '{"error": "skill not found", "findings": []}' > "$rdir/audit.json"
        return 1
    fi

    local skill_instructions
    skill_instructions="$(cat "$skill_file")"

    local abs_rdir="$(cd "$rdir" && pwd)"

    # Derive the gadget name and C++ sibling paths from the PIL file
    local gadget_name
    gadget_name=$(basename "$pil_file" .pil)
    local pil_dir
    pil_dir=$(dirname "$pil_file")

    # Build prompt — focused on a SINGLE PIL file
    local task_prompt="FOCUS: You are auditing a SINGLE PIL file: **${pil_file}**

Your primary target is ${pil_file} and its C++ siblings (simulation, tracegen, events).
You MAY read other PIL files for context about interactions (lookups/permutations that
reference columns from ${pil_file}), but your goal is to find bugs IN ${pil_file} or in
other gadgets' interactions WITH it.

C++ siblings to check (if they exist):
- src/barretenberg/vm2/simulation/gadgets/${gadget_name}.cpp
- src/barretenberg/vm2/tracegen/${gadget_name}.cpp
- src/barretenberg/vm2/simulation/events/${gadget_name}_event.hpp

Start by reading ${pil_file}, then check its C++ siblings, then look at interactions.

${skill_instructions}

---

TASK: Run the ${skill} audit focused on ${pil_file}. Provide a thorough audit report with findings categorized by severity (Critical, High, Medium, Low). Include file locations and line numbers for each finding.

OUTPUT REQUIREMENTS:
1. Write a markdown audit report.
2. Write a JSON findings file to: ${abs_rdir}/audit.json

The JSON file MUST have this structure:
\`\`\`json
{
  \"skill\": \"${skill}\",
  \"target_file\": \"${pil_file}\",
  \"findings\": [
    {
      \"id\": \"finding-1\",
      \"title\": \"Short title\",
      \"severity\": \"Critical|High|Medium|Low\",
      \"files\": [\"${pil_file}\"],
      \"description\": \"What the issue is and why it matters\",
      \"lines\": [123, 456]
    }
  ]
}
\`\`\`"

    local claude_args=(-p --model "$MODEL" --allowedTools "Read,Glob,Grep,Bash,Write,Edit" --output-format text --disable-slash-commands)

    # Write prompt to a temp file to avoid pipe fd inheritance issues
    local prompt_file="$rdir/.prompt.txt"
    echo "$task_prompt" > "$prompt_file"

    local start_time=$(date +%s)
    local exit_status="failed"
    # Timeout 6 min per file (much less work than full sweep)
    if (cd "$wt_bb_cpp" && unset CLAUDECODE && timeout 360 claude "${claude_args[@]}" < "$prompt_file" > "$rdir/audit.md" 2>&1); then
        exit_status="success"
    fi
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    rm -f "$prompt_file"

    # Store run metadata
    echo "{\"status\": \"$exit_status\", \"duration_seconds\": $duration, \"target_file\": \"$pil_file\"}" > "$rdir/run-meta.json"
}

# Evaluate findings from a single per-file run against ALL its mapped bugs.
evaluate_run() {
    local skill="$1"
    local pil_file="$2"
    local commit="$3"
    local run_key="${skill}|||${pil_file}|||${commit}"
    local rdir="$RESULTS_DIR/$(run_dir_name "$skill" "$pil_file" "$commit")"
    local audit_json="$rdir/audit.json"

    local run_meta="$rdir/run-meta.json"
    local exit_status="unknown"
    local duration=0
    if [[ -f "$run_meta" ]]; then
        exit_status=$(jq -r '.status // "unknown"' "$run_meta")
        duration=$(jq -r '.duration_seconds // 0' "$run_meta")
    fi

    local bugs="${RUN_BUGS[$run_key]}"

    # If no audit output, write failure verdicts for all bugs
    if [[ "$exit_status" != "success" || ! -f "$audit_json" ]]; then
        for bug_id in $bugs; do
            cat > "$rdir/verdict-${bug_id}.json" <<EOF
{
  "skill": "$skill",
  "target_file": "$pil_file",
  "bug_id": "$bug_id",
  "detected": false,
  "severity_match": false,
  "matched_severity": null,
  "matched_findings": [],
  "status": "$exit_status",
  "duration_seconds": $duration,
  "error": "no audit.json produced"
}
EOF
        done
        echo '{"unmatched_finding_count": 0}' > "$rdir/run-verdict.json"
        return
    fi

    # Parse all findings once
    local num_findings=0
    if jq -e '.findings' "$audit_json" > /dev/null 2>&1; then
        num_findings=$(jq '.findings | length' "$audit_json")
    fi

    # Track which findings matched ANY bug (for FP counting)
    local -A matched_any_bug=()

    # Evaluate each bug
    for bug_id in $bugs; do
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

        local detected=false
        local severity_match=false
        local matched_severity=""
        local match_indices=()

        if [[ $num_findings -gt 0 ]]; then
            for f_idx in $(seq 0 $((num_findings - 1))); do
                local finding_files
                finding_files=$(jq -r "(.findings[$f_idx].files[]? // empty), (.findings[$f_idx].file // empty)" "$audit_json" 2>/dev/null || true)
                local finding_title
                finding_title=$(jq -r ".findings[$f_idx].title // \"\"" "$audit_json" 2>/dev/null)
                local finding_desc
                finding_desc=$(jq -r ".findings[$f_idx].description // \"\"" "$audit_json" 2>/dev/null)
                local finding_id
                finding_id=$(jq -r ".findings[$f_idx].id // \"\"" "$audit_json" 2>/dev/null)
                local finding_severity
                finding_severity=$(jq -r ".findings[$f_idx].severity // \"\"" "$audit_json" 2>/dev/null)
                local finding_extra
                finding_extra=$(jq -r "(.findings[$f_idx].impact // \"\"), (.findings[$f_idx].destination_selector // \"\")" "$audit_json" 2>/dev/null || true)
                local combined_text
                combined_text=$(echo "$finding_id $finding_title $finding_desc $finding_extra" | tr '[:upper:]' '[:lower:]')

                # Check file match (any bug file basename appears in any finding file)
                local file_match=false
                for bug_file in $(jq -r '.[]' <<< "$bug_files_json" 2>/dev/null); do
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

                # Check keyword match
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
                    matched_any_bug[$f_idx]=1

                    local sev_ok
                    sev_ok=$(check_severity "$finding_severity" "$expected_min_severity")
                    if [[ "$sev_ok" == "true" ]]; then
                        severity_match=true
                        matched_severity="$finding_severity"
                    fi
                fi
            done
        fi

        # Build matched findings array
        local matched_findings="["
        local first=true
        for idx in "${match_indices[@]+"${match_indices[@]}"}"; do
            if [[ "$first" != "true" ]]; then matched_findings+=","; fi
            matched_findings+=$(jq -c ".findings[$idx]" "$audit_json")
            first=false
        done
        matched_findings+="]"

        cat > "$rdir/verdict-${bug_id}.json" <<EOF
{
  "skill": "$skill",
  "target_file": "$pil_file",
  "bug_id": "$bug_id",
  "detected": $detected,
  "severity_match": $severity_match,
  "matched_severity": $(if [[ -n "$matched_severity" ]]; then echo "\"$matched_severity\""; else echo "null"; fi),
  "matched_findings": $matched_findings,
  "status": "$exit_status",
  "duration_seconds": $duration
}
EOF
    done

    # Count unmatched findings
    local unmatched_count=0
    if [[ $num_findings -gt 0 ]]; then
        for f_idx in $(seq 0 $((num_findings - 1))); do
            if [[ -z "${matched_any_bug[$f_idx]:-}" ]]; then
                ((++unmatched_count))
            fi
        done
    fi

    local matched_count=$((num_findings - unmatched_count))
    echo "{\"unmatched_finding_count\": $unmatched_count, \"total_findings\": $num_findings, \"matched_finding_count\": $matched_count}" > "$rdir/run-verdict.json"
}

# Severity ordering: critical > high > medium > low
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
export -f run_skill run_dir_name pil_to_key check_severity parse_run_key
export RESULTS_DIR WORKDIR_BASE BUGS_FILE SKILLS_BASE MODEL

# ─── Execute skill runs with parallelism ────────────────────────────────────

OVERALL_START=$(date +%s)
log "${YELLOW}Running $TOTAL_RUNS per-file audits with $MAX_JOBS parallel jobs...${NC}"
log ""

job_count=0
pids=()
declare -A PID_TO_RUN  # pid -> "skill|||pil_file|||commit"

announce_finished() {
    local p="$1"
    local run_info="${PID_TO_RUN[$p]}"
    parse_run_key "$run_info"
    local pk
    pk=$(pil_to_key "$RK_PIL")
    local rdir="$RESULTS_DIR/$(run_dir_name "$RK_SKILL" "$RK_PIL" "$RK_COMMIT")"
    if [[ -f "$rdir/audit.json" ]]; then
        local nf
        nf=$(jq '.findings | length' "$rdir/audit.json" 2>/dev/null || echo "?")
        log "${GREEN}[DONE]${NC} ${RK_SKILL} × ${pk} → ${nf} findings"
    else
        log "${RED}[DONE]${NC} ${RK_SKILL} × ${pk} → ${RED}ERROR${NC}"
    fi
}

skipped_count=0
for run_key in $(printf '%s\n' "${!RUN_BUGS[@]}" | sort); do
    parse_run_key "$run_key"
    rdir="$RESULTS_DIR/$(run_dir_name "$RK_SKILL" "$RK_PIL" "$RK_COMMIT")"

    # Skip if audit already exists
    if [[ -f "$rdir/audit.json" ]]; then
        ((++skipped_count))
        continue
    fi

    pil_key=$(pil_to_key "$RK_PIL")
    bug_count=$(echo ${RUN_BUGS[$run_key]} | wc -w)
    log "${BLUE}[START]${NC} ${RK_SKILL} × ${pil_key} @ ${RK_COMMIT:0:10} (${bug_count} bugs)"

    run_skill "$RK_SKILL" "$RK_PIL" "$RK_COMMIT" &
    pid=$!
    pids+=($pid)
    PID_TO_RUN[$pid]="$run_key"
    ((++job_count))

    # Throttle
    if [[ $job_count -ge $MAX_JOBS ]]; then
        wait -n "${pids[@]}" 2>/dev/null || true
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
log "${GREEN}║                    Audit Runs Complete                       ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Total time: ${OVERALL_DURATION}s (${skipped_count} skipped — already had results)"

# ─── Evaluate all runs ──────────────────────────────────────────────────────

log ""
log "${YELLOW}Evaluating findings against known bugs...${NC}"

for run_key in $(printf '%s\n' "${!RUN_BUGS[@]}" | sort); do
    parse_run_key "$run_key"
    eval_skill="$RK_SKILL"
    eval_pil="$RK_PIL"
    eval_commit="$RK_COMMIT"
    evaluate_run "$eval_skill" "$eval_pil" "$eval_commit"

    eval_bugs="${RUN_BUGS[$run_key]}"
    eval_rdir="$RESULTS_DIR/$(run_dir_name "$eval_skill" "$eval_pil" "$eval_commit")"
    eval_pk=$(pil_to_key "$eval_pil")
    for bug_id in $eval_bugs; do
        vf="$eval_rdir/verdict-${bug_id}.json"
        if [[ -f "$vf" ]]; then
            det=$(jq -r 'if .detected then "DETECTED" else "MISSED" end' "$vf" 2>/dev/null || echo "???")
            if [[ "$det" == "DETECTED" ]]; then
                log "  ${GREEN}✓${NC} ${eval_skill} × ${eval_pk} → ${bug_id}"
            else
                log "  ${RED}✗${NC} ${eval_skill} × ${eval_pk} → ${bug_id}"
            fi
        fi
    done
done

# Quick summary — aggregate per (skill, bug) across PIL files
log ""
declare -A SUMMARY_DETECTED  # "skill|||bug" -> detected
for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
    sum_skill="${PAIRS_SKILL[$i]}"
    sum_bug="${PAIRS_BUG[$i]}"
    sum_commit="${PAIRS_COMMIT[$i]}"
    sum_pil="${PAIRS_PIL[$i]}"
    sum_rdir="$RESULTS_DIR/$(run_dir_name "$sum_skill" "$sum_pil" "$sum_commit")"
    vf="$sum_rdir/verdict-${sum_bug}.json"
    sb_key="${sum_skill}|||${sum_bug}"
    if [[ -f "$vf" ]]; then
        if jq -e '.detected == true' "$vf" > /dev/null 2>&1; then
            SUMMARY_DETECTED[$sb_key]="true"
        fi
    fi
done

# Count unique (skill, bug) pairs
declare -A UNIQUE_SB
detected_count=0
missed_count=0
for i in $(seq 0 $((TOTAL_PAIRS - 1))); do
    sb_key="${PAIRS_SKILL[$i]}|||${PAIRS_BUG[$i]}"
    if [[ -n "${UNIQUE_SB[$sb_key]:-}" ]]; then continue; fi
    UNIQUE_SB[$sb_key]=1
    if [[ "${SUMMARY_DETECTED[$sb_key]:-}" == "true" ]]; then
        ((++detected_count))
    else
        ((++missed_count))
    fi
done

total_sb=${#UNIQUE_SB[@]}
log ""
log "${GREEN}Detected:${NC} ${detected_count}  ${RED}Missed:${NC} ${missed_count}  Total: ${total_sb} (skill×bug pairs)"
log ""

# Generate the report
generate_report

log ""
log "${GREEN}All done! Results in: $RESULTS_DIR${NC}"
