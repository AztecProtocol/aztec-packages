use super::TestBuilder;
use dep::types::{
    address::AztecAddress,
    constants::DEFAULT_UPDATE_DELAY,
    hash::{create_protocol_nullifier, silo_nullifier},
    tests::utils::assert_claimed_length_array_eq,
    traits::Empty,
};

#[test]
fn with_everything_empty_except_for_first_nullifier_hint() {
    let mut builder = TestBuilder::new();

    builder.private_call.include_by_timestamp = 0;
    builder.first_nullifier_hint = 1234;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.min_revertible_side_effect_counter, 0);
    assert_eq(pi.fee_payer, AztecAddress::empty());
    assert_eq(pi.include_by_timestamp, 0);
    assert_eq(pi.is_private_only, false);
    assert_eq(pi.claimed_first_nullifier, 1234);
    assert_eq(pi.claimed_revertible_counter, 0);

    assert_claimed_length_array_eq(pi.end.note_hashes, []);
    // The nullifiers array is empty because the protocol nullifier is not injected.
    assert_claimed_length_array_eq(pi.end.nullifiers, []);
    assert_claimed_length_array_eq(pi.end.l2_to_l1_msgs, []);
    assert_claimed_length_array_eq(pi.end.private_logs, []);
    assert_claimed_length_array_eq(pi.end.contract_class_logs_hashes, []);
    assert_claimed_length_array_eq(pi.end.private_call_stack, []);
    assert_claimed_length_array_eq(pi.end.public_call_requests, []);
    assert(pi.public_teardown_call_request.is_empty());
    assert_claimed_length_array_eq(pi.validation_requests.note_hash_read_requests, []);
    assert_claimed_length_array_eq(pi.validation_requests.nullifier_read_requests, []);
    assert_claimed_length_array_eq(
        pi.validation_requests.scoped_key_validation_requests_and_generators,
        [],
    );
}

#[test]
fn with_protocol_nullifier_injected() {
    let mut builder = TestBuilder::new();

    let scoped_protocol_nullifier = create_protocol_nullifier(builder.tx_request);
    let protocol_nullifier = silo_nullifier(scoped_protocol_nullifier);
    builder.first_nullifier_hint = protocol_nullifier;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // The claimed value is propagated from the hint.
    assert_eq(pi.claimed_first_nullifier, protocol_nullifier);

    // The nullifiers array contains the protocol nullifier.
    assert_claimed_length_array_eq(pi.end.nullifiers, [scoped_protocol_nullifier]);
}

#[test]
fn with_nullifiers_emitted_and_protocol_nullifier_injected() {
    let mut builder = TestBuilder::new();

    let scoped_protocol_nullifier = create_protocol_nullifier(builder.tx_request);
    let protocol_nullifier = silo_nullifier(scoped_protocol_nullifier);
    builder.first_nullifier_hint = protocol_nullifier;

    builder.private_call.append_nullifiers(1);
    let private_call_nullifiers = builder.private_call.nullifiers.storage();

    let pi = builder.execute();

    // The claimed value is propagated from the hint.
    assert_eq(pi.claimed_first_nullifier, protocol_nullifier);

    // The nullifiers array contains the protocol nullifier and the private call's nullifier.
    assert_claimed_length_array_eq(
        pi.end.nullifiers,
        [scoped_protocol_nullifier, private_call_nullifiers[0]],
    );
}

#[test]
fn include_by_timestamp_constrained_by_contract_updates() {
    let mut builder = TestBuilder::new();

    // Set the private call's include_by_timestamp to a large value
    // that exceeds the contract update time horizon
    let anchor_timestamp = builder.private_call.anchor_block_header.global_variables.timestamp;
    let contract_update_horizon = anchor_timestamp + DEFAULT_UPDATE_DELAY;

    // Set include_by_timestamp larger than the contract update horizon
    builder.private_call.include_by_timestamp = contract_update_horizon + 1000;

    let pi = builder.execute();

    // Verify the output uses the smaller contract update timestamp, not the private call's value
    assert_eq(pi.include_by_timestamp, contract_update_horizon);
}

#[test]
fn with_everything_non_empty() {
    let mut builder = TestBuilder::new();

    builder.is_private_only = true;
    builder.first_nullifier_hint = 1234;
    builder.revertible_counter_hint = 567;
    builder.private_call.include_by_timestamp = 7890;
    builder.private_call.is_fee_payer = true;

    builder.private_call.append_note_hashes(2);
    builder.private_call.append_nullifiers(3);
    builder.private_call.append_l2_to_l1_msgs(1);
    builder.private_call.append_private_logs(2);
    builder.private_call.append_contract_class_logs(1);
    builder.private_call.append_private_call_requests(3);
    builder.private_call.append_public_call_requests(2);
    builder.private_call.set_public_teardown_call_request();

    builder.private_call.counter = 98765;
    builder.private_call.end_setup();

    builder.private_call.append_note_hash_read_requests(3);
    builder.private_call.append_nullifier_read_requests(2);
    builder.private_call.append_key_validation_requests(2);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.min_revertible_side_effect_counter, 98765);
    assert_eq(pi.fee_payer, builder.private_call.contract_address);
    assert_eq(pi.include_by_timestamp, 7890);
    assert_eq(pi.is_private_only, true);
    assert_eq(pi.claimed_first_nullifier, 1234);
    assert_eq(pi.claimed_revertible_counter, 567);

    let note_hashes = builder.private_call.note_hashes.storage();
    assert_claimed_length_array_eq(pi.end.note_hashes, [note_hashes[0], note_hashes[1]]);

    let nullifiers = builder.private_call.nullifiers.storage();
    assert_claimed_length_array_eq(
        pi.end.nullifiers,
        [nullifiers[0], nullifiers[1], nullifiers[2]],
    );

    let l2_to_l1_msgs = builder.private_call.l2_to_l1_msgs.storage();
    assert_claimed_length_array_eq(pi.end.l2_to_l1_msgs, [l2_to_l1_msgs[0]]);

    let private_logs = builder.private_call.private_logs.storage();
    assert_claimed_length_array_eq(pi.end.private_logs, [private_logs[0], private_logs[1]]);

    let contract_class_logs_hashes = builder.private_call.contract_class_logs_hashes.storage();
    assert_claimed_length_array_eq(
        pi.end.contract_class_logs_hashes,
        [contract_class_logs_hashes[0]],
    );

    let private_call_requests = builder.private_call.private_call_requests.storage();
    assert_claimed_length_array_eq(
        pi.end.private_call_stack,
        // The order of the private call requests is reversed.
        [private_call_requests[2], private_call_requests[1], private_call_requests[0]],
    );

    let public_call_requests = builder.private_call.public_call_requests.storage();
    assert_claimed_length_array_eq(
        pi.end.public_call_requests,
        [public_call_requests[0], public_call_requests[1]],
    );

    assert_eq(pi.public_teardown_call_request, builder.private_call.public_teardown_call_request);

    let note_hash_read_requests = builder.private_call.note_hash_read_requests.storage();
    assert_claimed_length_array_eq(
        pi.validation_requests.note_hash_read_requests,
        [note_hash_read_requests[0], note_hash_read_requests[1], note_hash_read_requests[2]],
    );

    let nullifier_read_requests = builder.private_call.nullifier_read_requests.storage();
    assert_claimed_length_array_eq(
        pi.validation_requests.nullifier_read_requests,
        [nullifier_read_requests[0], nullifier_read_requests[1]],
    );

    let key_validation_requests =
        builder.private_call.scoped_key_validation_requests_and_generators.storage();
    assert_claimed_length_array_eq(
        pi.validation_requests.scoped_key_validation_requests_and_generators,
        [key_validation_requests[0], key_validation_requests[1]],
    );
}
