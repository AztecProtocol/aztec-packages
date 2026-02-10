use crate::abis::PublicChonkVerifierPublicInputs;
use types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    constants::HIDING_KERNEL_TO_PUBLIC_VK_INDEX, proof::proof_data::ChonkProofData,
};

pub struct PublicChonkVerifierPrivateInputs {
    hiding_kernel_proof_data: ChonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
    prover_id: Field,
}

/// Recursively verifies Chonk (Client Honk) proofs in circuits.
/// This circuit is created so that verification of the `hiding_kernel_to_public` can run in parallel with
/// verification of the avm, to speed up the overall proving time.
///
/// VkIndex: PUBLIC_CHONK_VERIFIER_VK_INDEX
pub fn execute(inputs: PublicChonkVerifierPrivateInputs) -> PublicChonkVerifierPublicInputs {
    if !::std::runtime::is_unconstrained() {
        inputs.hiding_kernel_proof_data.verify_proof();
    }

    assert_eq(inputs.hiding_kernel_proof_data.vk_data.leaf_index, HIDING_KERNEL_TO_PUBLIC_VK_INDEX);

    let vk_tree_root = inputs.hiding_kernel_proof_data.public_inputs.constants.vk_tree_root;
    inputs.hiding_kernel_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);

    PublicChonkVerifierPublicInputs {
        private_tail: inputs.hiding_kernel_proof_data.public_inputs,
        prover_id: inputs.prover_id,
    }
}
