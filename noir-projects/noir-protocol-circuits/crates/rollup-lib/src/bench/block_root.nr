use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge, TxRollupPublicInputs},
    block_root::components::{validate_previous_rollups, BlockRollupPublicInputsComposer},
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
};
use types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::{
        ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    merkle_tree::append_only_tree::append_leaves_to_snapshot,
    proof::proof_data::RollupHonkProofData,
};

// Copied (not shared) from block_root_rollup.nr so the bench module stays self-contained and doesn't relax the
// visibility of the production global.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

global SPONGE_BUNDLE_SIZE: u32 = 256;

// ---------------------------------------------------------------------------------------------------------------------
// bench-block-root-none: the block root skeleton with ALL message machinery removed.
// ---------------------------------------------------------------------------------------------------------------------

pub struct BenchBlockRootNonePrivateInputs {
    pub previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// Bench variant of the non-first block root with no L1-to-L2 message bundle, no append, and no sponge. It is the
/// option-5 S=0 ladder rung and the baseline against which the marginal per-message cost in the block root is measured.
pub fn execute_none(inputs: BenchBlockRootNonePrivateInputs) -> BlockRollupPublicInputs {
    validate_previous_rollups(inputs.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

    let previous_rollups = inputs.previous_rollups.map(|rollup| rollup.public_inputs);
    BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups)
        .finish(inputs.new_archive_sibling_path)
}

// ---------------------------------------------------------------------------------------------------------------------
// bench-block-root-sponge-256: block root with a 256-sized bundle appended and absorbed into the poseidon sponge.
// ---------------------------------------------------------------------------------------------------------------------

pub struct BenchBlockRootSpongePrivateInputs {
    pub previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
    pub l1_to_l2_messages: [Field; SPONGE_BUNDLE_SIZE],
    pub num_msgs: u32,
    pub start_msg_sponge: L1ToL2MessageSponge,
    pub l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// Bench variant of the end-state block root (options 1-4): append the 256-message bundle to the l1-to-l2 tree and
/// absorb it into the message sponge. The bundle is sized at the post-flip 256 rather than the transitional 1024.
///
/// The append snapshot and the resulting sponge are wired back into the public outputs (the `end_state` tree and the
/// message sponge fields) so both are constrained; without that they would be dead-code eliminated and the gate count
/// would not reflect the message work.
pub fn execute_sponge(inputs: BenchBlockRootSpongePrivateInputs) -> BlockRollupPublicInputs {
    validate_previous_rollups(inputs.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

    let previous_rollups = inputs.previous_rollups.map(|rollup| rollup.public_inputs);
    let previous_l1_to_l2 = previous_rollups[0].constants.l1_to_l2_tree_snapshot;

    let new_l1_to_l2 = append_leaves_to_snapshot::<L1_TO_L2_MSG_TREE_HEIGHT, SPONGE_BUNDLE_SIZE>(
        previous_l1_to_l2,
        inputs.l1_to_l2_messages,
        inputs.num_msgs,
        inputs.l1_to_l2_message_frontier_hint,
    );

    let mut end_msg_sponge = inputs.start_msg_sponge;
    end_msg_sponge.absorb(inputs.l1_to_l2_messages, inputs.num_msgs);

    let mut pis = BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups)
        .finish(inputs.new_archive_sibling_path);
    pis.start_state.l1_to_l2_message_tree = previous_l1_to_l2;
    pis.end_state.l1_to_l2_message_tree = new_l1_to_l2;
    pis.start_msg_sponge = inputs.start_msg_sponge;
    pis.end_msg_sponge = end_msg_sponge;
    pis
}

// ---------------------------------------------------------------------------------------------------------------------
// bench-block-root-chain-{16,64,128,256}: block root with the bundle append kept but the sponge replaced by the
// rolling-hash chain (option 5).
// ---------------------------------------------------------------------------------------------------------------------

pub struct BenchBlockRootChainPrivateInputs<let S: u32> {
    pub previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
    pub l1_to_l2_messages: [Field; S],
    pub num_msgs: u32,
    pub start_rolling_hash: Field,
    pub l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

/// Output for the option-5 block root: the block PIs plus the rolling-hash start/end pair that replaces the sponge.
/// Since the production `BlockRollupPublicInputs` carries sponge fields (not a rolling-hash pair) and must not be
/// modified, the pair is exposed alongside the block PIs in this bench wrapper instead. The two extra field outputs are
/// negligible next to the block root's gate count.
pub struct BenchBlockRootChainOutput {
    pub block: BlockRollupPublicInputs,
    pub new_l1_to_l2: AppendOnlyTreeSnapshot,
    pub start_rolling_hash: Field,
    pub end_rolling_hash: Field,
}

/// Bench variant of the option-5 block root: append the bundle (sized `S`) and chain the real messages into the rolling
/// hash in place of the poseidon sponge. Both the append snapshot and the rolling-hash pair are returned so the work is
/// constrained.
pub fn execute_chain<let S: u32>(
    inputs: BenchBlockRootChainPrivateInputs<S>,
) -> BenchBlockRootChainOutput {
    validate_previous_rollups(inputs.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

    let previous_rollups = inputs.previous_rollups.map(|rollup| rollup.public_inputs);
    let previous_l1_to_l2 = previous_rollups[0].constants.l1_to_l2_tree_snapshot;

    let new_l1_to_l2 = append_leaves_to_snapshot::<L1_TO_L2_MSG_TREE_HEIGHT, S>(
        previous_l1_to_l2,
        inputs.l1_to_l2_messages,
        inputs.num_msgs,
        inputs.l1_to_l2_message_frontier_hint,
    );

    let end_rolling_hash =
        accumulate_inbox_rolling_hash(inputs.start_rolling_hash, inputs.l1_to_l2_messages, inputs.num_msgs);

    let block = BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups)
        .finish(inputs.new_archive_sibling_path);

    BenchBlockRootChainOutput {
        block,
        new_l1_to_l2,
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash,
    }
}
