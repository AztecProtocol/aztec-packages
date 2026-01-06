use crate::abis::CheckpointRollupPublicInputs;
use types::{constants::AZTEC_MAX_EPOCH_DURATION, utils::arrays::copy_items_into_array};

pub fn merge_checkpoint_rollups(
    left: CheckpointRollupPublicInputs,
    right: CheckpointRollupPublicInputs,
) -> CheckpointRollupPublicInputs {
    let num_left_checkpoints = left.num_checkpoints() as u32;
    let num_right_checkpoints = right.num_checkpoints() as u32;

    // Make sure that the total number of checkpoints does not exceed the maximum allowed in an epoch, preventing the
    // merged arrays (`checkpoint_header_hashes`, `fees`) from being truncated.
    let num_checkpoints = num_left_checkpoints + num_right_checkpoints;
    // Q: is it safe that we're using a constant whose value is `48` here, when I believe in practice (in prod) we're using 32 checkpoints per epoch.
    // TODO: we could put this check in the epoch root circuit, instead?
    assert(
        num_checkpoints <= AZTEC_MAX_EPOCH_DURATION,
        "total number of checkpoints exceeds max allowed in an epoch",
    );
    // Overly cautious check:
    std::static_assert(
        AZTEC_MAX_EPOCH_DURATION < 65536,
        "Your rollup design has gone a bit mental",
    );

    // We use `copy_items_into_array` below because we know exactly how many items should be taken from each side when
    // merging checkpoints.
    // It is especially critical for `fees` to copy the exact amount of items from both checkpoints. Because the L1
    // contracts will process fees by index, assuming each entry corresponds to the checkpoint at the same position.
    // However, the existence of zero fees or recipients is not prohibited by the circuit. Therefore, preserving empty
    // values is important.
    // Using this helper (instead of helper like `array_merge`) ensures those empty entries are copied over.

    let checkpoint_header_hashes = copy_items_into_array(
        left.checkpoint_header_hashes,
        num_left_checkpoints,
        right.checkpoint_header_hashes,
        num_right_checkpoints,
    );

    // Q: should we also sum left.num_fees() + right.num_fees() to ensure they fit within the array merge?
    // Do we have guarantees from the construction of these `fees` arrays that their lengths are equal to the
    // lengths of the (just checked above) left/right `checkpoint_header_hashes` arrays? If so, we should explain where
    // in the codebase we guarantee that they're the same lengths. Maybe we should add some static asserts to
    // protect against future accidental deviations in these constants.
    // We can't merge fees for the same recipient since the l1 contract iterates per checkpoint.
    let fees = copy_items_into_array(
        left.fees,
        num_left_checkpoints,
        right.fees,
        num_right_checkpoints,
    );

    CheckpointRollupPublicInputs {
        constants: left.constants,
        previous_archive: left.previous_archive,
        new_archive: right.new_archive,
        checkpoint_header_hashes,
        fees,
        start_blob_accumulator: left.start_blob_accumulator,
        end_blob_accumulator: right.end_blob_accumulator,
        final_blob_challenges: left.final_blob_challenges,
    }
}
