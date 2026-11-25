#!/usr/bin/env bash
# Prints the files outside docs/ that the docs quote with #include_code, one ^<path> pattern per line: with
# docs/.rebuild_patterns, the inputs the Makefile's docs target is keyed by. Snippets under labs/ come from the
# aztec-node commit docs/aztec-node.json pins, which ^docs/ already keys,
# as it does the snippets under docs/.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
dirs=(docs docs-developers docs-operate docs-participate developer_versioned_docs network_versioned_docs)
[ -d lines ] && dirs+=(lines)
# grep fails on a batch of files with no #include_code in it, which is no error here.
{ find "${dirs[@]}" -type f -name "*.md*" -exec grep -h '^#include_code' {} + || true; } |
  awk '{ gsub("^/", "", $3); if ($3 !~ /^(labs|docs)\//) print "^" $3 }' | sort -u
