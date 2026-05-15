#!/usr/bin/env bash
# IPC codegen package.
# Generates IPC bindings from committed JSON schemas under schemas/, in TS, C++,
# Rust and Zig. Zero npm dependencies — runs with just Node.js (v22+).
#
# The build's only consumer is its own cross-language test harness under
# examples/. Service consumers (bb, wsdb, cdb, avm) are wired up by their
# own bootstrap scripts, which invoke `ipc-codegen/bootstrap.sh build` as
# a build-time prerequisite.

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)

NODE_FLAGS="--experimental-strip-types --experimental-transform-types --no-warnings"

gen() { node $NODE_FLAGS src/generate.ts "$@"; }

function build {
  echo_header "ipc-codegen build (generate echo example bindings)"

  # Service generation (bb, wsdb, cdb, avm) is invoked by each service's own
  # bootstrap. The build step here only generates the echo example bindings,
  # which the test harness consumes.
  examples/echo-schema/generate.sh
}

function test_cmds {
  # Single test command: the 4-language echo wire-compat matrix.
  # Needs CPUS so the cargo + zig builds inside run_cross_language_tests.sh
  # have headroom, and TIMEOUT for the cold-cache first run.
  echo "$hash:CPUS=4:TIMEOUT=600s ipc-codegen/examples/scripts/run_cross_language_tests.sh"
}

function test {
  echo_header "ipc-codegen test"
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
