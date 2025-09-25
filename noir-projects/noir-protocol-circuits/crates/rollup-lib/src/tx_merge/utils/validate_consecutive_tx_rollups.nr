use crate::abis::TxRollupPublicInputs;
use types::utils::math::is_power_of_2;

pub fn validate_consecutive_tx_rollups(left: TxRollupPublicInputs, right: TxRollupPublicInputs) {
    assert_rollups_filled_greedily(left.num_txs, right.num_txs);
    assert_equal_constants(left, right);
    assert_prev_rollups_follow_on_from_each_other(left, right);
}

/// Asserts that the tree formed by rollup circuits is filled greedily from left to right.
///
/// `num_[left|right]_rollups` is the number of accumulated rollups on the left/right branch.
/// When called from the `tx_merge` or `block_root`, it represents the total number of `tx_base` rollups.
/// When called from the `block_merge` or `checkpoint_root`, it represents the total number of `block_root` rollups.
/// When called from the `checkpoint_merge` or `root`, it represents the total number of `checkpoint_root` rollups.
pub fn assert_rollups_filled_greedily(num_left_rollups: u16, num_right_rollups: u16) {
    // The left rollup must be a balanced tree (i.e., `num_left_rollups` is a power of 2).
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

/**
 * Asserts that the constants used in the left and right child are identical.
 */
fn assert_equal_constants(left: TxRollupPublicInputs, right: TxRollupPublicInputs) {
    assert(left.constants.eq(right.constants), "Mismatched constants in tx rollups");
}

/**
 * Asserts that the end snapshots of previous_rollup 0 equals the start snapshots of previous_rollup 1.
 * Ensures that right uses the trees that were updated by left.
 */
fn assert_prev_rollups_follow_on_from_each_other(
    left: TxRollupPublicInputs,
    right: TxRollupPublicInputs,
) {
    assert(
        left.end_tree_snapshots.note_hash_tree.eq(right.start_tree_snapshots.note_hash_tree),
        "Mismatched note hash tree snapshots: expected right.start to match left.end",
    );
    assert(
        left.end_tree_snapshots.nullifier_tree.eq(right.start_tree_snapshots.nullifier_tree),
        "Mismatched nullifier tree snapshots: expected right.start to match left.end",
    );
    assert(
        left.end_tree_snapshots.public_data_tree.eq(right.start_tree_snapshots.public_data_tree),
        "Mismatched public data tree snapshots: expected right.start to match left.end",
    );
    assert(
        left.end_sponge_blob.eq(right.start_sponge_blob),
        "Mismatched sponge blobs: expected right.start to match left.end",
    );
}
