#!/usr/bin/env bash
# Skill tooling for .claude/ skills system.
# Usage:
#   ./bootstrap.sh skills              Compile all skill.gen.* files into SKILL.md
#   ./bootstrap.sh skill <name> [args] Run a skill via claude CLI
set -euo pipefail

# Don't cd into .claude/, stay in caller's directory.
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

# Recognized generator extensions.
generator_extensions="ts js mjs sh"

function skills {
  echo "Discovering skill generators..."

  local generators=()
  local errors=0

  # Find all skill.gen.* files under any .claude/skills/ directory.
  while IFS= read -r -d '' gen_file; do
    local ext="${gen_file##*.}"
    local valid=false
    for allowed in $generator_extensions; do
      if [[ "$ext" == "$allowed" ]]; then
        valid=true
        break
      fi
    done
    if ! $valid; then
      echo "SKIP: $gen_file (unrecognized extension .$ext)"
      continue
    fi
    generators+=("$gen_file")
  done < <(find "$root" -path '*/.claude/skills/*/skill.gen.*' -type f -print0 2>/dev/null)

  if [[ ${#generators[@]} -eq 0 ]]; then
    echo "No skill generators found."
    return 0
  fi

  # Validate-all pass: ensure at most one generator per skill directory.
  declare -A dir_counts
  for gen_file in "${generators[@]}"; do
    local dir
    dir=$(dirname "$gen_file")
    dir_counts["$dir"]=$(( ${dir_counts["$dir"]:-0} + 1 ))
  done
  for dir in "${!dir_counts[@]}"; do
    if [[ ${dir_counts[$dir]} -gt 1 ]]; then
      echo "ERROR: Multiple skill.gen.* files in $dir"
      errors=1
    fi
  done
  if [[ $errors -ne 0 ]]; then
    echo "Validation failed. Fix errors above before running generators."
    return 1
  fi

  # Execute pass.
  local processed=0
  local skipped=0
  local errored=0

  for gen_file in "${generators[@]}"; do
    local skill_dir skill_md skill_name
    skill_dir=$(dirname "$gen_file")
    skill_md="$skill_dir/SKILL.md"
    skill_name=$(basename "$skill_dir")

    echo -n "Running: $skill_name ... "

    # Execute the generator. Stdout becomes the entire SKILL.md.
    local output err_file
    err_file=$(mktemp)
    if ! output=$("$gen_file" 2>"$err_file"); then
      echo "ERROR"
      head -5 "$err_file"
      rm -f "$err_file"
      errored=$((errored + 1))
      continue
    fi
    rm -f "$err_file"

    if [[ -z "$output" ]]; then
      echo "skip (empty output)"
      skipped=$((skipped + 1))
      continue
    fi

    # Write generator output as the entire SKILL.md.
    printf '%s\n' "$output" > "$skill_md"

    echo "ok"
    processed=$((processed + 1))
  done

  echo ""
  echo "Summary: $processed processed, $skipped skipped, $errored errored"
  [[ $errored -gt 0 ]] && return 1
  return 0
}

function skill {
  local name="${1:?Usage: bootstrap.sh skill <name> [args...]}"
  shift

  if ! command -v claude >/dev/null 2>&1; then
    echo "Error: claude CLI not found in PATH."
    echo "Install: https://docs.anthropic.com/en/docs/claude-code"
    exit 1
  fi

  # Search for skill by directory name across all .claude/skills/ directories.
  local matches=()
  local match_dirs=()
  while IFS= read -r -d '' skill_md; do
    local skill_dir dir_name
    skill_dir=$(dirname "$skill_md")
    dir_name=$(basename "$skill_dir")
    if [[ "$dir_name" == "$name" ]]; then
      matches+=("$skill_md")
      # Working directory is the parent of the .claude/ directory containing the skill.
      local claude_dir
      claude_dir=$(dirname "$(dirname "$skill_dir")")
      match_dirs+=("$claude_dir")
    fi
  done < <(find "$root" -path '*/.claude/skills/*/SKILL.md' -type f -print0 2>/dev/null)

  if [[ ${#matches[@]} -eq 0 ]]; then
    echo "Error: No skill named '$name' found."
    echo "Available skills:"
    find "$root" -path '*/.claude/skills/*/SKILL.md' -type f 2>/dev/null | while read -r f; do
      basename "$(dirname "$f")"
    done | sort -u | sed 's/^/  /'
    exit 1
  fi

  if [[ ${#matches[@]} -gt 1 ]]; then
    echo "Error: Ambiguous skill name '$name'. Found in multiple locations:"
    printf '  %s\n' "${matches[@]}"
    exit 1
  fi

  local work_dir="${match_dirs[0]}"
  local cmd_args=(-p "/$name $*")

  if [[ "${CI_CLAUDE_DANGER:-}" == "1" ]]; then
    echo "WARNING: CI_CLAUDE_DANGER=1 — running with --dangerously-skip-permissions"
    cmd_args+=(--dangerously-skip-permissions)
  fi

  echo "Running skill '$name' from $work_dir"
  cd "$work_dir"
  exec claude "${cmd_args[@]}"
}

# Command routing.
cmd="${1:-}"
if [[ -n "$cmd" ]]; then
  shift
fi

case "$cmd" in
  skills)
    skills "$@"
    ;;
  skill)
    skill "$@"
    ;;
  *)
    echo "Usage: .claude/bootstrap.sh <command>"
    echo ""
    echo "Commands:"
    echo "  skills              Compile all skill.gen.* files into SKILL.md"
    echo "  skill <name> [args] Run a skill via claude CLI"
    exit 1
    ;;
esac
