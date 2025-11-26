use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;

#[test]
fn validate_min_revertible_counter_0_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();
    builder.private_call.min_revertible_side_effect_counter = 0;
    builder.validate();
}

#[test(should_fail_with = "min_revertible_side_effect_counter must be greater than or equal to start_side_effect_counter")]
fn validate_min_revertible_counter_lower_than_start_side_effect_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();
    builder.private_call.counter_start = 3;
    builder.private_call.counter = 4;
    builder.private_call.min_revertible_side_effect_counter = 2;
    builder.validate();
}

#[test(should_fail_with = "min_revertible_side_effect_counter must be less than or equal to end_side_effect_counter")]
fn validate_min_revertible_counter_greater_than_end_side_effect_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();
    builder.private_call.counter_start = 3;
    builder.private_call.counter = 4;
    builder.private_call.min_revertible_side_effect_counter = 5;
    builder.validate();
}
