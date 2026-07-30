use crate::{
    abis::TxRollupPublicInputs,
    tx_merge::utils::validate_consecutive_tx_rollups::validate_consecutive_tx_rollups,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
    },
    proof::proof_data::RollupHonkProofData,
};

pub fn validate_previous_rollups<let NumPreviousRollups: u32, let NumVkIndices: u32>(
    previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; NumPreviousRollups],
    allowed_previous_vk_indices: [u32; NumVkIndices],
) {
    if !::std::runtime::is_unconstrained() {
        for i in 0..NumPreviousRollups {
            previous_rollups[i].verify_proof();
        }
    }

    let vk_tree_root = previous_rollups[0].public_inputs.constants.vk_tree_root;
    for i in 0..NumPreviousRollups {
        previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
            vk_tree_root,
            allowed_previous_vk_indices,
        );
    }

    // If there is more than one previous rollup, validate that they are consecutive.
    for i in 1..NumPreviousRollups {
        validate_consecutive_tx_rollups(
            previous_rollups[i - 1].public_inputs,
            previous_rollups[i].public_inputs,
        );
    }

    // Check that the block number matches the next available leaf index in the archive, ensuring the hash of the block
    // header will be inserted at the correct position.
    // We convert with `as Field` instead of converting the other `as u32` to avoid truncating the next_available_leaf_index.
    let constants = previous_rollups[0].public_inputs.constants;
    assert_eq(
        constants.global_variables.block_number as Field,
        constants.last_archive.next_available_leaf_index,
        "The block number must match the index at which the block header hash is inserted into the archive",
    );
}

/// Checks that the l1-to-l2 tree snapshot in the constants matches the value computed in the public inputs composer.
/// This snapshot is used in the AVM to validate l1-to-l2 message read requests, allowing public functions to
/// read new messages before they are inserted into the tree in the block root circuit.
///
/// Both tx-carrying block-root variants run this check against their own post-bundle snapshot, so each block's txs can
/// read the messages that block inserts (same-block consumption). They take their start snapshot as a witness rather
/// than reading it from the constants; that witness is pinned to the previous block's end state by the block merge, or
/// to the previous checkpoint's last block header by the checkpoint root, so it cannot be forged. (The tx-less variant
/// carries no tx constants to read against and so skips this check.)
pub fn validate_l1_to_l2_tree_snapshot_in_constants(
    constants: BlockConstantData,
    computed_new_l1_to_l2: AppendOnlyTreeSnapshot,
) {
    assert_eq(
        constants.l1_to_l2_tree_snapshot,
        computed_new_l1_to_l2,
        "l1_to_l2 tree snapshot in constants does not match the computed value",
    );
}
