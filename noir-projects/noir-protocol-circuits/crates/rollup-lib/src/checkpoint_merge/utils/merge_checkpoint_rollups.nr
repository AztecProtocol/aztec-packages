use crate::abis::CheckpointRollupPublicInputs;
use types::{constants::AZTEC_MAX_EPOCH_DURATION, utils::arrays::array_merge};

pub fn merge_checkpoint_rollups(
    left: CheckpointRollupPublicInputs,
    right: CheckpointRollupPublicInputs,
) -> CheckpointRollupPublicInputs {
    // Make sure that the total number of checkpoints does not exceed the maximum allowed in an epoch, preventing the
    // merged arrays (`checkpoint_header_hashes`, `fees`) from being truncated.
    let num_checkpoints = left.num_checkpoints() + right.num_checkpoints();
    assert(
        num_checkpoints <= AZTEC_MAX_EPOCH_DURATION as u16,
        "total number of checkpoints exceeds max allowed in an epoch",
    );

    let checkpoint_header_hashes = array_merge(
        left.checkpoint_header_hashes,
        right.checkpoint_header_hashes,
    );

    // TODO(Miranda): combine fees with same recipient depending on rollup structure
    // Assuming that the final rollup tree (block root -> block merge -> root) has max 32 leaves (TODO: constrain in root), then
    // in the worst case, we would be checking the left 16 values (left_len = 16) against the right 16 (right_len = 16).
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
