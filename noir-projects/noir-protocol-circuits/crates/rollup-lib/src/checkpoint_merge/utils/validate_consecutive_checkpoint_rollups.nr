use crate::{abis::CheckpointRollupPublicInputs, tx_merge::assert_rollups_filled_greedily};

pub fn validate_consecutive_checkpoint_rollups(
    left: CheckpointRollupPublicInputs,
    right: CheckpointRollupPublicInputs,
) {
    assert_rollups_filled_greedily(left.num_checkpoints(), right.num_checkpoints());
    assert_equal_constants(left, right);
    assert_rollups_follow_on_from_each_other(left, right);
}

fn assert_equal_constants(left: CheckpointRollupPublicInputs, right: CheckpointRollupPublicInputs) {
    assert_eq(left.constants, right.constants, "Mismatched constants in checkpoint rollups");
}

fn assert_rollups_follow_on_from_each_other(
    left: CheckpointRollupPublicInputs,
    right: CheckpointRollupPublicInputs,
) {
    assert_eq(
        left.new_archive,
        right.previous_archive,
        "Mismatched archives: expected right.previous_archive to match left.new_archive",
    );

    assert_eq(
        left.end_blob_accumulator,
        right.start_blob_accumulator,
        "Mismatched blob accumulators: expected right.start_blob_accumulator to match left.end_blob_accumulator",
    );

    assert_eq(
        left.final_blob_challenges,
        right.final_blob_challenges,
        "Mismatched final blob challenges of an epoch in checkpoint rollups",
    );
}
