#!/usr/bin/env bash
# Look at noir-contracts bootstrap.sh for some tips r.e. bash.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any
export BB=${BB:-../../barretenberg/cpp/build/bin/bb}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export BB_HASH=$(cache_content_hash ../../barretenberg/cpp/.rebuild_patterns)
export NOIR_HASH=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}

export key_dir=./target/keys
mkdir -p $key_dir

# Allows reusing this script when running from mock-protocol-circuits dir.
project_name=$(basename "$PWD")
# Hash of the entire protocol circuits.
# Needed for test hash, as we presently don't have a program hash for each individual test.
# Means if anything within the dir changes, the tests will rerun.
export circuits_hash=$(hash_str "$NOIR_HASH" $(cache_content_hash "^noir-projects/$project_name/crates/"))

# Circuits matching these patterns we have client-ivc keys computed, rather than ultra-honk.
readarray -t ivc_patterns < <(jq -r '.[]' "../client_ivc_circuits.json")
readarray -t ivc_tail_patterns < <(jq -r '.[]' "../client_ivc_tail_circuits.json")
readarray -t rollup_honk_patterns < <(jq -r '.[]' "../rollup_honk_circuits.json")
# Convert to regex string here and export for use in exported functions.
export ivc_regex=$(IFS="|"; echo "${ivc_patterns[*]}")
export private_tail_regex=$(IFS="|"; echo "${ivc_tail_patterns[*]}")
export rollup_honk_regex=$(IFS="|"; echo "${rollup_honk_patterns[*]}")

function on_exit {
  rm -f joblog.txt
}
trap on_exit EXIT

function compile {
  set -euo pipefail
  local dir=$1
  local name=${dir//-/_}
  local filename="$name.json"
  local json_path="./target/$filename"
  local program_hash hash bytecode_hash vk vk_fields

  # We get the monomorphized program hash from nargo. If this changes, we have to recompile.
  local program_hash_cmd="$NARGO check --package $name --silence-warnings --show-program-hash | cut -d' ' -f2"
  # echo_stderr $program_hash_cmd
  program_hash=$(dump_fail "$program_hash_cmd")
  echo_stderr "Hash preimage: $NOIR_HASH-$program_hash"
  hash=$(hash_str "$NOIR_HASH-$program_hash")

  if [ "${USE_CIRCUITS_CACHE:-0}" -eq 0 ] || ! cache_download circuit-$hash.tar.gz 1>&2; then
    SECONDS=0
    rm -f $json_path
    # TODO(#10754): Remove --skip-brillig-constraints-check
    local compile_cmd="$NARGO compile --package $name --skip-brillig-constraints-check"
    echo_stderr "$compile_cmd"
    dump_fail "$compile_cmd"
    echo_stderr "Compilation complete for: $name (${SECONDS}s)"
    bytecode_size=$(jq -r .bytecode $json_path | base64 -d | gunzip | wc -c)
    # TODO: Yes, you're reading that right. 850MB. That's why I'm adding this here, so we can't keep going up.
    if [ "$bytecode_size" -gt $((850 * 1024 * 1024)) ]; then
      echo "Error: $json_path bytecode size of $bytecode_size exceeds 850MB"
      exit 1
    fi
    cache_upload circuit-$hash.tar.gz $json_path &> /dev/null
  fi

  if echo "$name" | grep -qE "${private_tail_regex}"; then
    local proto="client_ivc_tail"
    # We still need the standalone IVC vk. We also create the final IVC vk from the tail (specifically, the number of public inputs is used from it).
    local write_vk_cmd="write_vk --scheme client_ivc --verifier_type standalone"
  elif echo "$name" | grep -qE "${ivc_regex}"; then
    local proto="client_ivc"
    local write_vk_cmd="write_vk --scheme client_ivc --verifier_type standalone"
  elif echo "$name" | grep -qE "${rollup_honk_regex}"; then
    local proto="ultra_rollup_honk"
    # --honk_recursion 2 injects a fake ipa claim
    local write_vk_cmd="write_vk --scheme ultra_honk --ipa_accumulation --honk_recursion 2"
  elif echo "$name" | grep -qE "rollup_root"; then
    local proto="ultra_keccak_honk"
    # the root rollup does not need to inject a fake ipa claim
    # and does not need to inject a default agg obj, so no -h flag
    local write_vk_cmd="write_vk --scheme ultra_honk --oracle_hash keccak"
  else
    local proto="ultra_honk"
    local write_vk_cmd="write_vk --scheme ultra_honk --init_kzg_accumulator --honk_recursion 1"
  fi
  # No vks needed for simulated circuits.
  [[ "$name" == *"simulated"* ]] && return

  # TODO: Change this to add verification_key to original json, like contracts does.
  # Will require changing TS code downstream.
  bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  hash=$(hash_str "$BB_HASH-$bytecode_hash-$proto")
  if [ "${USE_CIRCUITS_CACHE:-0}" -eq 0 ] || ! cache_download vk-$hash.tar.gz 1>&2; then
    local key_path="$key_dir/$name.vk.data.json"
    echo_stderr "Generating vk for function: $name..."
    SECONDS=0
    outdir=$(mktemp -d)
    trap "rm -rf $outdir" EXIT
    local vk_cmd="jq -r '.bytecode' $json_path | base64 -d | gunzip | $BB $write_vk_cmd -b - -o $outdir --output_format bytes_and_fields"
    echo_stderr $vk_cmd
    dump_fail "$vk_cmd"
    vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
    vk_fields=$(cat $outdir/vk_fields.json)
    # echo_stderr $vkf_cmd
    jq -n --arg vk "$vk_bytes" --argjson vkf "$vk_fields" '{keyAsBytes: $vk, keyAsFields: $vkf}' > $key_path
    echo_stderr "Key output at: $key_path (${SECONDS}s)"
    if echo "$name" | grep -qE "rollup_root"; then
      # If we are a rollup root circuit, we also need to generate the solidity verifier.
      local verifier_path="$key_dir/${name}_verifier.sol"
      SECONDS=0
      # Generate solidity verifier for this contract.
      echo "$vk_bytes" | xxd -r -p | $BB write_solidity_verifier --scheme ultra_honk --disable_zk -k - -o $verifier_path
      echo_stderr "Root rollup verifier at: $verifier_path (${SECONDS}s)"
      # Include the verifier path if we create it.
      cache_upload vk-$hash.tar.gz $key_path $verifier_path &> /dev/null
    elif echo "$name" | grep -qE "${private_tail_regex}"; then
      # If we are a tail kernel circuit, we also need to generate the ivc vk.
      SECONDS=0
      local ivc_vk_path="$key_dir/${name}.ivc.vk"
      echo_stderr "Generating ivc vk for function: $name..."
      jq -r '.bytecode' $json_path | base64 -d | gunzip | $BB write_vk --scheme client_ivc --verifier_type ivc -b - -o $outdir
      mv $outdir/vk $ivc_vk_path
      echo_stderr "IVC tail key output at: $ivc_vk_path (${SECONDS}s)"
      cache_upload vk-$hash.tar.gz $key_path $ivc_vk_path &> /dev/null
    else
      cache_upload vk-$hash.tar.gz $key_path &> /dev/null
    fi
  fi
}
export -f compile

function build {
  set -eu

  echo_stderr "Checking libraries for warnings..."
  parallel -v --line-buffer --tag $NARGO --program-dir {} check --deny-warnings ::: \
    ./crates/blob \
    ./crates/parity-lib \
    ./crates/private-kernel-lib \
    ./crates/reset-kernel-lib \
    ./crates/rollup-lib \
    ./crates/types \

  # We allow errors so we can output the joblog.
  set +e
  rm -rf target
  mkdir -p $key_dir

  [ -f "package.json" ] && denoise "yarn && yarn generate_variants"

  grep -oP '(?<=crates/)[^"]+' Nargo.toml | \
    while read -r dir; do
      toml_file=./crates/$dir/Nargo.toml
      if grep -q 'type = "bin"' "$toml_file"; then
          echo "$(basename $dir)"
      fi
    done | \
    parallel -v --line-buffer --tag --halt now,fail=1 --memsuspend $(memsuspend_limit) \
      --joblog joblog.txt compile {}
  code=$?
  cat joblog.txt
  return $code
}

function test_cmds {
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    echo "$circuits_hash noir-projects/scripts/run_test.sh noir-protocol-circuits $package $test"
  done
  # We don't blindly execute all circuits as some will have no `Prover.toml`.
  circuits_to_execute="
    private-kernel-init
    private-kernel-inner
    private-kernel-reset
    private-kernel-tail-to-public
    private-kernel-tail
    rollup-base-private
    rollup-base-public
    rollup-block-root
    rollup-block-merge
    rollup-merge rollup-root
  "
  nargo_root_rel=$(realpath --relative-to=$root $NARGO)
  for circuit in $circuits_to_execute; do
    echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/$circuit --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  done
}

function test {
  test_cmds | filter_test_cmds | parallelise
}

function format {
  [ -f "package.json" ] && denoise "yarn && yarn generate_variants"
  $NARGO fmt
}

function bench_cmds {
  prefix="$circuits_hash noir-projects/noir-protocol-circuits/scripts/run_bench.sh"
  for artifact in ./target/*.json; do
    [[ "$artifact" =~ _simulated ]] && continue
    if echo "$artifact" | grep -qEf <(printf '%s\n' "${ivc_patterns[@]}"); then
      echo "$prefix $artifact client_ivc"
    elif echo "$artifact" | grep -qEf <(printf '%s\n' "${rollup_honk_patterns[@]}"); then
      echo "$prefix $artifact ultra_honk 2"
    else
      echo "$prefix $artifact ultra_honk 1"
    fi
  done
}

function bench {
  rm -rf bench-out && mkdir -p bench-out

  bench_cmds | STRICT_SCHEDULING=1 parallelise
}

case "$cmd" in
  "bench")
    bench
    ;;
  "clean")
    git clean -fdx
    ;;
  "clean-keys")
    rm -rf $key_dir
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "compile")
    shift
    compile $1
    ;;
  test|test_cmds|bench_cmds|format)
    $cmd
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac
