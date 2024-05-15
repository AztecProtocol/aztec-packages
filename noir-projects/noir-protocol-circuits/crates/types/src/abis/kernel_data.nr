use crate::constants::VK_TREE_HEIGHT;
use crate::abis::kernel_circuit_public_inputs::KernelCircuitPublicInputs;
use crate::recursion::{proof::NestedRecursiveProof, verification_key::VerificationKey};

struct KernelData {
    public_inputs: KernelCircuitPublicInputs,
    proof: NestedRecursiveProof,
    vk: VerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
}

fn verify_kernel_proof(kernel_data: KernelData) {
    let inputs = KernelCircuitPublicInputs::serialize(kernel_data.public_inputs);
    dep::std::verify_proof(
        kernel_data.vk.key.as_slice(),
        kernel_data.proof.fields.as_slice(),
        inputs.as_slice(),
        kernel_data.vk.hash
    );
}
