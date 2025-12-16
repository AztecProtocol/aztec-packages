use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;
use types::constants::MAX_U32_VALUE;

#[test]
fn validate_as_first_call_regular_call_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new().is_first_call();
    builder.validate_as_first_call(0);
}

#[test(should_fail_with = "Users cannot make a static call")]
fn validate_as_first_call_static_call_fails() {
    let builder = PrivateCallDataValidatorBuilder::new().is_first_call().is_static_call();
    builder.validate_as_first_call(0);
}

#[test(should_fail_with = "Users cannot set msg_sender in first call")]
fn validate_as_first_call_msg_sender_fails() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.validate_as_first_call(0);
}

#[test(should_fail_with = "Failed to validate expected non revertible side effect counter")]
fn validate_against_previous_kernel_expected_non_revertible_side_effect_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_first_call();

    builder.private_call.expected_non_revertible_side_effect_counter = 10;

    builder.validate_as_first_call(10);
}

#[test]
fn validate_against_previous_kernel_expected_non_revertible_side_effect_counter_0_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_first_call();

    builder.private_call.expected_non_revertible_side_effect_counter = MAX_U32_VALUE;

    builder.validate_as_first_call(0);
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn validate_against_previous_kernel_expected_revertible_side_effect_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_first_call();

    builder.private_call.expected_revertible_side_effect_counter = 9;

    builder.validate_as_first_call(10);
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn validate_against_previous_kernel_expected_revertible_side_effect_counter_0_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_first_call();

    builder.private_call.expected_revertible_side_effect_counter = MAX_U32_VALUE;

    builder.validate_as_first_call(0);
}
