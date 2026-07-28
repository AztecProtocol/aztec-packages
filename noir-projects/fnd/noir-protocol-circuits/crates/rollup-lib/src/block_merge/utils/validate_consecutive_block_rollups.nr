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

    // `is_first_block` originates from the first block root only, and is propagated through all merge steps via the
    // left rollup only (see merge_block_rollups.nr). We prevent the right rollup from carrying it, so it's impossible
    // for any block but the first to propagate `is_first_block == true` up to the checkpoint root.
    assert(!right.is_first_block, "Right rollup must not be a first block");

    // The message sponge threads across the checkpoint's blocks: the right rollup must start from where the left rollup
    // ended. Combined with the checkpoint root asserting the leftmost start is empty and the merged end matches the
    // parity root's sponge, this pins the blocks to insert exactly the parity-committed message list, in order.
    assert_eq(
        right.start_msg_sponge,
        left.end_msg_sponge,
        "Mismatched message sponge: expected right.start_msg_sponge to match left.end_msg_sponge",
    );
}
