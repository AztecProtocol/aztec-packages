#!/usr/bin/env bash
# Some notes if you have to work on this script.
# - You can enable BUILD_SYSTEM_DEBUG=1 but the output is quite verbose that it's not much use by default.
# - You can call ./bootstrap.sh compile <contract names> to compile and process select contracts.
# - You can disable parallelism with PARALLELISM=1.
# - The exported functions called by parallel must enable their own flags at the start e.g. set -euo pipefail
# - The exported functions need to have external variables they require, to have been exported first.
# - If you want to echo something, send it to stderr e.g. echo_stderr "My debug"
# - Local assignments with sub-shells don't propagate errors e.g. local capture=$(false). Declare locals separately.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# entrypoint for docs
working_dir="${WORKING_DIR:-noir-projects/noir-contracts/contracts}"

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export STRIP_AZTEC_NR_PREFIX=${STRIP_AZTEC_NR_PREFIX:-./scripts/strip_aztec_nr_prefix.sh}
export BB_HASH=${BB_HASH:-$(../../barretenberg/cpp/bootstrap.sh hash)}
export NOIR_HASH=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}

# Set common flags for parallel.
export PARALLEL_FLAGS="-j${PARALLELISM:-16} --halt now,fail=1 --memsuspend $(memsuspend_limit)"

# Compute hash for a given contract.
# $1 is the contract name, $2 is the folder name (e.g. "contracts" or "examples")
function get_contract_hash {
  local contract_path=$(get_contract_path "$1" "$2")

  hash_str \
    $NOIR_HASH \
    $(cache_content_hash \
      ../../avm-transpiler/.rebuild_patterns \
      ../../barretenberg/cpp/.rebuild_patterns \
      ../../barretenberg/ts/.rebuild_patterns \
      "^$working_dir/$contract_path/" \
      "^noir-projects/aztec-nr/" \
      "^noir-projects/noir-protocol-circuits/crates/types/")
}
export -f get_contract_hash

# Extract contract path from Nargo.toml based on argument
# Handle both formats: full path relative to contracts/ or just contract name
# E.g. for both "ecdsa_k_account_contract" and "account/ecdsa_k_account_contractor" returns
# "account/ecdsa_k_account_contractor"
#
# $1 is the contract input, $2 is the folder name (e.g. "contracts" or "examples")
# This is done to ensure that both paths can be provided as inputs to the script.
function get_contract_path {
  local input=$1
  local folder_name=$2
  local contract_path
  if [[ $input == *"/"* ]]; then
    # Full path provided (e.g. account/ecdsa_k_account_contract)
    contract_path=$input
  else
    # Just contract name provided (e.g. ecdsa_k_account_contract)
    contract_path=$(grep -oP "(?<=$folder_name/)[^\"]+/$input" Nargo.toml)
    if [[ -z $contract_path ]]; then
      echo "Contract $input not found in Nargo.toml" >&2
      exit 1
    fi
  fi
  echo "$contract_path"
}
export -f get_contract_path

# This compiles a noir contract, transpiles public functions, and generates vk's for private functions.
# $1 is the input package name, $2 is the folder name (e.g. "contracts" or "examples")
# On exit its fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail
  local contract_name contract_hash

  local contract_path=$(get_contract_path "$1" "$2")
  local contract=${contract_path##*/}
  # Calculate filename because nargo...
  contract_name=$(cat $2/$contract_path/src/main.nr | awk '/^contract / { print $2 } /^pub contract / { print $3 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  contract_hash=$(get_contract_hash $1 $2)
  if ! cache_download contract-$contract_hash.tar.gz; then
    $NARGO compile --package $contract --inliner-aggressiveness 0 --pedantic-solving --deny-warnings
    # bb aztec_process handles both AVM transpilation and VK generation for private functions.
    # It has its own internal VK cache at ~/.bb/<version>/vk_cache/
    $BB aztec_process -i $json_path -o $json_path
    $STRIP_AZTEC_NR_PREFIX $json_path
    cache_upload contract-$contract_hash.tar.gz $json_path
  fi
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all relevant contracts from the root Nargo.toml and process them in parallel.
function build {
  echo_stderr "Compiling contracts (bb-hash: $BB_HASH)..."
  local folder_name=$(basename $working_dir)

  if [[ "$#" -eq 0 ]]; then
    rm -rf target
    local contracts=$(grep -oP "(?<=$folder_name/)[^\"]+" Nargo.toml)
  else
    local contracts="$@"
  fi
  set +e
  parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag compile {} $folder_name ::: ${contracts[@]}
  local code=$?
  cat joblog.txt
  return $code
}

function test_cmds {
  local -A cache
  local folder_name=$(basename $working_dir)

  # Test bb aztec_process command
  echo "$BB_HASH noir-projects/scripts/test_aztec_process.sh"

  local i=0
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    local port=$((45730 + (i++ % ${NUM_TXES:-1})))
    [[ -z "${cache[$package]:-}" ]] && cache[$package]=$(get_contract_hash $package $folder_name)
    echo "${cache[$package]} noir-projects/scripts/run_test.sh noir-contracts $package $test $port"
  done
}

function test {
  # Starting txe servers with incrementing port numbers.
  export NUM_TXES=8
  trap 'kill $(jobs -p) &>/dev/null || true' EXIT
  for i in $(seq 0 $((NUM_TXES-1))); do
    (cd $root/yarn-project/txe && LOG_LEVEL=silent TXE_PORT=$((45730 + i)) yarn start) >/dev/null &
  done
  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      while ! nc -z 127.0.0.1 $((45730 + i)) &>/dev/null; do sleep 1; done
  done

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
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
