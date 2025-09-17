use crate::{
    abis::{BlockRollupPublicInputs, ParityRootProofData},
    block_root::components::{BlockRollupPublicInputsComposer, validate_parity_root},
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, sponge_blob::SpongeBlob,
        state_reference::StateReference,
    },
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH},
};

/// VkIndex: BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX
pub struct BlockRootEmptyTxFirstRollupPrivateInputs {
    parity_root: ParityRootProofData,

    previous_archive: AppendOnlyTreeSnapshot,
    previous_state: StateReference,
    // The previous block is not in the same checkpoint as the current block. So we need to provide the constants for
    // the current checkpoint.
    constants: CheckpointConstantData,
    // The start sponge blob of this block. No data has been absorbed yet, since it's the first block. But it must be
    // initialized with the total number of blob fields in the entire checkpoint.
    start_sponge_blob: SpongeBlob,
    // The timestamp of this block. It's given as a free value here, but will be checked against the previous block's
    // timestamp in the checkpoint root.
    timestamp: u64,

    // Hint for inserting the new l1 to l2 message subtree.
    new_l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootEmptyTxFirstRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_parity_root(self.parity_root, self.constants.vk_tree_root);

        BlockRollupPublicInputsComposer::new_from_no_rollups(
            self.previous_archive,
            self.previous_state,
            self.constants,
            self.start_sponge_blob,
            self.timestamp,
        )
            .with_new_l1_to_l2_messages(
                self.parity_root.public_inputs,
                self.new_l1_to_l2_message_subtree_sibling_path,
            )
            .finish(self.new_archive_sibling_path)
    }
}
