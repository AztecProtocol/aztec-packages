#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Get repo root for absolute paths
REPO_ROOT=$(git rev-parse --show-toplevel)

export BB=${BB:-"$REPO_ROOT/barretenberg/cpp/build/bin/bb"}
export NARGO=${NARGO:-"$REPO_ROOT/noir/noir-repo/target/release/nargo"}
export TRANSPILER=${TRANSPILER:-"$REPO_ROOT/avm-transpiler/target/release/avm-transpiler"}
export STRIP_AZTEC_NR_PREFIX=${STRIP_AZTEC_NR_PREFIX:-"$REPO_ROOT/noir-projects/noir-contracts/scripts/strip_aztec_nr_prefix.sh"}
export BB_HASH=${BB_HASH:-$("$REPO_ROOT/barretenberg/cpp/bootstrap.sh" hash)}
export NOIR_HASH=${NOIR_HASH:-$("$REPO_ROOT/noir/bootstrap.sh" hash)}

# Safety net: ensure all TS example yarn.lock files are empty on exit.
# Both validate-ts and execute-examples (via Docker volume mount) can populate
# these files, and their per-project cleanup may not run if processes are killed.
trap 'for lf in "$REPO_ROOT"/docs/examples/ts/*/yarn.lock; do [ -f "$lf" ] && > "$lf"; done' EXIT

hash=$(hash_str \
  $BB_HASH \
  $NOIR_HASH \
  $(cache_content_hash .rebuild_patterns))

function compile-circuits {
  echo_header "Compiling vanilla Noir circuits"
  local CIRCUITS_DIR="$REPO_ROOT/docs/examples/circuits"

  if [ ! -d "$CIRCUITS_DIR" ]; then
    echo_stderr "No circuits directory found at $CIRCUITS_DIR"
    return 0
  fi

  if [ ! -f "$CIRCUITS_DIR/Nargo.toml" ]; then
    echo_stderr "No workspace Nargo.toml found in $CIRCUITS_DIR"
    return 0
  fi

  # Compile vanilla circuits (not contracts - those are compiled separately).
  # nargo walks up to docs/Nargo.toml, so we compile specific packages.
  echo_stderr "Compiling circuits..."
  local circuit
  for circuit in "$CIRCUITS_DIR"/*/; do
    local name=$(basename "$circuit")
    if [ -f "$circuit/Nargo.toml" ]; then
      echo_stderr "  Compiling $name..."
      (cd "$REPO_ROOT/docs" && $NARGO compile --package "$name")
    fi
  done
}

function compile {
  echo_header "Compiling example contracts"
  local CONTRACTS_DIR="$REPO_ROOT/docs/examples/contracts"

  if [ ! -d "$CONTRACTS_DIR" ]; then
    echo_stderr "No contracts directory found at $CONTRACTS_DIR"
    return 0
  fi

  local contracts=()
  if [ "$#" -gt 0 ]; then
    local contract
    for contract in "$@"; do
      if [[ "$contract" == */* ]]; then
        contracts+=("$contract")
      else
        contracts+=("contracts/$contract")
      fi
    done
  else
    local contract
    for contract in "$CONTRACTS_DIR"/*/; do
      if [ -f "$contract/Nargo.toml" ]; then
        contracts+=("contracts/$(basename "$contract")")
      fi
    done
  fi

  # Use noir-contracts bootstrap with DOCS_WORKING_DIR pointing to parent (docs/).
  # Pass only contract packages so circuits in the shared docs workspace are not
  # treated as contract artifacts by the noir-contracts bootstrap.
  DOCS_WORKING_DIR="$(cd .. && pwd)" \
    $REPO_ROOT/noir-projects/noir-contracts/bootstrap.sh compile "${contracts[@]}"
}

function compile-solidity {
  echo_header "Compiling Solidity examples"
  local SOLIDITY_DIR="$REPO_ROOT/docs/examples/solidity"
  local OUTPUT_DIR="$REPO_ROOT/docs/target/solidity"

  # Find all .sol files recursively
  local sol_files
  sol_files=$(find "$SOLIDITY_DIR" -name "*.sol" 2>/dev/null)
  if [ -z "$sol_files" ]; then
    echo_stderr "No Solidity files found in $SOLIDITY_DIR"
    return 0
  fi

  mkdir -p "$OUTPUT_DIR"

  # Compile using the local foundry.toml with proper remappings
  (
    cd "$SOLIDITY_DIR"
    for subdir in */; do
      if [ -d "$subdir" ] && ls "$subdir"/*.sol >/dev/null 2>&1; then
        local subdir_name=$(basename "$subdir")
        echo_stderr "Compiling $subdir_name..."
        forge build \
          --contracts "$subdir" \
          --out "$OUTPUT_DIR/$subdir_name" \
          --no-cache
      fi
    done
  )

  echo_stderr "Solidity artifacts written to $OUTPUT_DIR"
}

function validate-ts {
  echo_header "Validating TypeScript examples"
  (cd ts && ./bootstrap.sh "$@")
}

function execute-examples {
  echo_header "Executing TypeScript documentation examples"
  local COMPOSE_DIR="$REPO_ROOT/docs/examples/ts"
  run_compose_test "docs_examples" "docs-examples" "$COMPOSE_DIR"
}

function test_cmds {
  echo "$hash:ONLY_TERM_PARENT=1 docs/examples/bootstrap.sh execute"
}

function test {
  echo_header "docs examples test"
  test_cmds | filter_test_cmds | parallelize
}

##############################################################################
# CI failure handling - send Slack notifications instead of blocking the build
##############################################################################

# Get PR number (returns empty string if not in PR context)
function get_pr_number {
  if [[ -z "${CI:-}" ]] || ! command -v gh &>/dev/null; then
    return
  fi

  local branch="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"

  if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
    gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null || echo "Failed to query PR number from branch $branch" >&2
  fi
}

function send_slack_message {
  local message=$1
  local channel=${2:-"#devrel-docs-updates"}
  if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
    echo "SLACK_BOT_TOKEN not set, skipping Slack notification"
    return 0
  fi

  local data
  data=$(jq -n --arg channel "$channel" --arg text "$message" \
    '{channel: $channel, text: $text}')

  local response
  if ! response=$(curl -s --fail-with-body -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-type: application/json" \
    --data "$data"); then
    echo "Slack API request failed (curl error)" >&2
    return 1
  fi

  local ok
  if ! ok=$(echo "$response" | jq -r '.ok' 2>/dev/null); then
    echo "Slack API returned invalid JSON: $response" >&2
    return 1
  fi

  if [[ "$ok" != "true" ]]; then
    local error
    error=$(echo "$response" | jq -r '.error // "unknown error"' 2>/dev/null)
    echo "Slack API error: $error" >&2
    return 1
  fi

  return 0
}

# Arrays to collect failures across all steps
FAILED_STEPS=()
FAILED_OUTPUTS=()

# Run a step with retry, collect failure if it fails
function run_step {
  local step_name=$1
  local step_func=$2
  local output exit_code

  # Disable errexit for command substitution to properly capture exit code
  set +e
  output=$($step_func 2>&1)
  exit_code=$?
  set -e
  echo "$output"

  # Retry once on failure
  if [[ $exit_code -ne 0 ]]; then
    echo "WARNING: $step_name failed (exit code $exit_code), retrying..."
    set +e
    output=$($step_func 2>&1)
    exit_code=$?
    set -e
    echo "$output"
  fi

  if [[ $exit_code -ne 0 ]]; then
    echo "WARNING: $step_name failed after retry (exit code $exit_code)"
    FAILED_STEPS+=("$step_name")
    FAILED_OUTPUTS+=("$output")
  fi
}

# Send a consolidated Slack message for all failed steps
function send_failure_slack_message {
  local branch="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")}"
  local context="branch: \`${branch}\`"

  local pr_number
  pr_number=$(get_pr_number)
  if [[ -n "$pr_number" ]]; then
    local pr_url
    pr_url=$(gh pr view "$pr_number" --json url --jq '.url' 2>/dev/null || echo "")
    if [[ -n "$pr_url" ]]; then
      context="<${pr_url}|PR #${pr_number}>"
    else
      context="PR #${pr_number}"
    fi
  fi

  local max_chars_per_failure=$((2500 / ${#FAILED_STEPS[@]}))
  local message=":warning: *Docs Examples Validation Failed* (${context})"$'\n\n'

  for i in "${!FAILED_STEPS[@]}"; do
    local output="${FAILED_OUTPUTS[$i]}"
    if [[ ${#output} -gt $max_chars_per_failure ]]; then
      output="(truncated)..."$'\n'"${output: -$max_chars_per_failure}"
    fi
    message+="*${FAILED_STEPS[$i]}*"$'\n'"\`\`\`"$'\n'"$output"$'\n'"\`\`\`"$'\n\n'
  done

  message+="*Action required:* Please fix the docs examples or update them to match the current API."

  send_slack_message "$message"
}

case "$cmd" in
  "")
    run_step "Compile (Noir circuits)" compile-circuits
    run_step "Compile (Noir contracts)" compile
    run_step "Compile (Solidity)" compile-solidity
    run_step "TypeScript validation" validate-ts

    if [[ ${#FAILED_STEPS[@]} -gt 0 ]]; then
      send_failure_slack_message

      # Print a prominent error summary at the bottom of the log
      echo ""
      echo "============================================================"
      echo "  DOCS EXAMPLES FAILURE SUMMARY"
      echo "============================================================"
      for i in "${!FAILED_STEPS[@]}"; do
        echo ""
        echo "--- FAILED: ${FAILED_STEPS[$i]} ---"
        # Extract lines containing 'error' or 'ERROR' for a concise summary
        error_lines=$(echo "${FAILED_OUTPUTS[$i]}" | grep -i 'error' || true)
        if [[ -n "$error_lines" ]]; then
          echo "$error_lines"
        else
          # If no error lines found, show the last 20 lines of output
          echo "${FAILED_OUTPUTS[$i]}" | tail -20
        fi
      done
      echo ""
      echo "============================================================"
      echo ""

      # Block PRs on failure, but allow merge queue to proceed (may be transient infra issues)
      if [[ ! "$REF_NAME" =~ ^gh-readonly-queue/ ]]; then
        echo "ERROR: Docs examples validation failed. Failing the build."
        exit 1
      fi
    fi
    ;;
  "hash")
    echo "$hash"
    ;;
  compile-circuits)
    compile-circuits
    ;;
  compile-solidity)
    compile-solidity
    ;;
  execute)
    execute-examples
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
