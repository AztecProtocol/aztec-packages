use super::TestBuilder;

// Note: We only test a few cases here to ensure the code path is triggered. More comprehensive tests for merging and
// validating consecutive block rollups can be found in `block_merge/tests/consecutive_block_rollups_tests.nr`.

#[test]
fn propagate_right_out_hash_when_left_is_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 123;

    let (pi, _) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);

    let checkpoint_header = builder.get_expected_checkpoint_header();
    assert_eq(checkpoint_header.content_commitment.out_hash, 123);
}

#[test(should_fail_with = "Right rollup must not carry in_hash")]
fn non_zero_in_hash_in_right_rollup() {
    let mut builder = TestBuilder::default();

    builder.right_rollup.in_hash = 123;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_constants() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the left rollup.
    builder.left_rollup.constants.version += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Mismatched timestamps: expected right.timestamp to match left.timestamp")]
fn mismatch_timestamps() {
    let mut builder = TestBuilder::default();

    // Tweak the timestamp of the right rollup to be different to the timestamp of the left rollup.
    builder.right_rollup.timestamp = builder.left_rollup.timestamp + 1;

    builder.execute_with_mock_and_fail();
}
