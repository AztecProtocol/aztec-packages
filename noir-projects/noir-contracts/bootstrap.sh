#!/usr/bin/env bash
# Some notes if you have to work on this script.
# - First of all, I'm sorry. It's a beautiful script but it's no fun to debug. I got carried away.
# - You can enable BUILD_SYSTEM_DEBUG=1 but the output is quite verbose that it's not much use by default.
# - You can call ./bootstrap.sh build <package name> to compile and process a single contract.
# - You can disable further parallelism by setting PARALLELISM=1.
# - The exported functions called by parallel must enable their own flags at the start e.g. set -euo pipefail
# - The exported functions are using stdin/stdout, so be very careful about what's printed where.
# - The exported functions need to have external variables they require, to have been exported first.
# - If you want to echo something, send it to stderr e.g. echo_stderr "My debug"
# - If you call another script, be sure it also doesn't output something you don't want.
# - Note calls to cache scripts swallow everything with &> /dev/null.
# - Local assignments with subshells don't propagate errors e.g. local capture=$(false). Declare locals separately.
# - Just ask me (charlie) for guidance if you're suffering.
# - I remain convinced we don't need node for these kinds of things, and we can be more performant/expressive with bash.
# - We could perhaps make it less tricky to work with by leveraging more tempfiles and less stdin/stdout.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
test_flag=noir-contracts-test-$(cache_content_hash "^noir-projects/noir-contracts")

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PARALLELISM=${PARALLELISM:-16}
export PLATFORM_TAG=any

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export TRANSPILER=${TRANSPILER:-../../avm-transpiler/target/release/avm-transpiler}
export BB_HASH=$(cache_content_hash ../../barretenberg/cpp/.rebuild_patterns)

export tmp_dir=./target/tmp

# Create our tmp working directory, ensure it's removed on exit.
function on_exit() {
  rm -rf $tmp_dir
  rm -f joblog.txt
}
trap on_exit EXIT
mkdir -p $tmp_dir

# This computes a vk and adds it to the input function json if it's private, else returns same input.
# stdin has the function json.
# stdout receives the function json with the vk added (if private).
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
# If debugging, a set -x at the start can help.
function process_function() {
  set -euo pipefail
  local func name bytecode_b64 hash vk

  # Read the function json.
  func="$(cat)"
  name=$(echo "$func" | jq -r '.name')
  bytecode_b64=$(echo "$func" | jq -r '.bytecode')
  # echo "Processing function $name..." >&2

  # Check if the function is neither public nor unconstrained.
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
    hash=$((echo "$BB_HASH"; echo "$bytecode_b64") | sha256sum | tr -d ' -')
    if ! cache_download vk-$hash.tar.gz &> /dev/null; then
      # It's not in the cache. Generate the vk file and upload it to the cache.
      echo_stderr "Generating vk for function: $name..."
      echo "$bytecode_b64" | base64 -d | gunzip | $BB write_vk_for_ivc -h -b - -o $tmp_dir/$hash 2>/dev/null
      cache_upload vk-$hash.tar.gz $tmp_dir/$hash &> /dev/null
    fi

    # Return (echo) json containing the base64 encoded verification key.
    vk=$(cat $tmp_dir/$hash | base64 -w 0)
    echo "$func" | jq -c --arg vk "$vk" '. + {verification_key: $vk}'
  else
    # Not a private function. Return the original function json.
    echo "$func"
  fi
}
export -f process_function

# Compute hash for a given contract.
declare -A cache
function get_contract_hash {
  if [ -z "${cache[$1]:-}" ]; then
    cache[$1]=$(cache_content_hash \
      ../../noir/.rebuild_patterns \
      ../../avm-transpiler/.rebuild_patterns \
      "^noir-projects/noir-contracts/contracts/$1/" \
      "^noir-projects/aztec-nr/")
  fi
  echo -n "${cache[$1]}"
}
export -f get_contract_hash

# This compiles a noir contract, transpile's public functions, and generates vk's for private functions.
# $1 is the input package name, and on exit it's fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail
  local contract_name contract_hash

  local contract=$1
  # Calculate filename because nargo...
  contract_name=$(cat contracts/$1/src/main.nr | awk '/^contract / { print $2 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  contract_hash=$(get_contract_hash $contract)
  if ! cache_download contract-$contract_hash.tar.gz &> /dev/null; then
    $NARGO compile --package $contract --silence-warnings --inliner-aggressiveness 0
    $TRANSPILER $json_path $json_path
    cache_upload contract-$contract_hash.tar.gz $json_path &> /dev/null
  fi

  # Pipe each contract function, one per line (jq -c), into parallel calls of process_function.
  # The returned jsons from process_function are converted back to a json array in the second jq -s call.
  # When slurping (-s) in the last jq, we get an array of two elements:
  # .[0] is the original json (at $json_path)
  # .[1] is the updated functions on stdin (-)
  # * merges their fields.
  jq -c '.functions[]' $json_path | \
    parallel -j$PARALLELISM --keep-order -N1 --block 8M --pipe --halt now,fail=1 process_function | \
    jq -s '{functions: .}' | jq -s '.[0] * {functions: .[1].functions}' $json_path - > $tmp_dir/$filename
  mv $tmp_dir/$filename $json_path
}
export -f compile

# If given an argument, it's the contract to compile.
# Otherwise parse out all relevant contracts from the root Nargo.toml and process them in parallel.
function build {
  if [ -n "${1:-}" ]; then
    compile $1
  else
    set +e
    echo_stderr "Compiling contracts (bb-hash: $BB_HASH)..."
    grep -oP '(?<=contracts/)[^"]+' Nargo.toml | \
      parallel -j$PARALLELISM --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
    code=$?
    cat joblog.txt
    return $code
  fi

  # For testing. Small parallel case.
  # echo -e "uniswap_contract\ncontract_class_registerer_contract" | parallel --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
}

function test_cmds {
  i=0
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    port=$((45730 + (i++ % ${NUM_TXES:-1})))
    # This must be called within *this* shell, not within $(), else the cache won't work.
    get_contract_hash $package
    echo " noir-projects/scripts/run_test.sh noir-contracts $package $test $port"
  done
}

function test {
  # Starting txe servers with incrementing port numbers.
  NUM_TXES=8
  trap 'kill $(jobs -p) &>/dev/null || true' EXIT
  for i in $(seq 0 $((NUM_TXES-1))); do
    (cd $root/yarn-project/txe && LOG_LEVEL=silent TXE_PORT=$((45730 + i)) yarn start) &>/dev/null &
  done
  echo "Waiting for TXE's to start..."
  for i in $(seq 0 $((NUM_TXES-1))); do
      while ! nc -z 127.0.0.1 $((45730 + i)) &>/dev/null; do sleep 1; done
  done

  export NARGO_FOREIGN_CALL_TIMEOUT=300000
  test_cmds | parallelise
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
  ""|"fast"|"full"|"ci")
    build
    ;;
  "compile")
    shift
    build $1
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac