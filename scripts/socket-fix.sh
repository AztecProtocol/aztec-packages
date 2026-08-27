#!/usr/bin/env bash
# Discover and fix dependency vulnerabilities using Socket.dev CLI.
# Filters by severity, applies each fix individually, and commits per GHSA.
#
# Usage: socket-fix.sh [--severity LEVEL] [--dry-run] [--workspaces "w1 w2 ..."]
#
# Options:
#   --severity LEVEL   Minimum severity to fix: critical, high, medium, low (default: critical)
#   --dry-run          Discover and report vulnerabilities without applying fixes or committing
#   --workspaces LIST  Space-separated workspace roots (default: "barretenberg/ts l1-contracts")
#
# Prerequisites:
#   - Socket CLI: npm install -g socket
#   - GitHub CLI: gh (for advisory severity lookups)
#   - SOCKET_SECURITY_API_TOKEN env var set (or run `socket login` locally)
set -euo pipefail

# --- Logging ---
log()  { echo "[INFO]  $(date -Is) - $*"; }
warn() { echo "[WARN]  $(date -Is) - $*" >&2; }
err()  { echo "[ERROR] $(date -Is) - $*" >&2; }
die()  { err "$*"; exit 1; }

# --- Severity mapping ---
severity_to_num() {
  case "$1" in
    critical) echo 4 ;;
    high)     echo 3 ;;
    medium)   echo 2 ;;
    low)      echo 1 ;;
    *)        echo 0 ;;
  esac
}

# --- CI output helper ---
gh_output() {
  local key="$1" value="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "${key}=${value}" >> "$GITHUB_OUTPUT"
  fi
}

# --- Defaults ---
SEVERITY="critical"
DRY_RUN=false
WORKSPACES="barretenberg/ts l1-contracts"

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --severity)
      SEVERITY="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --workspaces)
      WORKSPACES="$2"
      shift 2
      ;;
    -h|--help)
      head -14 "$0" | tail -12
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

MIN_SEVERITY=$(severity_to_num "$SEVERITY")
if [[ "$MIN_SEVERITY" -eq 0 ]]; then
  die "Invalid severity level: $SEVERITY (must be critical, high, medium, or low)"
fi

# --- Validate prerequisites ---
command -v socket >/dev/null 2>&1 || die "Socket CLI not found. Install with: npm install -g socket"
command -v gh >/dev/null 2>&1     || die "GitHub CLI (gh) not found."
command -v jq >/dev/null 2>&1     || die "jq not found."

if [[ -z "${SOCKET_SECURITY_API_TOKEN:-}" ]]; then
  warn "SOCKET_SECURITY_API_TOKEN is not set. Socket CLI may fail to authenticate."
  warn "Set the env var or run 'socket login' to authenticate."
fi

# --- Resolve repo root ---
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

log "Severity threshold: $SEVERITY (>= $MIN_SEVERITY)"
log "Dry run: $DRY_RUN"
log "Workspaces: $WORKSPACES"

# --- Phase 1: Discover vulnerabilities across all workspaces ---
# Build an associative array: GHSA_ID -> "workspace1 workspace2 ..."
declare -A GHSA_WORKSPACES
declare -A GHSA_SEVERITY
GHSA_COUNT=0

for workspace in $WORKSPACES; do
  log "========================================="
  log "Discovering vulnerabilities in $workspace"
  log "========================================="

  output_file="/tmp/socket-fix-${workspace//\//-}-discovery.json"

  # CI= unsets the CI env var so socket CLI runs in interactive mode (avoids CI-only behavior).
  # Don't skip the workspace on non-zero exit — socket may still have written partial results.
  CI= socket fix --all --no-apply-fixes --output-file "$output_file" "$workspace/" 2>&1 || \
    warn "socket fix dry run returned non-zero in $workspace, attempting to parse output anyway"

  # Extract GHSA IDs from the structured JSON output (keys of the "fixes" object)
  ghsa_ids=$(jq -r '.fixes | keys[]' "$output_file" 2>/dev/null | sort -u || true)

  if [[ -z "$ghsa_ids" ]]; then
    log "No fixable vulnerabilities found in $workspace"
    continue
  fi

  for ghsa_id in $ghsa_ids; do
    # Only look up severity once per GHSA
    if [[ -z "${GHSA_SEVERITY[$ghsa_id]:-}" ]]; then
      sev=$(gh api "/advisories/$ghsa_id" --jq '.severity' 2>/dev/null || echo "unknown")
      if [[ "$sev" == "unknown" ]]; then
        warn "Could not determine severity for $ghsa_id, treating as unknown"
      fi
      GHSA_SEVERITY[$ghsa_id]="$sev"
      GHSA_COUNT=$((GHSA_COUNT + 1))
    fi

    # Track which workspaces this GHSA affects
    if [[ -n "${GHSA_WORKSPACES[$ghsa_id]:-}" ]]; then
      GHSA_WORKSPACES[$ghsa_id]="${GHSA_WORKSPACES[$ghsa_id]} $workspace"
    else
      GHSA_WORKSPACES[$ghsa_id]="$workspace"
    fi
  done
done

# --- Phase 2: Filter by severity ---
QUALIFYING_GHSAS=()
SKIPPED_GHSAS=()

if [[ $GHSA_COUNT -gt 0 ]]; then
  for ghsa_id in "${!GHSA_SEVERITY[@]}"; do
    sev="${GHSA_SEVERITY[$ghsa_id]}"
    sev_num=$(severity_to_num "$sev")

    if [[ "$sev_num" -ge "$MIN_SEVERITY" ]]; then
      QUALIFYING_GHSAS+=("$ghsa_id")
    else
      SKIPPED_GHSAS+=("$ghsa_id($sev)")
    fi
  done
fi

# --- Summary of discovered vulnerabilities ---
log "========================================="
log "Discovery complete"
log "========================================="
log "Total GHSAs found: $GHSA_COUNT"
log "Qualifying (>= $SEVERITY): ${#QUALIFYING_GHSAS[@]}"
log "Skipped (below threshold): ${#SKIPPED_GHSAS[@]}"

if [[ $GHSA_COUNT -gt 0 ]]; then
  log ""
  log "Vulnerability report:"
  for ghsa_id in "${!GHSA_SEVERITY[@]}"; do
    sev="${GHSA_SEVERITY[$ghsa_id]}"
    workspaces="${GHSA_WORKSPACES[$ghsa_id]}"
    sev_num=$(severity_to_num "$sev")
    marker=""
    if [[ "$sev_num" -ge "$MIN_SEVERITY" ]]; then
      marker=" [WILL FIX]"
    fi
    log "  $ghsa_id  severity=$sev  workspaces=($workspaces)$marker"
  done
fi

if [[ "$DRY_RUN" == true ]]; then
  log ""
  log "Dry run complete. No changes applied."
  gh_output "commit_count" "0"
  gh_output "fixed" ""
  gh_output "failed" ""
  gh_output "skipped" "${SKIPPED_GHSAS[*]:-}"
  gh_output "qualifying_ids" "${QUALIFYING_GHSAS[*]:-}"
  gh_output "remaining_count" "${#QUALIFYING_GHSAS[@]}"
  gh_output "total_found" "$GHSA_COUNT"
  gh_output "qualifying_count" "${#QUALIFYING_GHSAS[@]}"
  exit 0
fi

if [[ ${#QUALIFYING_GHSAS[@]} -eq 0 ]]; then
  log "No vulnerabilities meet the severity threshold. Nothing to do."
  gh_output "commit_count" "0"
  gh_output "fixed" ""
  gh_output "failed" ""
  gh_output "skipped" "${SKIPPED_GHSAS[*]:-}"
  gh_output "qualifying_ids" ""
  gh_output "remaining_count" "0"
  gh_output "total_found" "$GHSA_COUNT"
  gh_output "qualifying_count" "0"
  exit 0
fi

# --- Phase 3: Apply fixes one at a time ---
FIXED=()
FAILED=()
COMMIT_COUNT=0

for ghsa_id in "${QUALIFYING_GHSAS[@]}"; do
  workspaces="${GHSA_WORKSPACES[$ghsa_id]}"

  for workspace in $workspaces; do
    log "-----------------------------------------"
    log "Fixing $ghsa_id in $workspace"
    log "-----------------------------------------"

    if ! CI= socket fix --id "$ghsa_id" "$workspace/" 2>&1; then
      warn "socket fix failed for $ghsa_id in $workspace, resetting"
      git checkout -- "$workspace/"
      git clean -fd -- "$workspace/" 2>/dev/null || true
      FAILED+=("$ghsa_id($workspace/fix-failed)")
      continue
    fi

    # Check if socket fix actually changed anything
    if [[ -z $(git diff --name-only -- "$workspace/") ]]; then
      log "  socket fix reported success but no files changed, skipping"
      continue
    fi

    # Regenerate yarn.lock
    log "  Regenerating yarn.lock in $workspace"
    if ! (cd "$workspace" && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install 2>&1); then
      warn "yarn install failed for $ghsa_id in $workspace, resetting"
      git checkout -- "$workspace/"
      git clean -fd -- "$workspace/" 2>/dev/null || true
      FAILED+=("$ghsa_id($workspace/yarn-install-failed)")
      continue
    fi

    # Commit the fix (scope to workspace to avoid staging unrelated files)
    git add "$workspace/"
    git commit -m "fix(deps): $ghsa_id in $workspace"
    FIXED+=("$ghsa_id($workspace)")
    COMMIT_COUNT=$((COMMIT_COUNT + 1))
    log "  Committed fix for $ghsa_id in $workspace"
  done
done

# --- Final summary ---
log "========================================="
log "Summary"
log "========================================="
log "Fixed:   ${FIXED[*]:-none}"
log "Failed:  ${FAILED[*]:-none}"
log "Skipped: ${SKIPPED_GHSAS[*]:-none}"
log "Commits: $COMMIT_COUNT"

gh_output "commit_count" "$COMMIT_COUNT"
gh_output "fixed" "${FIXED[*]:-}"
gh_output "failed" "${FAILED[*]:-}"
gh_output "skipped" "${SKIPPED_GHSAS[*]:-}"
gh_output "qualifying_ids" "${QUALIFYING_GHSAS[*]:-}"
gh_output "remaining_count" "${#FAILED[@]}"
gh_output "total_found" "$GHSA_COUNT"
gh_output "qualifying_count" "${#QUALIFYING_GHSAS[@]}"
