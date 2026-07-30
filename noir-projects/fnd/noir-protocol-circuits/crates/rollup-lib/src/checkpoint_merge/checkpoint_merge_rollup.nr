use crate::{
    abis::CheckpointRollupPublicInputs,
    checkpoint_merge::utils::{
        merge_checkpoint_rollups::merge_checkpoint_rollups,
        validate_consecutive_checkpoint_rollups::validate_consecutive_checkpoint_rollups,
    },
};
use types::{
    constants::{
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX, CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
        CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_VK_INDICES: [u32; 3] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];

pub struct CheckpointMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<CheckpointRollupPublicInputs>; 2],
}

/// The Checkpoint Merge Rollup circuit combines two checkpoint rollup proofs into one.
/// It is used to build a binary tree of checkpoint proofs within an epoch.
///
/// This circuit:
/// - Verifies the proofs from two child checkpoint rollups (Checkpoint Root or Checkpoint Merge circuits)
/// - Validates that the two checkpoints are consecutive (left's end matches right's start)
/// - Validates archive continuity (left's new archive matches right's previous archive)
/// - Validates blob accumulator continuity (left's end matches right's start)
/// - Validates that both checkpoints share the same constants and final blob challenges
/// - Merges checkpoint header hashes, fees, and blob accumulators
///
/// The output feeds into another Checkpoint Merge circuit to continue building the tree,
/// or into the Root Rollup circuit once all checkpoints in the epoch are combined.
///
/// VkIndex: CHECKPOINT_MERGE_ROLLUP_VK_INDEX
pub fn execute(inputs: CheckpointMergeRollupPrivateInputs) -> CheckpointRollupPublicInputs {
    // Verify the previous rollup proofs and vks.
    if !::std::runtime::is_unconstrained() {
        let vk_tree_root = inputs.previous_rollups[0].public_inputs.constants.vk_tree_root;

        for i in 0..2 {
            inputs.previous_rollups[i].verify_proof();
            inputs.previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
                vk_tree_root,
                ALLOWED_VK_INDICES,
            );
        }
    }

    let left = inputs.previous_rollups[0].public_inputs;
    let right = inputs.previous_rollups[1].public_inputs;

    validate_consecutive_checkpoint_rollups(left, right);

    merge_checkpoint_rollups(left, right)
}
