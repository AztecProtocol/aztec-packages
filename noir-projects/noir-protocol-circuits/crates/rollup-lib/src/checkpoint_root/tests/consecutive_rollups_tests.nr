use super::TestBuilder;

// Note: We only test a few cases here to ensure the code path is triggered. More comprehensive tests for merging and
// validating consecutive block rollups can be found in `block_merge/tests/consecutive_block_rollups_tests.nr`.

#[test]
fn propagate_right_out_hash_when_left_is_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 123;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let checkpoint_header = builder.get_expected_checkpoint_header();
    assert_eq(checkpoint_header.content_commitment.out_hash, 123);
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_constants() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the left rollup.
    builder.left_rollup.constants.version += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Rollup block timestamps do not follow on from each other")]
fn non_consecutive_timestamps() {
    let mut builder = TestBuilder::default();

    // Tweak the start_timestamp of the right rollup to be smaller than the end_timestamp of the left rollup.
    builder.right_rollup.start_timestamp = builder.left_rollup.end_timestamp - 1;

    builder.execute_with_mock_and_fail();
}
