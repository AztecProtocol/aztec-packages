#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Format check across all workspaces. CI runs this via the root Makefile's
# noir-projects-format-check target, ordered before the subproject builds so the nargo
# dependency cache is warm by the time they run.
function format_check {
  # nargo downloads its git dependencies (e.g. noir-lang/poseidon) on first use.
  # Under heavy parallel CI load the VPC DNS resolver drops lookups
  # ("Could not resolve host: github.com"), leaving a half-cloned dependency dir
  # that then fails with "Cannot read file .../Nargo.toml". Retry the download,
  # wiping the partial dependency cache after a failure so the next attempt
  # re-clones cleanly. A warm cache is left intact on success.
  local nargo=$root/noir/noir-repo/target/release/nargo
  local fmt_check="( set -e; for dir in noir-contracts noir-protocol-circuits mock-protocol-circuits aztec-nr protocol-fuzzer/contracts; do (cd \"\$dir\" && \"$nargo\" fmt --check); done )"
  RETRY_SLEEP=10 retry "$fmt_check || { rm -rf \"\$HOME/nargo\"; exit 1; }"
}

function build {
  echo_header "noir-projects build"

  # Use fmt as a trick to download dependencies.
  # Otherwise parallel runs of nargo will trip over each other trying to download dependencies.
  # Also doubles up as our formatting check.
  function prep {
    set -eu
    (cd noir-protocol-circuits && yarn && node ./scripts/generate_variants.js)
    format_check
  }
  export -f prep format_check

  denoise prep

  parallel --tag --line-buffered --joblog joblog.txt --halt now,fail=1 denoise "'./{}/bootstrap.sh $cmd'" ::: \
    mock-protocol-circuits \
    noir-protocol-circuits \
    noir-contracts \
    aztec-nr
}

# Local-dev entry only (via ./bootstrap.sh test). CI does not run this aggregate:
# the root Makefile wires each subproject's test_cmds individually, so a new
# suite must also get a Makefile target to run in CI.
function test_cmds {
  parallel -k ./{}/bootstrap.sh test_cmds ::: noir-protocol-circuits noir-contracts aztec-nr contract-snapshots
}

function test {
  echo_header "noir-projects test"
  test_cmds | filter_test_cmds | parallelize
}

function format {
    parallel -k ./{}/bootstrap.sh format ::: noir-protocol-circuits noir-contracts aztec-nr
}

function pin-build {
  echo_header "noir-projects pin-build"
  parallel --tag --line-buffered --halt now,fail=1 './{}/bootstrap.sh pin-build' ::: \
    mock-protocol-circuits \
    noir-protocol-circuits
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    hash_str $(../noir/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns)
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
