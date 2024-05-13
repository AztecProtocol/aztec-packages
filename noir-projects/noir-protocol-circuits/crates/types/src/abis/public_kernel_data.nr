use crate::recursion::{proof::NestedRecursiveProof, verification_key::VerificationKey};
use crate::constants::VK_TREE_HEIGHT;
use crate::abis::kernel_circuit_public_inputs::{PublicKernelCircuitPublicInputs, KernelCircuitPublicInputs};

struct PublicKernelData {
    public_inputs: PublicKernelCircuitPublicInputs,
    proof: NestedRecursiveProof,
    vk: VerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
}
