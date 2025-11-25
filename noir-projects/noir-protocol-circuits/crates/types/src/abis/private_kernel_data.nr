use crate::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{
        MEGA_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_RESET_INDEX, PROOF_TYPE_HN, PROOF_TYPE_HN_TAIL,
    },
    proof::vk_data::VkData,
    utils::arrays::find_first_index,
};

pub struct PrivateKernelData {
    pub public_inputs: PrivateKernelCircuitPublicInputs,
    pub vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

impl PrivateKernelData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    /// Note: There's a similar function in vk_data.nr. This function is slightly different but necessary, because it
    /// lets us set only `PRIVATE_KERNEL_RESET_INDEX` in the `allowed_indices` to allow all the reset circuits.
    pub fn validate_vk_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        let vk_index = if self.vk_data.leaf_index >= PRIVATE_KERNEL_RESET_INDEX {
            // Kernel circuits only need to include `PRIVATE_KERNEL_RESET_INDEX` in the list to allow all private kernel
            // reset variants.
            PRIVATE_KERNEL_RESET_INDEX
        } else {
            self.vk_data.leaf_index
        };

        // Safety: `index_hint` is validated against the `allowed_indices` array below.
        // If an incorrect hint is provided, the validation will fail, affecting only the prover.
        let index_hint = unsafe { find_first_index(allowed_indices, |index| index == vk_index) };
        assert(index_hint != N, "Vk index not in allowed list");
        // If `index_hint` exceeds `N`, the code below will trigger an index-out-of-bounds error. Such a case would
        // require the return value of the unconstrained `find_first_index` to be intentionally manipulated, so we don't
        // care the error message isn't more explicit.
        assert_eq(allowed_indices[index_hint], vk_index, "Invalid vk index");

        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_in_vk_tree(self.public_inputs.constants.vk_tree_root);
    }
    pub fn verify(self, is_last_kernel: bool) {
        let mut proof_type = PROOF_TYPE_HN;
        // Chonk public inputs are linked in the backend via the databus
        if is_last_kernel {
            proof_type = PROOF_TYPE_HN_TAIL;
        }
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            [],
            [],
            self.vk_data.vk.hash,
            proof_type,
        );
    }
}

pub struct PrivateKernelDataWithoutPublicInputs {
    pub vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

impl PrivateKernelDataWithoutPublicInputs {
    pub fn to_private_kernel_data(
        self,
        public_inputs: PrivateKernelCircuitPublicInputs,
    ) -> PrivateKernelData {
        PrivateKernelData { public_inputs, vk_data: self.vk_data }
    }
}
