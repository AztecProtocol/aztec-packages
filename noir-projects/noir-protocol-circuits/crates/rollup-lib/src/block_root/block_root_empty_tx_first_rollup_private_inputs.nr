use crate::{
    abis::{BlockRollupPublicInputs, ParityRootProofData},
    block_root::components::{BlockRollupPublicInputsComposer, validate_parity_root},
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_header::BlockHeader,
        checkpoint_constant_data::CheckpointConstantData, sponge_blob::SpongeBlob,
    },
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH},
};

/// VkIndex: BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX
pub struct BlockRootEmptyTxFirstRollupPrivateInputs {
    parity_root: ParityRootProofData,

    previous_block_header: BlockHeader,
    previous_archive: AppendOnlyTreeSnapshot,
    // The previous block is not in the same checkpoint as the current block. So we need to provide the constants for
    // the current checkpoint.
    constants: CheckpointConstantData,
    // The start sponge blob of this block. No data has been absorbed into it yet, since it's the first block. But the
    // number of expected fields must be set to the total number of fields in the entire checkpoint.
    start_sponge_blob: SpongeBlob,

    // Hint for inserting the new l1 to l2 message subtree.
    new_l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootEmptyTxFirstRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_parity_root(self.parity_root, self.constants.vk_tree_root);

        BlockRollupPublicInputsComposer::new_from_no_rollups(
            self.previous_block_header,
            self.previous_archive,
            self.constants,
            self.start_sponge_blob,
        )
            .with_l1_to_l2_roots(
                self.parity_root.public_inputs,
                self.new_l1_to_l2_message_subtree_sibling_path,
            )
            .finish(self.new_archive_sibling_path)
    }
}
