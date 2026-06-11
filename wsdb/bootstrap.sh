#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
WSDB_BINARY=aztec-wsdb

hash=$(hash_str \
  $(../barretenberg/cpp/bootstrap.sh hash) \
  $(../ipc-runtime/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns))

function generate_ts_package {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/wsdb/wsdb_schema.json" \
    --lang ts \
    --client \
    --out "$ROOT/wsdb/ts/src/generated" \
    --prefix Wsdb \
    --strip-method-prefix \
    --package "$ROOT/wsdb/ts" \
    --package-name @aztec/wsdb \
    --binary-name "$WSDB_BINARY" \
    --package-transports uds,shm \
    --package-ipc-path-args 'msgpack,run,--input,{path}'
}

function copy_native {
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$ROOT/barretenberg/cpp/build/bin/$WSDB_BINARY" "$target_dir/$WSDB_BINARY"
}

function copy_cross {
  if [ -n "${1:-}" ]; then
    local cross_arch="$1"
    mkdir -p "ts/build/$cross_arch"
    cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/$WSDB_BINARY" "ts/build/$cross_arch/$WSDB_BINARY"
  elif semver check "${REF_NAME:-}" && [ "$(arch)" == "amd64" ]; then
    for cross_arch in arm64-linux amd64-macos arm64-macos; do
      mkdir -p "ts/build/$cross_arch"
      cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/$WSDB_BINARY" "ts/build/$cross_arch/$WSDB_BINARY"
    done
  else
    echo "This task is expected to be run with an explicit arch or in an x86 release context."
  fi
}

function build {
  echo_header "wsdb build"
  generate_ts_package
  copy_native
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh "$(arch)-$(os)=build/$(arch)-$(os)/$WSDB_BINARY")
}

function clean {
  rm -rf ts node_modules
}

function release {
  generate_ts_package
  copy_native
  copy_cross
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f generate_ts_package copy_native copy_cross build clean release

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
