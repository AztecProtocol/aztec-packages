#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/kvdb"
NAPI_BINARY=nodejs_module.node

hash=$(hash_str \
  $(../lmdblib/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns))

# Build the NAPI addon. kvdb is barretenberg-free: it links only the lmdblib
# sibling package's archives (+ lmdb, node-addon-api). lmdblib is assumed prebuilt.
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target nodejs_module
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$build_dir/lib/$NAPI_BINARY" "$target_dir/$NAPI_BINARY"
}

function build {
  echo_header "kvdb build"
  build_native
  # Create the per-arch workspace packages BEFORE installing: npm_install_deps does
  # a clean `yarn install --immutable` on a cache miss, and the @aztec/kvdb-<arch>
  # optionalDependencies must resolve to these local workspaces (not npm) or the
  # install 404s.
  (cd ts && ./scripts/prepare_arch_packages.sh "$(arch)-$(os)=build/$(arch)-$(os)/$NAPI_BINARY")
  npm_install_deps
  yarn build
}

function clean {
  rm -rf ts/dest ts/build ts/packages ts/node_modules node_modules cpp/build
}

function release {
  build_native
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f build_native build clean release

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
