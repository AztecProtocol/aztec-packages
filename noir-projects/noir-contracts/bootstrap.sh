#!/usr/bin/env bash
# Some notes if you have to work on this script.
# - First of all, I'm sorry. It's a beautiful script but it's no fun to debug. I got carried away.
# - You can enable BUILD_SYSTEM_DEBUG=1 but the output is so verbose that it's not much use.
# - You can call ./bootstrap.sh build <package name> to compile and process a single contract.
# - The exported functions called by parallel must enable their own flags at the start e.g. set -eu
# - The exported functions are using stdin/stdout, so be very careful about what's printed where.
# - If you want to echo something, send it to stderr e.g. echo "My debug" >&2
# - If you call another script, be sure it also doesn't output something you don't want.
# - Note calls to cache scripts swallow everything with &> /dev/null.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export RAYON_NUM_THREADS=16
export HARDWARE_CONCURRENCY=16
export PLATFORM_TAG=any

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export TRANSPILER=${TRANSPILER:-../../avm-transpiler/target/release/avm-transpiler}
export AZTEC_CACHE_REBUILD_PATTERNS=../../barretenberg/cpp/.rebuild_patterns
export BB_HASH=$(cache_content_hash)

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
function process_function() {
  set -euo pipefail

  # Read the function json.
  local func="$(cat)"
  local name=$(echo "$func" | jq -r '.name')
  local bytecode_b64=$(echo "$func" | jq -r '.bytecode')
  # echo "Processing function $name..." >&2

  # Check if the function is private.
  if echo "$func" | jq -e '.custom_attributes | index("private") != null' > /dev/null; then
    # It's a private function.
    # Build hash, check if in cache.
    # If it's in the cache it's extracted to $tmp_dir/$hash
    local hash=$((echo "$BB_HASH"; echo "$bytecode_b64") | sha256sum | tr -d ' -')
    if ! cache_download vk-$hash.tar.gz &> /dev/null; then
      # It's not in the cache. Generate the vk file and upload it to the cache.
      echo "Generating vk for function: $name..." >&2
      echo "$bytecode_b64" | base64 -d | gunzip | $BB write_vk_mega_honk -h -b - -o $tmp_dir/$hash 2>/dev/null
      cache_upload vk-$hash.tar.gz $tmp_dir/$hash &> /dev/null
    fi

    # Return (echo) json containing the base64 encoded verification key.
    local vk=$(cat $tmp_dir/$hash | base64 -w 0)
    echo "$func" | jq -c --arg vk "$vk" '. + {verification_key: $vk}'
  else
    # Not a private function. Return the original function json.
    echo "$func"
  fi
}
export -f process_function

# This compiles a noir contract, transpile's public functions, and generates vk's for private functions.
# $1 is the input package name, and on exit it's fully processed json artifact is in the target dir.
# The function is exported and called by a sub-shell in parallel, so we must "set -eu" etc..
function compile {
  set -euo pipefail

  local contract=$1
  # Calculate filename because nargo...
  local contract_name=$(cat contracts/$1/src/main.nr | awk '/^contract / { print $2 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  export AZTEC_CACHE_REBUILD_PATTERNS=../../noir/.rebuild_patterns
  export REBUILD_PATTERNS="^noir-projects/noir-contracts/contracts/$contract/"
  local contract_hash=$(cache_content_hash)
  if ! cache_download contract-$contract_hash.tar.gz &> /dev/null; then
    $NARGO compile --package $contract --silence-warnings --inliner-aggressiveness 0
    cache_upload contract-$contract_hash.tar.gz $json_path &> /dev/null
  fi

  $TRANSPILER $json_path $json_path

  # Pipe each contract function, one per line (jq -c), into parallel calls of process_function.
  # The returned jsons from process_function are converted back to a json array in the second jq -s call.
  # When slurping (-s) in the last jq, we get an array of two elements:
  # .[0] is the original json (at $json_path)
  # .[1] is the updated functions on stdin (-)
  # * merges their fields.
  jq -c '.functions[]' $json_path | \
    parallel -j16 --keep-order -N1 --block 8M --pipe --halt now,fail=1 process_function | \
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
    echo "Compiling contracts (bb-hash: $BB_HASH)..."
    grep -oP '(?<=contracts/)[^"]+' Nargo.toml | \
      parallel --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
    code=$?
    cat joblog.txt
    return $code
  fi

  # For testing. Small parallel case.
  # echo -e "uniswap_contract\ncontract_class_registerer_contract" | parallel --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "clean-keys")
    for artifact in target/*.json; do
      echo "Scrubbing vk from $artifact..."
      jq '.functions |= map(del(.verification_key))' "$artifact" > "${artifact}.tmp"
      mv "${artifact}.tmp" "$artifact"
    done
    ;;
  ""|"fast"|"ci")
    USE_CACHE=1 build
    ;;
  "full")
    build
    ;;
  "build")
    shift
    build $1
    ;;
  "test")
    # TODO: Needs TXE. Handle after yarn-project.
    exit 0
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac