#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

$ci3/github/group "noir-projects yarn"
# TODO: Remove yarn, use bash?
yarn install
$ci3/github/endgroup

export AZTEC_CACHE_REBUILD_PATTERNS={../noir,../barretenberg/cpp,noir-protocol-circuits,mock-protocol-circuits,noir-contracts}/.rebuild_patterns
VKS_HASH=$($ci3/cache/content_hash)

export AZTEC_CACHE_REBUILD_PATTERNS={../noir,noir-protocol-circuits,mock-protocol-circuits,noir-contracts}/.rebuild_patterns
CIRCUITS_HASH=$($ci3/cache/content_hash)

$ci3/github/group "noir-projects build"
# Attempt to just pull artefacts from CI first.
if [ -z "${USE_CACHE:-}" ] || ! ./bootstrap_cache_circuits.sh ; then
  parallel --line-buffer --tag {} ::: {noir-contracts,noir-protocol-circuits,mock-protocol-circuits}/bootstrap_circuits.sh
  $ci3/cache/upload noir-projects-circuits-$CIRCUITS_HASH.tar.gz {noir-contracts,noir-protocol-circuits,mock-protocol-circuits}/target
fi

if [ -z "${USE_CACHE:-}" ] || ! ./bootstrap_cache_vks.sh ; then
  parallel --line-buffer --tag {} ::: {noir-contracts,noir-protocol-circuits,mock-protocol-circuits}/bootstrap_vks.sh
  $ci3/cache/upload noir-projects-vks-$VKS_HASH.tar.gz noir-contracts/target {noir-protocol-circuits,mock-protocol-circuits}/target/keys
fi
$ci3/github/endgroup

if $ci3/base/is_test && $ci3/cache/should_run noir-projects-tests-$CIRCUITS_HASH; then
  $ci3/github/group "noir-projects test"
  NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}

  (cd ./noir-protocol-circuits && $NARGO fmt --check && $NARGO test --silence-warnings)
  (cd ./mock-protocol-circuits && $NARGO fmt --check)
  (cd ./noir-contracts && $NARGO fmt --check)
  (cd ./aztec-nr && $NARGO fmt --check)
  $ci3/cache/upload_flag noir-projects-tests-$CIRCUITS_HASH
  # Testing aztec.nr/contracts requires TXE, so must be pushed to after the final yarn project build.
  $ci3/github/endgroup
fi