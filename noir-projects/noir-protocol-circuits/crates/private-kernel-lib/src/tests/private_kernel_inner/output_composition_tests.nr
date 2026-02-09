use super::TestBuilder;
use ::types::{
    address::AztecAddress,
    tests::utils::assert_claimed_length_array_eq,
    traits::{Empty, FromField},
};

#[test]
fn with_everything_empty() {
    let mut builder = TestBuilder::new();

    let pi = builder.execute();

    assert_eq(pi.fee_payer, AztecAddress::empty());
    assert_eq(pi.is_private_only, false);
    assert_eq(pi.claimed_revertible_counter, 0);

    assert_claimed_length_array_eq(pi.end.note_hashes, []);
    assert_claimed_length_array_eq(pi.end.nullifiers, []);
    assert_claimed_length_array_eq(pi.end.l2_to_l1_msgs, []);
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
fn with_previous_kernel_non_empty_and_private_call_empty() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.fee_payer = AztecAddress::from_field(123);

    builder.previous_kernel.append_note_hashes(2);
    let previous_note_hashes = builder.previous_kernel.note_hashes.storage();

    builder.previous_kernel.append_nullifiers(3);
    let previous_nullifiers = builder.previous_kernel.nullifiers.storage();

    builder.previous_kernel.append_l2_to_l1_msgs(1);
    let previous_l2_to_l1_msgs = builder.previous_kernel.l2_to_l1_msgs.storage();

    builder.previous_kernel.append_private_logs(2);
    let previous_private_logs = builder.previous_kernel.private_logs.storage();

    builder.previous_kernel.append_contract_class_logs(1);
    let previous_contract_class_logs_hashes =
        builder.previous_kernel.contract_class_logs_hashes.storage();

    builder.previous_kernel.append_public_call_requests(2);
    let previous_public_call_requests = builder.previous_kernel.public_call_requests.storage();

    builder.previous_kernel.set_public_teardown_call_request();
    let public_teardown_call_request = builder.previous_kernel.public_teardown_call_request;

    builder.previous_kernel.append_private_call_requests(2);
    let previous_private_call_requests = builder.previous_kernel.private_call_requests.storage();

    let min_revertible_side_effect_counter = builder.previous_kernel.counter;
    builder.previous_kernel.end_setup();

    builder.previous_kernel.append_note_hash_read_requests(1);
    let previous_note_hash_read_requests =
        builder.previous_kernel.note_hash_read_requests.storage();

    builder.previous_kernel.append_nullifier_read_requests(2);
    let previous_nullifier_read_requests =
        builder.previous_kernel.nullifier_read_requests.storage();

    builder.previous_kernel.append_key_validation_requests(1);
    let previous_key_validation_requests_and_generators =
        builder.previous_kernel.scoped_key_validation_requests_and_generators.storage();

    let pi = builder.execute();

    assert_eq(pi.min_revertible_side_effect_counter, min_revertible_side_effect_counter);
    assert_eq(pi.fee_payer, AztecAddress::from_field(123));

    assert_claimed_length_array_eq(
        pi.end.note_hashes,
        [previous_note_hashes[0], previous_note_hashes[1]],
    );
    assert_claimed_length_array_eq(
        pi.end.nullifiers,
        [previous_nullifiers[0], previous_nullifiers[1], previous_nullifiers[2]],
    );
    assert_claimed_length_array_eq(pi.end.l2_to_l1_msgs, [previous_l2_to_l1_msgs[0]]);
    assert_claimed_length_array_eq(
        pi.end.private_logs,
        [previous_private_logs[0], previous_private_logs[1]],
    );
    assert_claimed_length_array_eq(
        pi.end.contract_class_logs_hashes,
        [previous_contract_class_logs_hashes[0]],
    );
    assert_claimed_length_array_eq(
        pi.end.public_call_requests,
        [previous_public_call_requests[0], previous_public_call_requests[1]],
    );
    assert_eq(pi.public_teardown_call_request, public_teardown_call_request);
    assert_claimed_length_array_eq(
        pi.end.private_call_stack,
        [previous_private_call_requests[0], previous_private_call_requests[1]],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.note_hash_read_requests,
        [previous_note_hash_read_requests[0]],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.nullifier_read_requests,
        [previous_nullifier_read_requests[0], previous_nullifier_read_requests[1]],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.scoped_key_validation_requests_and_generators,
        [previous_key_validation_requests_and_generators[0]],
    );
}

#[test]
fn with_previous_kernel_empty_and_private_call_non_empty() {
    let mut builder = TestBuilder::new();

    builder.private_call.is_fee_payer = true;

    builder.private_call.append_note_hashes(3);
    let new_note_hashes = builder.private_call.note_hashes.storage();

    builder.private_call.append_nullifiers(1);
    let new_nullifiers = builder.private_call.nullifiers.storage();

    builder.private_call.append_l2_to_l1_msgs(1);
    let new_l2_to_l1_msgs = builder.private_call.l2_to_l1_msgs.storage();

    let min_revertible_side_effect_counter = builder.private_call.counter;
    builder.private_call.end_setup();

    builder.private_call.append_private_logs(1);
    let new_private_logs = builder.private_call.private_logs.storage();

    builder.private_call.append_contract_class_logs(1);
    let new_contract_class_logs_hashes = builder.private_call.contract_class_logs_hashes.storage();

    builder.private_call.append_public_call_requests(2);
    let new_public_call_requests = builder.private_call.public_call_requests.storage();

    builder.private_call.set_public_teardown_call_request();
    let public_teardown_call_request = builder.private_call.public_teardown_call_request;

    builder.private_call.append_private_call_requests(3);
    let new_private_call_requests = builder.private_call.private_call_requests.storage();

    builder.private_call.append_note_hash_read_requests(2);
    let new_note_hash_read_requests = builder.private_call.note_hash_read_requests.storage();

    builder.private_call.append_nullifier_read_requests(1);
    let new_nullifier_read_requests = builder.private_call.nullifier_read_requests.storage();

    builder.private_call.append_key_validation_requests(2);
    let new_key_validation_requests_and_generators =
        builder.private_call.scoped_key_validation_requests_and_generators.storage();

    let pi = builder.execute();

    assert_eq(pi.min_revertible_side_effect_counter, min_revertible_side_effect_counter);
    assert_eq(pi.fee_payer, builder.private_call.contract_address);

    assert_claimed_length_array_eq(
        pi.end.note_hashes,
        [new_note_hashes[0], new_note_hashes[1], new_note_hashes[2]],
    );
    assert_claimed_length_array_eq(pi.end.nullifiers, [new_nullifiers[0]]);
    assert_claimed_length_array_eq(pi.end.l2_to_l1_msgs, [new_l2_to_l1_msgs[0]]);
    assert_claimed_length_array_eq(pi.end.private_logs, [new_private_logs[0]]);
    assert_claimed_length_array_eq(
        pi.end.contract_class_logs_hashes,
        [new_contract_class_logs_hashes[0]],
    );
    assert_claimed_length_array_eq(
        pi.end.public_call_requests,
        [new_public_call_requests[0], new_public_call_requests[1]],
    );
    assert_eq(pi.public_teardown_call_request, public_teardown_call_request);
    assert_claimed_length_array_eq(
        pi.end.private_call_stack,
        [new_private_call_requests[2], new_private_call_requests[1], new_private_call_requests[0]],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.note_hash_read_requests,
        [new_note_hash_read_requests[0], new_note_hash_read_requests[1]],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.nullifier_read_requests,
        [new_nullifier_read_requests[0]],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.scoped_key_validation_requests_and_generators,
        [
            new_key_validation_requests_and_generators[0],
            new_key_validation_requests_and_generators[1],
        ],
    );
}

#[test(should_fail_with = "cannot overwrite non-zero min_revertible_side_effect_counter")]
fn with_both_non_zero_min_revertible_side_effect_counter() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.end_setup();
    builder.private_call.end_setup();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Cannot overwrite non-empty fee_payer")]
fn with_both_non_empty_fee_payer() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.fee_payer = AztecAddress::from_field(123);
    builder.private_call.is_fee_payer = true;

    builder.execute_and_fail();
}

#[test]
fn include_by_timestamp_pick_previous() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.include_by_timestamp = 45;
    builder.private_call.include_by_timestamp = 678;

    let pi = builder.execute();

    assert_eq(pi.include_by_timestamp, 45);
}

#[test]
fn include_by_timestamp_pick_private_call() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.include_by_timestamp = 456;
    builder.private_call.include_by_timestamp = 78;

    let pi = builder.execute();

    assert_eq(pi.include_by_timestamp, 78);
}

#[test]
fn with_everything_non_empty() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.include_by_timestamp = 45;
    builder.private_call.include_by_timestamp = 45;

    builder.previous_kernel.is_private_only = true;
    builder.previous_kernel.claimed_revertible_counter = 123;

    // note_hashes
    builder.previous_kernel.append_note_hashes(2);
    let previous_note_hashes = builder.previous_kernel.note_hashes.storage();
    builder.private_call.append_note_hashes(3);
    let new_note_hashes = builder.private_call.note_hashes.storage();

    // nullifiers
    builder.previous_kernel.append_nullifiers(3);
    let previous_nullifiers = builder.previous_kernel.nullifiers.storage();
    builder.private_call.append_nullifiers(1);
    let new_nullifiers = builder.private_call.nullifiers.storage();

    // l2_to_l1_msgs
    builder.previous_kernel.append_l2_to_l1_msgs(1);
    let previous_l2_to_l1_msgs = builder.previous_kernel.l2_to_l1_msgs.storage();
    builder.private_call.append_l2_to_l1_msgs(1);
    let new_l2_to_l1_msgs = builder.private_call.l2_to_l1_msgs.storage();

    // private_logs
    builder.previous_kernel.append_private_logs(2);
    let previous_private_logs = builder.previous_kernel.private_logs.storage();
    builder.private_call.append_private_logs(1);
    let new_private_logs = builder.private_call.private_logs.storage();

    // contract_class_logs_hashes
    builder.previous_kernel.append_contract_class_logs(1);
    let previous_contract_class_logs_hashes =
        builder.previous_kernel.contract_class_logs_hashes.storage();

    // public_call_requests
    builder.previous_kernel.append_public_call_requests(2);
    let previous_public_call_requests = builder.previous_kernel.public_call_requests.storage();
    builder.private_call.append_public_call_requests(2);
    let new_public_call_requests = builder.private_call.public_call_requests.storage();

    // public_teardown_call_request
    builder.private_call.set_public_teardown_call_request();
    let public_teardown_call_request = builder.private_call.public_teardown_call_request;

    // private_call_stack
    builder.previous_kernel.append_private_call_requests(2);
    let previous_private_call_requests = builder.previous_kernel.private_call_requests.storage();
    builder.private_call.append_private_call_requests(3);
    let new_private_call_requests = builder.private_call.private_call_requests.storage();

    // note_hash_read_requests
    builder.previous_kernel.append_note_hash_read_requests(1);
    let previous_note_hash_read_requests =
        builder.previous_kernel.note_hash_read_requests.storage();
    builder.private_call.append_note_hash_read_requests(2);
    let new_note_hash_read_requests = builder.private_call.note_hash_read_requests.storage();

    // nullifier_read_requests
    builder.previous_kernel.append_nullifier_read_requests(2);
    let previous_nullifier_read_requests =
        builder.previous_kernel.nullifier_read_requests.storage();
    builder.private_call.append_nullifier_read_requests(1);
    let new_nullifier_read_requests = builder.private_call.nullifier_read_requests.storage();

    // key_validation_requests_and_generators
    builder.previous_kernel.append_key_validation_requests(1);
    let previous_key_validation_requests_and_generators =
        builder.previous_kernel.scoped_key_validation_requests_and_generators.storage();
    builder.private_call.append_key_validation_requests(2);
    let new_key_validation_requests_and_generators =
        builder.private_call.scoped_key_validation_requests_and_generators.storage();

    let pi = builder.execute();

    assert_eq(pi.include_by_timestamp, 45);
    assert_eq(pi.is_private_only, true);
    assert_eq(pi.claimed_revertible_counter, 123);

    assert_claimed_length_array_eq(
        pi.end.note_hashes,
        [
            previous_note_hashes[0],
            previous_note_hashes[1],
            new_note_hashes[0],
            new_note_hashes[1],
            new_note_hashes[2],
        ],
    );
    assert_claimed_length_array_eq(
        pi.end.nullifiers,
        [previous_nullifiers[0], previous_nullifiers[1], previous_nullifiers[2], new_nullifiers[0]],
    );
    assert_claimed_length_array_eq(
        pi.end.l2_to_l1_msgs,
        [previous_l2_to_l1_msgs[0], new_l2_to_l1_msgs[0]],
    );
    assert_claimed_length_array_eq(
        pi.end.private_logs,
        [previous_private_logs[0], previous_private_logs[1], new_private_logs[0]],
    );
    assert_claimed_length_array_eq(
        pi.end.contract_class_logs_hashes,
        [previous_contract_class_logs_hashes[0]],
    );
    assert_claimed_length_array_eq(
        pi.end.public_call_requests,
        [
            previous_public_call_requests[0],
            previous_public_call_requests[1],
            new_public_call_requests[0],
            new_public_call_requests[1],
        ],
    );
    assert_eq(pi.public_teardown_call_request, public_teardown_call_request);
    assert_claimed_length_array_eq(
        pi.end.private_call_stack,
        [
            previous_private_call_requests[0],
            previous_private_call_requests[1],
            new_private_call_requests[2],
            new_private_call_requests[1],
            new_private_call_requests[0],
        ],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.note_hash_read_requests,
        [
            previous_note_hash_read_requests[0],
            new_note_hash_read_requests[0],
            new_note_hash_read_requests[1],
        ],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.nullifier_read_requests,
        [
            previous_nullifier_read_requests[0],
            previous_nullifier_read_requests[1],
            new_nullifier_read_requests[0],
        ],
    );
    assert_claimed_length_array_eq(
        pi.validation_requests.scoped_key_validation_requests_and_generators,
        [
            previous_key_validation_requests_and_generators[0],
            new_key_validation_requests_and_generators[0],
            new_key_validation_requests_and_generators[1],
        ],
    );
}
