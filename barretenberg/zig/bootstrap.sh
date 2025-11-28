#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash depends on ts because ts generates the Zig bindings
hash=$(hash_str $(../ts/bootstrap.sh hash) $(cache_content_hash .))

function build {
  echo_header "barretenberg-zig build"

  if ! cache_download barretenberg-zig-$hash.tar.gz; then
    # Generate Zig bindings from msgpack schema (uses ts-node, no build needed)
    (cd ../ts && yarn generate)

    # Build the library
    zig build

    # Upload build artifacts and generated source files to cache
    cache_upload barretenberg-zig-$hash.tar.gz .zig-cache zig-out src/generated_types.zig src/api.zig
  fi
}

function test_cmds {
  local prefix=$hash
  echo "$prefix barretenberg/zig/scripts/run_test.sh"
}

function test {
  echo_header "barretenberg-zig test"

  # Run all Zig tests
  zig build test
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  bench|bench_cmds)
    # Empty handling just to make this command valid.
    ;;
  test|test_cmds)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
