#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any
export BB=${BB:-$(../../barretenberg/cpp/scripts/find-bb)}
export NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
export BB_HASH=$(../../barretenberg/cpp/bootstrap.sh hash)
export NOIR_HASH=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}

export key_dir=./target/keys
mkdir -p $key_dir

export circuits_hash=$(hash_str "$NOIR_HASH" $(cache_content_hash "^noir-projects/noir-protocol-circuits/" "^noir-projects/mock-protocol-circuits/"))

function on_exit {
  rm -f joblog.txt
}
trap on_exit EXIT

function hex_to_fields_json {
  fold -w64 | jq -R -s -c 'split("\n") | map(select(length > 0)) | map("0x" + .)'
}
export -f hex_to_fields_json

# ==============================================================================
# CIRCUIT COMPILATION
# ==============================================================================

function compile {
  set -euo pipefail
  local name=$1
  local filename="$name.json"
  local json_path="./target/$filename"

  local program_hash_cmd="$NARGO check --package $name --silence-warnings --show-program-hash | cut -d' ' -f2"
  local program_hash=$(dump_fail "$program_hash_cmd")
  echo_stderr "Hash preimage: $NOIR_HASH-$program_hash"
  local hash=$(hash_str "$NOIR_HASH-$program_hash" $(cache_content_hash "^noir-projects/noir-protocol-circuits/bootstrap.sh"))

  if ! cache_download circuit-$hash.tar.gz 1>&2; then
    SECONDS=0
    rm -f $json_path
    local compile_cmd="$NARGO compile --package $name --skip-brillig-constraints-check"
    echo_stderr "$compile_cmd"
    dump_fail "$compile_cmd"
    echo_stderr "Compilation complete for: $name (${SECONDS}s)"
    bytecode_size=$(jq -r .bytecode $json_path | base64 -d | gunzip | wc -c)
    if [ "$bytecode_size" -gt $((850 * 1024 * 1024)) ]; then
      echo "Error: $json_path bytecode size of $bytecode_size exceeds 850MB"
      exit 1
    fi
    cache_upload circuit-$hash.tar.gz $json_path &> /dev/null
  fi
}
export -f compile

# ==============================================================================
# VK GENERATION
# ==============================================================================

function generate_vk_base {
  set -euo pipefail
  local name=$1
  local bb_cmd=$2
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    jq -s '.[0] * .[1]' "$json_path" "$key_path" > "${json_path}.tmp"
    mv "${json_path}.tmp" "$json_path"
    rm $key_path
    return
  fi

  SECONDS=0
  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT

  echo_stderr "Generating vk for: $name..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | eval "$bb_cmd"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  local vk_hash=""
  [ -f $outdir/vk_hash ] && vk_hash=$(cat $outdir/vk_hash | xxd -p -c 0)

  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "$vk_hash" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  echo "$key_path"
  echo "$outdir"
  echo "$vk_bytes"
}
export -f generate_vk_base

function finalize_vk {
  local name=$1 key_path=$2
  local json_path="./target/$name.json"
  jq -s '.[0] * .[1]' "$json_path" "$key_path" > "${json_path}.tmp"
  mv "${json_path}.tmp" "$json_path"
  rm $key_path
}
export -f finalize_vk

# ==============================================================================
# COMPILE FUNCTIONS BY CIRCUIT TYPE
# ==============================================================================

# Chonk standalone (private kernels)
function compile_chonk_standalone {
  set -euo pipefail
  local name=$1
  compile "$name"
  [[ "$name" == *"simulated"* ]] && return

  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    finalize_vk "$name" "$key_path"
    return
  fi

  SECONDS=0
  echo_stderr "Generating vk for: $name (chonk_standalone)..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme chonk --verifier_type standalone -b - -o "$outdir"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  cache_upload vk-$hash.tar.gz "$key_path" &> /dev/null
  finalize_vk "$name" "$key_path"
}
export -f compile_chonk_standalone

# Chonk hiding (hiding kernels) - also generates IVC VK
function compile_chonk_hiding {
  set -euo pipefail
  local name=$1
  compile "$name"

  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    finalize_vk "$name" "$key_path"
    return
  fi

  SECONDS=0
  echo_stderr "Generating vk for: $name (chonk_hiding)..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme chonk --verifier_type standalone_hiding -b - -o "$outdir"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  # Generate IVC VK
  SECONDS=0
  local ivc_vk_path="$key_dir/${name}.ivc.vk"
  echo_stderr "Generating ivc vk for: $name..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme chonk --verifier_type ivc -b - -o "$outdir"
  mv "$outdir/vk" "$ivc_vk_path"
  echo_stderr "IVC key output at: $ivc_vk_path (${SECONDS}s)"

  cache_upload vk-$hash.tar.gz "$key_path" "$ivc_vk_path" &> /dev/null
  finalize_vk "$name" "$key_path"
}
export -f compile_chonk_hiding

# Ultra honk (parity, blob)
function compile_ultra_honk {
  set -euo pipefail
  local name=$1
  compile "$name"
  [[ "$name" == *"simulated"* ]] && return

  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    finalize_vk "$name" "$key_path"
    return
  fi

  SECONDS=0
  echo_stderr "Generating vk for: $name (ultra_honk)..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme ultra_honk -b - -o "$outdir"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  local vk_hash=$(cat $outdir/vk_hash | xxd -p -c 0)
  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "$vk_hash" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  cache_upload vk-$hash.tar.gz "$key_path" &> /dev/null
  finalize_vk "$name" "$key_path"
}
export -f compile_ultra_honk

# Ultra honk with IPA accumulation (rollup circuits)
function compile_ultra_honk_ipa {
  set -euo pipefail
  local name=$1
  compile "$name"
  [[ "$name" == *"simulated"* ]] && return

  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    finalize_vk "$name" "$key_path"
    return
  fi

  SECONDS=0
  echo_stderr "Generating vk for: $name (ultra_honk_ipa)..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme ultra_honk --ipa_accumulation -b - -o "$outdir"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  local vk_hash=$(cat $outdir/vk_hash | xxd -p -c 0)
  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "$vk_hash" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  cache_upload vk-$hash.tar.gz "$key_path" &> /dev/null
  finalize_vk "$name" "$key_path"
}
export -f compile_ultra_honk_ipa

# Ultra honk with IPA + AVM VK (rollup_tx_base_public only)
function compile_ultra_honk_ipa_avm {
  set -euo pipefail
  local name=$1
  compile "$name"
  [[ "$name" == *"simulated"* ]] && return

  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    finalize_vk "$name" "$key_path"
    return
  fi

  SECONDS=0
  echo_stderr "Generating vk for: $name (ultra_honk_ipa)..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme ultra_honk --ipa_accumulation -b - -o "$outdir"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  local vk_hash=$(cat $outdir/vk_hash | xxd -p -c 0)
  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "$vk_hash" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  # Generate AVM VK
  SECONDS=0
  local avm_vk_path="$key_dir/avm.vk"
  echo_stderr "Generating avm vk..."
  $BB avm_write_vk -o "$outdir"
  mv "$outdir/vk" "$avm_vk_path"
  echo_stderr "AVM key output at: $avm_vk_path (${SECONDS}s)"

  cache_upload vk-$hash.tar.gz "$key_path" "$avm_vk_path" &> /dev/null
  finalize_vk "$name" "$key_path"
}
export -f compile_ultra_honk_ipa_avm

# Ultra honk with keccak + solidity verifier (rollup_root only)
function compile_ultra_honk_keccak {
  set -euo pipefail
  local name=$1
  compile "$name"

  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local json_path="./target/$name.json"
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"

  if cache_download vk-$hash.tar.gz 1>&2; then
    finalize_vk "$name" "$key_path"
    return
  fi

  SECONDS=0
  echo_stderr "Generating vk for: $name (ultra_honk_keccak)..."
  jq -r '.bytecode' "$json_path" | base64 -d | gunzip | $BB write_vk --scheme ultra_honk --oracle_hash keccak -b - -o "$outdir"

  local vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
  local vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
  local vk_hash=$(cat $outdir/vk_hash | xxd -p -c 0)
  jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "$vk_hash" \
    '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
  echo_stderr "Key output at: $key_path (${SECONDS}s)"

  # Generate solidity verifier
  local verifier_path="$key_dir/${name}_verifier.sol"
  SECONDS=0
  echo "$vk_bytes" | xxd -r -p | $BB write_solidity_verifier --scheme ultra_honk --disable_zk -k - -o "$verifier_path"
  echo_stderr "Solidity verifier at: $verifier_path (${SECONDS}s)"

  cache_upload vk-$hash.tar.gz "$key_path" "$verifier_path" &> /dev/null
  finalize_vk "$name" "$key_path"
}
export -f compile_ultra_honk_keccak

# ==============================================================================
# BUILD
# ==============================================================================

function compile_cmds {
  # Private kernel circuits (chonk standalone)
  echo "compile_chonk_standalone private_kernel_init"
  echo "compile_chonk_standalone private_kernel_init_simulated"
  echo "compile_chonk_standalone private_kernel_inner"
  echo "compile_chonk_standalone private_kernel_inner_simulated"
  echo "compile_chonk_standalone private_kernel_reset"
  echo "compile_chonk_standalone private_kernel_reset_simulated"
  echo "compile_chonk_standalone private_kernel_tail"
  echo "compile_chonk_standalone private_kernel_tail_simulated"
  echo "compile_chonk_standalone private_kernel_tail_to_public"
  echo "compile_chonk_standalone private_kernel_tail_to_public_simulated"

  # Generated private_kernel_reset variants (from yarn generate_variants)
  grep -oP '(?<=autogenerated/private-kernel-reset-)[^"]+' Nargo.toml | while read -r tag; do
    echo "compile_chonk_standalone private_kernel_reset_${tag}"
  done
  grep -oP '(?<=autogenerated/private-kernel-reset-simulated-)[^"]+' Nargo.toml | while read -r tag; do
    echo "compile_chonk_standalone private_kernel_reset_simulated_${tag}"
  done

  # Hiding kernel circuits (chonk hiding + ivc_vk)
  echo "compile_chonk_hiding hiding_kernel_to_public"
  echo "compile_chonk_hiding hiding_kernel_to_rollup"

  # Rollup circuits (ultra_honk with ipa_accumulation)
  echo "compile_ultra_honk_ipa chonk_verifier_public"
  echo "compile_ultra_honk_ipa rollup_tx_base_private"
  echo "compile_ultra_honk_ipa rollup_tx_base_private_simulated"
  echo "compile_ultra_honk_ipa_avm rollup_tx_base_public"
  echo "compile_ultra_honk_ipa rollup_tx_base_public_simulated"
  echo "compile_ultra_honk_ipa rollup_tx_merge"
  echo "compile_ultra_honk_ipa rollup_block_root"
  echo "compile_ultra_honk_ipa rollup_block_root_simulated"
  echo "compile_ultra_honk_ipa rollup_block_root_first"
  echo "compile_ultra_honk_ipa rollup_block_root_first_simulated"
  echo "compile_ultra_honk_ipa rollup_block_root_first_empty_tx"
  echo "compile_ultra_honk_ipa rollup_block_root_first_single_tx"
  echo "compile_ultra_honk_ipa rollup_block_root_first_single_tx_simulated"
  echo "compile_ultra_honk_ipa rollup_block_root_single_tx"
  echo "compile_ultra_honk_ipa rollup_block_root_single_tx_simulated"
  echo "compile_ultra_honk_ipa rollup_block_merge"
  echo "compile_ultra_honk_ipa rollup_checkpoint_root"
  echo "compile_ultra_honk_ipa rollup_checkpoint_root_simulated"
  echo "compile_ultra_honk_ipa rollup_checkpoint_root_single_block"
  echo "compile_ultra_honk_ipa rollup_checkpoint_root_single_block_simulated"
  echo "compile_ultra_honk_ipa rollup_checkpoint_merge"
  echo "compile_ultra_honk_ipa rollup_checkpoint_padding"

  # Rollup root (ultra_honk with keccak + solidity verifier)
  echo "compile_ultra_honk_keccak rollup_root"

  # Parity and blob circuits (standard ultra_honk)
  echo "compile_ultra_honk parity_base"
  echo "compile_ultra_honk parity_root"
  echo "compile_ultra_honk blob"

  # Mock circuits (from mock/ folder, if present)
  if [ -d "./crates/mock" ]; then
    echo "compile_chonk_standalone mock_private_kernel_init"
    echo "compile_chonk_standalone mock_private_kernel_inner"
    echo "compile_chonk_standalone mock_private_kernel_reset"
    echo "compile_chonk_standalone mock_private_kernel_tail"
    echo "compile_chonk_standalone app_creator"
    echo "compile_chonk_standalone app_reader"
    echo "compile_chonk_hiding mock_hiding"
    echo "compile_ultra_honk_ipa mock_rollup_tx_base_private"
    echo "compile_ultra_honk_ipa mock_rollup_tx_base_public"
    echo "compile_ultra_honk_ipa mock_rollup_tx_merge"
    echo "compile_ultra_honk_keccak mock_rollup_root"
  fi
}

function build {
  set -eu

  echo_stderr "Checking libraries for warnings..."
  $NARGO --program-dir ./crates/blob check
  $NARGO --program-dir ./crates/parity-lib check
  $NARGO --program-dir ./crates/private-kernel-lib check
  $NARGO --program-dir ./crates/rollup-lib check
  $NARGO --program-dir ./crates/types check

  set +e
  rm -rf target
  mkdir -p $key_dir

  [ -f "package.json" ] && denoise "yarn && yarn generate_variants"

  compile_cmds | parallel -v --line-buffer --tag --halt now,fail=1 --memsuspend $(memsuspend_limit) --colsep ' ' --joblog joblog.txt {1} {2}

  code=$?
  cat joblog.txt
  return $code
}

# ==============================================================================
# TEST
# ==============================================================================

function test_cmds {
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    local prefix="$circuits_hash"
    if [[ "$test" =~ checkpoint || "$package" =~ "blob" ]]; then
      prefix+=":TIMEOUT=20m"
    fi
    echo "$prefix noir-projects/scripts/run_test.sh noir-protocol-circuits $package $test"
  done

  # Execute circuits with Prover.toml
  nargo_root_rel=$(realpath --relative-to=$root $NARGO)
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/private-kernel-init --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/private-kernel-inner --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/private-kernel-reset --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/private-kernel-tail-to-public --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/private-kernel-tail --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-tx-base-private --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-tx-base-public --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-tx-merge --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-block-root-first --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-block-root-first-single-tx --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-block-root-first-empty-tx --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-block-root --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-block-root-single-tx --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-block-merge --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-checkpoint-root --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-checkpoint-root-single-block --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-checkpoint-merge --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
  echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/noir-protocol-circuits/crates/rollup-root --silence-warnings --pedantic-solving --skip-brillig-constraints-check"
}

function test {
  test_cmds | filter_test_cmds | parallelize
}

# ==============================================================================
# FORMAT
# ==============================================================================

function format {
  [ -f "package.json" ] && denoise "yarn && yarn generate_variants"
  $NARGO fmt
}

# ==============================================================================
# BENCHMARK
# ==============================================================================

function bench_cmds {
  prefix="$circuits_hash noir-projects/noir-protocol-circuits/scripts/run_bench.sh"

  # IVC (chonk) circuits
  echo "$prefix ./target/private_kernel_init.json --scheme chonk"
  echo "$prefix ./target/private_kernel_inner.json --scheme chonk"
  echo "$prefix ./target/private_kernel_reset.json --scheme chonk"
  echo "$prefix ./target/private_kernel_tail.json --scheme chonk"
  echo "$prefix ./target/private_kernel_tail_to_public.json --scheme chonk"
  echo "$prefix ./target/hiding_kernel_to_public.json --scheme chonk"
  echo "$prefix ./target/hiding_kernel_to_rollup.json --scheme chonk"

  # Generated reset variants
  for artifact in ./target/private_kernel_reset_*.json; do
    [[ "$artifact" =~ _simulated ]] && continue
    echo "$prefix $artifact --scheme chonk"
  done

  # Rollup honk circuits (ultra_honk with ipa_accumulation)
  echo "$prefix ./target/chonk_verifier_public.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_tx_base_private.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_tx_base_public.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_tx_merge.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_block_root.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_block_root_first.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_block_root_first_empty_tx.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_block_root_first_single_tx.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_block_root_single_tx.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_block_merge.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_checkpoint_root.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_checkpoint_root_single_block.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_checkpoint_merge.json --scheme ultra_honk --ipa_accumulation"
  echo "$prefix ./target/rollup_checkpoint_padding.json --scheme ultra_honk --ipa_accumulation"

  # Ultra honk circuits
  echo "$prefix ./target/rollup_root.json --scheme ultra_honk"
  echo "$prefix ./target/parity_base.json --scheme ultra_honk"
  echo "$prefix ./target/parity_root.json --scheme ultra_honk"
  echo "$prefix ./target/blob.json --scheme ultra_honk"
}

function bench {
  rm -rf bench-out && mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelize
}

# ==============================================================================
# MAIN
# ==============================================================================

case "$cmd" in
  "clean-keys")
    rm -rf $key_dir
    ;;
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
