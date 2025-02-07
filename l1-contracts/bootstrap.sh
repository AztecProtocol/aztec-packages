#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# We rely on noir-projects for the verifier contract.
export hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir-projects/noir-protocol-circuits \
  ../barretenberg/cpp/.rebuild_patterns
)

function build {
  echo_header "l1-contracts build"
  local artifact=l1-contracts-$hash.tar.gz
  if ! cache_download $artifact; then
    # Clean
    rm -rf broadcast cache out serve generated

    # Install
    forge install --no-commit

    # Ensure libraries are at the correct version
    git submodule update --init --recursive ./lib

    mkdir -p generated
    # Copy from noir-projects. Bootstrap must have ran in noir-projects.
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

    # Step 1.5: Output storage information for the rollup contract.
    forge inspect src/core/Rollup.sol:Rollup storage > ./out/Rollup.sol/storage.json

    # Step 2: Build the the generated verifier contract with optimization.
    forge build $(find generated -name '*.sol') \
      --optimize \
      --optimizer-runs 200

    cache_upload $artifact out
  fi
}

function test_cmds {
  echo "$hash cd l1-contracts && solhint --config ./.solhint.json \"src/**/*.sol\""
  echo "$hash cd l1-contracts && forge fmt --check"
  echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest"
}

function test {
  echo_header "l1-contracts test"
  test_cmds | filter_test_cmds | parallelise
}

function release_git_push {
  local ref_name="${REF_NAME:?REF_NAME not set but should have been resolved by source_refname}"
  local mirrored_repo_url="git@github.com:AztecProtocol/l1-contracts.git"
  # Initialize a new git repository, create an orphan branch, commit, and tag.
  git init >/dev/null
  git checkout -b $COMMIT_HASH &>/dev/null
  git add .
  git commit -m "Release $ref_name." >/dev/null
  git tag -a "$ref_name" -m "Release $ref_name."
  git remote add origin "$mirrored_repo_url" >/dev/null
  # Force push the tag.
  git push origin --quiet --force "$ref_name" --tags
  echo "Release complete ($ref_name)."
}

function release {
  # Publish to own repo with current tag or branch REF_NAME.
  # We support one use-case - using foundry to install our contracts from a certain tag.
  # We take the our l1 contracts content, create an orphaned branch on aztecprotocol/l1-contracts,
  # and push with the tag being equal to REF_NAME.
  echo_header "l1-contracts release"

  # Clean up our release directory.
  rm -rf release-out && mkdir release-out

  # Copy our git files to our release directory.
  git archive HEAD | tar -x -C release-out

  # Copy from noir-projects. Bootstrap must have ran in noir-projects.
  cp ../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol release-out/src/HonkVerifier.sol

  cd release-out
  release_git_push
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
  "test")
    test
    ;;
  "release")
    release
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
