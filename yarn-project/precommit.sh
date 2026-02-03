#!/usr/bin/env bash
# Precommit hook for formatting staged files.
# Autoformats staged files, unless any are partially staged (committed in chunks).
set -euo pipefail

cd $(dirname $0)

export FORCE_COLOR=true

# Get all staged files (excluding deleted), relative to yarn-project
staged_files=$(git diff-index --diff-filter=d --relative --cached --name-only HEAD)

[ -z "$staged_files" ] && exit 0

# Filter for formattable files
staged_format_files=$(echo "$staged_files" | grep -E '\.(json|js|mjs|cjs|ts)$' || true)

# Get unstaged changes for formattable files
unstaged_format_files=$(git diff --relative --name-only --diff-filter=d | grep -E '\.(json|js|mjs|cjs|ts)$' || true)

# Detect partially staged files (staged + unstaged changes).
# We don't want to auto-format anything if someone has staged a hunk (partial file)
# as we might corrupt their hunks.
partially_staged=()
for file in $staged_format_files; do
  if echo "$unstaged_format_files" | grep -Fxq "$file"; then
    partially_staged+=("$file")
  fi
done

if (( ${#partially_staged[@]} > 0 )); then
  echo -e "\033[33mWarning:\033[0m The following files are partially staged:"
  for f in "${partially_staged[@]}"; do
    echo "  - $f"
  done
  echo -e "\033[33mSkipping prettier autoformat because of the partial staging. Format manually with 'yarn format'.\033[0m"
  exit 0
fi

if [[ -n "$staged_format_files" ]]; then
  echo "Formatting staged files..."
  echo "$staged_format_files" | parallel -N10 ./node_modules/.bin/prettier --log-level warn --write

  # Re-stage formatted files
  repo_root=$(git rev-parse --show-toplevel)
  echo "$staged_format_files" | xargs -I {} git add "$repo_root/yarn-project/{}"
fi

yarn prepare:check
