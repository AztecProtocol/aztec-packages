use crate::{
    abis::TxRollupPublicInputs,
    tx_merge::utils::{
        merge_tx_rollups::merge_tx_rollups,
        validate_consecutive_tx_rollups::validate_consecutive_tx_rollups,
    },
};
use types::{
    constants::{
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct TxMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
}

/// The Tx Merge Rollup circuit combines two transaction rollup proofs into one.
/// It is used to build a binary tree of transaction proofs within a block.
///
/// This circuit:
/// - Verifies the proofs from two child tx rollups (either Tx Base or Tx Merge circuits)
/// - Validates that the two rollups are consecutive (end state of left matches start state of right)
/// - Validates that both rollups share the same block constants
/// - Merges the tree snapshots (left's start with right's end)
/// - Merges the sponge blobs (left's start with right's end)
/// - Accumulates the out_hash by hashing the left and right out_hashes
/// - Accumulates the transaction fees and mana used
///
/// The output feeds into another Tx Merge circuit to continue building the tree,
/// or into a Block Root circuit once all transactions in the block are combined.
///
/// VkIndex: TX_MERGE_ROLLUP_VK_INDEX
pub fn execute(inputs: TxMergeRollupPrivateInputs) -> TxRollupPublicInputs {
    // Verify the previous rollup proofs
    if !std::runtime::is_unconstrained() {
        inputs.previous_rollups[0].verify_proof();
        inputs.previous_rollups[1].verify_proof();
    }

    // Validate the vks.
    let vk_tree_root = inputs.previous_rollups[0].public_inputs.constants.vk_tree_root;
    inputs.previous_rollups[0].vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        ALLOWED_PREVIOUS_CIRCUITS,
    );
    inputs.previous_rollups[1].vk_data.validate_allowed_in_vk_tree(
        vk_tree_root,
        ALLOWED_PREVIOUS_CIRCUITS,
    );

    // Validate the public inputs.
    let left = inputs.previous_rollups[0].public_inputs;
    let right = inputs.previous_rollups[1].public_inputs;
    validate_consecutive_tx_rollups(left, right);

    merge_tx_rollups(left, right)
}
