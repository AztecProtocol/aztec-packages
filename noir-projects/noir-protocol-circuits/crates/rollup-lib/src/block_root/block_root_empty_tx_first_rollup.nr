use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge},
    block_root::components::BlockRollupPublicInputsComposer,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, state_reference::StateReference,
    },
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK},
};

pub struct BlockRootEmptyTxFirstRollupPrivateInputs {
    pub(crate) previous_archive: AppendOnlyTreeSnapshot,
    pub(crate) previous_state: StateReference,
    // The previous block is not in the same checkpoint as the current block. So we need to provide the constants for
    // the current checkpoint.
    pub(crate) constants: CheckpointConstantData,
    // The timestamp of this block. It's given as a free value here, but will be checked against the previous block's
    // timestamp in the checkpoint root.
    pub(crate) timestamp: u64,

    // L1-to-L2 messages inserted by this block, padded with zeros beyond `num_msgs`.
    pub(crate) l1_to_l2_messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    // Number of real (non-padding) leaves in `l1_to_l2_messages`.
    pub(crate) num_msgs: u32,
    // Frontier hint for appending the bundle to the l1-to-l2 message tree (validated against `previous_state`).
    pub(crate) l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root Empty Tx First Rollup circuit creates the first empty block of a checkpoint.
/// It inserts the block's L1-to-L2 message bundle and creates the block header.
/// This variant is used for the first block in a checkpoint that contains no transactions.
///
/// This circuit:
/// - Appends the block's L1-to-L2 message bundle to the L1-to-L2 message tree and absorbs it into the message sponge
/// - Initializes an empty sponge blob (since it's the first block in a checkpoint)
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks.
///
/// VkIndex: BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootEmptyTxFirstRollupPrivateInputs) -> BlockRollupPublicInputs {
    BlockRollupPublicInputsComposer::new_from_no_rollups(
        inputs.previous_archive,
        inputs.previous_state,
        inputs.constants,
        inputs.timestamp,
    )
        .with_message_bundle(
            true,
            inputs.previous_state.l1_to_l2_message_tree,
            L1ToL2MessageSponge::new(),
            inputs.l1_to_l2_messages,
            inputs.num_msgs,
            inputs.l1_to_l2_message_frontier_hint,
        )
        .finish(inputs.new_archive_sibling_path)
}
