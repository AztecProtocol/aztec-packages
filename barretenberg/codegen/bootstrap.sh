#!/usr/bin/env bash
# Codegen tool: generates bindings from committed JSON schemas.
# Zero npm dependencies — runs with just Node.js (v22+).
#
# Usage:
#   ./bootstrap.sh           # Run codegen (generate bindings)
#   ./bootstrap.sh generate  # Same
#   ./bootstrap.sh hash      # Print content hash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash includes codegen source AND committed schema files.
export hash=$(cache_content_hash .rebuild_patterns)

NODE_FLAGS="--experimental-strip-types --experimental-transform-types --no-warnings"

function generate {
  echo_header "codegen generate"
  node $NODE_FLAGS src/generate.ts
}

case "$cmd" in
  ""|generate)
    generate
    ;;
  hash)
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
