use crate::{
    abis::{BlockRollupPublicInputs, ParityRootProofData},
    block_root::components::{BlockRollupPublicInputsComposer, validate_parity_root},
};
use types::{
    abis::checkpoint_constant_data::CheckpointConstantData,
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH},
};

/// VkIndex: BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX
pub struct BlockRootEmptyTxFirstRollupPrivateInputs {
    parity_root: ParityRootProofData,

    previous_block: BlockRollupPublicInputs,
    // The previous block is not in the same checkpoint as the current block. So we need to provide the constants for
    // the current checkpoint.
    constants: CheckpointConstantData,

    // Hint for inserting the new l1 to l2 message subtree.
    new_l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootEmptyTxFirstRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_parity_root(self.parity_root, self.constants.vk_tree_root);

        BlockRollupPublicInputsComposer::new_from_previous_block(
            self.previous_block,
            self.constants,
        )
            .with_l1_to_l2_roots(
                self.parity_root.public_inputs,
                self.new_l1_to_l2_message_subtree_sibling_path,
            )
            .finish(self.new_archive_sibling_path)
    }
}
