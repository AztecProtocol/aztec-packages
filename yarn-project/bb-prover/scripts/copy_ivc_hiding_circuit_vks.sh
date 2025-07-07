#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source
rm -rf ../artifacts
mkdir -p ../artifacts

# Copy from noir-projects. Bootstrap must have ran in noir-projects.
private_tail_vk=../../../noir-projects/noir-protocol-circuits/target/keys/private_kernel_tail.ivc.vk
private_to_public_tail_vk=../../../noir-projects/noir-protocol-circuits/target/keys/private_kernel_tail_to_public.ivc.vk
if [[ -f "$private_tail_vk" && -f "$private_to_public_tail_vk" ]]; then
  cp "$private_tail_vk" ../artifacts/private-civc-vk
  cp "$private_to_public_tail_vk" ../artifacts/public-civc-vk
else
  echo_stderr "You may need to run ./bootstrap.sh in the noir-projects folder. Could not find the IVC VKs at $private_tail_vk and $private_to_public_tail_vk."
  exit 1
fi
