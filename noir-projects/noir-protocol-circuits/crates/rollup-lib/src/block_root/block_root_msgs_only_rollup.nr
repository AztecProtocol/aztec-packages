use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge},
    block_root::components::BlockRollupPublicInputsComposer,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        checkpoint_constant_data::CheckpointConstantData, state_reference::StateReference,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK},
};

pub struct BlockRootMsgsOnlyRollupPrivateInputs {
    pub(crate) previous_archive: AppendOnlyTreeSnapshot,
    pub(crate) previous_state: StateReference,
    // The previous block is in the same checkpoint as this block, but this block has no txs, so there are no tx
    // constants to carry them. The checkpoint constants are given as a free value here and pinned by the checkpoint
    // root's previous-header check via the merge continuity of the states below.
    pub(crate) constants: CheckpointConstantData,
    // The timestamp of this block. It's given as a free value here, but will be checked against the previous block's
    // timestamp in the block merge or checkpoint root.
    pub(crate) timestamp: u64,
    // Sponge blob inherited from the previous block. Checked against the previous block's `end_sponge_blob` in the
    // block merge or checkpoint root circuit.
    pub(crate) start_sponge_blob: SpongeBlob,
    // Message sponge inherited from the previous block. Checked against the previous block's `end_msg_sponge` in the
    // block merge or checkpoint root circuit.
    pub(crate) start_msg_sponge: L1ToL2MessageSponge,

    // L1-to-L2 messages inserted by this block, padded with zeros beyond `num_msgs`.
    pub(crate) l1_to_l2_messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    // Number of real (non-padding) leaves in `l1_to_l2_messages`.
    pub(crate) num_msgs: u32,
    // Frontier hint for appending the bundle to the l1-to-l2 message tree (validated against `previous_state`).
    pub(crate) l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// The Block Root Msgs Only Rollup circuit creates a non-first, transaction-less block that inserts an L1-to-L2 message
/// bundle. It lets a proposer keep draining the Inbox into a checkpoint when the tx pool is empty.
///
/// Unlike the first-empty variant, this block sits in the middle of a checkpoint: it inherits the sponge blob and
/// message sponge from the previous block (rather than starting them from empty) and sets `is_first_block = false`. It
/// is deliberately unable to be the leftmost block of a checkpoint: the checkpoint root asserts the leftmost rollup's
/// `is_first_block` is true, so a checkpoint made only of this variant cannot prove.
///
/// This circuit:
/// - Requires the bundle to be non-empty (`num_msgs > 0`); an empty non-first block carries no reason to exist and
///   would otherwise be a provable filler block
/// - Appends the block's L1-to-L2 message bundle to the L1-to-L2 message tree and absorbs it into the message sponge
/// - Threads the (non-empty) start sponge blob through unchanged, since there are no tx effects
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined, or directly into a Checkpoint Root
/// circuit.
///
/// VkIndex: BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootMsgsOnlyRollupPrivateInputs) -> BlockRollupPublicInputs {
    // A message-only block exists solely to insert L1-to-L2 messages, so it must carry at least one. This prevents a
    // provable, fully-empty non-first filler block.
    assert(inputs.num_msgs != 0, "A message-only block must insert at least one L1-to-L2 message");

    BlockRollupPublicInputsComposer::new_from_no_rollups_with_start_sponge_blob(
        inputs.previous_archive,
        inputs.previous_state,
        inputs.constants,
        inputs.timestamp,
        inputs.start_sponge_blob,
    )
        .with_message_bundle(
            false,
            inputs.previous_state.l1_to_l2_message_tree,
            inputs.start_msg_sponge,
            inputs.l1_to_l2_messages,
            inputs.num_msgs,
            inputs.l1_to_l2_message_frontier_hint,
        )
        .finish(inputs.new_archive_sibling_path)
}
