#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Format check across the labs workspaces. CI runs this via the root Makefile's
# noir-projects-labs-format-check target. The check also warms the shared nargo
# dependency cache — parallel nargo runs trip over each other downloading — so
# it is ordered before the subproject builds.
function format_check {
  # nargo downloads its git dependencies (e.g. noir-lang/poseidon) on first use.
  # Under heavy parallel CI load the VPC DNS resolver drops lookups
  # ("Could not resolve host: github.com"), leaving a half-cloned dependency dir
  # that then fails with "Cannot read file .../Nargo.toml". Retry the download,
  # dropping only the dependencies that never finished cloning so the next
  # attempt re-fetches just those. Completed clones are kept: protocol_types is
  # served from a several-hundred-megabyte clone of aztec-packages, so wiping
  # the whole cache on each attempt costs far more than the flake it works
  # around. Cache layout is $HOME/nargo/<host>/<org>/<repo>/<ref>, and a clone
  # that did not complete has no resolvable HEAD.
  local nargo=$root/labs-aztec-toolchain/bin/nargo
  local fmt_check="( set -e; for dir in noir-contracts aztec-nr; do (cd \"\$dir\" && \"$nargo\" fmt --check); done )"
  local drop_partial_clones="for dep in \"\$HOME\"/nargo/*/*/*/*; do [ -d \"\$dep\" ] || continue; git -C \"\$dep\" rev-parse --verify --quiet HEAD >/dev/null 2>&1 || rm -rf \"\$dep\"; done"
  RETRY_SLEEP=10 retry "$fmt_check || { $drop_partial_clones; exit 1; }"
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
