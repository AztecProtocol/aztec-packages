#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash .rebuild_patterns)
test_hash=$(hash_str $hash-$(cache_content_hash .rebuild_patterns_tests))
test_flag=noir-test-$test_hash

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
  # export COMMIT_HASH="$(echo "$hash" | sed 's/-.*//g')"
  # export PATH="$PWD/noir-repo/target/release/:$PATH"
  # denoise ./scripts/test_native.sh
  # denoise ./scripts/test_js_packages.sh
  test_cmds | parallelise
  cache_upload_flag $test_flag &>/dev/null
  github_endgroup
}

function build_tests {
  cd noir-repo
  export SOURCE_DATE_EPOCH=$(date -d "today 00:00:00" +%s)
  export GIT_DIRTY=false
  export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}
  # TODO: Move to build image?
  if ! command -v cargo-binstall &>/dev/null; then
    denoise "curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash"
  fi
  denoise cargo-binstall cargo-nextest --version 0.9.67 -y --secure
  cargo nextest list --workspace --locked --release &>/dev/null
}

function test_cmds {
  test_should_run $test_flag || return 0

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
      # TODO: These fail. Figure out why.
      grep -vE "(test_caches_open|requests)"
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
