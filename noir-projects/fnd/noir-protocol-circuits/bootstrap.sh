#!/usr/bin/env bash
# Look at noir-contracts bootstrap.sh for some tips r.e. bash.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# entrypoint for mock circuits
if [ -n "${NOIR_PROTOCOL_CIRCUITS_WORKING_DIR:-}" ]; then
  cd "$NOIR_PROTOCOL_CIRCUITS_WORKING_DIR"
fi

export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-16}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
export PLATFORM_TAG=any
export BB=${BB:-$(../../../barretenberg/cpp/scripts/find-bb)}
export NARGO=${NARGO:-../../../noir/noir-repo/target/release/nargo}
export BB_HASH=$(../../../barretenberg/cpp/bootstrap.sh hash)
export NOIR_HASH=${NOIR_HASH:-$(../../../noir/bootstrap.sh hash)}

export key_dir=./target/keys
mkdir -p $key_dir

# Allows reusing this script when running from mock-protocol-circuits dir.
project_name=$(basename "$PWD")
# Hash of the entire protocol circuits.
# Needed for test hash, as we presently don't have a program hash for each individual test.
# Means if anything within the dir changes, the tests will rerun.
export circuits_hash=$(hash_str "$NOIR_HASH" $(cache_content_hash "^noir-projects/fnd/$project_name/crates/" "^noir-projects/fnd/noir-protocol-circuits/bootstrap.sh"))

# Circuits matching these patterns we have chonk keys computed, rather than ultra-honk.
# Each entry is `{ pattern, kind }` where kind ∈ {app, kernel, hiding}. The kind is forwarded to
# `bb write_vk --scheme chonk --circuit_kind <kind>` because each kind selects a distinct
# Mega flavor (MegaAppFlavor / MegaKernelFlavor / MegaZKFlavor) with a distinct VK shape.
readarray -t ivc_kernel_patterns < <(jq -r '.[] | select(.kind == "kernel") | .pattern' "../chonk_circuits.json")
readarray -t ivc_app_patterns < <(jq -r '.[] | select(.kind == "app") | .pattern' "../chonk_circuits.json")
ivc_hiding_pattern=("hiding")
readarray -t rollup_honk_patterns < <(jq -r '.[]' "../rollup_honk_circuits.json")
# Convert to regex strings here and export for use in exported functions.
export ivc_kernel_regex=$(IFS="|"; echo "${ivc_kernel_patterns[*]}")
export ivc_app_regex=$(IFS="|"; echo "${ivc_app_patterns[*]}")
export hiding_kernel_regex=$(IFS="|"; echo "${ivc_hiding_pattern[*]}")
export rollup_honk_regex=$(IFS="|"; echo "${rollup_honk_patterns[*]}")

# Classifies a circuit artifact by name: the three chonk circuit kinds, the two ultra-honk rollup
# configurations, and plain ultra_honk for everything else. Every place that picks bb flags for a
# circuit derives them from this, so the VKs the build writes and the bench that measures the same
# circuits cannot disagree on its scheme.
function circuit_kind {
  local name=$1
  if echo "$name" | grep -qE "${hiding_kernel_regex}"; then
    echo hiding
  elif echo "$name" | grep -qE "${ivc_kernel_regex}"; then
    echo kernel
  elif echo "$name" | grep -qE "${ivc_app_regex}"; then
    echo app
  elif echo "$name" | grep -qE "${rollup_honk_regex}"; then
    echo rollup_honk
  elif echo "$name" | grep -qE "rollup_root"; then
    echo rollup_root
  else
    echo ultra_honk
  fi
}

function on_exit {
  rm -f joblog.txt
}
trap on_exit EXIT

function hex_to_fields_json {
  # 1. split encoded hex into 64-character lines 3. encode as JSON array of hex strings
  fold -w64 | jq -R -s -c 'split("\n") | map(select(length > 0)) | map("0x" + .)'
}

function compile {
  set -euo pipefail
  local dir=$1
  local name=${dir//-/_}
  local filename="$name.json"
  local json_path="./target/$filename"

  # We get the monomorphized program hash from nargo. If this changes, we have to recompile.
  local program_hash_cmd="$NARGO check --package $name --silence-warnings --show-program-hash | cut -d' ' -f2"
  # echo_stderr $program_hash_cmd
  local program_hash=$(dump_fail "$program_hash_cmd")
  echo_stderr "Hash preimage: $NOIR_HASH-$program_hash"
  local hash=$(hash_str "$NOIR_HASH-$program_hash" $(cache_content_hash "^noir-projects/fnd/noir-protocol-circuits/bootstrap.sh"))
  # Note: an edge case: If you change the name of a circuit public input, but don't change any of the
  # circuit's bytecode, then this bootstrap script will not re-compile the circuits. You can force a
  # re-compilation by temporarily replacing $NOIR_HASH on the above two lines with:
  # `$NOIR_HASH-$program_hash-$circuits_hash"`
  # We don't want to include `-$circuits_hash"` ordinarily, because it would force unnecessary
  # rebuilds when tests / comments are changed.

  if ! cache_download circuit-$hash.tar.gz 1>&2; then
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

  generate_vk "$name"
}

function generate_vk {
  set -euo pipefail
  local name=$1
  local json_path="./target/$name.json"

  # No vks needed for simulated circuits.
  [[ "$name" == *"simulated"* ]] && return

  # Add verification key to original json, similar to contracts.
  # This adds keyAsBytes and keyAsFields to the JSON artifact.
  local bytecode_hash=$(jq -r '.bytecode' $json_path | sha256sum | tr -d ' -')
  local hash=$(hash_str "$BB_HASH-$bytecode_hash-$name-3")
  local key_path="$key_dir/$name.vk.data.json"
  if ! cache_download vk-$hash.tar.gz 1>&2; then
    SECONDS=0
    local outdir=$(mktemp -d)
    trap "rm -rf $outdir" EXIT
    function write_vk {
      local kind=$(circuit_kind "$name")
      case $kind in
        hiding|kernel|app)
          $BB write_vk --scheme chonk --circuit_kind $kind -b - -o $outdir ;;
        rollup_honk)
          $BB write_vk --scheme ultra_honk --ipa_accumulation -b - -o $outdir ;;
        rollup_root)
          $BB write_vk --scheme ultra_honk --oracle_hash keccak -b - -o $outdir ;;
        *)
          $BB write_vk --scheme ultra_honk -b - -o $outdir ;;
      esac
    }

    echo_stderr "Generating vk for function: $name..."
    jq -r '.bytecode' $json_path | base64 -d | gunzip | write_vk
    vk_bytes=$(cat $outdir/vk | xxd -p -c 0)
    # Split the hex-encoded vk bytes into fields boundaries (but still hex-encoded), first making 64-character lines and then encoding as JSON.
    # This used to be done by barretenberg itself, but with serialization now always being in field elements we can do it outside of bb.
    vk_fields=$(echo "$vk_bytes" | hex_to_fields_json)
    if [ -f $outdir/vk_hash ]; then
      # not created in chonk
      vk_hash=$(cat $outdir/vk_hash | xxd -p -c 0)
    else
      vk_hash=""
    fi
    jq -n --arg vk "$vk_bytes" --argjson vk_fields "$vk_fields" --arg vk_hash "$vk_hash" \
      '{verificationKey: {bytes: $vk, fields: $vk_fields, hash: $vk_hash}}' > $key_path
    echo_stderr "Key output at: $key_path (${SECONDS}s)"

    if echo "$name" | grep -qE "rollup_root"; then
      # If we are a rollup root circuit, we also need to generate the solidity verifier.
      local verifier_path="$key_dir/${name}_verifier.sol"
      SECONDS=0
      # Generate solidity verifier for this contract.
      # TODO(AD) ensure this passes.
      echo "$vk_bytes" | xxd -r -p | $BB write_solidity_verifier --scheme ultra_honk --disable_zk -k - -o $verifier_path --optimized
      echo_stderr "Root rollup verifier at: $verifier_path (${SECONDS}s)"
      # Include the verifier path if we create it.
      cache_upload vk-$hash.tar.gz $key_path $verifier_path &> /dev/null
    else
      cache_upload vk-$hash.tar.gz $key_path &> /dev/null
    fi
  fi
  # VK was downloaded from cache, update the JSON artifact with VK information
  jq -s '.[0] * .[1]' "$json_path" "$key_path" > "${json_path}.tmp"
  mv "${json_path}.tmp" "$json_path"
  # Remove temporary json file
  rm $key_path
}
function check_pinned_vk {
  set -euo pipefail
  local name=$1
  local json_path="./target/$name.json"
  local before=$(jq -r '.verificationKey.bytes // empty' "$json_path")
  generate_vk "$name"
  local after=$(jq -r '.verificationKey.bytes // empty' "$json_path")
  if [[ "$before" != "$after" ]]; then
    if [[ "${NOIR_PROTOCOL_CIRCUITS_REGEN_STALE_VKS:-0}" == "1" ]]; then
      echo_stderr "WARNING: pinned VK for $name does not match the current bb; building with the regenerated VK."
    else
      echo_stderr "ERROR: pinned VK for $name does not match the VK the current bb computes from its pinned bytecode."
      echo_stderr "A bb proof-system change invalidates pinned VKs even when the bytecode is unchanged."
      echo_stderr "Refresh and commit the pin with './bootstrap.sh pin-build', or set NOIR_PROTOCOL_CIRCUITS_REGEN_STALE_VKS=1 to build with regenerated VKs locally."
      return 1
    fi
  fi
}

export -f hex_to_fields_json circuit_kind compile generate_vk check_pinned_vk

function build {
  set -eu

  # Build output describing target/. Removed up front so a build that stops before regenerating it
  # cannot leave a config beside artifacts it does not describe.
  rm -f private_kernel_reset_config.json

  # If pinned-build.tar.gz exists, use it instead of compiling.
  if [ -f pinned-build.tar.gz ]; then
    echo_stderr "Using pinned-build.tar.gz instead of compiling."
    rm -rf target
    mkdir -p target
    tar xzf pinned-build.tar.gz -C target
    mkdir -p $key_dir
    # The pin freezes bytecode AND VKs, but VKs depend on the current bb: a proof-system change can
    # alter the VK for unchanged bytecode, and a stale pinned VK makes proofs fail self-verification
    # at proving time. Recompute each VK against the current bb (cached by BB_HASH and bytecode, so
    # this is cheap until bb changes) and fail the build on any mismatch, forcing an explicit pin refresh.
    set +e
    ls target/*.json | xargs -n1 basename -s .json | grep -v simulated | \
      parallel -v --line-buffer --tag --halt now,fail=1 --memsuspend $(memsuspend_limit) \
        --joblog joblog.txt check_pinned_vk {}
    local code=$?
    cat joblog.txt
    set -e
    [ "$code" -eq 0 ] || return $code
    generate_reset_config
    return
  fi

  if [[ -z NOIR_PROTOCOL_CIRCUITS_SKIP_CHECK_WARNINGS ]]; then
    echo_stderr "Checking libraries for warnings..."
    parallel -v --line-buffer --tag $NARGO --program-dir {} check ::: \
      ./crates/blob \
      ./crates/private-kernel-lib \
      ./crates/rollup-lib \
      ./crates/types
  fi

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
  [ "$code" -eq 0 ] || return $code

  generate_reset_config
}

# Writes private_kernel_reset_config.json: the variant catalog with the gate count `bb gates` reports
# for each freshly-compiled variant. The variant selector downstream reads it, so the release stages
# it into protocol-circuits-artifacts next to the circuits. Run after the variants are compiled.
function generate_reset_config {
  set -euo pipefail
  # The mock circuits reuse this script but have no reset variant catalog.
  [ -f ./scripts/generate_reset_config.js ] || return 0
  echo_stderr "Measuring reset variant costs..."
  denoise "BB=$BB node ./scripts/generate_reset_config.js"
}

function test_cmds {
  $NARGO test --list-tests --silence-warnings | sort | while read -r package test; do
    local prefix="$circuits_hash"
    if [[ "$test" =~ checkpoint || "$package" =~ "blob" ]]; then
      prefix+=":TIMEOUT=20m"
    fi
    echo "$prefix noir-projects/fnd/scripts/run_test.sh noir-protocol-circuits $package $test"
  done
  # Unit tests of the reset config generator, keyed on the scripts they cover rather than the circuits.
  if [ -f ./scripts/generate_reset_config.test.js ]; then
    local scripts_hash=$(hash_str $(cache_content_hash "^noir-projects/fnd/noir-protocol-circuits/scripts/"))
    echo "$scripts_hash node --test noir-projects/fnd/noir-protocol-circuits/scripts/generate_reset_config.test.js"
  fi
  # The mock circuits reuse this script; the classifier test lives with the real circuits only.
  if [ -f ./scripts/circuit_kind.test.sh ]; then
    local classifier_hash=$(hash_str $(cache_content_hash \
      "^noir-projects/fnd/noir-protocol-circuits/bootstrap.sh" \
      "^noir-projects/fnd/noir-protocol-circuits/scripts/circuit_kind.test.sh" \
      "^noir-projects/fnd/chonk_circuits.json" \
      "^noir-projects/fnd/rollup_honk_circuits.json"))
    echo "$classifier_hash noir-projects/fnd/noir-protocol-circuits/scripts/circuit_kind.test.sh"
  fi
  # We don't blindly execute all circuits as some will have no `Prover.toml`.
  circuits_to_execute="
    private-kernel-init
    private-kernel-inner
    private-kernel-reset
    private-kernel-reset-tail-to-public
    private-kernel-reset-tail
    rollup-tx-base-private
    rollup-tx-base-public
    rollup-tx-merge
    rollup-block-root
    rollup-block-root-single-tx
    rollup-block-root-no-txs
    rollup-block-merge
    rollup-checkpoint-root
    rollup-checkpoint-root-single-block
    rollup-checkpoint-merge
    rollup-root
  "
  nargo_root_rel=$(realpath --relative-to=$root $NARGO)
  for circuit in $circuits_to_execute; do
    echo "$circuits_hash $nargo_root_rel execute --program-dir noir-projects/fnd/noir-protocol-circuits/crates/$circuit --silence-warnings  --skip-brillig-constraints-check"
  done
}

function test {
  test_cmds | filter_test_cmds | parallelize
}

function format {
  [ -f "package.json" ] && denoise "yarn && yarn generate_variants"
  $NARGO fmt
}

function bench_cmds {
  prefix="$circuits_hash noir-projects/fnd/noir-protocol-circuits/scripts/run_bench.sh"
  for artifact in ./target/*.json; do
    [[ "$artifact" =~ _simulated ]] && continue
    case $(circuit_kind "$(basename "$artifact" .json)") in
      hiding|kernel|app) echo "$prefix $artifact --scheme chonk" ;;
      rollup_honk) echo "$prefix $artifact --scheme ultra_honk --ipa_accumulation" ;;
      *) echo "$prefix $artifact --scheme ultra_honk" ;;
    esac
  done
}

function bench {
  rm -rf bench-out && mkdir -p bench-out

  bench_cmds | STRICT_SCHEDULING=1 parallelize
}

# Generates the workspace files (Nargo.toml, crates/autogenerated), which are git-ignored
# and must exist before nargo can run in this workspace. CI runs this via the root
# Makefile's noir-protocol-circuits-variants target.
function generate_variants {
  set -eu
  yarn
  node ./scripts/generate_variants.js
}

function pin-build {
  # Force a real build by removing any existing pinned archive.
  rm -f pinned-build.tar.gz
  build
  echo_stderr "Creating pinned-build.tar.gz from target..."
  tar czf pinned-build.tar.gz -C target .
  echo_stderr "Done. pinned-build.tar.gz created. Commit it to pin these artifacts."
}

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
