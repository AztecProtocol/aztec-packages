use crate::abis::CheckpointRollupPublicInputs;
use types::{constants::MAX_CHECKPOINTS_PER_EPOCH, utils::arrays::splice_at_count};

pub fn merge_checkpoint_rollups(
    left: CheckpointRollupPublicInputs,
    right: CheckpointRollupPublicInputs,
) -> CheckpointRollupPublicInputs {
    let num_left_checkpoints = left.num_checkpoints() as u32;
    let num_right_checkpoints = right.num_checkpoints() as u32;

    // Make sure that the total number of checkpoints does not exceed the maximum allowed in an epoch.
    let num_checkpoints = num_left_checkpoints + num_right_checkpoints;
    assert(
        num_checkpoints <= MAX_CHECKPOINTS_PER_EPOCH,
        "total number of checkpoints exceeds max allowed in an epoch",
    );

    // Note: we have a guarantee that the number of left/right checkpoints equals the number of left/right fees:
    // Each checkpoint root adds its header hash and fee to index 0 of the arrays, which means each checkpoint
    // has the same amount (1) of header hash and fee entries. So we are able to use the number of header hashes
    // (which is the only property that doesn't have empty values), for the number of fees.
    // Hence, we don't need to assert left.num_fees == num_left_checkpoints and right.num_fees == num_right_checkpoints.

    // `splice_at_count` uses the number of **left** checkpoints to decide exactly how many items to include from each
    // side. This approach is more efficient than merging all non-empty items, and, importantly, it ensures the correct
    // alignment of array items. It would be incorrect to simply merge non-empty items.
    // For example, while header hashes are always present, the `fees` array can have empty (zeroed) entries that must
    // be preserved at their original indices. The L1 contract expects the fee at each index to correspond to the
    // checkpoint at the same index, even if that fee (or recipient) is zero. Therefore, we must always preserve all fee
    // items during the merge. Merging by `num_checkpoints` guarantees that array indices in all merged arrays remain
    // properly aligned.

    let checkpoint_header_hashes = splice_at_count(
        left.checkpoint_header_hashes,
        num_left_checkpoints,
        right.checkpoint_header_hashes,
    );
    // Sanity check that the length of the array is defined correctly.
    std::static_assert(
        checkpoint_header_hashes.len() == MAX_CHECKPOINTS_PER_EPOCH,
        "The length of the checkpoint header hashes array does not match the constant MAX_CHECKPOINTS_PER_EPOCH",
    );

    // We can't merge fees for the same recipient since the l1 contract iterates per checkpoint.
    let fees = splice_at_count(left.fees, num_left_checkpoints, right.fees);
    // Sanity check that the length of the array is defined correctly.
    std::static_assert(
        fees.len() == MAX_CHECKPOINTS_PER_EPOCH,
        "The length of the fees array does not match the constant MAX_CHECKPOINTS_PER_EPOCH",
    );

    CheckpointRollupPublicInputs {
        constants: left.constants,
        previous_archive: left.previous_archive,
        new_archive: right.new_archive,
        previous_out_hash: left.previous_out_hash,
        new_out_hash: right.new_out_hash,
        checkpoint_header_hashes,
        fees,
        start_blob_accumulator: left.start_blob_accumulator,
        end_blob_accumulator: right.end_blob_accumulator,
        final_blob_challenges: left.final_blob_challenges,
    }
}
