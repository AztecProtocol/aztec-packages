use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge, TxRollupPublicInputs},
    block_root::components::{BlockRollupPublicInputsComposer, validate_previous_rollups},
};
use types::{
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK,
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

// TX_MERGE_ROLLUP_VK_INDEX is not allowed if there is only one previous rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] =
    [PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootSingleTxRollupPrivateInputs {
    pub(crate) previous_rollup: RollupHonkProofData<TxRollupPublicInputs>,
    // L1-to-L2 messages inserted by this block, padded with zeros beyond `num_msgs`.
    pub(crate) l1_to_l2_messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    // Number of real (non-padding) leaves in `l1_to_l2_messages`.
    pub(crate) num_msgs: u32,
    // Message sponge inherited from the previous block. Checked against the previous block's `end_msg_sponge` in the
    // block merge or checkpoint root circuit.
    pub(crate) start_msg_sponge: L1ToL2MessageSponge,
    // Frontier hint for appending the bundle to the l1-to-l2 message tree (validated against the tree snapshot in the
    // constants, which is where the l1-to-l2 tree stands for this non-first block).
    pub(crate) l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root Single Tx Rollup circuit finalizes a block containing exactly one transaction.
/// It inserts the block's L1-to-L2 message bundle and creates the block header.
/// This variant is used for non-first blocks with only one transaction.
///
/// This circuit:
/// - Verifies the proof from a single tx rollup (Private Tx Base or Public Tx Base circuit)
/// - Appends the block's L1-to-L2 message bundle to the L1-to-L2 message tree and absorbs it into the message sponge
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks, or if the other blocks
/// have already been merged into a tree whose root is this block's left sibling.
///
/// VkIndex: BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootSingleTxRollupPrivateInputs) -> BlockRollupPublicInputs {
    validate_previous_rollups([inputs.previous_rollup], ALLOWED_PREVIOUS_VK_INDICES);

    // Non-first blocks build on the l1-to-l2 tree snapshot carried in the checkpoint constants.
    let previous_l1_to_l2 = inputs.previous_rollup.public_inputs.constants.l1_to_l2_tree_snapshot;
    BlockRollupPublicInputsComposer::new_from_single_rollup(inputs.previous_rollup.public_inputs)
        .with_message_bundle(
            false,
            previous_l1_to_l2,
            inputs.start_msg_sponge,
            inputs.l1_to_l2_messages,
            inputs.num_msgs,
            inputs.l1_to_l2_message_frontier_hint,
        )
        .finish(inputs.new_archive_sibling_path)
}
