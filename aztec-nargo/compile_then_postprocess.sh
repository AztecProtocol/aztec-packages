#!/usr/bin/env bash
# This is a wrapper script for nargo.
# Pass any args that you'd normally pass to nargo.
# If the first arg is "compile",
# run nargo and then postprocess any created artifacts.
#
# Usage: compile_then_postprocess.sh [nargo args]
set -eu

NARGO=${NARGO:-nargo}
TRANSPILER=${TRANSPILER:-avm-transpiler}
BB=${BB:-bb}

if [ "${1:-}" != "compile" ]; then
  # if not compiling, just pass through to nargo verbatim
  $NARGO $@
  exit $?
fi
shift # remove the compile arg so we can inject --show-artifact-paths

# Forward all arguments to nargo, tee output to console
artifacts_to_process=$($NARGO compile --inliner-aggressiveness 0 --show-artifact-paths $@ | tee /dev/tty | grep -oP 'Saved contract artifact to: \K.*')

# NOTE: the output that is teed to /dev/tty will normally not be redirectable by the caller.
# If the script is run via docker, however, the user will see this output on stdout and will be able to redirect.

# Postprocess each artifact
# `$artifacts_to_process` needs to be unquoted here, otherwise it will break if there are multiple artifacts
for artifact in $artifacts_to_process; do
  # transpiler input and output files are the same (modify in-place)
  $TRANSPILER "$artifact" "$artifact"
  artifact_name=$(basename "$artifact")
  echo "Generating verification keys for functions in $artifact_name"
  # See contract_artifact.ts (getFunctionType) for reference
  private_fn_indices=$(jq -r '.functions | to_entries | map(select((.value.custom_attributes | contains(["public"]) | not) and (.value.is_unconstrained == false))) | map(.key) | join(" ")' $artifact)
  for fn_index in $private_fn_indices; do
    fn_name=$(jq -r ".functions[$fn_index].name" $artifact)
    fn_artifact=$(jq -r ".functions[$fn_index]" $artifact)
    fn_artifact_path="$artifact.function_artifact_$fn_index.json"
    echo $fn_artifact > $fn_artifact_path

    echo "Generating verification key for function $fn_name"
    # BB outputs the verification key to stdout as raw bytes, however, we need to base64 encode it before storing it in the artifact
    verification_key=$($BB write_vk_mega_honk -h -b ${fn_artifact_path} -o - | base64)
    rm $fn_artifact_path
    jq ".functions[$fn_index].verification_key = \"$verification_key\"" $artifact > $artifact.tmp
    mv $artifact.tmp $artifact
  done
done
