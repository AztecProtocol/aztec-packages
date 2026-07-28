use crate::{abis::BlockRollupPublicInputs, tx_merge::assert_rollups_filled_greedily};

pub fn validate_consecutive_block_rollups(
    left: BlockRollupPublicInputs,
    right: BlockRollupPublicInputs,
) {
    assert_rollups_filled_greedily(left.num_blocks(), right.num_blocks());
    assert_equal_constants(left, right);
    assert_prev_block_rollups_follow_on_from_each_other(left, right);
}

fn assert_equal_constants(left: BlockRollupPublicInputs, right: BlockRollupPublicInputs) {
    assert(left.constants.eq(right.constants), "Mismatched constants in block rollups");
}

fn assert_prev_block_rollups_follow_on_from_each_other(
    left: BlockRollupPublicInputs,
    right: BlockRollupPublicInputs,
) {
    assert_eq(
        left.new_archive,
        right.previous_archive,
        "Mismatched archives: expected right.previous_archive to match left.new_archive",
    );

    assert_eq(
        left.end_state,
        right.start_state,
        "Mismatched states: expected right.start_state to match left.end_state",
    );

    assert_eq(
        left.end_sponge_blob,
        right.start_sponge_blob,
        "Mismatched sponge blobs: expected right.start_sponge_blob to match left.end_sponge_blob",
    );

    // All blocks within a checkpoint must have the same timestamp.
    assert_eq(
        left.timestamp,
        right.timestamp,
        "Mismatched timestamps: expected right.timestamp to match left.timestamp",
    );

    // TODO: Consider extracting into its own function:

    // A non-empty `in_hash` originates from the first block root only, and is propagated through all merge
    // steps via the left rollup only (see merge_block_rollups.nr).
    // We prevent the right rollup from propagating a nonzero `in_hash`, so it's impossible for any
    // block but the first to propagate a nonzero `in_hash` up to the checkpoint root.
    assert_eq(right.in_hash, 0, "Right rollup must not carry in_hash");

    // The inbox rolling-hash pair follows the same rule: only the first block root (which becomes the leftmost leaf)
    // may carry it, so the right rollup's pair must always be zero. The first block's nonzero `in_hash` already pins it
    // as the leftmost leaf, so the rolling hash rides along on the same block even when its value is legitimately zero.
    assert_eq(
        right.start_inbox_rolling_hash,
        0,
        "Right rollup must not carry start_inbox_rolling_hash",
    );
    assert_eq(right.end_inbox_rolling_hash, 0, "Right rollup must not carry end_inbox_rolling_hash");
}
