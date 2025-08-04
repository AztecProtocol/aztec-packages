use crate::{
    abis::{
        BaseOrMergeRollupPublicInputs, BlockRollupPublicInputs, ParityRootProofData,
        RollupProofData,
    },
    block_root::components::{
        BlockRollupPublicInputsComposer, validate_parity_root, validate_previous_rollups,
    },
};
use types::constants::{
    ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, PRIVATE_BASE_ROLLUP_VK_INDEX,
    PUBLIC_BASE_ROLLUP_VK_INDEX,
};

// MERGE_ROLLUP_VK_INDEX is not allowed if there is only one previous rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] =
    [PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

/// VkIndex: BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX
pub struct BlockRootSingleTxFirstRollupPrivateInputs {
    parity_root: ParityRootProofData,
    previous_rollup: RollupProofData<BaseOrMergeRollupPublicInputs>,
    // Hint for inserting the new l1 to l2 message subtree.
    new_l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootSingleTxFirstRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_parity_root(
            self.parity_root,
            self.previous_rollup.public_inputs.constants.vk_tree_root,
        );

        validate_previous_rollups([self.previous_rollup], ALLOWED_PREVIOUS_VK_INDICES);

        BlockRollupPublicInputsComposer::new_from_single_rollup(self.previous_rollup.public_inputs)
            .with_l1_to_l2_roots(
                self.parity_root.public_inputs,
                self.new_l1_to_l2_message_subtree_sibling_path,
            )
            .finish(self.new_archive_sibling_path)
    }
}
