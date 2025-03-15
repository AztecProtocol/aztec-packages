#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

set -eou pipefail

cmd=${1:-}
[ -n "$cmd" ] && shift

# Update the noir-repo before we hash its content, unless the command is exempt.
no_update=(clean make-patch bump-noir-repo-ref)
if [[ -z "$cmd" || ! ${no_update[*]} =~ "$cmd" ]]; then
  scripts/sync.sh init
  scripts/sync.sh update
fi

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
    npm_install_deps
    return
  fi

  cd noir-repo
  npm_install_deps
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

  # Find all files in packages dir and use sed to in-place replace @noir-lang with @aztec/noir-
  find packages -type f -exec sed -i 's|@noir-lang/|@aztec/noir-|g' {} \;

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
}

function format {
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
  release_packages $(dist_tag) ${REF_NAME#v}
}

# Bump the Noir repo reference on a given branch to a given ref.
# The branch might already exist, e.g. this could be a daily job bumping the version to the
# latest nightly, and we might have to deal with updating the patch file because the latest
# Noir code conflicts with the contents of the patch, or we're debugging some integration
# test failure on CI. In that case just push another commit to the branch to bump the version
# further without losing any other commit on the branch.
function bump_noir_repo_ref {
  branch=$1
  ref=$2
  git fetch --depth 1 origin $branch || true
  git checkout --track origin/$branch || git checkout $branch || git checkout -b $branch
  scripts/sync.sh write-noir-repo-ref $ref
  git add .
  git commit -m "chore: Update noir-repo-ref to $ref" || true
  do_or_dryrun git push --set-upstream origin $branch
}

case "$cmd" in
  "clean")
    # Double `f` needed to delete the nested git repository.
    git clean -ffdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  test_cmds|build_native|build_packages|format|test|release|test_example)
    $cmd "$@"
    ;;
  "hash")
    echo $hash
    ;;
  "hash-test")
    echo $test_hash
    ;;
  "make-patch")
    scripts/sync.sh make-patch
    ;;
  "bump-noir-repo-ref")
    bump_noir_repo_ref $@
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
