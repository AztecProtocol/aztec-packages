use crate::{
    abis::{BlockRollupPublicInputs, ParityRootProofData, RollupProofData, TxRollupPublicInputs},
    block_root::components::{
        BlockRollupPublicInputsComposer, validate_parity_root, validate_previous_rollups,
    },
};
use types::constants::{
    ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
    PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootFirstRollupPrivateInputs {
    pub(crate) parity_root: ParityRootProofData,
    pub(crate) previous_rollups: [RollupProofData<TxRollupPublicInputs>; 2],
    // Hint for inserting the new l1 to l2 message subtree.
    pub(crate) new_l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootFirstRollupPrivateInputs {
    /// VkIndex: BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_parity_root(
            self.parity_root,
            self.previous_rollups[0].public_inputs.constants.vk_tree_root,
        );

        validate_previous_rollups(self.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

        let previous_rollups = self.previous_rollups.map(|rollup| rollup.public_inputs);
        BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups)
            .with_l1_to_l2_roots(
                self.parity_root.public_inputs,
                self.new_l1_to_l2_message_subtree_sibling_path,
            )
            .finish(self.new_archive_sibling_path)
    }
}
