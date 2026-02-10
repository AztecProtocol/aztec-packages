use crate::tests::private_kernel_inner::TestBuilder;
use types::{
    address::AztecAddress, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, traits::FromField,
};

// Note: We only test a few cases here to ensure the code path is triggered.
// More thorough tests for the `validate_common` function in `PrivateCallDataValidator` are in
// `tests/private_kernel_init/private_call_data/`.

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn validate_claimed_lengths__note_hashes_out_of_bounds() {
    let mut builder = TestBuilder::new();

    builder.private_call.append_note_hash_read_requests(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL + 1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "computed contract address does not match expected one")]
fn validate_contract_address__incorrect_function_leaf_index() {
    let mut builder = TestBuilder::new();

    // Set the leaf index of the function leaf to a wrong value (the correct value + 1).
    let leaf_index = builder.private_call.function_leaf_membership_witness.leaf_index;
    builder.private_call.function_leaf_membership_witness.leaf_index = leaf_index + 1;

    builder.execute_and_fail();
}

#[test]
fn validate_contract_address__with_protocol_contract() {
    let mut builder = TestBuilder::new();

    let _ = builder.private_call.use_protocol_contract(0 /* contract address 1 is at index 0 */);

    let _ = builder.execute();
}

#[test(should_fail_with = "computed contract address does not match protocol contract derived address")]
fn validate_contract_address__protocol_contract_mismatch_contract() {
    let mut builder = TestBuilder::new();

    let _ = builder.private_call.use_protocol_contract(0 /* contract address 1 is at index 0 */);

    // Change to another contract address.
    builder.private_call.contract_address.inner += 1;

    builder.execute_and_fail();
}

#[test]
fn validate_contract_address__with_updated_contract() {
    let mut builder = TestBuilder::new();

    builder.private_call.use_updated_contract(
        builder.private_call.anchor_block_header.global_variables.timestamp,
    );
    builder.previous_kernel.anchor_block_header = builder.private_call.anchor_block_header;

    let _ = builder.execute();
}

#[test(should_fail_with = "computed contract class id does not match updated contract class id")]
fn validate_contract_address__updated_contract_not_yet_updated() {
    let mut builder = TestBuilder::new();

    builder.private_call.use_updated_contract(
        builder.private_call.anchor_block_header.global_variables.timestamp + 1,
    );
    builder.previous_kernel.anchor_block_header = builder.private_call.anchor_block_header;

    builder.execute_and_fail();
}

#[test]
fn validate_expected_counters__expect_correct_counters() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.claimed_revertible_counter = 50;

    builder.private_call.expected_non_revertible_side_effect_counter = 49;
    builder.private_call.expected_revertible_side_effect_counter = 51;

    let _ = builder.execute();
}

#[test(should_fail_with = "Failed to validate expected non revertible side effect counter")]
fn validate_expected_counters__expect_incorrect_non_revertible_counter() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.claimed_revertible_counter = 50;

    builder.private_call.expected_non_revertible_side_effect_counter = 50;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn validate_expected_counters__expect_incorrect_revertible_counter() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.claimed_revertible_counter = 50;

    builder.private_call.expected_revertible_side_effect_counter = 49;

    builder.execute_and_fail();
}

#[test(should_fail_with = "incorrect msg_sender for private call request")]
fn validate_msg_senders__private_call_request_with_incorrect_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_private_call_requests(2);

    // Tweak the msg_sender to be a random address.
    let mut call_request = builder.private_call.private_call_requests.get(0);
    call_request.call_context.msg_sender = AztecAddress::from_field(99);
    builder.private_call.private_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test(should_fail_with = "incorrect msg_sender for public call request")]
fn validate_msg_senders__public_call_request_with_incorrect_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_public_call_requests(2);

    // Tweak the msg_sender to be a random address.
    let mut call_request = builder.private_call.public_call_requests.get(0);
    call_request.inner.msg_sender = AztecAddress::from_field(99);
    builder.private_call.public_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test(should_fail_with = "incorrect msg_sender for public teardown call request")]
fn validate_msg_senders__public_teardown_call_request_with_incorrect_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.set_public_teardown_call_request();

    // Tweak the msg_sender to be a random address.
    builder.private_call.public_teardown_call_request.msg_sender = AztecAddress::from_field(99);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Private call has incorrect counter range")]
fn validate_counters__private_call_counter_end_less_than_start() {
    let mut builder = TestBuilder::new();

    // Tweak the end counter to be less than the start counter.
    builder.private_call.counter_start = 20;
    builder.private_call.counter = 10;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_counter_equals_counter_start() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_note_hashes(1);

    // Tweak the counter of the note hash to be equal to the private call's start counter.
    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = builder.private_call.counter_start;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}
