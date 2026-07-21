#!/usr/bin/env bash
# PostToolUse hook: format files after Edit/Write by dispatching to the right
# formatter based on extension. Reads Claude Code's hook JSON from stdin.
#
# Never fails the edit — prints hints to stderr on missing tools and exits 0.

set -u

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

[[ -z "$file" ]] && exit 0
[[ ! -f "$file" ]] && exit 0

hint() { printf 'format-file.sh: %s\n' "$*" >&2; }

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json)
    root=""
    if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]] && [[ -f "$CLAUDE_PROJECT_DIR/yarn-project/package.json" ]]; then
      root="$CLAUDE_PROJECT_DIR"
    else
      root=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || true)
    fi
    if [[ -n "$root" && -x "$root/yarn-project/node_modules/.bin/prettier" ]]; then
      "$root/yarn-project/node_modules/.bin/prettier" --write --log-level=warn "$file" \
        || hint "prettier failed on $file"
    else
      hint "prettier not found — run yarn-project bootstrap to enable format-on-edit"
    fi
    ;;
  *.cpp|*.cxx|*.cc|*.hpp|*.hxx|*.h)
    cf=""
    if command -v clang-format-20 >/dev/null 2>&1; then
      cf=clang-format-20
    elif [[ -x /opt/homebrew/opt/llvm/bin/clang-format ]] && /opt/homebrew/opt/llvm/bin/clang-format --version 2>/dev/null | grep -q 'version 20'; then
      cf=/opt/homebrew/opt/llvm/bin/clang-format
    elif [[ -x /usr/local/opt/llvm/bin/clang-format ]] && /usr/local/opt/llvm/bin/clang-format --version 2>/dev/null | grep -q 'version 20'; then
      cf=/usr/local/opt/llvm/bin/clang-format
    fi
    if [[ -n "$cf" ]]; then
      "$cf" -i "$file" || hint "$cf failed on $file"
    else
      hint "clang-format 20 not found — install via 'apt install clang-format-20' (Linux) or 'brew install llvm' (macOS)"
    fi
    ;;
  *.rs)
    # rustfmt walks up from the file path to find .rustfmt.toml, which pins
    # edition and style. Don't pass --edition here; it would override that.
    if command -v rustfmt >/dev/null 2>&1; then
      rustfmt "$file" || hint "rustfmt failed on $file"
    else
      hint "rustfmt not found — install via 'rustup component add rustfmt'"
    fi
    ;;
  *.sol)
    if command -v forge >/dev/null 2>&1; then
      (cd "$(dirname "$file")" && forge fmt "$file") || hint "forge fmt failed on $file"
    else
      hint "forge not found — install foundry via 'curl -L https://foundry.paradigm.xyz | bash && foundryup'"
    fi
    ;;
  *.nr)
    # nargo fmt operates on whole crates, not individual files.
    hint "nargo fmt is crate-scoped — run 'nargo fmt' from the noir project directory before committing"
    ;;
esac

exit 0
