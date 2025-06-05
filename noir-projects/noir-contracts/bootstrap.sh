#!/usr/bin/env bash
# Some notes if you have to work on this script.
# - First of all, I'm sorry (edit: not sorry). It's a beautiful script but it's no fun to debug. I got carried away.
# - You can enable BUILD_SYSTEM_DEBUG=1 but the output is quite verbose that it's not much use by default.
# - This flag however, isn't carried into exported functions. You need to do "set -x" in those functions manually.
# - You can call ./bootstrap.sh compile <contract names> to compile and process select contracts.
# - You can disable further parallelism by setting passing 1 as arg to 'parallelise' and with PARALLELISM=1.
# - The exported functions called by parallel must enable their own flags at the start e.g. set -euo pipefail
# - The exported functions are using stdin/stdout, so be very careful about what's printed where.
# - The exported functions need to have external variables they require, to have been exported first.
# - You can't export bash arrays or maps to be used by external functions, only strings.
# - If you want to echo something, send it to stderr e.g. echo_stderr "My debug"
# - If you call another script, be sure it also doesn't output something you don't want.
# - Local assignments with sub-shells don't propagate errors e.g. local capture=$(false). Declare locals separately.
# - Just ask me (charlie) for guidance if you're suffering.
# - I remain convinced we don't need node for these kinds of things, and we can be more performant/expressive with bash.
# - We could perhaps make it less tricky to work with by leveraging more tempfiles and less stdin/stdout.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export TRANSPILER=${TRANSPILER:-../../avm-transpiler/target/release/avm-transpiler}
export BB_HASH=$(cache_content_hash ../../barretenberg/cpp/.rebuild_patterns)
export NOIR_HASH=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}

export tmp_dir=./target/tmp

# Remove our tmp dir from last run.
# Note: This can use BASH 'trap' for better cleanliness, but the script has been hitting edge-cases so is (temporarily?) simplified.
rm -rf $tmp_dir
mkdir -p $tmp_dir

# Set common flags for parallel.
export PARALLEL_FLAGS="-j${PARALLELISM:-16} --halt now,fail=1 --memsuspend $(memsuspend_limit)"

# This computes a vk and adds it to the input function json if it's private, else returns same input.
# stdin has the function json.
# stdout receives the function json with the vk added (if private).
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
# If debugging, a set -x at the start can help.
function process_function {
  set -euo pipefail
  local func name bytecode_b64 hash vk

  contract_hash=$1
  # Read the function json.
  func="$(cat)"
  name=$(echo "$func" | jq -r '.name')
  echo_stderr "Processing function: $name..."

  # Check if the function is neither public nor unconstrained.
  # TODO: Why do we need to gen keys for functions that are not marked private?
  # We allow the jq call to error (set +e) because it returns an error code if the result is false.
  # We then differentiate between a real error, and the result being false.
  set +e
  make_vk=$(echo "$func" | jq -e '(.custom_attributes | index("public") == null) and (.is_unconstrained == false)')
  if [ $? -ne 0 ] && [ "$make_vk" != "false" ]; then
    echo_stderr "Failed to check function $name is neither public nor unconstrained."
    exit 1
  fi
  set -e

  if [ "$make_vk" == "true" ]; then
    # It's a private function.
    # Build hash, check if in cache.
    # If it's in the cache it's extracted to $tmp_dir/$hash
    bytecode_b64=$(echo "$func" | jq -r '.bytecode')
    hash=$((echo "$BB_HASH"; echo "$bytecode_b64") | sha256sum | tr -d ' -')

    if ! cache_download vk-$contract_hash-$hash.tar.gz >&2; then
      # It's not in the cache. Generate the vk file and upload it to the cache.
      echo_stderr "Generating vk for function: $name..."

      local outdir=$(mktemp -d -p $tmp_dir)
      echo "$bytecode_b64" | base64 -d | gunzip | $BB write_vk --scheme client_ivc --verifier_type standalone -b - -o $outdir -v
      mv $outdir/vk $tmp_dir/$contract_hash/$hash

      cache_upload vk-$contract_hash-$hash.tar.gz $tmp_dir/$contract_hash/$hash
    fi

    # Return (echo) json containing the base64 encoded verification key.
    vk=$(cat $tmp_dir/$contract_hash/$hash | base64 -w 0)
    echo "$func" | jq -c --arg vk "$vk" '. + {verification_key: $vk}'
  else
    echo_stderr "Function $name is neither public nor unconstrained, skipping."
    # Not a private function. Return the original function json.
    echo "$func"
  fi
}
export -f process_function

# Compute hash for a given contract.
function get_contract_hash {
  local contract_path=$(get_contract_path "$1")

  hash_str \
    $NOIR_HASH \
    $(cache_content_hash \
      ../../avm-transpiler/.rebuild_patterns \
      "^noir-projects/noir-contracts/contracts/$contract_path/" \
      "^noir-projects/aztec-nr/" \
      "^noir-projects/noir-protocol-circuits/crates/types/")
}
export -f get_contract_hash

# Extract contract path from Nargo.toml based on argument
# Handle both formats: full path relative to contracts/ or just contract name
# E.g. for both "ecdsa_k_account_contract" and "account/ecdsa_k_account_contractor" returns
# "account/ecdsa_k_account_contractor"
#
# This is done to ensure that both paths can be provided as inputs to the script.
function get_contract_path {
  local input=$1
  local contract_path
  if [[ $input == *"/"* ]]; then
    # Full path provided (e.g. account/ecdsa_k_account_contract)
    contract_path=$input
  else
    # Just contract name provided (e.g. ecdsa_k_account_contract)
    contract_path=$(grep -oP "(?<=contracts/)[^\"]+/$input" Nargo.toml)
    if [ -z "$contract_path" ]; then
      echo "Contract $input not found in Nargo.toml" >&2
      exit 1
    fi
  fi
  echo "$contract_path"
}
export -f get_contract_path

# This compiles a noir contract, transpile's public functions, and generates vk's for private functions.
# $1 is the input package name, and on exit it's fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail
  local contract_name contract_hash

  local contract_path=$(get_contract_path "$1")
  local contract=${contract_path#*/}
  # Calculate filename because nargo...
  contract_name=$(cat contracts/$contract_path/src/main.nr | awk '/^contract / { print $2 } /^pub contract / { print $3 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  contract_hash=$(get_contract_hash $1)
  if ! cache_download contract-$contract_hash.tar.gz; then
    if [ "${VERBOSE:-0}" -eq 0 ]; then
      local args="--silence-warnings"
    fi
    $NARGO compile ${args:-} --package $contract --inliner-aggressiveness 0 --pedantic-solving
    $TRANSPILER $json_path $json_path
    cache_upload contract-$contract_hash.tar.gz $json_path
  fi

  # We segregate equivalent vk's created by processs_function. This was done to narrow down potential edge cases with identical VKs
  # reading from cache at the same time. Create this folder up-front.
  mkdir -p $tmp_dir/$contract_hash

  # Pipe each contract function, one per line (jq -c), into parallel calls of process_function.
  # The returned jsons from process_function are converted back to a json array in the second jq -s call.
  # When slurping (-s) in the last jq, we get an array of two elements:
  # .[0] is the original json (at $json_path)
  # .[1] is the updated functions on stdin (-)
  # * merges their fields.
  jq -c '.functions[]' $json_path | \
    parallel $PARALLEL_FLAGS --keep-order -N1 --block 8M --pipe process_function $contract_hash | \
    jq -s '{functions: .}' | jq -s '.[0] * {functions: .[1].functions}' $json_path - > $tmp_dir/$filename
  mv $tmp_dir/$filename $json_path
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all relevant contracts from the root Nargo.toml and process them in parallel.
function build {
  echo_stderr "Compiling contracts (bb-hash: $BB_HASH)..."
  if [ "$#" -eq 0 ]; then
    rm -rf target
    mkdir -p $tmp_dir
    local contracts=$(grep -oP '(?<=contracts/)[^"]+' Nargo.toml)
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
  test_cmds | filter_test_cmds | parallelise
}

function format {
  $NARGO fmt
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "clean-keys")
    for artifact in target/*.json; do
      echo_stderr "Scrubbing vk from $artifact..."
      jq '.functions |= map(del(.verification_key))' "$artifact" > "${artifact}.tmp"
      mv "${artifact}.tmp" "$artifact"
    done
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
