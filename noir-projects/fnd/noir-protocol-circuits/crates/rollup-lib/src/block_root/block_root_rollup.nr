use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageBundle, L1ToL2MessageSponge, TxRollupPublicInputs},
    block_root::components::{
        BlockRollupPublicInputsComposer, validate_l1_to_l2_tree_snapshot_in_constants,
        validate_previous_rollups,
    },
};
use types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
    // L1-to-L2 message bundle inserted by this block.
    pub(crate) message_bundle: L1ToL2MessageBundle,
    // The l1-to-l2 tree snapshot this block builds on (the previous block's post-insertion snapshot). It is a witnessed
    // value, pinned by block-merge continuity (`right.start_state == left.end_state`) to the previous block's end
    // state; since the checkpoint root forces the leftmost block to be a first-block variant, every non-first block
    // has a left neighbour that pins it.
    pub(crate) previous_l1_to_l2: AppendOnlyTreeSnapshot,
    // Message sponge inherited from the previous block. Checked against the previous block's `end_msg_sponge` in the
    // block merge or checkpoint root circuit.
    pub(crate) start_msg_sponge: L1ToL2MessageSponge,
    // Frontier hint for appending the bundle to the l1-to-l2 message tree (validated against `previous_l1_to_l2`).
    pub(crate) l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root Rollup circuit finalizes a block by combining two transaction rollup proofs.
/// It inserts the block's L1-to-L2 message bundle and creates the block header.
/// This variant is used for non-first blocks with multiple transactions.
///
/// This circuit:
/// - Verifies the proofs from two child tx rollups (Tx Base or Tx Merge circuits)
/// - Appends the block's L1-to-L2 message bundle to the L1-to-L2 message tree and absorbs it into the message sponge
/// - Validates that the two child rollups are consecutive (end state of left matches start state of right)
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks, or if the other blocks
/// have already been merged into a tree whose root is this block's left sibling.
///
/// VkIndex: BLOCK_ROOT_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootRollupPrivateInputs) -> BlockRollupPublicInputs {
    let previous_rollups = inputs.previous_rollups.map(|rollup| rollup.public_inputs);
    // Non-first blocks build on a witnessed start snapshot (pinned by block-merge continuity to the previous block's
    // end state) rather than the constants value, so this block can append its own bundle and still assert the tx
    // constants carry the post-bundle snapshot.
    let mut composer = BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups);
    let new_l1_to_l2 = composer
        .with_message_bundle(
            false,
            inputs.previous_l1_to_l2,
            inputs.start_msg_sponge,
            inputs.message_bundle,
            inputs.l1_to_l2_message_frontier_hint,
        )
        .get_new_l1_to_l2();

    validate_previous_rollups(inputs.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

    // The tx constants pin the l1-to-l2 snapshot the AVM validates message reads against; asserting it equals this
    // block's post-bundle root lets this block's txs read the messages this block inserts (same-block consumption).
    validate_l1_to_l2_tree_snapshot_in_constants(
        inputs.previous_rollups[0].public_inputs.constants,
        new_l1_to_l2,
    );

    composer.finish(inputs.new_archive_sibling_path)
}
