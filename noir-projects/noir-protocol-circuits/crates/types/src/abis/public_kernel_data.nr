use crate::constants::VK_TREE_HEIGHT;
use crate::abis::kernel_circuit_public_inputs::{PublicKernelCircuitPublicInputs, KernelCircuitPublicInputs};
use crate::recursion::{proof::NestedRecursiveProof, verification_key::VerificationKey};

struct PublicKernelData {
    public_inputs: PublicKernelCircuitPublicInputs,
    proof: NestedRecursiveProof,
    vk: VerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
}

fn verify_public_kernel(public_kernel_data: PublicKernelData) {
    let inputs = PublicKernelCircuitPublicInputs::serialize(public_kernel_data.public_inputs);
    dep::std::verify_proof(
        public_kernel_data.vk.key.as_slice(),
        public_kernel_data.proof.fields.as_slice(),
        inputs.as_slice(),
        public_kernel_data.vk.hash
    );
}
