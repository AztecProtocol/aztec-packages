use crate::{
    components::private_call_data_validator::validate_side_effect_counters::{
        build_uniqueness_hints, validate_unique_and_within_bounds_side_effect_counters_with_hints,
    },
    tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder,
};
use types::{
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
    },
    tests::fixture_builder::FixtureBuilder,
};

#[test]
fn validate_side_effect_counters_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new_from_counter(23);
    builder.validate();
}

#[test]
fn validate_side_effect_counters_full_inputs_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(2);
    builder.private_call.append_note_hashes(MAX_NOTE_HASHES_PER_CALL);
    builder.private_call.append_nullifiers(MAX_NULLIFIERS_PER_CALL);
    builder.private_call.append_note_hash_read_requests(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL);
    builder.private_call.append_nullifier_read_requests(MAX_NULLIFIER_READ_REQUESTS_PER_CALL);
    builder.private_call.append_private_call_requests(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL);
    builder.private_call.append_public_call_requests(MAX_ENQUEUED_CALLS_PER_CALL);
    builder.private_call.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_CALL);
    builder.private_call.append_private_logs(MAX_PRIVATE_LOGS_PER_CALL);
    builder.private_call.append_contract_class_logs(MAX_CONTRACT_CLASS_LOGS_PER_CALL);
    builder.validate();
}

#[test(should_fail_with = "private call has incorrect counter range")]
fn validate_side_effect_counters_call_request_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.counter = 10;
    builder.validate();
}

// Note hash read requests

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_note_hash_read_request_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);

    let mut item = builder.private_call.note_hash_read_requests.get(0);
    item.inner.counter = 49;

    builder.private_call.note_hash_read_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_note_hash_read_request_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);

    let mut item = builder.private_call.note_hash_read_requests.get(0);
    item.inner.counter = 100;

    builder.private_call.note_hash_read_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_note_hash_read_request_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_note_hash_read_requests(5);

    let mut item = builder.private_call.note_hash_read_requests.get(0);
    let another_item = builder.private_call.note_hash_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.note_hash_read_requests.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_note_hash_read_request_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_note_hash_read_requests(5);
    builder.private_call.append_nullifier_read_requests(5);

    let mut item = builder.private_call.note_hash_read_requests.get(0);
    let another_item = builder.private_call.nullifier_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.note_hash_read_requests.set(0, item);
    builder.validate();
}

// Nullifier read requests
#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_nullifier_read_request_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);

    let mut item = builder.private_call.nullifier_read_requests.get(0);
    item.inner.counter = 49;

    builder.private_call.nullifier_read_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_nullifier_read_request_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);

    let mut item = builder.private_call.nullifier_read_requests.get(0);
    item.inner.counter = 100;

    builder.private_call.nullifier_read_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_nullifier_read_request_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_nullifier_read_requests(5);

    let mut item = builder.private_call.nullifier_read_requests.get(0);
    let another_item = builder.private_call.nullifier_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_nullifier_read_request_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_nullifier_read_requests(5);
    builder.private_call.append_note_hash_read_requests(5);

    let mut item = builder.private_call.nullifier_read_requests.get(0);
    let another_item = builder.private_call.note_hash_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.validate();
}

// Note hashes

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_note_hash_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);

    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = 49;

    builder.private_call.note_hashes.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_note_hash_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);

    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = 100;

    builder.private_call.note_hashes.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_note_hash_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_note_hashes(5);

    let mut item = builder.private_call.note_hashes.get(0);
    let another_item = builder.private_call.note_hashes.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.note_hashes.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_note_hash_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_note_hashes(5);
    builder.private_call.append_nullifiers(5);

    let mut item = builder.private_call.note_hashes.get(0);
    let another_item = builder.private_call.nullifiers.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.note_hashes.set(0, item);

    builder.validate();
}

// Nullifiers
#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_nullifier_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);

    let mut item = builder.private_call.nullifiers.get(0);
    item.inner.counter = 49;

    builder.private_call.nullifiers.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_nullifier_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);

    let mut item = builder.private_call.nullifiers.get(0);
    item.inner.counter = 100;

    builder.private_call.nullifiers.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_nullifier_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_nullifiers(5);

    let mut item = builder.private_call.nullifiers.get(0);
    let another_item = builder.private_call.nullifiers.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.nullifiers.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_nullifier_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_nullifiers(5);
    builder.private_call.append_note_hash_read_requests(5);

    let mut item = builder.private_call.nullifiers.get(0);
    let another_item = builder.private_call.note_hash_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.nullifiers.set(0, item);

    builder.validate();
}

// Private call requests
#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_call_request_start_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    let mut item = builder.private_call.private_call_requests.get(0);
    item.start_side_effect_counter = 49;

    builder.private_call.private_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_private_call_request_end_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    let mut item = builder.private_call.private_call_requests.get(0);
    item.end_side_effect_counter = 100;

    builder.private_call.private_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_calls_with_overlapping_counter_ranges_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(2);

    let mut item = builder.private_call.private_call_requests.get(0);
    let another_item = builder.private_call.private_call_requests.get(1);

    item.end_side_effect_counter = another_item.start_side_effect_counter + 1;

    builder.private_call.private_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_calls_with_adjacent_counter_ranges_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(2);

    let mut item = builder.private_call.private_call_requests.get(0);
    let another_item = builder.private_call.private_call_requests.get(1);

    item.end_side_effect_counter = another_item.start_side_effect_counter;

    builder.private_call.private_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "nested call has incorrect counter range")]
fn validate_side_effect_counters_private_call_with_reversed_counter_ranges_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    let mut item = builder.private_call.private_call_requests.get(0);

    let start_counter = item.start_side_effect_counter;
    item.start_side_effect_counter = item.end_side_effect_counter;
    item.end_side_effect_counter = start_counter;

    builder.private_call.private_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "nested call has incorrect counter range")]
fn validate_side_effect_counters_private_call_with_no_range_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    let mut item = builder.private_call.private_call_requests.get(0);

    item.start_side_effect_counter = item.end_side_effect_counter;

    builder.private_call.private_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_calls_overlapping_other_side_effect_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);
    builder.private_call.append_nullifier_read_requests(1);

    let call = builder.private_call.private_call_requests.get(0);
    let mut another_item = builder.private_call.nullifier_read_requests.get(0);

    another_item.inner.counter = call.start_side_effect_counter + 1;

    builder.private_call.nullifier_read_requests.set(0, another_item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_calls_same_start_other_side_effect_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);
    builder.private_call.append_nullifier_read_requests(1);

    let call = builder.private_call.private_call_requests.get(0);
    let mut another_item = builder.private_call.nullifier_read_requests.get(0);

    another_item.inner.counter = call.start_side_effect_counter;

    builder.private_call.nullifier_read_requests.set(0, another_item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_calls_same_end_other_side_effect_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);
    builder.private_call.append_nullifier_read_requests(1);

    let call = builder.private_call.private_call_requests.get(0);
    let mut another_item = builder.private_call.nullifier_read_requests.get(0);

    another_item.inner.counter = call.end_side_effect_counter;

    builder.private_call.nullifier_read_requests.set(0, another_item);
    builder.validate();
}

// Public call requests

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_public_call_request_start_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_public_call_requests(1);

    let mut item = builder.private_call.public_call_requests.get(0);
    item.counter = 49;

    builder.private_call.public_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_public_call_request_end_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_public_call_requests(1);

    let mut item = builder.private_call.public_call_requests.get(0);
    item.counter = 100;

    builder.private_call.public_call_requests.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_public_call_request_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_public_call_requests(5);

    let mut item = builder.private_call.public_call_requests.get(0);
    let another_item = builder.private_call.public_call_requests.get(3);

    item.counter = another_item.counter;
    builder.private_call.public_call_requests.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_public_call_request_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_public_call_requests(5);
    builder.private_call.append_l2_to_l1_msgs(5);

    let mut item = builder.private_call.public_call_requests.get(0);
    let another_item = builder.private_call.l2_to_l1_msgs.get(3);

    item.counter = another_item.inner.counter;
    builder.private_call.public_call_requests.set(0, item);

    builder.validate();
}

// L2 to L1 messages
#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_l2_to_l1_msg_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_l2_to_l1_msgs(1);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    item.inner.counter = 49;

    builder.private_call.l2_to_l1_msgs.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_l2_to_l1_msg_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_l2_to_l1_msgs(1);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    item.inner.counter = 100;

    builder.private_call.l2_to_l1_msgs.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_l2_to_l1_msg_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_l2_to_l1_msgs(5);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    let another_item = builder.private_call.l2_to_l1_msgs.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.l2_to_l1_msgs.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_l2_to_l1_msg_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_l2_to_l1_msgs(5);
    builder.private_call.append_private_logs(5);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    let another_item = builder.private_call.private_logs.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.l2_to_l1_msgs.set(0, item);

    builder.validate();
}

// Private logs
#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_log_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_logs(1);

    let mut item = builder.private_call.private_logs.get(0);
    item.inner.counter = 49;

    builder.private_call.private_logs.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_private_log_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_private_logs(1);

    let mut item = builder.private_call.private_logs.get(0);
    item.inner.counter = 100;

    builder.private_call.private_logs.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_private_log_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_private_logs(5);

    let mut item = builder.private_call.private_logs.get(0);
    let another_item = builder.private_call.private_logs.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.private_logs.set(0, item);

    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_private_log_counter_duplicated_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_private_logs(5);
    builder.private_call.append_contract_class_logs(1);

    let mut item = builder.private_call.private_logs.get(3);
    let another_item = builder.private_call.contract_class_logs_hashes.get(0);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.private_logs.set(0, item);

    builder.validate();
}

// Contract class logs
#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_contract_class_log_counter_less_than_counter_start_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_contract_class_logs(1);

    let mut item = builder.private_call.contract_class_logs_hashes.get(0);
    item.inner.counter = 49;

    builder.private_call.contract_class_logs_hashes.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "end counter must be less than the end counter of the call")]
fn validate_side_effect_counters_contract_class_log_counter_greater_than_counter_end_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(50);
    builder.private_call.append_contract_class_logs(1);

    let mut item = builder.private_call.contract_class_logs_hashes.get(0);
    item.inner.counter = 100;

    builder.private_call.contract_class_logs_hashes.set(0, item);
    builder.validate();
}

#[test(should_fail_with = "start counter must be greater than previous counter")]
fn validate_side_effect_counters_duplicated_contract_class_log_counter_in_other_array_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_from_counter(10);
    builder.private_call.append_contract_class_logs(1);
    builder.private_call.append_note_hash_read_requests(5);

    let mut item = builder.private_call.contract_class_logs_hashes.get(0);
    let another_item = builder.private_call.note_hash_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.contract_class_logs_hashes.set(0, item);

    builder.validate();
}

// Modifying hints

#[test(should_fail_with = "side effect range index out of bounds")]
fn validate_side_effect_counters_modify_range_index_out_of_bounds_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_nullifiers(2);

    let private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    hints.nullifiers_indices[0] = 10;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}

#[test(should_fail_with = "counter does not match start range item")]
fn validate_side_effect_counters_modify_range_start_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_note_hash_read_requests(2);

    let mut private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    hints.side_effect_ranges[0].start += 1;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}

#[test(should_fail_with = "counter does not match end range item")]
fn validate_side_effect_counters_modify_range_end_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_nullifier_read_requests(2);

    let mut private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    hints.side_effect_ranges[0].end += 1;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}

#[test(should_fail_with = "range global index does not match side effect global index")]
fn validate_side_effect_counters_modify_range_global_index_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_l2_to_l1_msgs(2);

    let mut private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    hints.side_effect_ranges[0].side_effect_global_index += 1;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}

#[test(should_fail_with = "start counter does not match range item")]
fn validate_side_effect_counters_modify_call_request_range_start_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_private_call_requests(1);

    let mut private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    private_call.public_inputs.private_call_requests.array[0].start_side_effect_counter += 1;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}

#[test(should_fail_with = "end counter does not match range item")]
fn validate_side_effect_counters_modify_call_request_range_end_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_private_call_requests(2);

    let mut private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    private_call.public_inputs.private_call_requests.array[0].end_side_effect_counter += 1;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}

#[test(should_fail_with = "range global index does not match side effect global index")]
fn validate_side_effect_counters_modify_call_request_range_global_index_fails() {
    let mut builder = FixtureBuilder::new_from_counter(50);
    builder.append_private_call_requests(2);

    let mut private_call = builder.to_private_call_data();

    // Safety: Validation below should fail
    let mut hints = unsafe { build_uniqueness_hints(private_call.public_inputs) };
    hints.side_effect_ranges[1].side_effect_global_index += 1;

    validate_unique_and_within_bounds_side_effect_counters_with_hints(
        private_call.public_inputs,
        hints,
    );
}
