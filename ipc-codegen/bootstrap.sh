#!/usr/bin/env bash
# Codegen tool: generates bindings from committed JSON schemas.
# Zero npm dependencies — runs with just Node.js (v22+).
#
# Usage:
#   ./bootstrap.sh           # Run codegen (generate all bindings)
#   ./bootstrap.sh generate  # Same
#   ./bootstrap.sh test      # Run the cross-language wire-compat test matrix
#   ./bootstrap.sh hash      # Print content hash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash includes codegen source AND committed schema files.
export hash=$(cache_content_hash .rebuild_patterns)

NODE_FLAGS="--experimental-strip-types --experimental-transform-types --no-warnings"

gen() { node $NODE_FLAGS src/generate.ts "$@"; }

function generate {
  echo_header "codegen generate"

  # In this PR, only the echo example wires up codegen output.
  # Service consumers (bb, wsdb, cdb, avm) are added by later PRs as they migrate
  # from the legacy cbind generator. Until then, schemas live committed under
  # schemas/ and the only consumer of codegen output is the echo test harness.
  examples/echo-schema/generate.sh
}

function test {
  echo_header "codegen test"
  examples/scripts/run_cross_language_tests.sh
}

case "$cmd" in
  ""|generate)
    generate
    ;;
  test)
    test
    ;;
  hash)
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
