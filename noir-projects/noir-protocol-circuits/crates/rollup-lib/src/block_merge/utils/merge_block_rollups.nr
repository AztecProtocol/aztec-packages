use crate::abis::block_root_or_block_merge_public_inputs::{
    BlockRootOrBlockMergePublicInputs, FeeRecipient,
};
use blob::blob_batching_public_inputs::BlockBlobPublicInputs;
use types::{constants::AZTEC_MAX_EPOCH_DURATION, utils::arrays::array_merge};

pub fn merge_block_rollups(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> BlockRootOrBlockMergePublicInputs {
    let proposed_block_header_hashes = accumulate_proposed_block_header_hashes(left, right);

    let fees = accumulate_blocks_fees(left, right);

    // Note: for blob batching, in validate_consecutive_block_rollups > assert_prev_block_rollups_follow_on_from_each_other we have checked:
    // - left.end_blob_accumulator == right.start_blob_accumulator
    // - left.challenge_z == right.challenge_z
    // - left.challenge_gamma == right.challenge_gamma
    let blob_public_inputs = BlockBlobPublicInputs {
        start_blob_accumulator: left.blob_public_inputs.start_blob_accumulator,
        end_blob_accumulator: right.blob_public_inputs.end_blob_accumulator,
        final_blob_challenges: left.blob_public_inputs.final_blob_challenges,
    };

    BlockRootOrBlockMergePublicInputs {
        constants: left.constants,
        previous_archive: left.previous_archive,
        new_archive: right.new_archive,
        start_global_variables: left.start_global_variables,
        end_global_variables: right.end_global_variables,
        out_hash: 0, // Not needed for block merge. This is only required for block root since the value is inserted on L1 per block.
        proposed_block_header_hashes,
        fees,
        blob_public_inputs,
    }
}

fn accumulate_proposed_block_header_hashes(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [Field; AZTEC_MAX_EPOCH_DURATION] {
    array_merge(
        left.proposed_block_header_hashes,
        right.proposed_block_header_hashes,
    )
}

fn accumulate_blocks_fees(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) -> [FeeRecipient; AZTEC_MAX_EPOCH_DURATION] {
    // TODO(Miranda): combine fees with same recipient depending on rollup structure
    // Assuming that the final rollup tree (block root -> block merge -> root) has max 32 leaves (TODO: constrain in root), then
    // in the worst case, we would be checking the left 16 values (left_len = 16) against the right 16 (right_len = 16).
    array_merge(left.fees, right.fees)
}
