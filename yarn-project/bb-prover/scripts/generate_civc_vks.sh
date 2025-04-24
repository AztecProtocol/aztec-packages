#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

# NOTE: This is very hacky. we pin the captured IVC inputs to a known master commit, exploiting that there won't be frequent changes.
# TODO(https://github.com/AztecProtocol/barretenberg/issues/1296): This should just be a boolean interface,
# bypassing the need for this this scheme, until then...
#
# This prevents us from having a chicken and egg problem as IVC input generation occurs as a last phase
# and for purposes of VK generation, stale inputs work just fine.
# IF NEW INPUTS SUDDENLY DO NOT VERIFY IN THE IVC BENCH - we need to redo this:
# - Generate inputs: $root/yarn-project/end-to-end/bootstrap.sh generate_example_app_ivc_inputs
# - Upload the compressed results: aws s3 cp bb-civc-inputs-[version].tar.gz s3://aztec-ci-artifacts/protocol/bb-civc-inputs-[version].tar.gz

pinned_civc_inputs_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-civc-inputs-v3.tar.gz"
hash=$(hash_str $(../bootstrap.sh hash) "$pinned_civc_inputs_url")

if cache_download bb-prover-vks-$hash.tar.gz; then
  exit
fi

inputs_tmp_dir=$(mktemp -d)
trap 'rm -rf "$inputs_tmp_dir"' EXIT SIGINT

curl -s -f "$pinned_civc_inputs_url" | tar -xzf - -C "$inputs_tmp_dir" &>/dev/null

$root/barretenberg/cpp/scripts/generate_civc_vks.sh $inputs_tmp_dir $(pwd)/artifacts
cache_upload bb-prover-vks-$hash.tar.gz artifacts/private-civc-vk artifacts/public-civc-vk
