use types::{
    abis::kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
    constants::{MEGA_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_TAIL_INDEX, PROOF_TYPE_PG_FINAL},
    proof::vk_data::VkData,
};

pub struct HidingKernelToRollupPrivateInputs {
    previous_kernel_public_inputs: PrivateToRollupKernelCircuitPublicInputs,
    previous_kernel_vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

impl HidingKernelToRollupPrivateInputs {
    pub fn execute(self) {
        // Verify previous kernel, which contains a protogalaxy proof and a decider proof.
        // The associated public inputs and proofs are linked through the verification queue in the backend.
        // The proof type `PROOF_TYPE_PG_FINAL` designates the final proof in the client IVC sequence.
        if !std::runtime::is_unconstrained() {
            std::verify_proof_with_type(
                self.previous_kernel_vk_data.vk.key,
                [],
                [],
                self.previous_kernel_vk_data.vk.hash,
                PROOF_TYPE_PG_FINAL,
            );
        }

        // Validate that the vk index corresponds to the `private_kernel_tail` circuit.
        assert_eq(self.previous_kernel_vk_data.leaf_index, PRIVATE_KERNEL_TAIL_INDEX);

        // Validates that the vk hash exists in the vk tree at the expected index.
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.previous_kernel_vk_data.validate_in_vk_tree(
            self.previous_kernel_public_inputs.constants.vk_tree_root,
        );
    }
}

fn main(
    previous_kernel_public_inputs: call_data(0) PrivateToRollupKernelCircuitPublicInputs,
    previous_kernel_vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
) -> pub PrivateToRollupKernelCircuitPublicInputs {
    HidingKernelToRollupPrivateInputs { previous_kernel_public_inputs, previous_kernel_vk_data }
        .execute();

    previous_kernel_public_inputs
}
