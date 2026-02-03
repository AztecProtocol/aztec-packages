use super::TestBuilder;

// Note: We only test a few cases here to ensure the code path is triggered. More comprehensive tests for validating
// consecutive rollups can be found in `checkpoint_merge/tests/consecutive_checkpoint_rollups_tests.nr`.

#[test]
fn correct_default_inputs() {
    let builder = TestBuilder::default();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_constants() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the left rollup.
    builder.left_rollup.constants.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched archives: expected right.previous_archive to match left.new_archive")]
fn non_consecutive_archives() {
    let mut builder = TestBuilder::default();

    // Tweak the previous_archive of the right rollup.
    builder.right_rollup.previous_archive.root += 1;

    builder.execute_and_fail();
}
