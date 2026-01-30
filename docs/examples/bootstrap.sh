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

  # Compile all circuits in the workspace
  echo_stderr "Compiling circuits workspace..."
  (cd "$CIRCUITS_DIR" && $NARGO compile --workspace)

  echo_stderr "Vanilla circuits compiled"
}

function compile {
  echo_header "Compiling example contracts"
  # Use noir-contracts bootstrap with DOCS_WORKING_DIR pointing to parent (docs/)
  DOCS_WORKING_DIR="$(cd .. && pwd)" \
    $REPO_ROOT/noir-projects/noir-contracts/bootstrap.sh compile "$@"
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

##############################################################################
# CI failure handling - post PR comments instead of blocking the build
##############################################################################

# Get PR number for commenting (returns empty string if not in PR context)
function get_pr_number {
  if [[ -z "${CI:-}" ]] || ! command -v gh &>/dev/null; then
    return
  fi

  local branch="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"

  if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
    gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null
  fi
}

# Find existing docs examples failure comment ID
function get_existing_comment_id {
  local pr_number=$1
  local jq_filter='.comments[] | select(.body | startswith("⚠️ **Docs Examples Validation Failed**")) | .id'
  gh pr view "$pr_number" --json comments --jq "$jq_filter" 2>/dev/null | head -n 1
}

# Post or update a PR comment about docs example failures
function post_failure_comment {
  local pr_number=$1
  local comment_body=$2
  local existing_comment
  existing_comment=$(get_existing_comment_id "$pr_number")

  if [[ -n "$existing_comment" ]]; then
    echo "Updating existing docs examples failure comment..."
    gh api "repos/{owner}/{repo}/issues/comments/$existing_comment" \
      -X PATCH -f body="$comment_body" 2>/dev/null \
      || echo "⚠ Failed to update existing comment"
  else
    echo "Adding docs examples failure comment to PR #$pr_number..."
    gh pr comment "$pr_number" --body "$comment_body" 2>/dev/null \
      || echo "⚠ Failed to add PR comment"
  fi
}

# Delete existing failure comment (called when validation passes)
function delete_failure_comment {
  local pr_number=$1
  local existing_comment
  existing_comment=$(get_existing_comment_id "$pr_number")

  if [[ -n "$existing_comment" ]]; then
    echo "Validation passed - deleting previous failure comment..."
    gh api "repos/{owner}/{repo}/issues/comments/$existing_comment" \
      -X DELETE 2>/dev/null || true
  fi
}

# Arrays to collect failures across all steps
FAILED_STEPS=()
FAILED_OUTPUTS=()

# Run a step, collect failure if it fails
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

  if [[ $exit_code -ne 0 ]]; then
    echo "WARNING: $step_name failed (exit code $exit_code)"
    FAILED_STEPS+=("$step_name")
    FAILED_OUTPUTS+=("$output")
  fi
}

# Post a consolidated failure comment for all failed steps
function post_failure_comment_for_steps {
  local pr_number=$1
  local max_chars_per_failure=$((4500 / ${#FAILED_STEPS[@]}))
  local body="⚠️ **Docs Examples Validation Failed**"$'\n\n'

  for i in "${!FAILED_STEPS[@]}"; do
    local output="${FAILED_OUTPUTS[$i]}"
    if [[ ${#output} -gt $max_chars_per_failure ]]; then
      output="(truncated)..."$'\n'"${output: -$max_chars_per_failure}"
    fi
    body+="### ${FAILED_STEPS[$i]}"$'\n\n'"~~~"$'\n'"$output"$'\n'"~~~"$'\n\n'
  done

  body+="**Action required:** Please fix the docs examples or update them to match the current API."$'\n\n'
  body+="cc @AztecProtocol/devrel"

  post_failure_comment "$pr_number" "$body"
}

case "$cmd" in
  "")
    run_step "Compile (Noir circuits)" compile-circuits
    run_step "Compile (Noir contracts)" compile
    run_step "Compile (Solidity)" compile-solidity
    run_step "TypeScript validation" validate-ts

    pr_number=$(get_pr_number)
    if [[ -n "$pr_number" ]]; then
      if [[ ${#FAILED_STEPS[@]} -gt 0 ]]; then
        post_failure_comment_for_steps "$pr_number"
      else
        delete_failure_comment "$pr_number"
      fi
    fi
    ;;
  compile-circuits)
    compile-circuits
    ;;
  compile-solidity)
    compile-solidity
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
