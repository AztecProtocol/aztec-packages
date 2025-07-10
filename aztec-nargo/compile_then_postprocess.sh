#!/usr/bin/env bash
# This is a wrapper script for nargo.
# Pass any args that you'd normally pass to nargo.
# If the first arg is "compile",
# run nargo and then postprocess any created artifacts.
#
# Usage: compile_then_postprocess.sh [nargo args]
set -euo pipefail

dir=$(dirname $0)
NARGO=${NARGO:-"$dir/../noir/noir-repo/target/release/nargo"}
TRANSPILER=${TRANSPILER:-"$dir/../avm-transpiler/target/release/avm-transpiler"}
BB=${BB:-"$dir/../barretenberg/cpp/build/bin/bb"}


if [ "${1:-}" != "compile" ]; then
  # if not compiling, just pass through to nargo verbatim
  $NARGO $@
  exit $?
fi
shift # remove the compile arg so we can inject --show-artifact-paths

# bb --version returns 00000000.00000000.00000000, so we compute
# the binary hash to ensure we invalidate vk cache artifacts when bb changes
bb_hash=$(sha256sum "$BB" | cut -d' ' -f1)

# Forward all arguments to nargo, tee output to console.
# Nargo should be outputting errors to stderr, but it doesn't. Use tee to duplicate stdout to stderr to display errors.
artifacts_to_process=$($NARGO compile --pedantic-solving --inliner-aggressiveness 0 --show-artifact-paths $@ | tee >(cat >&2) | grep -oP 'Saved contract artifact to: \K.*')

# Postprocess each artifact
# `$artifacts_to_process` needs to be unquoted here, otherwise it will break if there are multiple artifacts
for artifact in $artifacts_to_process; do
  # Transpile in-place
  $TRANSPILER "$artifact" "$artifact"
  artifact_name=$(basename "$artifact")
  cache_dir=$(dirname "$artifact")/cache
  mkdir -p "$cache_dir"
  echo "Generating verification keys for functions in $artifact_name. Cache directory: $cache_dir"

  # See contract_artifact.ts (getFunctionType) for reference
  private_fn_indices=$(jq -r '.functions | to_entries | map(select((.value.custom_attributes | contains(["public"]) | not) and (.value.is_unconstrained == false))) | map(.key) | join(" ")' "$artifact")

  # Build a list of BB verification key generation commands
  job_commands=()
  for fn_index in $private_fn_indices; do
    fn_name=$(jq -r ".functions[$fn_index].name" "$artifact")
    # Remove debug symbols since they don't affect vk computation, but can cause cache misses
    fn_artifact=$(jq -r ".functions[$fn_index] | del(.debug_symbols)" "$artifact")
    fn_artifact_hash=$(echo "$fn_artifact-$bb_hash" | sha256sum | cut -d' ' -f1)

    # File to capture the base64 encoded verification key.
    vk_cache="$cache_dir/${artifact_name}_${fn_artifact_hash}.vk"

    # Don't regenerate if vk_cache exists
    if [ -f "$vk_cache" ]; then
      echo "Using cached verification key for function \"$fn_name\""
      continue
    fi

    fn_artifact_path="$artifact.function_artifact_$fn_index.json"
    echo "$fn_artifact" > "$fn_artifact_path"

    # Construct the command:
    # The BB call is wrapped by GNU parallel's memsuspend (active memory-based suspension)
    # This command will generate the verification key, base64 encode it, and save it to vk_cache.
    job_commands+=("echo \"Generating verification key for function $fn_name\"; $BB write_vk --scheme client_ivc --verifier_type standalone -b \"$fn_artifact_path\" -o - | base64 > \"$vk_cache\"; rm \"$fn_artifact_path\"")
  done

  # Run the commands in parallel, limiting to available cores and using memsuspend to actively suspend jobs if memory usage exceeds 2G.
  # GNU parallel will suspend a job if free memory drops below 1G.
  printf "%s\n" "${job_commands[@]}" | parallel --jobs "$(nproc)" --memsuspend 1G

  # Now, update the artifact sequentially with each generated verification key.
  for fn_index in $private_fn_indices; do
    fn_artifact=$(jq -r ".functions[$fn_index] | del(.debug_symbols)" "$artifact")
    fn_artifact_hash=$(echo "$fn_artifact-$bb_hash" | sha256sum | cut -d' ' -f1)
    vk_cache="$cache_dir/${artifact_name}_${fn_artifact_hash}.vk"
    verification_key=$(cat "$vk_cache")
    # Update the artifact with the new verification key.
    jq ".functions[$fn_index].verification_key = \"$verification_key\"" "$artifact" > "$artifact.tmp"
    mv "$artifact.tmp" "$artifact"
  done
done
