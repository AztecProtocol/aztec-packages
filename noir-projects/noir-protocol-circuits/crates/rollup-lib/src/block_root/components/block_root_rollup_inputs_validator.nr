use crate::{
    abis::{BaseOrMergeRollupPublicInputs, ParityRootProofData, RollupProofData},
    merge::utils::validate_consecutive_rollups::validate_consecutive_rollups,
};
use types::constants::{PROOF_TYPE_HONK, PROOF_TYPE_ROLLUP_HONK, ROOT_PARITY_INDEX};

pub fn validate_previous_rollups<let NumPreviousRollups: u32, let NumVkIndices: u32>(
    previous_rollups: [RollupProofData<BaseOrMergeRollupPublicInputs>; NumPreviousRollups],
    allowed_previous_vk_indices: [u32; NumVkIndices],
) {
    if !dep::std::runtime::is_unconstrained() {
        let vk_tree_root = previous_rollups[0].public_inputs.constants.vk_tree_root;
        for i in 0..NumPreviousRollups {
            previous_rollups[i].verify(PROOF_TYPE_ROLLUP_HONK);
            previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
                vk_tree_root,
                allowed_previous_vk_indices,
            );
        }
    }

    // If there is more than one previous rollup, validate that they are consecutive.
    for i in 1..NumPreviousRollups {
        validate_consecutive_rollups(
            previous_rollups[i - 1].public_inputs,
            previous_rollups[i].public_inputs,
        );
    }

    // Check that the block number matches the next available leaf index in the archive, ensuring the hash of the block
    // header will be inserted at the correct position.
    let constants = previous_rollups[0].public_inputs.constants;
    assert_eq(
        constants.global_variables.block_number,
        constants.last_archive.next_available_leaf_index,
        "The block number must match the index at which the block header hash is inserted into the archive",
    );
}

/// Verify the parity root proof and vk, and check that its vk tree root equals the one in the rollup's constants.
pub fn validate_parity_root(data: ParityRootProofData, vk_tree_root: Field) {
    if !dep::std::runtime::is_unconstrained() {
        data.verify(PROOF_TYPE_HONK);

        assert(data.vk_data.leaf_index == ROOT_PARITY_INDEX);

        // Check that the `vk_tree_root` in the public inputs matches the one in the rollup's constants, as it was used
        // to verify the vk of the base parity proofs.
        assert_eq(
            data.public_inputs.vk_tree_root,
            vk_tree_root,
            "The vk tree root of the parity root does not match the rollup's vk tree root",
        );

        data.vk_data.validate_in_vk_tree(vk_tree_root);
    }
}
