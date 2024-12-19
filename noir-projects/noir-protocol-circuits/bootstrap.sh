#!/usr/bin/env bash
# Look at noir-contracts bootstrap.sh for some tips r.e. bash.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

CMD=${1:-}

export RAYON_NUM_THREADS=16
export HARDWARE_CONCURRENCY=16

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
  "empty_nested.*",
  "private_kernel_empty.*",
  "rollup_base.*",
  "rollup_block.*",
  "rollup_merge"
)


ivc_regex=$(IFS="|"; echo "${ivc_patterns[*]}")
rollup_honk_regex=$(IFS="|"; echo "${rollup_honk_patterns[*]}")

function on_exit() {
  rm -rf $tmp_dir
  rm -f joblog.txt
}
trap on_exit EXIT

[ -f package.json ] && denoise "yarn && node ./scripts/generate_variants.js"

mkdir -p $tmp_dir
mkdir -p $key_dir

# Export vars needed inside compile.
export tmp_dir key_dir ci3 ivc_regex rollup_honk_regex

function compile {
  set -euo pipefail
  local dir=$1
  local name=${dir//-/_}
  local filename="$name.json"
  local json_path="./target/$filename"
  local program_hash hash bytecode_hash vk vk_fields
  local program_hash_cmd="$NARGO check --package $name --silence-warnings --show-program-hash | cut -d' ' -f2"
  # echo_stderr $program_hash_cmd
  program_hash=$(dump_fail "$program_hash_cmd")
  echo_stderr "Hash preimage: $NARGO_HASH-$program_hash"
  hash=$(hash_str "$NARGO_HASH-$program_hash")
  if ! cache_download circuit-$hash.tar.gz 1>&2; then
    SECONDS=0
    rm -f $json_path
    # TODO: --skip-brillig-constraints-check added temporarily for blobs build time.
    local compile_cmd="$NARGO compile --package $name --silence-warnings --skip-brillig-constraints-check"
    echo_stderr "$compile_cmd"
    dump_fail "$compile_cmd"
    echo_stderr "Compilation complete for: $name (${SECONDS}s)"
    cache_upload circuit-$hash.tar.gz $json_path &> /dev/null
  fi

  if echo "$name" | grep -qE "${ivc_regex}"; then
    local proto="client_ivc"
    local write_vk_cmd="write_vk_for_ivc"
    local vk_as_fields_cmd="vk_as_fields_mega_honk"
  else if echo "$name" | grep -qE "${rollup_honk_regex}"; then
    local proto="ultra_rollup_honk"
    local write_vk_cmd="write_vk_ultra_rollup_honk -h 2"
    local vk_as_fields_cmd="vk_as_fields_ultra_rollup_honk"
  else
    local proto="ultra_honk"
    local write_vk_cmd="write_vk_ultra_honk -h 1"
    local vk_as_fields_cmd="vk_as_fields_ultra_honk"
  fi

  # No vks needed for simulated circuits.
  [[ "$name" == *"simulated"* ]] && return

  # Change this to add verification_key to original json, like contracts does.
  # Will require changing TS code downstream.
  bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  hash=$(hash_str "$BB_HASH-$bytecode_hash-$proto")
  if ! cache_download vk-$hash.tar.gz 1>&2; then
    local key_path="$key_dir/$name.vk.data.json"
    echo_stderr "Generating vk for function: $name..."
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
    parallel -j16 --joblog joblog.txt -v --line-buffer --tag --halt now,fail=1 compile {}
  code=$?
  cat joblog.txt
  return $code
}

function test {
  set -eu
  # Whether we run the tests or not is coarse grained.
  name=$(basename "$PWD")
  CIRCUITS_HASH=$(cache_content_hash ../../noir/.rebuild_patterns "^noir-projects/$name")
  if ! test_should_run $name-tests-$CIRCUITS_HASH; then
    return
  fi
  github_group "$name test"
  RAYON_NUM_THREADS= $NARGO test --silence-warnings
  cache_upload_flag $name-tests-$CIRCUITS_HASH
  github_endgroup
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
  "compile")
    shift
    compile $1
    ;;
  "test")
    test
    ;;
  "ci")
    parallel --line-buffered bash -c {} ::: build test
    ;;
  *)
    echo_stderr "Unknown command: $CMD"
    exit 1
esac
