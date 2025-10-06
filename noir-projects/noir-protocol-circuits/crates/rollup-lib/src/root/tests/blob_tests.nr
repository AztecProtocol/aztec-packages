use super::TestBuilder;
use bignum::bignum::BigNum;

#[test(should_fail_with = "Epoch did not start with empty blob state.")]
fn start_blob_accumulator_is_not_empty() {
    let mut builder = TestBuilder::default();

    // Tweak the `gamma_acc` of the start blob accumulator to be non-empty.
    builder.left_rollup.start_blob_accumulator.gamma_acc = 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Final blob challenge gamma mismatch.")]
fn incorrect_final_blob_challenges_gamma() {
    let mut builder = TestBuilder::default();

    // Tweak the `gamma` of the final blob challenges.
    let random_gamma = BigNum::from_limbs([1, 2, 3]);
    builder.left_rollup.final_blob_challenges.gamma = random_gamma;
    builder.right_rollup.final_blob_challenges.gamma = random_gamma;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Final blob challenge z mismatch.")]
fn incorrect_final_blob_challenges_z() {
    let mut builder = TestBuilder::default();

    // Tweak the `z` of the final blob challenges.
    builder.left_rollup.final_blob_challenges.z += 1;
    builder.right_rollup.final_blob_challenges.z += 1;

    builder.execute_and_fail();
}
