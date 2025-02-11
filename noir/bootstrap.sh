#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

export hash=$(cache_content_hash .rebuild_patterns)
export test_hash=$(cache_content_hash .rebuild_patterns .rebuild_patterns_tests)

export js_projects="
  @noir-lang/acvm_js
  @noir-lang/types
  @noir-lang/noirc_abi
  @noir-lang/noir_codegen
  @noir-lang/noir_js
"
export js_include=$(printf " --include %s" $js_projects)

# Must be in dependency order.
package_dirs=(
  types
  noir_js
  noir_codegen
  noirc_abi
  acvm_js
)

# Fake this so artifacts have a consistent hash in the cache and not git hash dependent.
export GIT_COMMIT="0000000000000000000000000000000000000000"
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS="-Dwarnings"

# Builds nargo, acvm and profiler binaries.
function build_native {
  set -euo pipefail
  cd noir-repo
  if cache_download noir-$hash.tar.gz; then
    return
  fi
  parallel --tag --line-buffer --halt now,fail=1 ::: \
    "cargo fmt --all --check" \
    "cargo build --locked --release --target-dir target" \
    "cargo clippy --target-dir target/clippy --workspace --locked --release"
  cache_upload noir-$hash.tar.gz target/release/nargo target/release/acvm target/release/noir-profiler
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
    tar zxfv noir-repo/$p/package.tgz -C packages
    mv packages/package packages/${project#*/}
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

function test_example {
  local test="$1"
  export PATH="$root/noir/noir-repo/target/release:${PATH}"
  export BACKEND="$root/barretenberg/cpp/build/bin/bb"
  cd "noir-repo/examples/$test"
  ./test.sh
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
  # This is a test as it runs over our test programs (format is usually considered a build step).
  echo "$test_hash noir/bootstrap.sh format --check"
  # We need to include these as they will go out of date otherwise and externals use these examples.
  local example_test_hash=$(hash_str $test_hash-$(../barretenberg/cpp/bootstrap.sh hash))
  echo "$example_test_hash noir/bootstrap.sh test_example codegen_verifier"
  echo "$example_test_hash noir/bootstrap.sh test_example prove_and_verify"
  echo "$example_test_hash noir/bootstrap.sh test_example recursion"
}

function format {
  # WORKTODO(adam) should this call cargo fmt?
  # Check format of noir programs in the noir repo.
  export PATH="$(pwd)/noir-repo/target/release:${PATH}"
  arg=${1:-}
  cd noir-repo/test_programs
  if [ "$arg" = "--check" ]; then
    # different passing of check than nargo fmt
    ./format.sh check
  else
    ./format.sh
  fi
  cd ../noir_stdlib
  nargo fmt $arg
}

function release_packages {
  local dist_tag=$1
  local version=$2
  cd packages

  for package in ${package_dirs[@]}; do
    local path="$package"
    [ ! -d "$path" ] && echo "Project path not found: $path" && exit 1
    cd $path

    # Rename package name @aztec/noir-<package> and update version.
    jq ".name |= \"@aztec/noir-$package\"" package.json >tmp.json
    mv tmp.json package.json
    jq --arg v $version '.version = $v' package.json >tmp.json
    mv tmp.json package.json

    deploy_npm $dist_tag $version
    cd ..
  done
}

function release {
  release_packages latest ${REF_NAME#v}
}

function release_commit {
  release_packages next "$CURRENT_VERSION-commit.$COMMIT_HASH"
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
  build_native|build_packages|format|test|release|release_commit|test_example)
    $cmd $@
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
