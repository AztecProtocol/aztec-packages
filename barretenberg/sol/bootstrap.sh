#!/usr/bin/env bash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH="../cpp/srs_db"

export hash=$(cache_content_hash \
  ^barretenberg/sol/ \
  ../cpp/.rebuild_patterns
)


function test {
    echo_header "sol testing"
    test_cmds | filter_test_cmds | parallelise 64
}

function test_cmds {
    test_cmds_internal | awk "{ print \"$hash \" \$0 }"
}

function test_cmds_internal {
    echo "cd barretenberg/sol && forge test --no-match-contract Base"
}

function download_old_crs {
  echo_header "barretenberg/sol downloading old crs"
  ../cpp/srs_db/download_ignition.sh 3
}

function build_sol {
    echo_header "barretenberg/sol building sol"

    local artifact=barretenberg-sol-$hash.tar.gz
    if ! cache_download $artifact; then

        rm -rf broadcast cache out
        forge install
        # Ensure libraries are at the correct version
        git submodule update --init --recursive ./lib

        forge fmt
        forge build

        cache_upload $artifact out
    fi
}

function build_cpp {
    echo_header "barretenberg/sol building cpp"

    local artifact=barretenberg-sol-cpp-$hash.tar.gz
    if ! cache_download $artifact; then
        cd ../cpp
        cmake --build --preset default --parallel --target honk_solidity_proof_gen honk_solidity_key_gen
        cd ../sol

        cache_upload $artifact ../cpp/build/bin/*solidity*
    fi
}

function generate_vks {
    # Only run on a cache miss
    ./scripts/init_honk.sh
}

function build_code {
    # These steps are sequential
    build_cpp
    generate_vks
    build_sol
}

export -f build_code build_cpp generate_vks build_sol download_old_crs

function build {
    echo_header "barretenberg/sol building"
    build_code

    echo "Targets built, you are good to go!"
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
  "hash")
    echo $hash
    ;;
  test|test_cmds)
    $cmd
    ;;
  "bench"|"release")
    # noop
    exit 0
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
