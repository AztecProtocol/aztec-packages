#!/usr/bin/env bash
# Some notes if you have to work on this script.
# - First of all, I'm sorry (edit: not sorry). It's a beautiful script but it's no fun to debug. I got carried away.
# - You can enable BUILD_SYSTEM_DEBUG=1 but the output is quite verbose that it's not much use by default.
# - This flag however, isn't carried into exported functions. You need to do "set -x" in those functions manually.
# - You can call ./bootstrap.sh compile <contract names> to compile and process select contracts.
# - You can disable further parallelism by setting passing 1 as arg to 'parallelize' and with PARALLELISM=1.
# - The exported functions called by parallel must enable their own flags at the start e.g. set -euo pipefail
# - The exported functions are using stdin/stdout, so be very careful about what's printed where.
# - The exported functions need to have external variables they require, to have been exported first.
# - You can't export bash arrays or maps to be used by external functions, only strings.
# - If you want to echo something, send it to stderr e.g. echo_stderr "My debug"
# - If you call another script, be sure it also doesn't output something you don't want.
# - Just ask me (charlie) for guidance if you're suffering.
# - I remain convinced we don't need node for these kinds of things, and we can be more performant/expressive with bash.
# - We could perhaps make it less tricky to work with by leveraging more tempfiles and less stdin/stdout.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
# entrypoint for docs
if [ -n "${DOCS_WORKING_DIR:-}" ]; then
  cd "$DOCS_WORKING_DIR"
  export folder_name="examples"
else
  export folder_name="contracts"
fi

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export PLATFORM_TAG=any

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export BB_HASH=${BB_HASH:-$(../../barretenberg/cpp/bootstrap.sh hash)}
export NOIR_HASH=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}
# Get BB version for aztec_process cache key
bb_version=$($BB --version)

export tmp_dir=./target/tmp

# Remove our tmp dir from last run.
# Note: This can use BASH 'trap' for better cleanliness, but the script has been hitting edge-cases so is (temporarily?) simplified.
rm -rf $tmp_dir
mkdir -p $tmp_dir

# Set common flags for parallel.
export PARALLEL_FLAGS="-j${PARALLELISM:-16} --halt now,fail=1 --memsuspend $(memsuspend_limit)"

# Compute hash for a given contract.
# $1 is the contract name
function get_contract_hash {
  local contract_path=$(get_contract_path "$1")

  if [ "$folder_name" = "examples" ]; then
    # Called from docs
    hash_str \
      $NOIR_HASH \
      $(cache_content_hash \
        ../avm-transpiler/.rebuild_patterns \
        "^docs/examples/$contract_path/" \
        "^noir-projects/aztec-nr/" \
        "^noir-projects/noir-protocol-circuits/crates/types/")
  else
    # Called from noir-contracts
    hash_str \
      $NOIR_HASH \
      $(cache_content_hash \
        ../../avm-transpiler/.rebuild_patterns \
        "^noir-projects/noir-contracts/contracts/$contract_path/" \
        "^noir-projects/aztec-nr/" \
        "^noir-projects/noir-protocol-circuits/crates/types/")
  fi
}
export -f get_contract_hash

# Extract contract path from Nargo.toml based on argument
# Handle both formats: full path relative to contracts/ or just contract name
# E.g. for both "ecdsa_k_account_contract" and "account/ecdsa_k_account_contractor" returns
# "account/ecdsa_k_account_contractor"
#
# $1 is the contract input
# This is done to ensure that both paths can be provided as inputs to the script.
function get_contract_path {
  local input=$1
  local contract_path
  if [[ $input == *"/"* ]]; then
    # Full path provided (e.g. account/ecdsa_k_account_contract)
    contract_path=$input
  else
    # Just contract name provided (e.g. ecdsa_k_account_contract)
    contract_path=$(grep -oP "(?<=$folder_name/)[^\"]+/$input" Nargo.toml)
    if [ -z "$contract_path" ]; then
      echo "Contract $input not found in Nargo.toml" >&2
      exit 1
    fi
  fi
  echo "$contract_path"
}
export -f get_contract_path

# This compiles a noir contract.
# $1 is the input package name
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail
  local contract_name contract_hash

  local contract_path=$(get_contract_path "$1")
  local contract=${contract_path#*/}
  # Calculate filename because nargo...
  contract_name=$(cat $folder_name/$contract_path/src/main.nr | awk '/^contract / { print $2 } /^pub contract / { print $3 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  contract_hash=$(get_contract_hash $1)

  if ! cache_download contract-$contract_hash.tar.gz; then
    $NARGO compile --package $contract --inliner-aggressiveness 0 --pedantic-solving --deny-warnings
    cache_upload contract-$contract_hash.tar.gz $json_path
  fi
  # Output the json path for aztec_process batching
  echo "$json_path"
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all relevant contracts from the root Nargo.toml and process them in parallel.
function build {
  echo_stderr "Compiling contracts (bb-hash: $BB_HASH)..."

  # Download VK cache before building
  local vk_cache_dir="$HOME/.bb/$bb_version/vk_cache"
  mkdir -p "$vk_cache_dir"
  # Create a hash for the vk cache based on all contracts and bb version
  local all_contracts_hash
  if [ "$#" -eq 0 ]; then
    all_contracts_hash=$(hash_str $BB_HASH $NOIR_HASH $(cache_content_hash .))
  else
    # If building specific contracts, include them in the hash
    all_contracts_hash=$(hash_str $BB_HASH $NOIR_HASH "$@")
  fi
  cache_download vk-cache-$all_contracts_hash.tar.gz || true

  if [ "$#" -eq 0 ]; then
    rm -rf target
    mkdir -p $tmp_dir
    local contracts=$(grep -oP "(?<=$folder_name/)[^\"]+" Nargo.toml)
  else
    local contracts="$@"
  fi
  set +e
  # Compile contracts and collect their json paths
  local json_paths=$(parallel $PARALLEL_FLAGS --joblog joblog.txt -v --line-buffer --tag compile {} ::: ${contracts[@]})
  code=$?
  cat joblog.txt

  if [ $code -eq 0 ]; then
    # Build the aztec_process command with all -i flags
    local aztec_process_cmd="$BB aztec_process"
    while IFS= read -r json_path; do
      # Skip empty lines and lines from parallel's tag output
      if [ -n "$json_path" ] && [ -f "$json_path" ]; then
        aztec_process_cmd="$aztec_process_cmd -i \"$json_path\""
      fi
    done <<< "$json_paths"

    # Run aztec_process once with all inputs
    echo_stderr "Processing artifacts with aztec_process..."
    eval "$aztec_process_cmd"
    code=$?
  fi

  # Upload VK cache after building if it was populated
  if [ $code -eq 0 ] && [ -d "$vk_cache_dir" ] && [ -n "$(ls -A "$vk_cache_dir" 2>/dev/null)" ]; then
    cache_upload vk-cache-$all_contracts_hash.tar.gz "$vk_cache_dir"
  fi

  return $code
}

function test_cmds {
  local -A cache

  i=0
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    port=$((45730 + (i++ % ${NUM_TXES:-1})))
    [ -z "${cache[$package]:-}" ] && cache[$package]=$(get_contract_hash $package)
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
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "ci")
    build
    test
    ;;
  "compile")
    shift
    VERBOSE=${VERBOSE:-1} build "$@"
    ;;
  test|test_cmds|format)
    $cmd
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac
