use crate::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{
        CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS, PRIVATE_KERNEL_RESET_INDEX, PROOF_TYPE_PG,
    },
    proof::{traits::Verifiable, vk_data::VkData},
    utils::arrays::find_index_hint,
};

pub struct PrivateKernelData {
    pub public_inputs: PrivateKernelCircuitPublicInputs,
    pub vk_data: VkData<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl PrivateKernelData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    /// Note: There's a similarly-named function in vk_data.nr.
    /// This function is different, in that it lets us set only PRIVATE_KERNEL_RESET_INDEX
    /// in the allowed_indices to allow all the reset circuits.
    /// So unfortunately we can't use the same function in vk_data.nr.
    pub fn validate_vk_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        let index_in_allowed_list = if self.vk_data.leaf_index >= PRIVATE_KERNEL_RESET_INDEX {
            // Kernel circuits only need to include PRIVATE_KERNEL_RESET_INDEX in the list to allow all private kernel reset variants.
            PRIVATE_KERNEL_RESET_INDEX
        } else {
            self.vk_data.leaf_index
        };
        // Safety: find_index_hint should return an index into allowed_indices where `index == index_in_allowed_list`.
        // The assertion below then verifies that the condition is met.
        let maybe_index_hint = unsafe {
            find_index_hint(allowed_indices, |index: u32| index == index_in_allowed_list)
        };

        // we want a custom error, which unwrap() doesn't give at the moment:
        assert(maybe_index_hint.is_some(), "Invalid vk index");
        let index_hint = maybe_index_hint.unwrap_unchecked();

        assert_eq(allowed_indices[index_hint], index_in_allowed_list, "Invalid vk index");

        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_in_vk_tree(self.public_inputs.constants.vk_tree_root);
    }
}

impl Verifiable for PrivateKernelData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    fn verify(self) {
        // Client IVC public inputs are linked in the backend via the databus
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            [],
            [],
            self.vk_data.vk.hash,
            PROOF_TYPE_PG,
        );
    }
}

pub struct PrivateKernelDataWithoutPublicInputs {
    vk_data: VkData<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl PrivateKernelDataWithoutPublicInputs {
    pub fn to_private_kernel_data(
        self,
        public_inputs: PrivateKernelCircuitPublicInputs,
    ) -> PrivateKernelData {
        PrivateKernelData { public_inputs, vk_data: self.vk_data }
    }
}
