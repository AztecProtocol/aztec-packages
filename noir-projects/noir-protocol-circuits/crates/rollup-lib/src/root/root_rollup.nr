use crate::{
    abis::{CheckpointRollupPublicInputs, RootRollupPublicInputs},
    checkpoint_merge::{merge_checkpoint_rollups, validate_consecutive_checkpoint_rollups},
};
use blob::utils::validate_final_blob_batching_challenges;
use types::{
    constants::{
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX, CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
        CHECKPOINT_ROOT_ROLLUP_VK_INDEX, CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
        EMPTY_EPOCH_OUT_HASH,
    },
    proof::proof_data::RollupHonkProofData,
    traits::Empty,
};

global ALLOWED_LEFT_ROLLUP_VK_INDICES: [u32; 3] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];

global ALLOWED_RIGHT_ROLLUP_VK_INDICES: [u32; 4] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
    // Padding checkpoint rollup can only be the right child of the root rollup.
    CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
];

pub struct RootRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<CheckpointRollupPublicInputs>; 2],
}

/// The Root Rollup circuit is the final circuit in the rollup hierarchy for an epoch.
/// It produces the epoch proof that is verified on L1 to finalize the epoch's state transitions.
///
/// This circuit:
/// - Verifies the proofs from two child checkpoint rollups (Checkpoint Root, Checkpoint Merge, or Checkpoint Padding)
/// - Validates that the left checkpoint is not a padding checkpoint (at least one real checkpoint required)
/// - Validates checkpoint continuity if the right child is not padding
/// - Validates that the epoch out hash tree starts from empty.
/// - Validates that the epoch starts with an empty blob accumulator
/// - Validates that the final blob challenges match the end blob accumulator state
/// - Finalizes the blob accumulator to produce blob public inputs for L1 verification
/// - Outputs the epoch constants including vk_tree_root and protocol_contracts_hash
/// - Outputs the previous and new archive roots for L1 state validation
/// - Outputs checkpoint header hashes and fees for the entire epoch
///
/// The output is the final proof for the epoch, verified by the L1 rollup contract to update the canonical state root
/// and process cross-chain messages.
///
/// VkIndex: ROOT_ROLLUP_VK_INDEX
pub fn execute(inputs: RootRollupPrivateInputs) -> RootRollupPublicInputs {
    // Verify the previous rollup proofs
    if !std::runtime::is_unconstrained() {
        inputs.previous_rollups[0].verify_proof_in_root();
        inputs.previous_rollups[1].verify_proof_in_root();
    }

    let vk_tree_root = inputs.previous_rollups[0].public_inputs.constants.vk_tree_root;
    // The vk validation below ensures that the left rollup can never be a padding block root rollup,
    // because `CHECKPOINT_PADDING_ROLLUP_VK_INDEX` is not included in `ALLOWED_LEFT_ROLLUP_VK_INDICES`.
    inputs.previous_rollups[0].vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        ALLOWED_LEFT_ROLLUP_VK_INDICES,
    );
    inputs.previous_rollups[1].vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        ALLOWED_RIGHT_ROLLUP_VK_INDICES,
    );

    let left = inputs.previous_rollups[0].public_inputs;
    let right = inputs.previous_rollups[1].public_inputs;
    let is_right_padding =
        inputs.previous_rollups[1].vk_data.leaf_index == CHECKPOINT_PADDING_ROLLUP_VK_INDEX;

    if is_right_padding {
        // Padding checkpoint root rollup is needed when the epoch has only 1 checkpoint, which must be on the left.
        assert_eq(left.num_checkpoints(), 1, "unnecessary padding checkpoint root rollup");
    } else {
        validate_consecutive_checkpoint_rollups(left, right);
    }

    let merged = if is_right_padding {
        left
    } else {
        merge_checkpoint_rollups(left, right)
    };

    // Validate that the out hash tree starts from empty.
    assert_eq(
        merged.previous_out_hash.root,
        EMPTY_EPOCH_OUT_HASH,
        "Epoch did not start with empty out hash tree root",
    );
    assert_eq(
        merged.previous_out_hash.next_available_leaf_index,
        0,
        "Epoch did not start with zero out hash tree index",
    );

    // Note: for blob batching, in `validate_consecutive_checkpoint_rollups` we have checked:
    // - left.end_blob_accumulator == right.start_blob_accumulator
    // - left.final_blob_challenges == right.final_blob_challenges
    //
    // Below we check:
    // 1. The first accumulator of the entire epoch (left.start_blob_accumulator) is empty.
    merged.start_blob_accumulator.assert_empty("Epoch did not start with empty blob state.");
    // 2. The claimed `final_blob_challenges` match the final state of the accumulator.
    validate_final_blob_batching_challenges(
        merged.end_blob_accumulator,
        merged.final_blob_challenges,
    );

    // Finalize the `end_blob_accumulator`.
    let blob_public_inputs = merged.end_blob_accumulator.finalize();

    RootRollupPublicInputs {
        previous_archive_root: merged.previous_archive.root,
        new_archive_root: merged.new_archive.root,
        out_hash: merged.new_out_hash.root,
        checkpoint_header_hashes: merged.checkpoint_header_hashes,
        fees: merged.fees,
        constants: merged.constants,
        blob_public_inputs,
    }
}
