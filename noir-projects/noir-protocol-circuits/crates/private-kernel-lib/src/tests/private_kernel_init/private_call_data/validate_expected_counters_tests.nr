use crate::tests::private_kernel_init::TestBuilder;
use dep::types::constants::MAX_U32_VALUE;

#[test]
fn with_zero_counter() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 0;

    // Everything is non-revertible.
    builder.private_call.expected_non_revertible_side_effect_counter = 2;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn with_zero_counter_expect_min_value() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 0;

    // The start counter for the first call is 2. But it can still request kernel to validate counter 1.
    builder.private_call.expected_non_revertible_side_effect_counter = 1;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn with_zero_counter_expect_max_non_revertible() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 0;

    builder.private_call.expected_non_revertible_side_effect_counter = MAX_U32_VALUE;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn with_zero_counter_expect_max_revertible() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 0;

    builder.private_call.expected_revertible_side_effect_counter = MAX_U32_VALUE;

    builder.execute_and_fail();
}

#[test]
fn expect_correct_counters() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 50;

    builder.private_call.expected_non_revertible_side_effect_counter = 49;
    builder.private_call.expected_revertible_side_effect_counter = 51;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn expect_zero_counters() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 50;

    // Zero values mean no expectations.
    builder.private_call.expected_non_revertible_side_effect_counter = 0;
    builder.private_call.expected_revertible_side_effect_counter = 0;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn expect_counter_equals_hint() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 50;

    // The value of the revertible_counter_hint is expected to be revertible.
    builder.private_call.expected_revertible_side_effect_counter = 50;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Failed to validate expected non revertible side effect counter")]
fn expect_incorrect_non_revertible_counter() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 50;

    builder.private_call.expected_non_revertible_side_effect_counter = 50;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn expect_incorrect_revertible_counter() {
    let mut builder = TestBuilder::new();
    builder.revertible_counter_hint = 50;

    builder.private_call.expected_revertible_side_effect_counter = 49;

    builder.execute_and_fail();
}
