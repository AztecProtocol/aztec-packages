#!/bin/bash
#
# summarize-audits.sh - Summarize results from all vm2-audit-* skill runs
#
# Usage:
#   ./summarize-audits.sh [OPTIONS]
#
# Options:
#   -o, --output DIR    Output directory containing audit results (default: ./audit-results)
#   -m, --model MODEL   Model to use for summarization (default: sonnet)
#   --json-only         Only extract JSON findings, skip Claude summarization
#   --multi-model-summary  Run extra multi-model validation (Gemini/GPT via PAL MCP)
#   -h, --help          Show this help message
#
# Environment Variables:
#   EXTRA_MULTI_MODEL_SUMMARY=1  Enable multi-model validation (same as --multi-model-summary)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Defaults
OUTPUT_DIR="./audit-results"
MODEL="sonnet"
JSON_ONLY=false
EXTRA_MULTI_MODEL_SUMMARY="${EXTRA_MULTI_MODEL_SUMMARY:-false}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -m|--model)
            MODEL="$2"
            shift 2
            ;;
        --json-only)
            JSON_ONLY=true
            shift
            ;;
        --multi-model-summary)
            EXTRA_MULTI_MODEL_SUMMARY=true
            shift
            ;;
        -h|--help)
            head -15 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check output directory exists
if [[ ! -d "$OUTPUT_DIR" ]]; then
    echo -e "${RED}Output directory not found: $OUTPUT_DIR${NC}"
    exit 1
fi

SUMMARY_FILE="$OUTPUT_DIR/SUMMARY.md"
COMBINED_FILE="$OUTPUT_DIR/.combined-findings.txt"
JSON_FINDINGS_FILE="$OUTPUT_DIR/findings.json"
STATS_FILE="$OUTPUT_DIR/STATS.txt"

# Temp files for large prompts (avoids "Argument list too long" errors)
PROMPT_FILE=""
CONSENSUS_PROMPT_FILE=""
cleanup_temp_files() {
    [[ -n "$PROMPT_FILE" && -f "$PROMPT_FILE" ]] && rm -f "$PROMPT_FILE"
    [[ -n "$CONSENSUS_PROMPT_FILE" && -f "$CONSENSUS_PROMPT_FILE" ]] && rm -f "$CONSENSUS_PROMPT_FILE"
}
trap cleanup_temp_files EXIT

echo -e "${BLUE}Gathering audit results from: $OUTPUT_DIR${NC}"

# Count findings by collecting all .md files (excluding SUMMARY.md)
audit_files=()
for f in "$OUTPUT_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    [[ "$(basename "$f")" == "SUMMARY.md" ]] && continue
    [[ "$(basename "$f")" == "MULTI-MODEL-SUMMARY.md" ]] && continue
    audit_files+=("$f")
done

if [[ ${#audit_files[@]} -eq 0 ]]; then
    echo -e "${RED}No audit result files found in $OUTPUT_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}Found ${#audit_files[@]} audit result files${NC}"

# ============================================================================
# PHASE 1: Collect JSON findings from separate .json files
# ============================================================================

echo -e "${YELLOW}Collecting JSON findings from separate files...${NC}"

# Find all JSON files (one per skill)
json_files=()
for f in "$OUTPUT_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    [[ "$(basename "$f")" == "findings.json" ]] && continue  # Skip combined output
    json_files+=("$f")
done

# Start the combined JSON structure
echo '{' > "$JSON_FINDINGS_FILE"
echo '  "generated": "'$(date -Iseconds)'",' >> "$JSON_FINDINGS_FILE"
echo '  "audit_count": '${#audit_files[@]}',' >> "$JSON_FINDINGS_FILE"
echo '  "skills": [' >> "$JSON_FINDINGS_FILE"

first_skill=true
total_findings=0
critical_count=0
high_count=0
medium_count=0
low_count=0
informational_count=0
skills_with_findings=0
skills_no_findings=0
skills_error=0

# Exploitability tracking for nuanced view
exp_none=0          # False positives / not exploitable
exp_very_low=0      # Practically not exploitable
exp_low=0           # Low exploitability
exp_medium=0        # Medium exploitability
exp_high=0          # High exploitability
exp_other=0         # Categorical markers (completeness, soundness, etc.)

for f in "${audit_files[@]}"; do
    skill_name=$(basename "$f" .md)
    json_file="$OUTPUT_DIR/${skill_name}.json"

    if [[ -f "$json_file" ]]; then
        json_block=$(cat "$json_file")
        echo -e "${GREEN}  OK: $skill_name (from ${skill_name}.json)${NC}"

        # Count findings by severity from the JSON
        status=$(echo "$json_block" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4 || echo "UNKNOWN")

        if [[ "$status" == *"NO_FINDINGS"* ]]; then
            ((skills_no_findings++)) || true
        elif [[ "$status" == *"WITH_FINDINGS"* ]]; then
            ((skills_with_findings++)) || true
        elif [[ "$status" == *"ERROR"* ]]; then
            ((skills_error++)) || true
        fi

        # Count by severity (rough grep-based count)
        skill_critical=$(echo "$json_block" | grep -c '"severity"[[:space:]]*:[[:space:]]*"critical"' || true)
        skill_high=$(echo "$json_block" | grep -c '"severity"[[:space:]]*:[[:space:]]*"high"' || true)
        skill_medium=$(echo "$json_block" | grep -c '"severity"[[:space:]]*:[[:space:]]*"medium"' || true)
        skill_low=$(echo "$json_block" | grep -c '"severity"[[:space:]]*:[[:space:]]*"low"' || true)
        skill_info=$(echo "$json_block" | grep -c '"severity"[[:space:]]*:[[:space:]]*"informational"' || true)

        ((critical_count += skill_critical)) || true
        ((high_count += skill_high)) || true
        ((medium_count += skill_medium)) || true
        ((low_count += skill_low)) || true
        ((informational_count += skill_info)) || true
        ((total_findings += skill_critical + skill_high + skill_medium + skill_low + skill_info)) || true

        # Count by exploitability for nuanced view
        skill_exp_none=$(echo "$json_block" | grep -c '"exploitability"[[:space:]]*:[[:space:]]*"none"' || true)
        skill_exp_not_exp=$(echo "$json_block" | grep -c '"exploitability"[[:space:]]*:[[:space:]]*"not-exploitable"' || true)
        skill_exp_very_low=$(echo "$json_block" | grep -c '"exploitability"[[:space:]]*:[[:space:]]*"very_low"' || true)
        skill_exp_low=$(echo "$json_block" | grep -c '"exploitability"[[:space:]]*:[[:space:]]*"low"' || true)
        skill_exp_medium=$(echo "$json_block" | grep -c '"exploitability"[[:space:]]*:[[:space:]]*"medium"' || true)
        skill_exp_high=$(echo "$json_block" | grep -c '"exploitability"[[:space:]]*:[[:space:]]*"high"' || true)

        ((exp_none += skill_exp_none + skill_exp_not_exp)) || true
        ((exp_very_low += skill_exp_very_low)) || true
        ((exp_low += skill_exp_low)) || true
        ((exp_medium += skill_exp_medium)) || true
        ((exp_high += skill_exp_high)) || true
        # Other = total findings minus known exploitability categories
        skill_exp_known=$((skill_exp_none + skill_exp_not_exp + skill_exp_very_low + skill_exp_low + skill_exp_medium + skill_exp_high))
        skill_exp_other=$((skill_critical + skill_high + skill_medium + skill_low + skill_info - skill_exp_known))
        ((exp_other += skill_exp_other > 0 ? skill_exp_other : 0)) || true
    else
        # No JSON file found - skill didn't produce JSON output
        echo -e "${YELLOW}  WARN: $skill_name - no JSON file found${NC}"
        json_block='{
  "skill": "'$skill_name'",
  "status": "NO_JSON_OUTPUT",
  "findings": []
}'
        ((skills_error++)) || true
    fi

    # Add to combined JSON
    if [[ "$first_skill" == "true" ]]; then
        first_skill=false
    else
        echo ',' >> "$JSON_FINDINGS_FILE"
    fi
    echo "$json_block" >> "$JSON_FINDINGS_FILE"
done

# Close the combined JSON structure
echo '' >> "$JSON_FINDINGS_FILE"
echo '  ],' >> "$JSON_FINDINGS_FILE"
# Calculate actionable vs informational findings
actionable_findings=$((exp_medium + exp_high))
likely_fp=$((exp_none + exp_very_low))

echo '  "totals": {' >> "$JSON_FINDINGS_FILE"
echo '    "findings": '$total_findings',' >> "$JSON_FINDINGS_FILE"
echo '    "by_severity": {' >> "$JSON_FINDINGS_FILE"
echo '      "critical": '$critical_count',' >> "$JSON_FINDINGS_FILE"
echo '      "high": '$high_count',' >> "$JSON_FINDINGS_FILE"
echo '      "medium": '$medium_count',' >> "$JSON_FINDINGS_FILE"
echo '      "low": '$low_count',' >> "$JSON_FINDINGS_FILE"
echo '      "informational": '$informational_count >> "$JSON_FINDINGS_FILE"
echo '    },' >> "$JSON_FINDINGS_FILE"
echo '    "by_exploitability": {' >> "$JSON_FINDINGS_FILE"
echo '      "high": '$exp_high',' >> "$JSON_FINDINGS_FILE"
echo '      "medium": '$exp_medium',' >> "$JSON_FINDINGS_FILE"
echo '      "low": '$exp_low',' >> "$JSON_FINDINGS_FILE"
echo '      "very_low": '$exp_very_low',' >> "$JSON_FINDINGS_FILE"
echo '      "none_or_false_positive": '$exp_none',' >> "$JSON_FINDINGS_FILE"
echo '      "other_categorical": '$exp_other >> "$JSON_FINDINGS_FILE"
echo '    },' >> "$JSON_FINDINGS_FILE"
echo '    "actionable_findings": '$actionable_findings',' >> "$JSON_FINDINGS_FILE"
echo '    "likely_false_positives": '$likely_fp',' >> "$JSON_FINDINGS_FILE"
echo '    "skills_with_findings": '$skills_with_findings',' >> "$JSON_FINDINGS_FILE"
echo '    "skills_no_findings": '$skills_no_findings',' >> "$JSON_FINDINGS_FILE"
echo '    "skills_error_or_no_output": '$skills_error >> "$JSON_FINDINGS_FILE"
echo '  }' >> "$JSON_FINDINGS_FILE"
echo '}' >> "$JSON_FINDINGS_FILE"

echo -e "${GREEN}JSON findings written to: $JSON_FINDINGS_FILE${NC}"
echo -e "${BLUE}  (Merged from ${#json_files[@]} individual JSON files)${NC}"

# ============================================================================
# PHASE 2: Generate statistics file
# ============================================================================

echo -e "${YELLOW}Generating statistics...${NC}"

cat > "$STATS_FILE" << EOF
VM2 Audit Statistics
====================

Generated: $(date)

Audit Results Summary
---------------------
Total audit files: ${#audit_files[@]}
Skills with findings: $skills_with_findings
Skills with no findings: $skills_no_findings
Skills with errors/no output: $skills_error

Findings by Severity
--------------------
Critical: $critical_count
High: $high_count
Medium: $medium_count
Low: $low_count
Informational: $informational_count
TOTAL: $total_findings

Findings by Exploitability
--------------------------
High exploitability: $exp_high
Medium exploitability: $exp_medium
Low exploitability: $exp_low
Very low exploitability: $exp_very_low
None / False positives: $exp_none
Other (categorical): $exp_other

Actionability Summary
---------------------
Actionable (medium+ exploitability): $actionable_findings
Likely false positives (none/very_low): $likely_fp
Low exploitability (needs review): $exp_low

Result File Sizes
-----------------
EOF

for f in "${audit_files[@]}"; do
    size=$(wc -c < "$f")
    name=$(basename "$f")
    printf "  %-50s %8d bytes\n" "$name" "$size" >> "$STATS_FILE"
done

echo -e "${GREEN}Statistics written to: $STATS_FILE${NC}"

# ============================================================================
# PHASE 3: Run Claude summarization (unless --json-only)
# ============================================================================

if [[ "$JSON_ONLY" == "true" ]]; then
    echo -e "${YELLOW}Skipping Claude summarization (--json-only)${NC}"
else
    echo -e "${YELLOW}Running Claude summarization...${NC}"

    # Skill descriptions for context (what each skill audits for)
    SKILL_CONTEXT='## Skill Descriptions (for context)

- **vm2-audit-missing-boolean**: Missing `sel * (1-sel) = 0` constraints on boolean columns, enabling field arithmetic exploits
- **vm2-audit-zero-check**: Incorrect zero-check patterns (e.g., division by zero indicators) that can be bypassed
- **vm2-audit-range-check-overflow**: Missing range checks on arithmetic that could overflow/underflow
- **vm2-audit-lookup-vs-permutation**: Using lookups instead of permutations for side-effectful operations (allows duplicates)
- **vm2-audit-memory-row-injection**: Ability to inject fake memory rows via permutation gaps
- **vm2-audit-interaction-tuple-completeness**: Missing columns in lookup/permutation tuples
- **vm2-audit-error-aggregation**: Error flag aggregation issues (cancellation via field arithmetic)
- **vm2-audit-missing-error-gating**: Lookups not gated by error flags (fail on error paths)
- **vm2-audit-constraint-typos**: Wrong variable constrained (copy-paste errors)
- **vm2-audit-commented-constraints**: Security constraints commented out or disabled
- **vm2-audit-dead-columns**: Columns declared but never constrained
- **vm2-audit-derived-value-constraints**: Intermediate values not properly constrained
- **vm2-audit-tag-validation**: Type tag validation gaps
- **vm2-audit-tracegen-pil-alignment**: Mismatch between tracegen code and PIL constraints
- **vm2-audit-first-row-special-cases**: First row edge cases with skippable constraints
- **vm2-audit-mutual-exclusivity**: Selectors that should be mutually exclusive but are not
- **vm2-audit-shift-bit-constraints**: Shift operation bit decomposition issues
- **vm2-audit-fiat-shamir-transcript**: Transcript/challenge generation security
- **vm2-audit-selector-outside-active**: Selectors active on rows they should not be
- **vm2-audit-premature-termination**: Early loop/computation termination issues
- **vm2-audit-optional-value-safety**: Unsafe access to optional/conditional values
- **vm2-audit-discard-revert-handling**: Reverted state changes persisting incorrectly
- **vm2-audit-exception-type-matching**: Exception type mismatches
- **vm2-audit-missing-initialization**: Missing initial value constraints
- **vm2-audit-missing-propagation**: Missing multi-row value propagation
- **vm2-audit-ghost-row-injection**: Injecting extra rows via trace gaps
- **vm2-audit-operation-transition-continuity**: Operation state transition issues
'

    # Summarization prompt using JSON data
    SUMMARIZE_PROMPT='You are reviewing VM2/AVM security audit results in JSON format.

'"$SKILL_CONTEXT"'

## Audit Summary
- Total findings: '$total_findings'

### By Severity:
- Critical: '$critical_count'
- High: '$high_count'
- Medium: '$medium_count'
- Low: '$low_count'
- Informational: '$informational_count'

### By Exploitability (key for prioritization):
- High exploitability: '$exp_high' (definitely actionable)
- Medium exploitability: '$exp_medium' (likely actionable)
- Low exploitability: '$exp_low' (needs human review)
- Very low exploitability: '$exp_very_low' (likely false positive)
- None / False positives: '$exp_none' (ruled out)

### Actionability:
- Actionable findings (medium+ exploitability): '$actionable_findings'
- Likely false positives (none/very_low): '$likely_fp'
- Skills with findings: '$skills_with_findings'
- Skills with no findings: '$skills_no_findings'

Create a summary with these sections:

## Executive Summary
2-3 sentences on overall security posture. Distinguish between total findings and actionable findings.

## Actionable Findings (exploitability: medium or high)
For each: ID, file:line, severity, exploitability, description, impact, fix suggestion.

## Findings Needing Review (exploitability: low)
Brief list (ID + severity + one-liner). These need human judgment.

## Likely False Positives (exploitability: none, very_low, not-exploitable)
Brief count and list of categories. Include why they were ruled out if clear from the data.

## Informational / Low Severity Findings
Brief list (ID + one-liner) for findings with low severity AND low/no exploitability.

## Skills With No Findings
List clean skills.

## Top 5 Recommendations
Prioritized by exploitability first, then severity.

## Deduplication Notes
Note if multiple skills found the same underlying issue.

Use the finding IDs exactly as they appear in the JSON.'

    # Run claude with JSON data via stdin (avoids "Argument list too long" for large findings)
    # Use streaming append to avoid heredoc backslash interpretation issues with JSON
    PROMPT_FILE=$(mktemp)

    {
        echo "$SUMMARIZE_PROMPT"
        echo ""
        echo "## JSON Findings Data"
        echo '```json'
    } > "$PROMPT_FILE"
    cat "$JSON_FINDINGS_FILE" >> "$PROMPT_FILE"
    {
        echo '```'
        echo ""
        echo "Please provide the summary."
    } >> "$PROMPT_FILE"

    if claude -p - \
        --model "$MODEL" \
        --output-format text \
        < "$PROMPT_FILE" > "$SUMMARY_FILE" 2>&1; then
        echo -e "${GREEN}Summary written to: $SUMMARY_FILE${NC}"
    else
        echo -e "${RED}Summarization failed. Check $SUMMARY_FILE for errors.${NC}"
    fi
fi

# ============================================================================
# OPTIONAL: Multi-model validation (via PAL MCP consensus)
# This creates an ADDITIONAL summary file, does not replace SUMMARY.md
# ============================================================================

if [[ "$JSON_ONLY" != "true" ]] && { [[ "$EXTRA_MULTI_MODEL_SUMMARY" == "true" ]] || [[ "$EXTRA_MULTI_MODEL_SUMMARY" == "1" ]]; }; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║      Multi-Model Validation (Additional Summary)             ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Starting multi-model cross-validation with Gemini and GPT...${NC}"
    echo "This creates an additional MULTI-MODEL-SUMMARY.md to help assess finding validity."
    echo ""

    MULTI_MODEL_SUMMARY="$OUTPUT_DIR/MULTI-MODEL-SUMMARY.md"
    MULTI_MODEL_LOG="$OUTPUT_DIR/.multi-model-validate.log"
    MULTI_MODEL_START=$(date +%s)

    # Use temp file for prompt to avoid "Argument list too long" with large JSON
    # Use streaming append to avoid heredoc backslash interpretation issues with JSON
    CONSENSUS_PROMPT_FILE=$(mktemp)

    {
        echo 'Cross-validate these VM2/AVM security audit findings using the mcp__pal__consensus tool.'
        echo ''
        echo 'Use models: [{"model":"gemini-3-pro-preview","stance":"neutral"},{"model":"gpt-5.2","stance":"neutral"}]'
        echo ''
        echo 'For each finding, have models assess:'
        echo '1. CONFIRMED / DISPUTED / UNCERTAIN'
        echo '2. Their severity (Critical/High/Medium/Low/False Positive)'
        echo '3. Brief reasoning'
        echo ''
        echo 'Output the complete summary as markdown with:'
        echo '- Consensus table (Finding ID | Claude Severity | Gemini | GPT | Consensus)'
        echo '- High-confidence findings (all models agree)'
        echo '- Disputed findings (models disagree)'
        echo '- Potential false positives'
        echo '- Prioritized recommendations based on consensus'
        echo ''
        echo 'Findings JSON:'
        echo '```json'
    } > "$CONSENSUS_PROMPT_FILE"
    cat "$JSON_FINDINGS_FILE" >> "$CONSENSUS_PROMPT_FILE"
    echo '```' >> "$CONSENSUS_PROMPT_FILE"

    if claude -p - \
        --model "$MODEL" \
        --allowedTools "mcp__pal__consensus,mcp__pal__chat" \
        --output-format text \
        < "$CONSENSUS_PROMPT_FILE" > "$MULTI_MODEL_SUMMARY" 2>"$MULTI_MODEL_LOG"; then
        MULTI_MODEL_END=$(date +%s)
        MULTI_MODEL_DURATION=$((MULTI_MODEL_END - MULTI_MODEL_START))
        echo -e "${GREEN}Multi-model validation complete (${MULTI_MODEL_DURATION}s)${NC}"
    else
        MULTI_MODEL_END=$(date +%s)
        MULTI_MODEL_DURATION=$((MULTI_MODEL_END - MULTI_MODEL_START))
        echo -e "${RED}Multi-model validation failed (${MULTI_MODEL_DURATION}s)${NC}"
        echo "  Check log: $MULTI_MODEL_LOG"
    fi
fi

# ============================================================================
# PHASE 4: Print final summary
# ============================================================================

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   Summarization Complete                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Results:"
echo "  Total findings: $total_findings"
echo "    By Severity:       Critical=$critical_count  High=$high_count  Medium=$medium_count  Low=$low_count  Info=$informational_count"
echo "    By Exploitability: High=$exp_high  Medium=$exp_medium  Low=$exp_low  VeryLow=$exp_very_low  None/FP=$exp_none"
echo ""
echo "  Actionability:"
echo "    Actionable (medium+ exploitability): $actionable_findings"
echo "    Likely false positives:              $likely_fp"
echo "    Low exploitability (needs review):   $exp_low"
echo ""
echo "Output files:"
echo "  JSON Findings: $JSON_FINDINGS_FILE"
echo "  Statistics:    $STATS_FILE"
if [[ "$JSON_ONLY" != "true" ]]; then
    echo "  Summary:       $SUMMARY_FILE"
fi
if [[ -f "$OUTPUT_DIR/MULTI-MODEL-SUMMARY.md" ]]; then
    echo "  Multi-Model:   $OUTPUT_DIR/MULTI-MODEL-SUMMARY.md"
fi
echo ""

if [[ "$JSON_ONLY" != "true" ]] && [[ -f "$SUMMARY_FILE" ]]; then
    echo -e "${YELLOW}Summary preview:${NC}"
    head -40 "$SUMMARY_FILE"
    echo ""
    echo -e "${BLUE}(See full summary in $SUMMARY_FILE)${NC}"
fi
