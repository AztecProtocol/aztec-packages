use crate::{
    abis::{BlockRollupPublicInputs, ParityPublicInputs},
    block_root::components::{BlockRollupPublicInputsComposer, validate_parity_root},
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, state_reference::StateReference,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH},
    proof::proof_data::UltraHonkProofData,
};

pub struct BlockRootEmptyTxFirstRollupPrivateInputs {
    pub(crate) parity_root: UltraHonkProofData<ParityPublicInputs>,

    pub(crate) previous_archive: AppendOnlyTreeSnapshot,
    pub(crate) previous_state: StateReference,
    // The previous block is not in the same checkpoint as the current block. So we need to provide the constants for
    // the current checkpoint.
    pub(crate) constants: CheckpointConstantData,
    // The timestamp of this block. It's given as a free value here, but will be checked against the previous block's
    // timestamp in the checkpoint root.
    pub(crate) timestamp: u64,

    // Hint for inserting the new l1 to l2 message subtree.
    pub(crate) new_l1_to_l2_message_subtree_root_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root Empty Tx First Rollup circuit creates the first empty block of a checkpoint.
/// It processes L1-to-L2 messages and creates the block header.
/// This variant is used for the first block in a checkpoint that contains no transactions.
///
/// This circuit:
/// - Verifies the parity root proof containing L1-to-L2 messages for the checkpoint
/// - Inserts the L1-to-L2 message subtree into the L1-to-L2 message tree
/// - Initializes an empty sponge blob (since it's the first block in a checkpoint)
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks.
///
/// VkIndex: BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootEmptyTxFirstRollupPrivateInputs) -> BlockRollupPublicInputs {
    validate_parity_root(inputs.parity_root, inputs.constants.vk_tree_root);

    BlockRollupPublicInputsComposer::new_from_no_rollups(
        inputs.previous_archive,
        inputs.previous_state,
        inputs.constants,
        inputs.timestamp,
    )
        .with_new_l1_to_l2_messages(
            inputs.parity_root.public_inputs,
            inputs.new_l1_to_l2_message_subtree_root_sibling_path,
        )
        .finish(inputs.new_archive_sibling_path)
}
