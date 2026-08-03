#!/usr/bin/env bash
# Compiles the protocol contracts.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any

export BB=${BB:-../../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}
export BB_HASH=${BB_HASH:-$(../../../barretenberg/cpp/bootstrap.sh hash)}
export NOIR_HASH=${NOIR_HASH:-$(../../../noir/bootstrap.sh hash)}

# Set common flags for parallel.
export PARALLEL_FLAGS="-j${PARALLELISM:-16} --halt now,fail=1 --memsuspend $(memsuspend_limit)"

# Compute hash for a given contract.
# $1 is the contract name or path
function get_contract_hash {
  local contract_path=$(get_contract_path "$1")
  hash_str \
    $NOIR_HASH \
    $(cache_content_hash \
      ../../../avm-transpiler/.rebuild_patterns \
      ../../../barretenberg/cpp/.rebuild_patterns \
      ../../../barretenberg/ts/.rebuild_patterns \
      "^noir-projects/fnd/noir-contracts/contracts/$contract_path/" \
      "^noir-projects/fnd/noir-contracts/contracts/protocol/aztec_sublib/" \
      "^noir-projects/fnd/noir-protocol-circuits/crates/types/")
}
export -f get_contract_hash

# Extract contract path from Nargo.toml based on argument.
# Handles both a full path relative to contracts/ (e.g. "protocol/fee_juice_contract") and a bare
# contract name (e.g. "fee_juice_contract").
# $1 is the contract input
function get_contract_path {
  local input=$1
  local contract_path
  if [[ $input == *"/"* ]]; then
    contract_path=$input
  else
    contract_path=$(grep -oP "(?<=contracts/)[^\"]+/$input" Nargo.toml)
    if [ -z "$contract_path" ]; then
      echo "Contract $input not found in Nargo.toml" >&2
      exit 1
    fi
  fi
  echo "$contract_path"
}
export -f get_contract_path

# Stamps "dev" (DEV_VERSION) as the artifact's aztec_version - that is the expected version of a locally checked out
# monorepo. The real release version is applied at publish time by whichever path owns it:
# ci3/release_prep_package_json for npm packages, release-image/Dockerfile for the docker image.
function stamp_dev_aztec_version {
  local json_path=$1
  local tmp=$(mktemp)
  jq '.aztec_version = "dev"' "$json_path" > "$tmp"
  cat "$tmp" > "$json_path"
  rm "$tmp"
}
export -f stamp_dev_aztec_version

# This compiles a noir contract, transpiles public functions, strips internal prefixes,
# and generates verification keys for private functions via 'bb aztec_process'.
# $1 is the input package name or path. On exit its fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail

  local contract_path=$(get_contract_path "$1")
  local contract=$(grep -oP '(?<=^name = ")[^"]+' "contracts/$contract_path/Nargo.toml")
  # Calculate filename because nargo...
  local contract_name=$(cat contracts/$contract_path/src/main.nr | awk '/^contract / { print $2 } /^pub contract / { print $3 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  local contract_hash=$(get_contract_hash $1)
  if ! cache_download contract-$contract_hash.tar.gz; then
    # Aztec private app circuits intentionally defer validation of some oracle outputs (including
    # note-read requests) to the private kernels. Noir's local underconstrained and Brillig coverage
    # checks cannot see those downstream constraints. Every other diagnostic is an error:
    # the fixed PrivateCircuitPublicInputs ABI carries constant fields, and the entrypoint the
    # aztec-nr macro generates silences that one lint with #[allow(constant_return)].
    $NARGO compile \
      --package $contract \
      --inliner-aggressiveness 0 \
      --skip-underconstrained-check \
      --skip-brillig-constraints-check \
      --deny-warnings
    $BB aztec_process -i $json_path
    cache_upload contract-$contract_hash.tar.gz $json_path
  fi
  # Stamp the version after the cache block so the field is always present, whether the artifact came from a fresh
  # compile or a cache hit.
  stamp_dev_aztec_version "$json_path"
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all contracts from the root Nargo.toml and process them in parallel.
function build {
  echo_stderr "Compiling protocol contracts (bb-hash: $BB_HASH)..."
  if [ "$#" -eq 0 ]; then
    rm -rf target
    mkdir -p target
    local contracts=$(grep -oP "(?<=contracts/)[^\"]+" Nargo.toml)
  else
    local contracts="$@"
  fi
  set +e
  parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag compile {} ::: ${contracts[@]}
  code=$?
  cat joblog.txt
  return $code
}

function test_cmds {
  # Fairies want to run these tests on every PR
  if [ "${TARGET_BRANCH:-}" = "merge-train/fairies" ]; then
    $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
      echo "disabled-cache noir-projects/fnd/scripts/run_test.sh noir-contracts $package $test"
    done
  else
    local -A cache
    $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
      [ -z "${cache[$package]:-}" ] && cache[$package]=$(get_contract_hash $package)
      echo "${cache[$package]} noir-projects/fnd/scripts/run_test.sh noir-contracts $package $test"
    done
  fi
}

function test {
  test_cmds | filter_test_cmds | parallelize
}

function format {
  $NARGO fmt
}

case "$cmd" in
  "clean-keys")
    for artifact in target/*.json; do
      echo_stderr "Scrubbing vk from $artifact..."
      jq '.functions |= map(del(.verification_key))' "$artifact" > "${artifact}.tmp"
      mv "${artifact}.tmp" "$artifact"
    done
    ;;
  "")
    build
    ;;
  "compile")
    VERBOSE=${VERBOSE:-1} build "$@"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
