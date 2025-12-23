use crate::abis::CheckpointRollupPublicInputs;
use types::{constants::AZTEC_MAX_EPOCH_DURATION, utils::arrays::array_merge};

pub fn merge_checkpoint_rollups(
    left: CheckpointRollupPublicInputs,
    right: CheckpointRollupPublicInputs,
) -> CheckpointRollupPublicInputs {
    // Make sure that the total number of checkpoints does not exceed the maximum allowed in an epoch, preventing the
    // merged arrays (`checkpoint_header_hashes`, `fees`) from being truncated.
    let num_checkpoints = left.num_checkpoints() + right.num_checkpoints();
    // Q: is it safe that we're using a constant whose value is `48` here, when I believe in practice (in prod) we're using 32 checkpoints per epoch.
    // TODO: we could put this check in the epoch root circuit, instead?
    assert(
        num_checkpoints <= AZTEC_MAX_EPOCH_DURATION as u16,
        "total number of checkpoints exceeds max allowed in an epoch",
    );
    // Overly cautious check:
    std::static_assert(
        AZTEC_MAX_EPOCH_DURATION < 65536,
        "Your rollup design has gone a bit mental",
    );

    // Note: we need to do the length checks above, because this array_merge function is unsafe: it
    // doesn't check whether the summed length of the inputs exceeds the capacity of the output.
    let checkpoint_header_hashes = array_merge(
        left.checkpoint_header_hashes,
        right.checkpoint_header_hashes,
    );

    // Q: should we also sum left.num_fees() + right.num_fees() to ensure they fit within the array merge?
    // Do we have guarantees from the construction of these `fees` arrays that their lengths are equal to the
    // lengths of the (just checked above) left/right `checkpoint_header_hashes` arrays? If so, we should explain where
    // in the codebase we guarantee that they're the same lengths.
    // We can't merge fees for the same recipient since the l1 contract iterates per checkpoint.
    let fees = array_merge(left.fees, right.fees);

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
