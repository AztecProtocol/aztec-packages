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
  cmake --build "$build_dir" --target lmdblib
}

function build {
  echo_header "lmdblib build"
  build_native
}

function clean {
  rm -rf cpp/build
}

export -f build_native build clean

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
