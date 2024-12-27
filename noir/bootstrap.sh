#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash .rebuild_patterns)
test_hash=$(cache_content_hash .rebuild_patterns .rebuild_patterns_tests)

function build {
  github_group "noir build"
  # Downloads and checks for valid nargo and packages.
  if ! cache_download noir-$hash.tar.gz; then
    # Fake this so artifacts have a consistent hash in the cache and not git hash dependent
    export COMMIT_HASH="$(echo "$hash" | sed 's/-.*//g')"
    parallel denoise ::: ./scripts/bootstrap_native.sh ./scripts/bootstrap_packages.sh
    cache_upload noir-$hash.tar.gz noir-repo/target/release/nargo noir-repo/target/release/acvm packages
  fi
  github_endgroup
}

function test {
  github_group "noir test"
  # TODO: js packages
  test_cmds | parallelise
  github_endgroup
}

function build_tests {
  github_group "noir build tests"
  cd noir-repo
  export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}
  export SOURCE_DATE_EPOCH=$(git show -s --format=%ct $GIT_COMMIT)
  export GIT_DIRTY=false
  # TODO: Move to build image?
  if ! command -v cargo-binstall &>/dev/null; then
    denoise "curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash"
  fi
  denoise cargo-binstall cargo-nextest --version 0.9.67 -y --secure
  denoise "cargo nextest list --workspace --locked --release >/dev/null"
  github_endgroup
}

function test_cmds {
  export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}
  export SOURCE_DATE_EPOCH=$(git show -s --format=%ct $GIT_COMMIT)
  export GIT_DIRTY=false

  cd noir-repo
  cargo nextest list --workspace --locked --release -Tjson-pretty | \
      jq -r '
        .["rust-suites"][] |
        .testcases as $tests |
        .["binary-path"] as $binary |
        $tests |
        to_entries[] |
        select(.value.ignored == false and .value["filter-match"].status == "matches") |
        "noir/scripts/run_test.sh \($binary) \(.key)"' | \
      sed "s|$PWD/target/release/deps/||" | \
      # TODO: These fail. Figure out why.
      grep -vE "(test_caches_open|requests)" | \
      awk "{print \"$test_hash \" \$0 }"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "ci")
    build
    build_tests
    ;;
  "build-tests")
    build_tests
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
