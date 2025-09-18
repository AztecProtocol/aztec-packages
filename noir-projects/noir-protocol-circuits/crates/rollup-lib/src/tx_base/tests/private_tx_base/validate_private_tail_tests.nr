use super::PrivateTxBaseTestBuilder;
use types::constants::AVM_MAX_PROCESSABLE_L2_GAS;

#[test]
fn validate_private_tail_success() {
    let builder = PrivateTxBaseTestBuilder::new();
    builder.validate();
}

#[test(should_fail_with = "da gas is higher than the maximum specified by the tx")]
fn not_enough_fee_per_da_gas_fails() {
    let mut builder = PrivateTxBaseTestBuilder::new();

    builder.hiding_kernel_proof_data.public_inputs.constants.tx_context.gas_settings.max_fees_per_gas.fee_per_da_gas =
        3;
    builder.block_constant_data.global_variables.gas_fees.fee_per_da_gas = 4;

    builder.validate();
}

#[test(should_fail_with = "l2 gas is higher than the maximum specified by the tx")]
fn not_enough_fee_per_l2_gas_fails() {
    let mut builder = PrivateTxBaseTestBuilder::new();

    builder.hiding_kernel_proof_data.public_inputs.constants.tx_context.gas_settings.max_fees_per_gas.fee_per_l2_gas =
        3;
    builder.block_constant_data.global_variables.gas_fees.fee_per_l2_gas = 4;

    builder.validate();
}

#[test(should_fail_with = "tx include_by_timestamp is smaller than block timestamp")]
fn include_by_timestamp_lower_than_block_fails() {
    let mut builder = PrivateTxBaseTestBuilder::new();

    builder.hiding_kernel_proof_data.public_inputs.include_by_timestamp =
        builder.block_constant_data.global_variables.timestamp - 1;

    builder.validate();
}

#[test(should_fail_with = "l2 gas limit exceeds max processable l2 gas")]
fn gas_settings_l2_gas_limit_exceeds_max_processable_l2_gas_fails() {
    let mut builder = PrivateTxBaseTestBuilder::new();

    builder.hiding_kernel_proof_data.public_inputs.constants.tx_context.gas_settings.gas_limits.l2_gas =
        AVM_MAX_PROCESSABLE_L2_GAS + 1;

    builder.validate();
}
