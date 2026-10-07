#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/lmdblib"

hash=$(hash_str \
  $(cache_content_hash .rebuild_patterns))

# Build liblmdblib.a + liblmdb.a. lmdblib is barretenberg-free: it builds against
# its own deps (lmdb, msgpack-c) only. Both archives are consumed by the kvdb NAPI
# addon and the wsdb service.
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target lmdblib lmdblib_tests
}

function build {
  echo_header "lmdblib build"
  build_native
}

# Emit test commands for the CI test engine (one self-contained gtest binary).
function test_cmds {
  echo "$hash:CPUS=2:TIMEOUT=120s native-packages/lmdblib/cpp/build/lmdblib_tests"
}

# Manual: build then run the tests directly.
function test {
  echo_header "lmdblib test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf cpp/build
}

export -f build_native build test_cmds test clean

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
