use crate::{
    block::Block,
    constants::{
        BLOCK_HEADER_LENGTH,
        GENERATOR_INDEX__BLOCK_HASH,
    },
    hash::pedersen_hash,
};

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
    pub fn assert_is_zero(self) {
        assert(self.archive_root == 0);
        self.block.assert_is_zero();
        assert(self.private_kernel_vk_tree_root == 0);
    }

    pub fn serialize(self) -> [Field; BLOCK_HEADER_LENGTH] {
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

    pub fn deserialize(deserialized: [Field; BLOCK_HEADER_LENGTH]) -> Self {
        BlockHeader {
            archive_root: deserialized[4],
            block: Block {
                note_hash_tree_root: deserialized[0],
                nullifier_tree_root: deserialized[1],
                contract_tree_root: deserialized[2],
                l1_to_l2_messages_tree_root: deserialized[3],
                public_data_tree_root: deserialized[5],
                global_variables_hash: deserialized[6],
            },
            private_kernel_vk_tree_root: 0, // TODO(#3441)
        }
    }
    
    pub fn note_hash_tree_root(self) -> Field {
        self.block.note_hash_tree_root
    }

    pub fn contract_tree_root(self) -> Field {
        self.block.contract_tree_root
    }

    pub fn block_hash(self) -> Field {
        // TODO(#3442): Unify the ordering in `BlockHeader::serialize` function and the ordering
        // in the block hash preimage --> This requires changes in the circuits.
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3595)
        self.block.hash()
    }
}
