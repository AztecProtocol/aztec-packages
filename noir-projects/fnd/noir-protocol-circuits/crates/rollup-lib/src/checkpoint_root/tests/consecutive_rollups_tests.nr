use super::TestBuilder;

// Note: We only test a few cases here to ensure the code path is triggered. More comprehensive tests for merging and
// validating consecutive block rollups can be found in `block_merge/tests/consecutive_block_rollups_tests.nr`.
// Tests for merging out hashes can be found in `out_hash_tests.nr`.

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
