#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export hash=$(cache_content_hash .rebuild_patterns)

function build {
  github_group "l1-contracts build"
  local artifact=l1-contracts-$hash.tar.gz
  if ! cache_download $artifact; then
    # Clean
    rm -rf broadcast cache out serve generated

    # Install
    forge install --no-commit

    # Ensure libraries are at the correct version
    git submodule update --init --recursive ./lib

    mkdir -p generated
    # Copy from noir-projects. Bootstrap must hav
    local rollup_verifier_path=../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol
    if [ -f "$rollup_verifier_path" ]; then
      cp "$rollup_verifier_path" generated/HonkVerifier.sol
    else
      echo_stderr "You may need to run ./bootstrap.sh in the noir-projects folder. Could not find the rollup verifier at $rollup_verifier_path."
      exit 1
    fi

    # Compile contracts
    # Step 1: Build everything in src.
    forge build $(find src test -name '*.sol')

    # Step 2: Build the the generated verifier contract with optimization.
    forge build $(find generated -name '*.sol') \
      --optimize \
      --optimizer-runs 200

    cache_upload $artifact out
  fi
  github_endgroup
}

function test {
  set -eu
  local test_flag=l1-contracts-test-$hash
  test_should_run $test_flag || return 0

  github_group "l1-contracts test"
  solhint --config ./.solhint.json "src/**/*.sol"
  forge fmt --check
  forge test --no-match-contract UniswapPortalTest
  cache_upload_flag $test_flag
  github_endgroup
}
export -f test

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
  "test-cmds")
    echo "cd l1-contracts && forge test --no-match-contract UniswapPortalTest"
    ;;
  "ci")
    build
    denoise test
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac