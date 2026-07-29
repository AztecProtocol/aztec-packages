#!/usr/bin/env bash
# Precommit hook for formatting staged noir files and keeping generated contracts in sync.
# We only run the formatter if there are staged *.nr files.
# Nothing should cause a failure, because that would annoy everyone if all they're trying to do is commit.
set -euo pipefail

# we have to unset this env var set by git hooks so that this relative paths work correctly when used inside worktrees
unset GIT_DIR

cd $(dirname $0)

export FORCE_COLOR=true

# Path to nargo binary
NARGO_PATH="../noir/noir-repo/target/release/nargo"
# Absolute path for use inside the per-workspace loop, where a relative path would
# resolve differently depending on each workspace's depth.
NARGO_ABS="$PWD/$NARGO_PATH"

# Check if there are staged .nr files
staged_nr_files=$(git diff --cached --name-only --diff-filter=d | grep '\.nr$' || true)
# Check for unstaged .nr files too
unstaged_nr_files=$(git diff --name-only --diff-filter=d | grep '\.nr$' || true)

# Detect partially staged .nr files (staged + unstaged changes).
# We don't want to auto-format anything if someone has staged a hunk (partial file)
# as we might corrupt their hunks.
# We'll identify partially staged files by looking
# at the intersection of staged and unstaged:
partially_staged_nr_files=()
for file in $staged_nr_files; do
  if echo "$unstaged_nr_files" | grep -Fxq "$file"; then
    partially_staged_nr_files+=("$file")
  fi
done

if (( ${#partially_staged_nr_files[@]} > 0 )); then
  echo -e "\033[33mWarning:\033[0m The following .nr files are partially staged:"
  for f in "${partially_staged_nr_files[@]}"; do
    echo "  - $f"
  done
  echo -e "\033[33mSkipping nargo fmt because of the partial staging. Your files have been committed (as you wanted), but you'll have to format them manually with '$NARGO_PATH fmt'.\033[0m"
  exit 0
fi

if [[ -n "$staged_nr_files" ]]; then
  echo "Detected staged .nr files. Running nargo fmt..."

  # Check if nargo exists (the user might be making a quick change, without wanting to have to bootstrap the entire repo, so we don't want an inconvenient catastrophic failure if this hook can't complete execution; we want to fail gracefully).
  if [[ ! -x "$NARGO_PATH" ]]; then
    echo "Warning: nargo not found at $NARGO_PATH"
    echo "   Skipping the nargo fmt commit hook."
    exit 0
  fi

  for dir in fnd/noir-contracts labs/noir-contracts fnd/noir-protocol-circuits fnd/mock-protocol-circuits labs/aztec-nr labs/protocol-fuzzer/contracts; do
    if [[ -d "$dir" ]]; then
      echo "Formatting in $dir..."
      (cd "$dir" && "$NARGO_ABS" fmt) || echo "Warning: Formatting failed in $dir, but continuing..."
    else
      echo "Warning: Directory $dir not found, skipping..."
    fi
  done

  echo "Formatting completed."

  # Re-stage formatted .nr files
  echo "Re-staging formatted .nr files..."
  repo_root=$(git rev-parse --show-toplevel)
  echo "$staged_nr_files" | xargs -I {} git add "$repo_root/{}"
fi

# We just don't say anything if there are no staged nr files, because no one cares.

# Keep the generated TestToken in sync with canonical Token (see
# labs/noir-contracts/scripts/gen_test_token.sh). That script is pure cp+perl (no build), so it's cheap to
# run here, and it replaces the build-time --check for local commits. Runs after nargo fmt above so it
# copies the freshly-formatted canonical source. Like the rest of this hook, it must never block a commit.
staged_token_files=$(git diff --cached --name-only --diff-filter=d \
  | grep '^noir-projects/labs/noir-contracts/contracts/app/token_contract/' || true)
if [[ -n "$staged_token_files" ]]; then
  # Skip if any canonical Token file is partially staged, so we don't bake unstaged Token changes into
  # the committed TestToken (mirrors the partial-staging guard above).
  unstaged_token_files=$(git diff --name-only --diff-filter=d \
    | grep '^noir-projects/labs/noir-contracts/contracts/app/token_contract/' || true)
  token_partially_staged=false
  for file in $staged_token_files; do
    if echo "$unstaged_token_files" | grep -Fxq "$file"; then
      token_partially_staged=true
    fi
  done

  if $token_partially_staged; then
    echo -e "\033[33mWarning:\033[0m token_contract is partially staged; skipping TestToken regen."
    echo -e "\033[33mRun labs/noir-contracts/scripts/gen_test_token.sh and stage the result manually.\033[0m"
  else
    echo "Detected staged canonical Token change. Regenerating TestToken..."
    if ./labs/noir-contracts/scripts/gen_test_token.sh; then
      repo_root=$(git rev-parse --show-toplevel)
      git add "$repo_root/noir-projects/labs/noir-contracts/contracts/test/test_token_contract"
    else
      echo -e "\033[33mWarning:\033[0m TestToken regen failed; your commit will proceed."
      echo -e "\033[33mRun labs/noir-contracts/scripts/gen_test_token.sh manually.\033[0m"
    fi
  fi
fi
