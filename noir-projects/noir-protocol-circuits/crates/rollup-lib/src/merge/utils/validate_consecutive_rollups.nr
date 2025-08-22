use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use types::utils::math::is_power_of_2;

pub fn validate_consecutive_rollups(
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
) {
    assert_rollups_filled_greedily(left.num_txs, right.num_txs);
    assert_equal_constants(left, right);
    assert_prev_rollups_follow_on_from_each_other(left, right);
}

/// Asserts that the tree formed by rollup circuits is filled greedily from left to right.
///
/// `num_[left|right]_rollups` is the number of accumulated rollups on the left/right branch.
/// When called from the `merge` or `block_root`, it represents the total number of `base` rollups.
/// When called from the `block_merge` or `checkpoint_root`, it represents the total number of `block_root` rollups.
/// When called from the `checkpoint_merge` or `root`, it represents the total number of `checkpoint_root` rollups.
pub fn assert_rollups_filled_greedily(num_left_rollups: u32, num_right_rollups: u32) {
    if (num_left_rollups == 1) {
        // If the left rollup is a root, the right rollup must also be a root.
        assert_eq(
            num_right_rollups,
            1,
            "The rollup should be filled greedily from left to right, but received a left Root and right Merge",
        );
    } else {
        // Otherwise, the left rollup must be a balanced tree (i.e., `num_left_rollups` is a power of 2).
        assert(
            is_power_of_2(num_left_rollups),
            "The rollup should be filled greedily from left to right, but received an unbalanced left subtree",
        );
        // The right rollup must be smaller than or equal to the left rollup.
        assert(
            num_right_rollups <= num_left_rollups,
            "The rollup should be filled greedily from left to right, but received left rollups < right rollups",
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
