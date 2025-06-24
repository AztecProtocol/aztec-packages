use crate::{
    constants::VK_TREE_HEIGHT, merkle_tree::membership::assert_check_membership, traits::Empty,
    utils::arrays::find_index_hint,
};
use super::verification_key::VerificationKey;

#[derive(Eq)]
pub struct VkData<let VK_LENGTH: u32> {
    pub vk: VerificationKey<VK_LENGTH>,
    pub leaf_index: u32,
    pub sibling_path: [Field; VK_TREE_HEIGHT],
}

impl<let VK_LENGTH: u32> VkData<VK_LENGTH> {
    // TODO: duplicate of a function in private_kernel_data.nr?
    pub fn validate_in_vk_tree<let N: u32>(self, vk_tree_root: Field, allowed_indices: [u32; N]) {
        // Safety: find_index_hint should return an index into allowed_indices where
        // `index == index_in_allowed_list`. The assertion below then verifies that the condition is met.
        let maybe_index_hint =
            unsafe { find_index_hint(allowed_indices, |index: u32| index == self.leaf_index) };
        assert(maybe_index_hint.is_some(), "Invalid vk index"); // TODO: this is because Option::unwrap() doesn't enable a custom error message. We should add this feature.
        let index_hint = maybe_index_hint.unwrap_unchecked();
        assert_eq(allowed_indices[index_hint], self.leaf_index, "Invalid vk index");

        assert_check_membership(
            self.vk.hash,
            self.leaf_index as Field,
            self.sibling_path,
            vk_tree_root,
        );
    }
}

impl<let VK_LENGTH: u32> Empty for VkData<VK_LENGTH> {
    fn empty() -> Self {
        Self { vk: VerificationKey::empty(), leaf_index: 0, sibling_path: [0; VK_TREE_HEIGHT] }
    }
}
