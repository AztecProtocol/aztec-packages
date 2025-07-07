use crate::{
    abis::previous_rollup_block_data::PreviousRollupBlockData,
    block_merge::{merge_block_rollups, validate_consecutive_block_rollups},
    root::root_rollup_public_inputs::RootRollupPublicInputs,
};
use types::{
    constants::{
        AZTEC_MAX_EPOCH_DURATION, BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
        BLOCK_ROOT_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_PADDING_INDEX, BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
        PROOF_TYPE_ROOT_ROLLUP_HONK,
    },
    traits::Empty,
};

global ALLOWED_PREVIOUS_CIRCUITS_LEFT: [u32; 4] = [
    BLOCK_ROOT_ROLLUP_INDEX,
    BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
    BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
    BLOCK_MERGE_ROLLUP_INDEX,
];

global ALLOWED_PREVIOUS_CIRCUITS_RIGHT: [u32; 5] = [
    BLOCK_ROOT_ROLLUP_INDEX,
    BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
    BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
    BLOCK_ROOT_ROLLUP_PADDING_INDEX, // Padding block root rollup can only be the right child of the root rollup.
    BLOCK_MERGE_ROLLUP_INDEX,
];

#[derive(Eq)]
pub struct RootRollupInputs {
    pub previous_rollup_data: [PreviousRollupBlockData; 2],
}

impl Empty for RootRollupInputs {
    fn empty() -> Self {
        RootRollupInputs { previous_rollup_data: [PreviousRollupBlockData::empty(); 2] }
    }
}

impl RootRollupInputs {
    pub fn root_rollup_circuit(self) -> RootRollupPublicInputs {
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify(PROOF_TYPE_ROOT_ROLLUP_HONK); // root rollup honk proof type so we do full IPA recursive verifier
            // The vk validation below ensures that the left rollup can never be a padding block root rollup,
            // because BLOCK_ROOT_ROLLUP_PADDING_INDEX is not included in ALLOWED_PREVIOUS_CIRCUITS_LEFT.
            self.previous_rollup_data[0].validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS_LEFT);

            self.previous_rollup_data[1].verify(PROOF_TYPE_ROOT_ROLLUP_HONK); // root rollup honk proof type so we do full IPA recursive verifier
            self.previous_rollup_data[1].validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS_RIGHT);
        }

        let left = self.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = self.previous_rollup_data[1].block_root_or_block_merge_public_inputs;
        let is_right_padding =
            self.previous_rollup_data[1].vk_data.leaf_index == BLOCK_ROOT_ROLLUP_PADDING_INDEX;

        if is_right_padding {
            // Padding block root rollup is needed when the epoch has only 1 block, which must be on the left.
            assert_eq(left.num_blocks(), 1, "unnecessary padding block root rollup");

            // Ensure that the padding block root rollup is created specifically for the current epoch.
            // While it may be fine to reuse the padding block root rollup across multiple epochs,
            // we enforce this constraint for consistency and clarity.
            // Note: We ignore the rest of the public inputs (archives, global_variables, fees, etc.) as they are not
            // used at all.
            assert_eq(
                left.constants,
                right.constants,
                "constants should be the same for the entire epoch",
            );
        } else {
            validate_consecutive_block_rollups(left, right);
        }

        let merged = if is_right_padding {
            left
        } else {
            merge_block_rollups(left, right)
        };

        // Make sure that the total number of blocks in the epoch does not exceed the max, preventing the merged
        // data (proposed_block_header_hashes, fees, blob_public_inputs) from being truncated.
        let num_blocks = merged.num_blocks();
        assert(num_blocks <= AZTEC_MAX_EPOCH_DURATION, "too many blocks in root rollup");

        // Note: for blob batching, in validate_consecutive_block_rollups > assert_prev_block_rollups_follow_on_from_each_other we have checked:
        // - left.end_blob_accumulator == right.start_blob_accumulator
        // - left.challenge_z == right.challenge_z
        // - left.challenge_gamma == right.challenge_gamma
        // Below we check:
        // - first (left.start_blob_accumulator) acc is empty
        // Finally, we call finalize_and_validate() on the end_blob_accumulator which calculates final_gamma and checks:
        // - end_blob_accumulator.z == injected.challenge_z
        // - final_gamma == injected.challenge_gamma
        // => Validated public inputs from acc are: FinalBlobAccumulatorPublicInputs { blob_commitments_hash, z, y, C } (gamma is not required)
        merged.blob_public_inputs.start_blob_accumulator.assert_empty(
            "Epoch did not start with empty blob state.",
        );
        let blob_public_inputs = merged
            .blob_public_inputs
            .end_blob_accumulator
            .finalize_and_validate(merged.blob_public_inputs.final_blob_challenges);

        RootRollupPublicInputs {
            previous_archive_root: merged.previous_archive.root,
            end_archive_root: merged.new_archive.root,
            proposed_block_header_hashes: merged.proposed_block_header_hashes,
            fees: merged.fees,
            chain_id: merged.end_global_variables.chain_id,
            version: merged.end_global_variables.version,
            vk_tree_root: merged.constants.vk_tree_root,
            protocol_contract_tree_root: merged.constants.protocol_contract_tree_root,
            prover_id: merged.constants.prover_id,
            blob_public_inputs,
        }
    }
}
