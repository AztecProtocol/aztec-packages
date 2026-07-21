#!/usr/bin/env bash
# Bootstrap + test entry for the .claude/ tooling directory. Mirrors the shape
# used by ci3/bootstrap.sh: emits test commands via `test_cmds`, runs them via
# `test`. Keeps hook scripts and their tests as a self-contained component.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash everything agents_symlink_test inspects, not just .claude/: the .codex mirrors and the root
# AGENTS.md/CLAUDE.md symlinks live outside .claude/, so a change there must still rerun the test.
hash=$(cache_content_hash "^.*.claude" "^.*.codex" "^AGENTS.md" "^CLAUDE.md")

function test_cmds {
  # source_base cd's us into .claude/, so glob relative-to-here, but emit paths
  # relative to the git root (same convention used by ci3/bootstrap.sh).
  for f in tests/*; do
    [[ -x "$f" ]] || continue
    echo "$hash ./.claude/$f"
  done
}

function test {
  echo_header ".claude tests"
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "")
    test
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
