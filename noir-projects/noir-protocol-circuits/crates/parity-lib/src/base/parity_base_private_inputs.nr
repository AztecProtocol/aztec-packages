use crate::parity_public_inputs::ParityPublicInputs;
use dep::types::{constants::NUM_MSGS_PER_BASE_PARITY, merkle_tree::MerkleTree};

pub struct ParityBasePrivateInputs {
    pub(crate) msgs: [Field; NUM_MSGS_PER_BASE_PARITY],
    pub(crate) vk_tree_root: Field,
}

impl ParityBasePrivateInputs {
    /// VkIndex: PARITY_BASE_VK_INDEX
    pub fn execute(self) -> ParityPublicInputs {
        let sha_tree = MerkleTree::new_sha(self.msgs);
        let poseidon_tree = MerkleTree::new(self.msgs);

        ParityPublicInputs {
            sha_root: sha_tree.get_root(),
            converted_root: poseidon_tree.get_root(),
            vk_tree_root: self.vk_tree_root,
        }
    }
}
