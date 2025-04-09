#!/usr/bin/env bash
# Precommit hook for formatting staged noir files.
# We only run the formatter if there are staged *.nr files.
# Nothing should cause a failure, because that would annoy everyone if all they're trying to do is commit.
set -euo pipefail

cd $(dirname $0)

export FORCE_COLOR=true

# Path to nargo binary
NARGO_PATH="../noir/noir-repo/target/release/nargo"

# Check if there are staged .nr files
staged_nr_files=$(git diff --cached --name-only --diff-filter=d | grep '\.nr$' || true)

if [[ -n "$staged_nr_files" ]]; then
  echo "Detected staged .nr files. Running nargo fmt..."

  # Check if nargo exists (the user might be making a quick change, without wanting to have to bootstrap the entire repo, so we don't want an inconvenient catastrophic failure if this hook can't complete execution; we want to fail gracefully).
  if [[ ! -x "$NARGO_PATH" ]]; then
    echo "Warning: nargo not found at $NARGO_PATH"
    echo "   Skipping the nargo fmt commit hook."
    exit 0
  fi

  for dir in noir-contracts noir-protocol-circuits mock-protocol-circuits aztec-nr; do
    if [[ -d "$dir" ]]; then
      echo "Formatting in $dir..."
      (cd "$dir" && "../$NARGO_PATH" fmt) || echo "Warning: Formatting failed in $dir, but continuing..."
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
