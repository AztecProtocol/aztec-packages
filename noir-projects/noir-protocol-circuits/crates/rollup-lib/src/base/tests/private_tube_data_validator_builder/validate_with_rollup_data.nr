use super::PrivateTubeDataValidatorBuilder;

#[test]
fn validate_with_rollup_data_success() {
    let builder = PrivateTubeDataValidatorBuilder::new();
    builder.validate_with_rollup_data();
}

#[test(should_fail_with = "fee_per_da_gas in settings must not be less than the global value")]
fn validate_with_rollup_data_not_enough_fee_per_da_gas_fails() {
    let mut builder = PrivateTubeDataValidatorBuilder::new();

    builder.tube_data.tx_context.gas_settings.max_fees_per_gas.fee_per_da_gas = 4;
    builder.rollup_data.global_variables.gas_fees.fee_per_da_gas = 3;

    builder.validate_with_rollup_data();
}

#[test(should_fail_with = "fee_per_l2_gas in settings must not be less than the global value")]
fn validate_with_rollup_data_not_enough_fee_per_l2_gas_fails() {
    let mut builder = PrivateTubeDataValidatorBuilder::new();

    builder.tube_data.tx_context.gas_settings.max_fees_per_gas.fee_per_l2_gas = 4;
    builder.rollup_data.global_variables.gas_fees.fee_per_l2_gas = 3;

    builder.validate_with_rollup_data();
}
