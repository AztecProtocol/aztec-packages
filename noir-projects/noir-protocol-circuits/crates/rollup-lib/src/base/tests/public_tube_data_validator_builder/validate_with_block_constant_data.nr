use super::PublicTubeDataValidatorBuilder;

#[test]
fn public_tube_validate_with_block_constant_data_success() {
    let builder = PublicTubeDataValidatorBuilder::new();
    builder.validate_with_block_constant_data();
}

#[test(should_fail_with = "da gas is higher than the maximum specified by the tx")]
fn public_tube_validate_with_block_constant_data_not_enough_fee_per_da_gas_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new();

    builder.tube_data.tx_context.gas_settings.max_fees_per_gas.fee_per_da_gas = 3;
    builder.block_constant_data.global_variables.gas_fees.fee_per_da_gas = 4;

    builder.validate_with_block_constant_data();
}

#[test(should_fail_with = "l2 gas is higher than the maximum specified by the tx")]
fn public_tube_validate_with_block_constant_data_not_enough_fee_per_l2_gas_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new();

    builder.tube_data.tx_context.gas_settings.max_fees_per_gas.fee_per_l2_gas = 3;
    builder.block_constant_data.global_variables.gas_fees.fee_per_l2_gas = 4;

    builder.validate_with_block_constant_data();
}

#[test(should_fail_with = "tx include_by_timestamp is smaller than block timestamp")]
fn validate_with_block_constant_data_include_by_timestamp_lower_than_block_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new();

    builder.tube_data.include_by_timestamp = builder.tube_data.global_variables.timestamp - 1;

    builder.validate_with_block_constant_data();
}
