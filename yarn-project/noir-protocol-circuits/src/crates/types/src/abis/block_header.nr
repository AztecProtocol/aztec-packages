use crate::hash::pedersen_hash;

use crate::block::Block;

// docs:start:block-header
struct BlockHeader {
    archive_root : Field,
    block : Block,
    // Private data
    // This is marked in the cpp code as an enhancement
    private_kernel_vk_tree_root : Field,
}
// docs:end:block-header

impl BlockHeader {
    fn assert_is_zero(self) {
        self.block.assert_is_zero();
        assert(self.private_kernel_vk_tree_root == 0);
    }

    fn to_array(self) -> [Field;7] {
        // This comment was copied from the cpp codebase.
        //
        // TODO(#3441): Note private_kernel_vk_tree_root, is not included yet as
        // it is not present in noir,
        [
            self.block.note_hash_tree_root,
            self.block.nullifier_tree_root,
            self.block.contract_tree_root,
            self.block.l1_to_l2_messages_tree_root,
            self.archive_root,
            self.block.public_data_tree_root,
            self.block.global_variables_hash
        ]
    }
    
    fn note_hash_tree_root(self) -> Field {
        self.block.note_hash_tree_root
    }

    fn contract_tree_root(self) -> Field {
        self.block.contract_tree_root
    }

    pub fn block_hash(self) -> Field {
        // TODO(#3442): Unify the ordering in `BlockHeader::serialize` function and the ordering
        // in the block hash preimage --> This requires changes in the circuits.
        let inputs = [
            self.global_variables_hash,
            self.note_hash_tree_root,
            self.nullifier_tree_root,
            self.contract_tree_root,
            self.l1_to_l2_messages_tree_root,
            self.public_data_tree_root
        ];
        pedersen_hash(inputs, GENERATOR_INDEX__BLOCK_HASH)
    }
}
