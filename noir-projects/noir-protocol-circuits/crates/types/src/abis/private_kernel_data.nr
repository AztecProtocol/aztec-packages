use crate::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::{PRIVATE_KERNEL_RESET_INDEX, VK_TREE_HEIGHT},
    merkle_tree::membership::assert_check_membership, recursion::{verification_key::VerificationKey},
    utils::arrays::find_index_hint
};

pub struct PrivateKernelData {
    public_inputs: PrivateKernelCircuitPublicInputs,
    vk: VerificationKey,
    vk_index: u32,
    vk_path: [Field; VK_TREE_HEIGHT],
}

impl PrivateKernelData {
    fn validate_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        let index_in_allowed_list = if self.vk_index >= PRIVATE_KERNEL_RESET_INDEX {
            // Kernel circuits only need to include PRIVATE_KERNEL_RESET_INDEX in the list to allow all private kernel reset variants.
            PRIVATE_KERNEL_RESET_INDEX
        } else {
            self.vk_index
        };
        let index_hint = unsafe {
            find_index_hint(allowed_indices, |index: u32| index == index_in_allowed_list)
        };
        assert_eq(allowed_indices[index_hint], index_in_allowed_list, "Invalid vk index");

        assert_check_membership(
            self.vk.hash,
            self.vk_index as Field,
            self.vk_path,
            self.public_inputs.constants.vk_tree_root
        );
    }
}
