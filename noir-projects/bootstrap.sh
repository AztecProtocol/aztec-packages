#!/usr/bin/env bash
# TODO: Testing aztec.nr/contracts requires TXE, so must be pushed to after the final yarn project build.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

function build {
  github_group "noir-projects build"

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

  parallel --tag --line-buffered --joblog joblog.txt --halt now,fail=1 denoise "./{}/bootstrap.sh $cmd" ::: \
    mock-protocol-circuits \
    noir-protocol-circuits \
    noir-contracts

  github_endgroup
}

case "$cmd" in
  full|fast|ci|test|"")
    build
    ;;
  "test-cmds")
    parallel -k ./{}/bootstrap.sh test-cmds ::: noir-protocol-circuits noir-contracts aztec-nr
    ;;
  "hash")
    cache_content_hash .rebuild_patterns ../noir/.rebuild_patterns
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac
