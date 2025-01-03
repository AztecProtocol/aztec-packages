#!/usr/bin/env bash
# Look at noir-contracts bootstrap.sh for some tips r.e. bash.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

CMD=${1:-}

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PARALLELISM=${PARALLELISM:-16}

export PLATFORM_TAG=any
export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export BB_HASH=$(cache_content_hash ../../barretenberg/cpp/.rebuild_patterns)
export NARGO_HASH=$(cache_content_hash ../../noir/.rebuild_patterns)

tmp_dir=./target/tmp
key_dir=./target/keys

# Circuits matching these patterns we have clientivc keys computed, rather than ultrahonk.
ivc_patterns=(
  "private_kernel_init"
  "private_kernel_inner"
  "private_kernel_reset.*"
  "private_kernel_tail.*"
  "app_creator"
  "app_reader"
)

rollup_honk_patterns=(
  "empty_nested.*"
  "private_kernel_empty.*"
  "rollup_base.*"
  "rollup_block.*"
  "rollup_merge"
)


ivc_regex=$(IFS="|"; echo "${ivc_patterns[*]}")
rollup_honk_regex=$(IFS="|"; echo "${rollup_honk_patterns[*]}")

function on_exit() {
  rm -rf $tmp_dir
  rm -f joblog.txt
}
trap on_exit EXIT

mkdir -p $tmp_dir
mkdir -p $key_dir

# Export vars needed inside compile.
export tmp_dir key_dir ci3 ivc_regex rollup_honk_regex

# Tries downloading a circuit artifact from the remote cache
# Input: circuit directory
# Output: circuit name if successful, circuit name-hash otherwise
function try_download_circuit {
  set -euo pipefail
  local dir=$1
  local name=${dir//-/_}
  local program_hash hash
  local program_hash_cmd="$NARGO check --package $name --silence-warnings --show-program-hash | cut -d' ' -f2"
  # echo_stderr $program_hash_cmd
  program_hash=$(dump_fail "$program_hash_cmd")
  echo_stderr "Hash preimage: $NARGO_HASH-$program_hash"
  hash=$(hash_str "$NARGO_HASH-$program_hash")

  if cache_download circuit-$hash.tar.gz 1>&2; then
    echo "$name"
  else
    echo "$name-$hash"
  fi
}

# Compiles a circuit and uploads it to the remote cache if needed
# Input: circuit name or circuit name-hash, will only compile if hash is provided
# Output: circuit name
function compile_circuit {
  set -euo pipefail
  local name hash
  IFS="-" read -r name hash <<< "$1"
  if [[ -z $hash ]]; then
    echo_stderr "Circuit $name downloaded from cache"
    echo $name
    return
  fi

  local filename="$name.json"
  local json_path="./target/$filename"
  echo_stderr "Compiling circuit $name-$hash to $json_path"

  SECONDS=0
  rm -f $json_path
  # TODO: --skip-brillig-constraints-check added temporarily for blobs build time.
  local compile_cmd="$NARGO compile --package $name --silence-warnings --skip-brillig-constraints-check"
  echo_stderr "$compile_cmd"
  dump_fail "$compile_cmd"
  echo_stderr "Compilation complete for: $name (${SECONDS}s)"
  cache_upload circuit-$hash.tar.gz $json_path &> /dev/null

  echo $name
}

# Tries downloading a verification key from the remote cache
# Input: circuit name
# Output: circuit name if successful, circuit name-hash otherwise
function try_download_vk {
  local name=$1
  local filename="$name.json"
  local json_path="./target/$filename"

  # No vks needed for simulated circuits.
  if [[ "$name" == *"simulated"* ]]; then
    echo "$name"
    return
  fi

  # Compute protocol from name, used for the hash
  if echo "$name" | grep -qE "${ivc_regex}"; then
    local proto="client_ivc"
  elif echo "$name" | grep -qE "${rollup_honk_regex}"; then
    local proto="ultra_rollup_honk"
  else
    local proto="ultra_honk"
  fi

  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$proto")
  if cache_download vk-$hash.tar.gz 1>&2; then
    echo "$name"
  else
    echo "$name-$hash"
  fi
}

# Generates a verification key and uploads it to the remote cache if needed
# Input: circuit name or circuit name-hash, will only compile if hash is provided
# Output: circuit name
function generate_vk {
  set -euo pipefail
  local name hash
  IFS="-" read -r name hash <<< "$1"
  if [[ -z $hash ]]; then
    echo_stderr "Verification key $name downloaded from cache"
    echo $name
    return
  fi

  # Get commands for writing vk and converting to fields based on name
  if echo "$name" | grep -qE "${ivc_regex}"; then
    local write_vk_cmd="write_vk_for_ivc"
    local vk_as_fields_cmd="vk_as_fields_mega_honk"
  elif echo "$name" | grep -qE "${rollup_honk_regex}"; then
    local write_vk_cmd="write_vk_ultra_rollup_honk -h 2"
    local vk_as_fields_cmd="vk_as_fields_ultra_rollup_honk"
  else
    local write_vk_cmd="write_vk_ultra_honk -h 1"
    local vk_as_fields_cmd="vk_as_fields_ultra_honk"
  fi

  local filename="$name.json"
  local json_path="./target/$filename"
  local key_path="$key_dir/$name.vk.data.json"
  echo_stderr "Generating vk for function: $name..."

  # Change this to add verification_key to original json, like contracts does.
  # Will require changing TS code downstream.
  local vk vk_fields
  SECONDS=0
  local vk_cmd="jq -r '.bytecode' $json_path | base64 -d | gunzip | $BB $write_vk_cmd -b - -o - --recursive | xxd -p -c 0"
  echo_stderr $vk_cmd
  vk=$(dump_fail "$vk_cmd")
  local vkf_cmd="echo '$vk' | xxd -r -p | $BB $vk_as_fields_cmd -k - -o -"
  # echo_stderrr $vkf_cmd
  vk_fields=$(dump_fail "$vkf_cmd")
  jq -n --arg vk "$vk" --argjson vkf "$vk_fields" '{keyAsBytes: $vk, keyAsFields: $vkf}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"
  cache_upload vk-$hash.tar.gz $key_path &> /dev/null

  echo $name
}

# Compiles a single circuit
function compile {
  set -eu
  [ -f "package.json" ] && denoise "yarn && node ./scripts/generate_variants.js"
  local dir=$1
  generate_vk $(try_download_vk $(compile_circuit $(try_download_circuit $dir)))
}

# Runs the following steps for each circuit:
# 1. try_download_circuit
# 2. compile_circuit
# 3. try_download_vk
# 4. generate_vk
function build {
  set +e
  set -u

  [ -f "package.json" ] && denoise "yarn && node ./scripts/generate_variants.js"
  local parallel_cmd="parallel -t --line-buffer --halt now,fail=1"

  grep -oP '(?<=crates/)[^"]+' Nargo.toml | \
    while read -r dir; do
      toml_file=./crates/$dir/Nargo.toml
      if grep -q 'type = "bin"' "$toml_file"; then
          echo "$(basename $dir)"
      fi
    done | \
    $parallel_cmd -j32 --joblog joblog-1.txt try_download_circuit {} | \
    $parallel_cmd -j$PARALLELISM --joblog joblog-2.txt compile_circuit {} | \
    $parallel_cmd -j32 --joblog joblog-3.txt try_download_vk {} | \
    $parallel_cmd -j$PARALLELISM --joblog joblog-4.txt generate_vk {}
  code=$?
  cat joblog-*.txt
  return $code
}

function test {
  set -eu
  name=$(basename "$PWD")
  CIRCUITS_HASH=$(cache_content_hash ../../noir/.rebuild_patterns "^noir-projects/$name")
  test_should_run $name-tests-$CIRCUITS_HASH || return 0

  RAYON_NUM_THREADS= $NARGO test --silence-warnings --skip-brillig-constraints-check
  cache_upload_flag $name-tests-$CIRCUITS_HASH
}

export -f try_download_circuit compile_circuit try_download_vk generate_vk test build

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
  "compile")
    shift
    compile $1
    ;;
  "test")
    test
    ;;
  "test-cmds")
    $NARGO test --list-tests --silence-warnings | while read -r package test; do
      echo "noir-projects/scripts/run_test.sh noir-protocol-circuits $package $test"
    done
    ;;
  "ci")
    parallel --tag --line-buffered {} ::: build test
    ;;
  *)
    echo_stderr "Unknown command: $CMD"
    exit 1
esac
