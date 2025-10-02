use crate::{
    abis::TxRollupPublicInputs,
    tx_merge::utils::validate_consecutive_tx_rollups::validate_consecutive_tx_rollups,
};
use parity_lib::ParityPublicInputs;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
    },
    constants::PARITY_ROOT_VK_INDEX,
    proof::proof_data::{RollupHonkProofData, UltraHonkProofData},
};

pub fn validate_previous_rollups<let NumPreviousRollups: u32, let NumVkIndices: u32>(
    previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; NumPreviousRollups],
    allowed_previous_vk_indices: [u32; NumVkIndices],
) {
    if !dep::std::runtime::is_unconstrained() {
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
/// This check is only required for the first block in a checkpoint, where the new l1-to-l2 messages are inserted
/// into the tree. For subsequent blocks, the value in the constants is simply propagated to the start and end states of
/// the public inputs. However, the start state of each block must match the end state of the previous block, which is
/// validated in the block merge or checkpoint root circuit. This ensures that the snapshot used in subsequent blocks
/// matches the `computed_new_l1_to_l2` from the first block.
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

/// Verify the parity root proof and vk, and check that its vk tree root equals the one in the rollup's constants.
pub fn validate_parity_root(data: UltraHonkProofData<ParityPublicInputs>, vk_tree_root: Field) {
    if !dep::std::runtime::is_unconstrained() {
        data.verify_proof();
    }

    assert_eq(data.vk_data.leaf_index, PARITY_ROOT_VK_INDEX, "Incorrect vk index for parity root");

    // Check that the `vk_tree_root` in the public inputs matches the one in the rollup's constants, as it was used
    // to verify the vk of the base parity proofs.
    assert_eq(
        data.public_inputs.vk_tree_root,
        vk_tree_root,
        "The vk tree root of the parity root does not match the rollup's vk tree root",
    );

    data.vk_data.validate_in_vk_tree(vk_tree_root);
}
