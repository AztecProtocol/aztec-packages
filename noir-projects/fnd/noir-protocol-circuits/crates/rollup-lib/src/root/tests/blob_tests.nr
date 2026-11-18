use super::TestBuilder;

#[test(should_fail_with = "Epoch did not start with empty blob state.")]
fn start_blob_accumulator_is_not_empty() {
    let mut builder = TestBuilder::default();

    // Tweak the `alpha_acc` of the start blob accumulator to be non-empty.
    builder.left_rollup.start_blob_accumulator.alpha_acc = 1;

    builder.execute_and_fail();
}
