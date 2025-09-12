use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;

pub fn validate_consecutive_rollups(
    prev_rollup: BaseOrMergeRollupPublicInputs,
    next_rollup: BaseOrMergeRollupPublicInputs,
) {
    assert_txs_filled_from_left(prev_rollup, next_rollup);
    assert_equal_constants(prev_rollup, next_rollup);
    assert_prev_rollups_follow_on_from_each_other(prev_rollup, next_rollup);
}

/**
 * Asserts that the tree formed by rollup circuits is filled greedily from L to R.
 */
fn assert_txs_filled_from_left(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    // assert that the left rollup is either a base (1 tx) or a balanced tree (num txs = power of 2)
    if (left.num_txs != 1) {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        assert_eq(
            (left.num_txs) & (left.num_txs - 1),
            0,
            "The rollup should be filled greedily from L to R, but received an unbalanced left subtree",
        );
        assert(
            right.num_txs <= left.num_txs,
            "The rollup should be filled greedily from L to R, but received a L txs < R txs",
        );
    } else {
        assert_eq(
            right.num_txs,
            1,
            "The rollup should be filled greedily from L to R, but received a L base and R merge",
        );
    }
}

/**
 * Asserts that the constants used in the left and right child are identical.
 */
fn assert_equal_constants(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    assert(left.constants.eq(right.constants), "input proofs have different constants");
}

/**
 * Asserts that the end snapshots of previous_rollup 0 equals the start snapshots of previous_rollup 1.
 * Ensures that right uses the trees that were updated by left.
 */
fn assert_prev_rollups_follow_on_from_each_other(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    assert(
        left.end.note_hash_tree.eq(right.start.note_hash_tree),
        "input proofs have different note hash tree snapshots",
    );
    assert(
        left.end.nullifier_tree.eq(right.start.nullifier_tree),
        "input proofs have different nullifier tree snapshots",
    );
    assert(
        left.end.public_data_tree.eq(right.start.public_data_tree),
        "input proofs have different public data tree snapshots",
    );
    assert(
        left.end_sponge_blob.eq(right.start_sponge_blob),
        "input proofs have different blob data sponges",
    );
}
