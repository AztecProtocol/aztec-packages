use crate::tests::private_kernel_circuit_output_validator_builder::PrivateKernelCircuitOutputValidatorBuilder;
use dep::types::{
    address::AztecAddress,
    constants::{DEFAULT_UPDATE_DELAY, MAX_U64_VALUE},
    traits::FromField,
};

#[test]
fn validate_initial_values_empty_data_succeeds() {
    let builder = PrivateKernelCircuitOutputValidatorBuilder::new();
    builder.validate_as_first_call();
}

/**
 * constants
 */
#[test(should_fail_with = "mismatch tx_context")]
fn validate_initial_values_constants_mismatch_chain_id_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.output.tx_context.chain_id += 1;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "mismatch is_private_only")]
fn validate_initial_values_is_private_only_mismatch_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.output.is_private_only = true;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "mismatch historical_header")]
fn validate_initial_values_constants_mismatch_out_hash_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.output.historical_header.content_commitment.out_hash += 1;

    builder.validate_as_first_call();
}

/**
 * First nullifier.
 */
#[test(should_fail_with = "protocol nullifier must be the tx request nullifier")]
fn validate_initial_values_constants_incorrect_protocol_nullifier_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();
    builder.with_protocol_nullifier();

    let mut nullifier = builder.output.nullifiers.get(0);
    nullifier.nullifier.value += 1;
    builder.output.nullifiers.set(0, nullifier);

    builder.validate_as_first_call();
}

/**
 * min_revertible_side_effect_counter
 */
#[test]
fn validate_initial_values_min_revertible_side_effect_counter_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.min_revertible_side_effect_counter = 8989;
    builder.output.min_revertible_side_effect_counter = 8989;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial min_revertible_side_effect_counter")]
fn validate_initial_values_min_revertible_side_effect_counter_mismatch_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.min_revertible_side_effect_counter = 8989;
    builder.output.min_revertible_side_effect_counter = 50;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial min_revertible_side_effect_counter")]
fn validate_initial_values_min_revertible_side_effect_counter_empty_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.min_revertible_side_effect_counter = 8989;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial min_revertible_side_effect_counter")]
fn validate_initial_values_min_revertible_side_effect_counter_random_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.output.min_revertible_side_effect_counter = 8989;

    builder.validate_as_first_call();
}

/**
 * include_by_timestamp
 */
#[test]
fn validate_initial_values_include_by_timestamp_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.include_by_timestamp = 3;
    builder.output.include_by_timestamp = 3;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial include_by_timestamp")]
fn validate_initial_values_include_by_timestamp_mismatch_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.include_by_timestamp = 3;
    builder.output.include_by_timestamp = 4;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial include_by_timestamp")]
fn validate_initial_values_include_by_timestamp_empty_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.include_by_timestamp = 4;
    builder.output.include_by_timestamp = 0;

    builder.validate_as_first_call();
}

#[test]
fn validate_initial_values_include_by_timestamp_override_default_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.include_by_timestamp = MAX_U64_VALUE;

    let include_by_timestamp_for_contract_updates =
        builder.private_call.historical_header.global_variables.timestamp + DEFAULT_UPDATE_DELAY;
    builder.output.include_by_timestamp = include_by_timestamp_for_contract_updates;

    builder.validate_as_first_call();
}

/**
 * public_teardown_call_request
 */
#[test]
fn validate_initial_values_public_teardown_call_request_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.set_public_teardown_call_request();
    builder.output.set_public_teardown_call_request();

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial public_teardown_call_request")]
fn validate_initial_values_public_teardown_call_request_mismatch_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.set_public_teardown_call_request();
    builder.output.set_public_teardown_call_request();
    // Tweak the output.
    builder.output.public_teardown_call_request.calldata_hash += 1;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial public_teardown_call_request")]
fn validate_initial_values_public_teardown_call_request_empty_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.set_public_teardown_call_request();

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial public_teardown_call_request")]
fn validate_initial_values_public_teardown_call_request_random_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.output.set_public_teardown_call_request();

    builder.validate_as_first_call();
}

/**
 * fee_payer
 */
#[test]
fn validate_initial_values_fee_payer_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    let fee_payer = builder.private_call.make_fee_payer();
    builder.output.set_fee_payer(fee_payer);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial fee_payer")]
fn validate_initial_values_fee_payer_mismatch_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    let fee_payer = builder.private_call.make_fee_payer();
    builder.output.set_fee_payer(fee_payer);
    // Tweak the output.
    builder.output.fee_payer.inner += 1;

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial fee_payer")]
fn validate_initial_values_fee_payer_empty_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    let _ = builder.private_call.make_fee_payer();

    builder.validate_as_first_call();
}

#[test(should_fail_with = "incorrect initial fee_payer")]
fn validate_initial_values_fee_payer_random_output_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.output.set_fee_payer(AztecAddress::from_field(3));

    builder.validate_as_first_call();
}
