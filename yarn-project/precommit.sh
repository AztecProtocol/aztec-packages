#!/usr/bin/env bash
# Precommit hook for formatting staged files.
# Autoformats staged files, unless any are partially staged (committed in chunks).
set -euo pipefail

# we have to unset this env var set by git hooks so that this relative paths work correctly when used inside worktrees
unset GIT_DIR

cd $(dirname $0)

export FORCE_COLOR=true

# Verify every .codex directory mirrors its sibling .claude via child symlinks, so that adding a
# file or folder to a .claude config does not silently leave the sandboxed .codex path behind.
# Only immediate children are checked: a symlinked folder (e.g. .codex/skills) already covers its
# contents, and a .codex that is itself a symlink (the repo root) mirrors .claude inherently.
check_codex_symlinks() {
  local repo_root claude_dirs claude_dir codex_dir path name
  local -a errors=()
  repo_root=$(git rev-parse --show-toplevel)
  claude_dirs=$(cd "$repo_root" && git ls-files -- '.claude/*' '*/.claude/*' | sed -E 's#(.*/)?\.claude/.*#\1.claude#' | sort -u)

  for claude_dir in $claude_dirs; do
    codex_dir="${claude_dir%.claude}.codex"
    if [ -L "$repo_root/$codex_dir" ]; then
      continue
    fi
    if [ ! -d "$repo_root/$codex_dir" ]; then
      errors+=("missing directory $codex_dir (should mirror $claude_dir)")
      continue
    fi
    while IFS= read -r path; do
      name=$(basename "$path")
      if [ ! -L "$repo_root/$codex_dir/$name" ] || [ ! "$repo_root/$codex_dir/$name" -ef "$path" ]; then
        errors+=("$codex_dir/$name should be a symlink to ../.claude/$name")
      fi
    done < <(find "$repo_root/$claude_dir" -mindepth 1 -maxdepth 1)
    while IFS= read -r path; do
      name=$(basename "$path")
      if [ ! -e "$repo_root/$claude_dir/$name" ] && [ ! -L "$repo_root/$claude_dir/$name" ]; then
        errors+=("$codex_dir/$name is stale; no matching $claude_dir/$name")
      fi
    done < <(find "$repo_root/$codex_dir" -mindepth 1 -maxdepth 1)
  done

  if (( ${#errors[@]} > 0 )); then
    echo -e "\033[31mError:\033[0m .codex directories are out of sync with their .claude siblings:"
    for e in "${errors[@]}"; do echo "  - $e"; done
    echo "Each entry under a .claude folder needs a sibling symlink in .codex, e.g.:"
    echo "  (cd <component>/.codex && ln -s ../.claude/<name> <name> && git add <name>)"
    return 1
  fi
}

check_codex_symlinks

# Get all staged files (excluding deleted), relative to yarn-project
staged_files=$(git diff-index --diff-filter=d --relative --cached --name-only HEAD)

[ -z "$staged_files" ] && exit 0

# Filter for formattable files
staged_format_files=$(echo "$staged_files" | grep -E '\.(json|js|mjs|cjs|ts)$' || true)

# Drop symlinks; prettier errors when handed a symbolic link (e.g. .codex/settings.json).
if [[ -n "$staged_format_files" ]]; then
  staged_format_files=$(echo "$staged_format_files" | while IFS= read -r f; do [ -L "$f" ] || printf '%s\n' "$f"; done)
fi

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
