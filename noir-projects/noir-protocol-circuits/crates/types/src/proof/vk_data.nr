use crate::{
    constants::VK_TREE_HEIGHT, merkle_tree::check_membership, traits::Empty,
    utils::arrays::find_first_index,
};
use super::verification_key::VerificationKey;

#[derive(Eq)]
pub struct VkData<let VK_LENGTH: u32> {
    pub vk: VerificationKey<VK_LENGTH>,
    pub leaf_index: u32,
    pub sibling_path: [Field; VK_TREE_HEIGHT],
}

impl<let VK_LENGTH: u32> VkData<VK_LENGTH> {
    pub fn validate_allowed_in_vk_tree<let N: u32>(
        self,
        vk_tree_root: Field,
        allowed_indices: [u32; N],
    ) {
        // Safety: `index_hint` is validated against the `allowed_indices` array below.
        // If an incorrect hint is provided, the validation will fail, affecting only the prover.
        let index_hint =
            unsafe { find_first_index(allowed_indices, |index: u32| index == self.leaf_index) };
        assert(index_hint != N, "Vk index not in allowed list");
        // If `index_hint` exceeds `N`, the code below will trigger an index-out-of-bounds error. Such a case would
        // require the return value of the unconstrained `find_first_index` to be intentionally manipulated, so we don't
        // care the error message isn't more explicit.
        assert_eq(allowed_indices[index_hint], self.leaf_index, "Invalid vk index");

        self.validate_in_vk_tree(vk_tree_root);
    }

    pub fn validate_in_vk_tree(self, vk_tree_root: Field) {
        assert(
            check_membership(
                self.vk.hash,
                self.leaf_index as Field,
                self.sibling_path,
                vk_tree_root,
            ),
            "Membership check failed: vk hash not found in vk tree",
        );
    }
}

impl<let VK_LENGTH: u32> Empty for VkData<VK_LENGTH> {
    fn empty() -> Self {
        Self { vk: VerificationKey::empty(), leaf_index: 0, sibling_path: [0; VK_TREE_HEIGHT] }
    }
}
