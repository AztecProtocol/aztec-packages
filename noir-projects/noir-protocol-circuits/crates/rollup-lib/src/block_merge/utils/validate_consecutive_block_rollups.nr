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

    assert(
        left.end_timestamp < right.start_timestamp,
        "Rollup block timestamps do not follow on from each other",
    );

    // Ensure `in_hash` is set on the left rollup. It originates from the first block root and must propagate through
    // all merge steps via the left rollup only.
    assert(left.in_hash != 0, "in_hash must be set on the left rollup when merging blocks");

    // The right rollup must not carry or propagate the `in_hash`, only the left rollup does.
    assert_eq(right.in_hash, 0, "Right rollup must not carry in_hash");
}
