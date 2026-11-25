#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/lmdblib"

# Only for `./bootstrap.sh hash`, which kvdb's and wsdb's still chain. The build itself is keyed and cached as the
# lmdblib make step.
hash=$(hash_str \
  $(cache_content_hash .rebuild_patterns))

# Build liblmdblib.a and its tests, unconditionally, installing them into $STEP_OUT (ci3-out/lmdblib): the lmdblib
# make step restores them from the cache instead when it can. lmdblib is barretenberg-free: it builds against its own
# deps (lmdb, msgpack-c) only. The kvdb NAPI addon and the wsdb service compile its sources themselves.
function build_native {
  echo_header "lmdblib build"
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target lmdblib lmdblib_tests
  cp "$build_dir/lib/liblmdblib.a" "$build_dir/lmdblib_tests" "${STEP_OUT:?run through make: make lmdblib}/"
}

# Through make, so the build is restored from the cache when it can be.
function build {
  make -C "$root" lmdblib
}

# Emit test commands for the CI test engine (one self-contained gtest binary), keyed by the lmdblib-tests make step.
function test_cmds {
  echo "${STEP_KEY:-disabled-cache}:CPUS=2:TIMEOUT=120s native-packages/lmdblib/ci3-out/lmdblib/lmdblib_tests"
}

# Manual: build then run the tests directly.
function test {
  echo_header "lmdblib test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf cpp/build ci3-out
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
