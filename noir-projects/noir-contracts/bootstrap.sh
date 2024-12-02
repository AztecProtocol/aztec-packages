#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/base/source

CMD=${1:-}

export RAYON_NUM_THREADS=16
export HARDWARE_CONCURRENCY=16

export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export TRANSPILER=${TRANSPILER:-../../avm-transpiler/target/release/avm-transpiler}
export AZTEC_CACHE_REBUILD_PATTERNS=../../barretenberg/cpp/.rebuild_patterns
export BB_HASH=$($ci3/cache/content_hash)

tmp_dir=./target/tmp

function on_exit() {
  rm -rf $tmp_dir
  rm -f joblog.txt
}
trap on_exit EXIT

mkdir -p $tmp_dir

# Export vars needed inside compile.
export tmp_dir ci3

function compile {
  set -eu
  local contract=$1
  # Calculate filename because nargo...
  local contract_name=$(cat contracts/$1/src/main.nr | awk '/^contract / { print $2 }')
  local filename="$contract-$contract_name.json"
  local json_path="./target/$filename"
  export AZTEC_CACHE_REBUILD_PATTERNS=../../noir/.rebuild_patterns_native
  export REBUILD_PATTERNS="^noir-projects/noir-contracts/contracts/$contract/"
  local contract_hash=$($ci3/cache/content_hash)
  if ! $ci3/cache/download contract-$contract_hash.tar.gz 2> /dev/null; then
    $NARGO compile --package $contract --silence-warnings --inliner-aggressiveness 0
    $ci3/cache/upload contract-$contract_hash.tar.gz $json_path 2> /dev/null
  fi

  $TRANSPILER $json_path $json_path

  # stdin has the function json.
  # stdout receives the function json with the vk added (if it's a private function).
  process_function() {
    set -eu
    local func="$(cat)"

    if echo "$func" | jq -e '.custom_attributes | index("private") != null' > /dev/null; then
      local hash=$((echo "$BB_HASH"; echo "$func" | jq -r '.bytecode') | sha256sum | tr -d ' -')
      if ! $ci3/cache/download vk-$hash.tar.gz 2> /dev/null; then
        local name=$(echo "$func" | jq -r '.name')
        echo "Generating vk for function: $name..." >&2
        echo "$func" | jq -r '.bytecode' | base64 -d | gunzip | $BB write_vk_mega_honk -h -b - -o $tmp_dir/$hash 2>/dev/null
        $ci3/cache/upload vk-$hash.tar.gz $tmp_dir/$hash 2> /dev/null
      fi
      local vk=$(cat $tmp_dir/$hash | base64 -w 0)
      echo "$func" | jq -c --arg vk "$vk" '. + {verification_key: $vk}'
    else
      echo "$func"
    fi
  }
  export -f process_function

  # When slurping (-s), we get an array of two elements:
  # .[0] is the original json (at $json_path)
  # .[1] is the updated functions on stdin (-)
  # * merges their fields.
  jq -c '.functions[]' $json_path | \
    parallel -j16 --keep-order -N1 --block 8M --pipe --halt now,fail=1 process_function | \
    jq -s '{functions: .}' | jq -s '.[0] * {functions: .[1].functions}' $json_path - > $tmp_dir/$filename
  mv $tmp_dir/$filename $json_path
}

export -f compile

function build {
  set +e
  echo "Compiling contracts (bb-hash: $BB_HASH)..."
  grep -oP '(?<=contracts/)[^"]+' Nargo.toml | \
    parallel --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
  code=$?
  cat joblog.txt
  return $code

  # For testing. No parallel case. Small parallel case.
  # echo -e "uniswap_contract\ncontract_class_registerer_contract" | parallel --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
  # compile uniswap_contract
}

case "$CMD" in
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
  "test")
    # TODO: Needs TXE. Handle after yarn-project.
    exit 0
    ;;
  *)
    echo "Unknown command: $CMD"
    exit 1
esac