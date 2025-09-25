use crate::{
    abis::{BlockRollupPublicInputs, TxRollupPublicInputs},
    block_root::components::{
        BlockRollupPublicInputsComposer, validate_l1_to_l2_tree_snapshot_in_constants,
        validate_parity_root, validate_previous_rollups,
    },
};
use parity_lib::ParityPublicInputs;
use types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::{RollupHonkProofData, UltraHonkProofData},
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootFirstRollupPrivateInputs {
    pub(crate) parity_root: UltraHonkProofData<ParityPublicInputs>,
    pub(crate) previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
    // Hinted value to insert the new l1-to-l2 message subtree to.
    // This will be set to the `start_start` in the public inputs and validated in the checkpoint root circuit to
    // ensure it matches the l1-to-l2 tree snapshot in the header of the last block from the previous checkpoint.
    pub(crate) previous_l1_to_l2: AppendOnlyTreeSnapshot,
    // Hint for inserting the new l1-to-l2 message subtree.
    pub(crate) new_l1_to_l2_message_subtree_root_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootFirstRollupPrivateInputs {
    /// VkIndex: BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX
    pub fn execute(self) -> BlockRollupPublicInputs {
        let previous_rollups = self.previous_rollups.map(|rollup| rollup.public_inputs);
        let mut composer = BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups);
        let new_l1_to_l2 = composer.update_l1_to_l2_tree_snapshots(
            self.parity_root.public_inputs,
            self.previous_l1_to_l2,
            self.new_l1_to_l2_message_subtree_root_sibling_path,
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
