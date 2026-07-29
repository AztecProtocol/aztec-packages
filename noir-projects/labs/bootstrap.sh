#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Format check across the labs workspaces. CI runs this via the root Makefile's
# noir-projects-format-check target, which runs the fnd and labs checks serially:
# both warm the shared nargo dependency cache, and parallel nargo runs trip over
# each other downloading. Ordered before the subproject builds so the cache is
# warm by the time they run.
function format_check {
  # nargo downloads its git dependencies (e.g. noir-lang/poseidon) on first use.
  # Under heavy parallel CI load the VPC DNS resolver drops lookups
  # ("Could not resolve host: github.com"), leaving a half-cloned dependency dir
  # that then fails with "Cannot read file .../Nargo.toml". Retry the download,
  # wiping the partial dependency cache after a failure so the next attempt
  # re-clones cleanly. A warm cache is left intact on success.
  local nargo=$root/labs-aztec-toolchain/bin/nargo
  local fmt_check="( set -e; for dir in noir-contracts aztec-nr protocol-fuzzer/contracts; do (cd \"\$dir\" && \"$nargo\" fmt --check); done )"
  RETRY_SLEEP=10 retry "$fmt_check || { rm -rf \"\$HOME/nargo\"; exit 1; }"
}

function build {
  echo_header "noir-projects labs build"

  # Use fmt as a trick to download dependencies.
  # Otherwise parallel runs of nargo will trip over each other trying to download dependencies.
  # Also doubles up as our formatting check.
  export -f format_check

  denoise format_check

  parallel --tag --line-buffered --joblog joblog.txt --halt now,fail=1 denoise "'./{}/bootstrap.sh $cmd'" ::: \
    noir-contracts \
    aztec-nr
}

# Local-dev entry only (via ./bootstrap.sh test). CI does not run this aggregate:
# the root Makefile wires each subproject's test_cmds individually, so a new
# suite must also get a Makefile target to run in CI.
function test_cmds {
  parallel -k ./{}/bootstrap.sh test_cmds ::: noir-contracts aztec-nr contract-snapshots
}

function test {
  echo_header "noir-projects labs test"
  test_cmds | filter_test_cmds | parallelize
}

function format {
    parallel -k ./{}/bootstrap.sh format ::: noir-contracts aztec-nr
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
