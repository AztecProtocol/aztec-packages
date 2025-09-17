use crate::{
    abis::{
        BaseOrMergeRollupPublicInputs, BlockRollupPublicInputs, ParityRootProofData,
        RollupProofData,
    },
    block_root::components::{
        BlockRollupPublicInputsComposer, validate_l1_to_l2_tree_snapshot_in_constants,
        validate_parity_root, validate_previous_rollups,
    },
};
use types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, MERGE_ROLLUP_VK_INDEX,
        PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX,
    },
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [MERGE_ROLLUP_VK_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

/// VkIndex: BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX
pub struct BlockRootFirstRollupPrivateInputs {
    parity_root: ParityRootProofData,
    previous_rollups: [RollupProofData<BaseOrMergeRollupPublicInputs>; 2],
    // Hinted value to insert the new l1-to-l2 message subtree to.
    // This will be set to the `start_start` in the public inputs and validated in the checkpoint root circuit to
    // ensure it matches the l1-to-l2 tree snapshot in the header of the last block from the previous checkpoint.
    previous_l1_to_l2: AppendOnlyTreeSnapshot,
    // Hint for inserting the new l1-to-l2 message subtree.
    new_l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootFirstRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        let previous_rollups = self.previous_rollups.map(|rollup| rollup.public_inputs);
        let mut composer = BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups);
        let new_l1_to_l2 = composer.update_l1_to_l2_tree_snapshots(
            self.parity_root.public_inputs,
            self.previous_l1_to_l2,
            self.new_l1_to_l2_message_subtree_sibling_path,
        );

        validate_parity_root(
            self.parity_root,
            self.previous_rollups[0].public_inputs.constants.vk_tree_root,
        );

        validate_previous_rollups(self.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

        validate_l1_to_l2_tree_snapshot_in_constants(
            self.previous_rollups[0].public_inputs.constants,
            new_l1_to_l2,
        );

        composer.finish(self.new_archive_sibling_path)
    }
}
