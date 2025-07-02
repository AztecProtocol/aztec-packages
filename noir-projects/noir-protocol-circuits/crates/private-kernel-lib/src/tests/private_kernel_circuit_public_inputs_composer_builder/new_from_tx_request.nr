use crate::{
    components::private_kernel_circuit_public_inputs_composer::create_protocol_nullifier,
    tests::private_kernel_circuit_public_inputs_composer_builder::PrivateKernelCircuitPublicInputsComposerBuilder,
};
use dep::types::{abis::side_effect::OrderedValue, traits::Empty};

#[test]
fn new_from_tx_request_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();
    builder.with_protocol_nullifier();

    // Make sure we are not testing with empty structs/data.
    let tx_request = builder.tx_request;
    assert(!tx_request.is_empty());
    let protocol_nullifier = create_protocol_nullifier(tx_request);

    builder.private_call.historical_header.total_fees = 979797;
    builder.private_call.historical_header.content_commitment.out_hash = 122122;
    let historical_header = builder.private_call.historical_header;

    // Safety: this is a test.
    let output = unsafe { builder.new_from_tx_request(false).public_inputs_builder.finish() };

    // Check output constants.
    assert_eq(output.is_private_only, false);
    assert_eq(output.constants.tx_context, tx_request.tx_context);
    assert_eq(output.constants.historical_header, historical_header);

    // Check protocol nullifier is set.
    assert_eq(output.end.nullifiers.array[0], protocol_nullifier);

    // Check the nullifier claim is set to the protocol nullifier
    assert_eq(output.claimed_first_nullifier, protocol_nullifier.value());

    // Check values default to empty.
    assert_eq(output.min_revertible_side_effect_counter, 0);
    assert(output.validation_requests.is_empty());
    assert(output.include_by_timestamp.is_none());
    assert(output.public_teardown_call_request.is_empty());
    assert(output.fee_payer.is_empty());
}

#[test]
fn new_from_tx_request_without_protocol_nullifier_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    // Make sure we are not testing with empty structs/data.
    let tx_request = builder.tx_request;
    assert(!tx_request.is_empty());

    builder.private_call.historical_header.total_fees = 979797;
    builder.private_call.historical_header.content_commitment.out_hash = 122122;
    let historical_header = builder.private_call.historical_header;

    // Safety: this is a test.
    let output = unsafe { builder.new_from_tx_request(false).public_inputs_builder.finish() };

    // Check output constants.
    assert_eq(output.is_private_only, false);
    assert_eq(output.constants.tx_context, tx_request.tx_context);
    assert_eq(output.constants.historical_header, historical_header);

    // Check no nullifier is generated
    assert(output.end.nullifiers.array[0].is_empty());

    // Check the nullifier claim is set to the hint
    assert_eq(output.claimed_first_nullifier, builder.first_nullifier_hint);

    // Check values default to empty.
    assert_eq(output.min_revertible_side_effect_counter, 0);
    assert(output.validation_requests.is_empty());
    assert(output.include_by_timestamp.is_none());
    assert(output.public_teardown_call_request.is_empty());
    assert(output.fee_payer.is_empty());
}
