use crate::abis::PublicChonkVerifierPublicInputs;
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    constants::HIDING_KERNEL_TO_PUBLIC_VK_INDEX, proof::proof_data::ChonkProofData,
};

// CHONK_VERIFIER: Recursively verifies Chonk (Client Honk) proofs in circuits
pub struct PublicChonkVerifierPrivateInputs {
    hiding_kernel_proof_data: ChonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
    prover_id: Field,
}

impl PublicChonkVerifierPrivateInputs {
    /// This circuit is created so that verification of the `hiding_kernel_to_public` can run in parallel with
    /// verification of the avm, to speed up the overall proving time.
    ///
    /// VkIndex: PUBLIC_CHONK_VERIFIER_VK_INDEX
    pub fn execute(self) -> PublicChonkVerifierPublicInputs {
        if !dep::std::runtime::is_unconstrained() {
            self.hiding_kernel_proof_data.verify_proof();
        }

        assert_eq(
            self.hiding_kernel_proof_data.vk_data.leaf_index,
            HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
        );

        let vk_tree_root = self.hiding_kernel_proof_data.public_inputs.constants.vk_tree_root;
        self.hiding_kernel_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);

        PublicChonkVerifierPublicInputs {
            private_tail: self.hiding_kernel_proof_data.public_inputs,
            prover_id: self.prover_id,
        }
    }
}
