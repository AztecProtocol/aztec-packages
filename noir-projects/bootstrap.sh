#!/usr/bin/env bash
# TODO: Testing aztec.nr/contracts requires TXE, so must be pushed to after the final yarn project build.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

function build {
  github_group "noir-projects build"

  # TODO: Move the build image, or better, just use devcontainer as our build container.
  # Or just normalize the protocol circuit keys to be added to the contract artifact, base64 encoded instead of hex.
  if ! command -v xxd &> /dev/null; then
    denoise "apt update && apt install -y xxd"
  fi

  # Use fmt as a trick to download dependencies.
  # Otherwise parallel runs of nargo will trip over each other trying to download dependencies.
  # Also doubles up as our formatting check.
  function prep {
    set -eu
    (cd noir-protocol-circuits && yarn && node ./scripts/generate_variants.js)
    for dir in noir-contracts noir-protocol-circuits mock-protocol-circuits aztec-nr; do
      (cd $dir && ../../noir/noir-repo/target/release/nargo fmt --check)
    done
  }
  export -f prep

  denoise prep

  parallel --tag --line-buffered --joblog joblog.txt --halt now,fail=1 ::: \
    "denoise ./mock-protocol-circuits/bootstrap.sh $cmd" \
    "denoise ./noir-protocol-circuits/bootstrap.sh $cmd" \
    "denoise ./noir-contracts/bootstrap.sh $cmd"

  github_endgroup
}

case "$cmd" in
  full|fast|ci|test|"")
    build
    ;;
  "test-cmds")
    ./noir-protocol-circuits/bootstrap.sh test-cmds
    ./noir-contracts/bootstrap.sh test-cmds
    ./aztec-nr/bootstrap.sh test-cmds
    exit
    ;;
  "hash")
    cache_content_hash .rebuild_patterns
    exit
    ;;
  *)
    echo_stderr "Unknown command: $CMD"
    exit 1
esac
