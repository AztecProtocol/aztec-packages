#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source
rm -rf ../artifacts
mkdir -p ../artifacts

# Copy from noir-projects. Bootstrap must have ran in noir-projects.
private_to_rollup_vk=../../../noir-projects/noir-protocol-circuits/target/keys/hiding_kernel_to_rollup.ivc.vk
private_to_public_vk=../../../noir-projects/noir-protocol-circuits/target/keys/hiding_kernel_to_public.ivc.vk
if [[ -f "$private_to_rollup_vk" && -f "$private_to_public_vk" ]]; then
  cp "$private_to_rollup_vk" ../artifacts/private-civc-vk
  cp "$private_to_public_vk" ../artifacts/public-civc-vk
else
  echo_stderr "You may need to run ./bootstrap.sh in the noir-projects folder. Could not find the IVC VKs at $private_to_rollup_vk and $private_to_public_vk."
  exit 1
fi
