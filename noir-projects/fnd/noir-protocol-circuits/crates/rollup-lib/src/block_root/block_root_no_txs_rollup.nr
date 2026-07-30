use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageBundle, L1ToL2MessageSponge},
    block_root::components::BlockRollupPublicInputsComposer,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, state_reference::StateReference,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT},
};

pub struct BlockRootNoTxsRollupPrivateInputs {
    pub(crate) previous_archive: AppendOnlyTreeSnapshot,
    pub(crate) previous_state: StateReference,
    // This block has no txs, so there are no tx constants to carry the checkpoint constants. They are given as a free
    // value here and pinned by the checkpoint root's previous-header check via the merge continuity of the states
    // below.
    pub(crate) constants: CheckpointConstantData,
    // The timestamp of this block. It's given as a free value here, but will be checked against the previous block's
    // timestamp in the block merge or checkpoint root.
    pub(crate) timestamp: u64,
    // Sponge blob this block starts from: `SpongeBlob::init()` for the checkpoint's first block, otherwise the sponge
    // blob inherited from the previous block. Checked against `SpongeBlob::init()` in the checkpoint root for the
    // leftmost block, and against the previous block's `end_sponge_blob` in the block merge otherwise.
    pub(crate) start_sponge_blob: SpongeBlob,
    // Message sponge this block starts from: the empty sponge for the checkpoint's first block, otherwise the sponge
    // inherited from the previous block. Checked against the empty sponge in the checkpoint root for the leftmost
    // block, and against the previous block's `end_msg_sponge` in the block merge otherwise.
    pub(crate) start_msg_sponge: L1ToL2MessageSponge,

    // L1-to-L2 message bundle inserted by this block.
    pub(crate) message_bundle: L1ToL2MessageBundle,
    // Frontier hint for appending the bundle to the l1-to-l2 message tree (validated against `previous_state`).
    pub(crate) l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root No Txs Rollup circuit finalizes a block that contains no transactions. The block may still insert an
/// L1-to-L2 message bundle, letting a proposer keep draining the Inbox when the tx pool is empty, and it may also be
/// fully empty, giving the sequencer a regular block cadence with no "nothing to include" special case. What bounds
/// the prover cost of empty blocks is the cap on blocks per checkpoint asserted in the checkpoint root.
///
/// The block may sit anywhere in the checkpoint: it takes both of its start sponges as inputs, which the checkpoint
/// root pins to their initial values for the leftmost block and the block merge pins to the previous block's end
/// values otherwise.
///
/// This circuit:
/// - Appends the block's L1-to-L2 message bundle to the L1-to-L2 message tree and absorbs it into the message sponge
/// - Threads the start sponge blob through unchanged, since there are no tx effects
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined, or directly into a Checkpoint Root
/// circuit.
///
/// VkIndex: BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootNoTxsRollupPrivateInputs) -> BlockRollupPublicInputs {
    BlockRollupPublicInputsComposer::new_from_no_rollups(
        inputs.previous_archive,
        inputs.previous_state,
        inputs.constants,
        inputs.timestamp,
        inputs.start_sponge_blob,
    )
        .with_message_bundle(
            inputs.previous_state.l1_to_l2_message_tree,
            inputs.start_msg_sponge,
            inputs.message_bundle,
            inputs.l1_to_l2_message_frontier_hint,
        )
        .finish(inputs.new_archive_sibling_path)
}
