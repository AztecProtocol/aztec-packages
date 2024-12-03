#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/base/bootstrap_source

CMD=${1:-}

export RAYON_NUM_THREADS=16
export HARDWARE_CONCURRENCY=16

export PLATFORM_TAG=any
export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export AZTEC_CACHE_REBUILD_PATTERNS=../../barretenberg/cpp/.rebuild_patterns
export BB_HASH=$($ci3/cache/content_hash)
export AZTEC_CACHE_REBUILD_PATTERNS=../../noir/.rebuild_patterns_native
export NARGO_HASH=$($ci3/cache/content_hash)

tmp_dir=./target/tmp
key_dir=./target/keys

# Circuits matching these patterns we have megahonk keys computed, rather than ultrahonk.
megahonk_patterns=(
  "private_kernel_init"
  "private_kernel_inner"
  "private_kernel_reset.*"
  "private_kernel_tail.*"
)
megahonk_regex=$(IFS="|"; echo "${megahonk_patterns[*]}")

function on_exit() {
  rm -rf $tmp_dir
  rm -f joblog.txt
}
trap on_exit EXIT

[ -f package.json ] && yarn && node ./scripts/generate_variants.js

mkdir -p $tmp_dir
mkdir -p $key_dir

# Export vars needed inside compile.
export tmp_dir key_dir ci3 megahonk_regex

function compile {
  set -eu
  local dir=$1
  local name=${dir//-/_}
  local filename="$name.json"
  local json_path="./target/$filename"
  local proto=$(echo "$name" | grep -qE "${megahonk_regex}" && echo "mega_honk" || echo "ultra_honk")
  local program_hash=$($NARGO check --package $name --silence-warnings --show-program-hash | cut -d' ' -f2)
  local hash=$(echo "$NARGO_HASH-$program_hash" | sha256sum | tr -d ' -')
  if ! $ci3/cache/download circuit-$hash.tar.gz 2> /dev/null; then
    SECONDS=0
    $NARGO compile --package $name --silence-warnings
    echo "Compilation complete for: $name (${SECONDS}s)"
    $ci3/cache/upload circuit-$hash.tar.gz $json_path 2> /dev/null
  fi

  # No vks needed for simulated circuits.
  [[ "$name" == *"simulated"* ]] && return

  # Change this to add verification_key to original json, like contracts does.
  # Will require changing TS code downstream.
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(echo "$BB_HASH-$bytecode_hash-$proto" | sha256sum | tr -d ' -')
  if ! $ci3/cache/download vk-$hash.tar.gz 2> /dev/null; then
    local key_path="$key_dir/$name.vk.data.json"
    echo "Generating vk for function: $name..." >&2
    SECONDS=0
    local vk=$(jq -r '.bytecode' $json_path | base64 -d | gunzip | $BB write_vk_$proto -h -b - -o - --recursive 2>/dev/null | base64 -w 0)
    local vk_fields=$(echo "$vk" | base64 -d | $BB vk_as_fields_$proto -k - -o - 2>/dev/null)
    jq -n --arg vk "$vk" --argjson vkf "$vk_fields" '{keyAsBytes: $vk, keyAsFields: $vkf}' > $key_path
    echo "Key output at: $key_path (${SECONDS}s)"
    $ci3/cache/upload vk-$hash.tar.gz $key_path 2> /dev/null
  fi
}

function build {
  set +e
  set -u
  grep -oP '(?<=crates/)[^"]+' Nargo.toml | \
    while read -r dir; do
      toml_file=./crates/$dir/Nargo.toml
      if grep -q 'type = "bin"' "$toml_file"; then
          echo "$(basename $dir)"
      fi
    done | \
    parallel --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
  code=$?
  cat joblog.txt
  return $code
}

function test {
  set -eu
  # Wether we run the tests or not is corse grained.
  name=$(basename "$PWD")
  export REBUILD_PATTERNS="^noir-projects/$name"
  export AZTEC_CACHE_REBUILD_PATTERNS=$(echo ../../noir/.rebuild_patterns_native)
  CIRCUITS_HASH=$($ci3/cache/content_hash)
  if ! $ci3/cache/should_run $name-tests-$CIRCUITS_HASH; then
    return
  fi
  $ci3/github/group "$name test"
  RAYON_NUM_THREADS= $NARGO test --silence-warnings
  $ci3/cache/upload_flag $name-tests-$CIRCUITS_HASH
  $ci3/github/endgroup
}

export -f compile test build

case "$CMD" in
  "clean")
    git clean -fdx
    ;;
  "clean-keys")
    rm -rf target/keys
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "ci")
    parallel --line-buffered bash -c {} ::: build test
    ;;
  *)
    echo "Unknown command: $CMD"
    exit 1
esac