use crate::{
    abis::BlockRollupPublicInputs,
    block_merge::utils::{
        merge_block_rollups::merge_block_rollups,
        validate_consecutive_block_rollups::validate_consecutive_block_rollups,
    },
};
use types::{
    constants::{
        BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

// Note: see `rollup_structure_tests.nr` for valid combinations of left and right vks.
global ALLOWED_RIGHT_ROLLUP_VK_INDICES: [u32; 3] =
    [BLOCK_ROOT_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX, BLOCK_MERGE_ROLLUP_VK_INDEX];

global ALLOWED_LEFT_ROLLUP_VK_INDICES: [u32; 6] = ALLOWED_RIGHT_ROLLUP_VK_INDICES.concat([
    // The first block roots may only appear as the left child of the block merge rollup.
    // However, this doesn't prevent having 2 first block roots in the same checkpoint. We rely on the checks in
    // `validate_consecutive_block_rollups` and `checkpoint_root_inputs_validator` to enforce this.
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
]);

pub struct BlockMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; 2],
}

/// The Block Merge Rollup circuit combines two block rollup proofs into one.
/// It is used to build a binary tree of block proofs within a checkpoint.
///
/// This circuit:
/// - Verifies the proofs from two child block rollups (Block Root or Block Merge circuits)
/// - Validates that the two rollups are consecutive (end state of left matches start state of right)
/// - Validates that both rollups share the same checkpoint constants
/// - Merges the state references (left's start with right's end)
/// - Merges the sponge blobs (left's start with right's end)
/// - Accumulates the block_headers_hash, out_hash, fees, and mana used
/// - Propagates `is_first_block` from the left rollup and threads the message sponge (left's start, right's end)
///
/// The output feeds into another Block Merge circuit to continue building the tree,
/// or into a Checkpoint Root circuit once all blocks in the checkpoint are combined.
///
/// VkIndex: BLOCK_MERGE_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockMergeRollupPrivateInputs) -> BlockRollupPublicInputs {
    // Verify the previous rollup proofs.
    if !::std::runtime::is_unconstrained() {
        inputs.previous_rollups[0].verify_proof();
        inputs.previous_rollups[1].verify_proof();
    }

    // Validate the vks.
    let vk_tree_root = inputs.previous_rollups[0].public_inputs.constants.vk_tree_root;
    inputs.previous_rollups[0].vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        ALLOWED_LEFT_ROLLUP_VK_INDICES,
    );
    inputs.previous_rollups[1].vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        ALLOWED_RIGHT_ROLLUP_VK_INDICES,
    );

    // Validate the public inputs.
    let left = inputs.previous_rollups[0].public_inputs;
    let right = inputs.previous_rollups[1].public_inputs;
    validate_consecutive_block_rollups(left, right);

    merge_block_rollups(left, right)
}
