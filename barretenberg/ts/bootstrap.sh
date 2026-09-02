#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
BB_AVM_SIM_BINARY=bb-avm-sim
BB_AVM_SIM_PACKAGE=@aztec-foundation/bb-avm-sim
CDB_PACKAGE=@aztec-foundation/cdb

hash=$(hash_str \
  $(bb.js/bootstrap.sh hash) \
  $(../cpp/bootstrap.sh hash) \
  $(../../ipc-codegen/bootstrap.sh hash) \
  $(../../ipc-runtime/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns) \
  $(semver check $REF_NAME && echo 1 || echo 0))

function generate_bb_avm_sim_package {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/avm/avm_schema.json" \
    --lang ts \
    --client \
    --out "$ROOT/barretenberg/ts/bb-avm-sim/src/generated" \
    --package "$ROOT/barretenberg/ts/bb-avm-sim" \
    --package-name "$BB_AVM_SIM_PACKAGE" \
    --binary-name "$BB_AVM_SIM_BINARY" \
    --prefix Avm \
    --strip-method-prefix \
    --package-transports uds \
    --package-ipc-path-args 'msgpack,run,--input,{path}'
}

# Server binding package for the AVM CDB protocol: generated wire types +
# Handler/dispatch + the schema itself. Pure TS — no binary, no arch packages.
function generate_cdb_package {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/cdb/cdb_schema.json" \
    --lang ts \
    --server \
    --out "$ROOT/barretenberg/ts/cdb/src/generated" \
    --package "$ROOT/barretenberg/ts/cdb" \
    --package-name "$CDB_PACKAGE"
}

# Both bb-avm-sim and cdb are gitignored workspaces declared in package.json, so
# `yarn install --immutable` fails against the committed lockfile unless both exist.
# Generate them together before installing, whichever one we're about to build.
function generate_packages {
  generate_bb_avm_sim_package
  generate_cdb_package
}

function copy_bb_avm_sim_native {
  local target_dir="bb-avm-sim/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$ROOT/barretenberg/cpp/build/bin/$BB_AVM_SIM_BINARY" "$target_dir/$BB_AVM_SIM_BINARY"
}

function copy_bb_avm_sim_cross {
  if [ -n "${1:-}" ]; then
    local cross_arch="$1"
    mkdir -p "bb-avm-sim/build/$cross_arch"
    cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/$BB_AVM_SIM_BINARY" \
      "bb-avm-sim/build/$cross_arch/$BB_AVM_SIM_BINARY"
  elif semver check "${REF_NAME:-}" && [ "$(arch)" == "amd64" ]; then
    for cross_arch in arm64-linux amd64-macos arm64-macos; do
      mkdir -p "bb-avm-sim/build/$cross_arch"
      cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/$BB_AVM_SIM_BINARY" \
        "bb-avm-sim/build/$cross_arch/$BB_AVM_SIM_BINARY"
    done
  else
    echo "This task is expected to be run with an explicit arch or in an x86 release context."
  fi
}

function prepare_bb_avm_sim_arch_packages {
  (cd bb-avm-sim && ./scripts/prepare_arch_packages.sh "$@")
}

function build_bb_js {
  (cd bb.js && ./bootstrap.sh)
}

function build_bb_avm_sim {
  echo_header "bb-avm-sim package build"
  generate_packages
  copy_bb_avm_sim_native
  npm_install_deps
  yarn workspace "$BB_AVM_SIM_PACKAGE" build
  prepare_bb_avm_sim_arch_packages "$(arch)-$(os)=build/$(arch)-$(os)/$BB_AVM_SIM_BINARY"
}

# The bb and bb-avm binaries as npm packages: a meta package per binary (@aztec-foundation/bb,
# @aztec-foundation/bb-avm) over one package per platform. Native builds stage this machine's
# platform; a release stages every platform and checks each binary against the release tarball.
function build_bb_bin {
  echo_header "bb / bb-avm npm packages"
  # Stage only this machine's platform. Every-platform staging (and the parity verify) is
  # cross_copy_bb_bin, whose target depends on the cross builds and the release dir. bb-bin
  # depends only on bb-cpp-native, so during a release (REF_NAME set) an unqualified stage would
  # select every platform and fail on cross binaries that are not built yet.
  ./scripts/native_packages.sh stage bb "$(arch)-$(os)"
  ./scripts/native_packages.sh stage bb-avm "$(arch)-$(os)"
}

function cross_copy_bb_bin {
  ./scripts/native_packages.sh stage bb "$@"
  ./scripts/native_packages.sh stage bb-avm "$@"
  if [ -d ../cpp/build-release ]; then
    ./scripts/native_packages.sh verify bb
    ./scripts/native_packages.sh verify bb-avm
  fi
}

function release_bb_bin {
  local d p staged
  for d in bb-cli bb-avm-cli; do
    staged=0
    for p in "$d"/packages/*/; do
      [ -d "$p/bin" ] || continue   # a platform not built here is not published
      (cd "$p" && retry "deploy_npm ${REF_NAME#v}")
      staged=1
    done
    # The meta package is nothing without its platform packages: its optionalDependencies would
    # every one 404. Do not publish it if none were staged (e.g. a build that never ran stage).
    [ "$staged" = 1 ] || { echo "release_bb_bin: no $d platform packages staged; skipping $d" >&2; continue; }
    (cd "$d" && retry "deploy_npm ${REF_NAME#v}")
  done
}

function build_cdb {
  echo_header "cdb package build"
  generate_packages
  npm_install_deps
  yarn workspace "$CDB_PACKAGE" build
}

function build {
  build_bb_js
  build_bb_avm_sim
  build_cdb
}

function test_cmds {
  (cd bb.js && ./bootstrap.sh test_cmds)
}

function bench_cmds {
  (cd bb.js && ./bootstrap.sh bench_cmds)
}

function test {
  (cd bb.js && ./bootstrap.sh test)
}

function cross_copy_bb_js {
  (cd bb.js && ./bootstrap.sh cross_copy "$@")
}

function cross_copy_bb_avm_sim {
  generate_packages
  copy_bb_avm_sim_cross "$@"
  npm_install_deps
  yarn workspace "$BB_AVM_SIM_PACKAGE" build
  prepare_bb_avm_sim_arch_packages
}

function cross_copy {
  cross_copy_bb_js "$@"
}

function get_projects {
  echo "$PWD/bb.js"
  if [ -d bb-avm-sim ]; then
    for package_dir in bb-avm-sim/packages/*; do
      [ -d "$package_dir" ] && echo "$PWD/$package_dir"
    done
    echo "$PWD/bb-avm-sim"
  fi
  if [ -d cdb ]; then
    echo "$PWD/cdb"
  fi
}

function release_bb_avm_sim {
  generate_packages
  copy_bb_avm_sim_native
  copy_bb_avm_sim_cross
  npm_install_deps
  yarn workspace "$BB_AVM_SIM_PACKAGE" build
  prepare_bb_avm_sim_arch_packages
  for package_dir in bb-avm-sim/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd bb-avm-sim && retry "deploy_npm ${REF_NAME#v}")
}

function release_cdb {
  generate_packages
  npm_install_deps
  yarn workspace "$CDB_PACKAGE" build
  (cd cdb && retry "deploy_npm ${REF_NAME#v}")
}

function release {
  (cd bb.js && ./bootstrap.sh release)
  release_bb_avm_sim
  release_cdb
  release_bb_bin
}

export -f generate_bb_avm_sim_package copy_bb_avm_sim_native copy_bb_avm_sim_cross generate_cdb_package generate_packages
export -f build_bb_js build_bb_avm_sim build_cdb build cross_copy_bb_js cross_copy_bb_avm_sim release release_cdb

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
