use super::TestBuilder;

// Note: We only test a few cases here to ensure the code path is triggered. More comprehensive tests for merging and
// validating consecutive tx rollups can be found in `tx_merge/tests/consecutive_tx_rollups_tests.nr`.

global IS_FIRST_BLOCK_ROOT: bool = true;
// Only the block root that has 2 rollups will need to validate that the rollups are consecutive.
global HAS_SINGLE_TX: bool = false;

#[test]
fn propagate_right_out_hash_when_left_is_zero() {
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, HAS_SINGLE_TX);

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 123;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.out_hash, 123);
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn first_mismatch_block_number() {
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, HAS_SINGLE_TX);

    // Tweak the block number of the left rollup.
    builder.left_rollup.constants.global_variables.block_number += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched note hash tree snapshots: expected right.start to match left.end")]
fn first_non_consecutive_note_hash_next_available_index() {
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, HAS_SINGLE_TX);

    // Tweak the next_available_leaf_index in the note hash tree snapshot of the right rollup.
    builder.right_rollup.start_tree_snapshots.note_hash_tree.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn non_first_mismatch_block_number() {
    let mut builder = TestBuilder::default(!IS_FIRST_BLOCK_ROOT, HAS_SINGLE_TX);

    // Tweak the block number of the left rollup.
    builder.left_rollup.constants.global_variables.block_number += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched note hash tree snapshots: expected right.start to match left.end")]
fn non_first_non_consecutive_note_hash_next_available_index() {
    let mut builder = TestBuilder::default(!IS_FIRST_BLOCK_ROOT, HAS_SINGLE_TX);

    // Tweak the next_available_leaf_index in the note hash tree snapshot of the right rollup.
    builder.right_rollup.start_tree_snapshots.note_hash_tree.next_available_leaf_index += 1;

    builder.execute_and_fail();
}
