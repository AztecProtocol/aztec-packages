#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export hash=$(cache_content_hash .rebuild_patterns)
# TODO: Do we need this? Test binaries depend on test programs?
export test_hash=$(cache_content_hash .rebuild_patterns .rebuild_patterns_tests)

js_projects=(
  @noir-lang/acvm_js
  @noir-lang/types
  @noir-lang/noirc_abi
  @noir-lang/noir_codegen
  @noir-lang/noir_js
)
js_include=$(printf " --include %s" "${js_projects[@]}")

# Fake this so artifacts have a consistent hash in the cache and not git hash dependent.
# export GIT_COMMIT="$(echo "$hash" | sed 's/-.*//g')"
export GIT_COMMIT="0000000000000000000000000000000000000000"
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS=-Dwarnings

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

# Builds all test binaries.
function build_tests {
  set -euo pipefail
  cd noir-repo
  if cache_download noir-tests-$test_hash.tar.gz; then
    return
  fi
  cache_upload noir-tests-$test_hash.tar.gz \
    $(cargo nextest list --workspace --locked --release -Tjson-pretty | \
      jq -r '.["rust-suites"][] | .["binary-path"]' | \
      sed -e "s|$PWD/||")
}

# Builds js packages.
function build_packages {
  set -euo pipefail
  if cache_download noir-packages-$hash.tar.gz; then
    return
  fi

  cd noir-repo

  yarn install
  yarn workspaces foreach --parallel --topological-dev --verbose $js_include run build

  # We create a folder called packages, that contains each package as it would be published to npm, named correctly.
  # These can be useful for testing, or portaling into other projects.
  yarn workspaces foreach --parallel $include pack

  cd ..
  rm -rf packages && mkdir -p packages
  for project in "${js_projects[@]}"; do
    p=$(cd noir-repo && yarn workspaces list --json | jq -r "select(.name==\"$project\").location")
    tar zxfv noir-repo/$p/package.tgz -C packages && mv packages/package packages/${project#*/}
  done

  cache_upload noir-packages-$hash.tar.gz packages
}

export -f build_native build_tests build_packages

function build {
  github_group "noir build"

  # TODO: Move to build image?
  denoise ./noir-repo/.github/scripts/wasm-bindgen-install.sh
  if ! command -v cargo-binstall &>/dev/null; then
    denoise "curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash"
  fi
  if ! command -v cargo-nextest &>/dev/null; then
    denoise "cargo-binstall cargo-nextest --version 0.9.67 -y --secure"
  fi

  parallel --tag --line-buffer --halt now,fail=1 denoise ::: build_native build_tests build_packages
  # if [ -x ./scripts/fix_incremental_ts.sh ]; then
  #   ./scripts/fix_incremental_ts.sh
  # fi

  github_endgroup
}

function test {
  github_group "noir test"
  test_cmds | filter_test_cmds | parallelise
  github_endgroup
}

# Prints the commands to run tests, one line per test, prefixed with the appropriate content hash.
# Originally this used "cargo nextest list", but you can't avoid kicking off a build when you use cargo.
# So this just attempts to run "--list" on every executable in the test dir and extracts the test lines.
function test_cmds {
  find noir-repo/target/release/deps -type f -executable ! -name "*.so" | while read -r bin; do
    $bin --list 2>/dev/null | \
      grep -oP '.*(?=: test$)' | \
      awk "{print \"$test_hash noir/scripts/run_test.sh $(basename $bin) \" \$0 }" || true
  done
  echo "$test_hash cd noir/noir-repo && yarn workspaces foreach --parallel --topological-dev --verbose $js_include run test"
  # cargo nextest list --workspace --locked --release -Tjson-pretty | \
  #     jq -r '
  #       .["rust-suites"][] |
  #       .testcases as $tests |
  #       .["binary-path"] as $binary |
  #       $tests |
  #       to_entries[] |
  #       select(.value.ignored == false and .value["filter-match"].status == "matches") |
  #       "noir/scripts/run_test.sh \($binary) \(.key)"' | \
  #     sed "s|$PWD/target/release/deps/||" | \
  #     awk "{print \"$test_hash \" \$0 }"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full"|"ci")
    build
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
