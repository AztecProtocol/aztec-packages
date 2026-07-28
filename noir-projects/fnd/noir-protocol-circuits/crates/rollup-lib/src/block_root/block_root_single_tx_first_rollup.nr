use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge, TxRollupPublicInputs},
    block_root::components::{
        BlockRollupPublicInputsComposer, validate_l1_to_l2_tree_snapshot_in_constants,
        validate_previous_rollups,
    },
};
use types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK,
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

// TX_MERGE_ROLLUP_VK_INDEX is not allowed if there is only one previous rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] =
    [PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootSingleTxFirstRollupPrivateInputs {
    pub(crate) previous_rollup: RollupHonkProofData<TxRollupPublicInputs>,
    // L1-to-L2 messages inserted by this block, padded with zeros beyond `num_msgs`.
    pub(crate) l1_to_l2_messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    // Number of real (non-padding) leaves in `l1_to_l2_messages`.
    pub(crate) num_msgs: u32,
    // Hinted value the bundle is appended to.
    // This will be set to the `start_state` in the public inputs and validated in the checkpoint root circuit to
    // ensure it matches the l1-to-l2 tree snapshot in the header of the last block from the previous checkpoint.
    pub(crate) previous_l1_to_l2: AppendOnlyTreeSnapshot,
    // Frontier hint for appending the bundle to the l1-to-l2 message tree (validated against `previous_l1_to_l2`).
    pub(crate) l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root Single Tx First Rollup circuit finalizes the first block of a checkpoint.
/// It inserts the block's L1-to-L2 message bundle and creates the block header.
/// This variant is used for the first block with only one transaction.
///
/// This circuit:
/// - Verifies the proof from a single tx rollup (Private Tx Base or Public Tx Base circuit)
/// - Appends the block's L1-to-L2 message bundle to the L1-to-L2 message tree and absorbs it into the message sponge
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks.
///
/// VkIndex: BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootSingleTxFirstRollupPrivateInputs) -> BlockRollupPublicInputs {
    let mut composer = BlockRollupPublicInputsComposer::new_from_single_rollup(
        inputs.previous_rollup.public_inputs,
    );
    // The leftmost block of a checkpoint starts the message sponge from empty.
    let new_l1_to_l2 = composer
        .with_message_bundle(
            true,
            inputs.previous_l1_to_l2,
            L1ToL2MessageSponge::new(),
            inputs.l1_to_l2_messages,
            inputs.num_msgs,
            inputs.l1_to_l2_message_frontier_hint,
        )
        .get_new_l1_to_l2();

    validate_previous_rollups([inputs.previous_rollup], ALLOWED_PREVIOUS_VK_INDICES);

    validate_l1_to_l2_tree_snapshot_in_constants(
        inputs.previous_rollup.public_inputs.constants,
        new_l1_to_l2,
    );

    composer.finish(inputs.new_archive_sibling_path)
}
