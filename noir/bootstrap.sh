#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# WORKTODO(ci3) remove this -2
export hash=$(cache_content_hash .rebuild_patterns)-2
export test_hash=$(cache_content_hash .rebuild_patterns .rebuild_patterns_tests)

export js_projects="
  @noir-lang/acvm_js
  @noir-lang/types
  @noir-lang/noirc_abi
  @noir-lang/noir_codegen
  @noir-lang/noir_js
"
export js_include=$(printf " --include %s" $js_projects)

# Fake this so artifacts have a consistent hash in the cache and not git hash dependent.
export COMMIT_HASH="0000000000000000000000000000000000000000"
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS="-Dwarnings"

# Builds nargo and acvm binaries.
function build_native {
  set -euo pipefail
  cd noir-repo
  if cache_download noir-$hash.tar.gz; then
    return
  fi
  cargo build --release
  cache_upload noir-$hash.tar.gz target/release/nargo target/release/acvm
}

# Builds js packages.
function build_packages {
  set -euo pipefail

  if cache_download noir-packages-$hash.tar.gz; then
    cd noir-repo
    yarn install
    return
  fi

  cd noir-repo
  yarn install
  yarn workspaces foreach --parallel --topological-dev --verbose $js_include run build

  # We create a folder called packages, that contains each package as it would be published to npm, named correctly.
  # These can be useful for testing, or portaling into other projects.
  yarn workspaces foreach --parallel $js_include pack

  cd ..
  rm -rf packages && mkdir -p packages
  for project in $js_projects; do
    p=$(cd noir-repo && yarn workspaces list --json | jq -r "select(.name==\"$project\").location")
    tar zxfv noir-repo/$p/package.tgz -C packages && mv packages/package packages/${project#*/}
  done

  cache_upload noir-packages-$hash.tar.gz \
    packages \
    noir-repo/acvm-repo/acvm_js/nodejs \
    noir-repo/acvm-repo/acvm_js/web \
    noir-repo/tooling/noir_codegen/lib \
    noir-repo/tooling/noir_js/lib \
    noir-repo/tooling/noir_js_types/lib \
    noir-repo/tooling/noirc_abi_wasm/nodejs \
    noir-repo/tooling/noirc_abi_wasm/web
}

export -f build_native build_packages

function build {
  echo_header "noir build"

  # TODO: Move to build image?
  denoise ./noir-repo/.github/scripts/wasm-bindgen-install.sh
  if ! command -v cargo-binstall &>/dev/null; then
    denoise "curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash"
  fi
  if ! command -v cargo-nextest &>/dev/null; then
    denoise "cargo-binstall cargo-nextest --version 0.9.67 -y --secure"
  fi

  parallel --tag --line-buffer --halt now,fail=1 denoise ::: build_native build_packages
  # if [ -x ./scripts/fix_incremental_ts.sh ]; then
  #   ./scripts/fix_incremental_ts.sh
  # fi
}

function test {
  echo_header "noir test"
  test_cmds | filter_test_cmds | parallelise
}

# Prints the commands to run tests, one line per test, prefixed with the appropriate content hash.
function test_cmds {
  cd noir-repo
  cargo nextest list --workspace --locked --release -Tjson-pretty 2>/dev/null | \
      jq -r '
        .["rust-suites"][] |
        .testcases as $tests |
        .["binary-path"] as $binary |
        $tests |
        to_entries[] |
        select(.value.ignored == false and .value["filter-match"].status == "matches") |
        "noir/scripts/run_test.sh \($binary) \(.key)"' | \
      sed "s|$PWD/target/release/deps/||" | \
      awk "{print \"$test_hash \" \$0 }"
  echo "$test_hash cd noir/noir-repo && GIT_COMMIT=$GIT_COMMIT NARGO=$PWD/target/release/nargo yarn workspaces foreach --parallel --topological-dev --verbose $js_include run test"
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
  "build-native")
    build_native
    ;;
  "build-packages")
    build_packages
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo $hash
    ;;
  "hash-test")
    echo $test_hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
