use crate::tests::private_kernel_init::TestBuilder;
use types::{
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
    },
    tests::utils::swap_items,
};

#[test]
fn full_side_effects() {
    let mut builder = TestBuilder::new_from_counter(2);

    builder.private_call.append_note_hashes(MAX_NOTE_HASHES_PER_CALL);
    builder.private_call.append_nullifiers(MAX_NULLIFIERS_PER_CALL);
    builder.private_call.append_note_hash_read_requests(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL);
    builder.private_call.append_nullifier_read_requests(MAX_NULLIFIER_READ_REQUESTS_PER_CALL);
    builder.private_call.append_private_call_requests(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL);
    builder.private_call.append_public_call_requests(MAX_ENQUEUED_CALLS_PER_CALL);
    builder.private_call.end_setup();
    builder.private_call.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_CALL);
    builder.private_call.append_private_logs(MAX_PRIVATE_LOGS_PER_CALL);
    builder.private_call.append_contract_class_logs(MAX_CONTRACT_CLASS_LOGS_PER_CALL);

    // First nullifier hint is set to a non-zero value to avoid adding a protocol nullifier to the output.
    builder.first_nullifier_hint = 123;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn full_unordered_side_effects() {
    let mut builder = TestBuilder::new_from_counter(2);

    builder.private_call.append_note_hashes(5);
    builder.private_call.append_nullifiers(7);
    builder.private_call.append_note_hash_read_requests(4);
    builder.private_call.append_nullifier_read_requests(6);
    builder.private_call.append_private_call_requests(4);
    builder.private_call.append_public_call_requests(5);
    builder.private_call.append_l2_to_l1_msgs(3);
    builder.private_call.append_private_logs(4);
    builder.private_call.end_setup();
    // Split up the side effects so the counters are not sequential for the same type.
    builder.private_call.append_note_hashes(MAX_NOTE_HASHES_PER_CALL - 5);
    builder.private_call.append_nullifiers(MAX_NULLIFIERS_PER_CALL - 7);
    builder.private_call.append_contract_class_logs(MAX_CONTRACT_CLASS_LOGS_PER_CALL);
    builder.private_call.append_note_hash_read_requests(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL - 4);
    builder.private_call.append_nullifier_read_requests(MAX_NULLIFIER_READ_REQUESTS_PER_CALL - 6);
    builder.private_call.append_private_call_requests(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL - 4);
    builder.private_call.append_public_call_requests(MAX_ENQUEUED_CALLS_PER_CALL - 5);
    builder.private_call.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_CALL - 3);
    builder.private_call.append_private_logs(MAX_PRIVATE_LOGS_PER_CALL - 4);

    // First nullifier hint is set to a non-zero value to avoid adding a protocol nullifier to the output.
    builder.first_nullifier_hint = 123;

    // Shuffle the side effects so the counters are not sorted.
    swap_items(&mut builder.private_call.note_hashes, 0, 1);
    swap_items(&mut builder.private_call.nullifiers, 1, 4);
    swap_items(&mut builder.private_call.nullifiers, 2, 9);
    swap_items(&mut builder.private_call.note_hash_read_requests, 1, 3);
    swap_items(&mut builder.private_call.nullifier_read_requests, 0, 4);
    swap_items(&mut builder.private_call.nullifier_read_requests, 3, 8);
    swap_items(&mut builder.private_call.private_call_requests, 4, 7);
    swap_items(&mut builder.private_call.public_call_requests, 2, 6);
    swap_items(&mut builder.private_call.public_call_requests, 0, 5);
    swap_items(&mut builder.private_call.l2_to_l1_msgs, 1, 2);
    swap_items(&mut builder.private_call.private_logs, 3, 7);
    swap_items(&mut builder.private_call.private_logs, 4, 6);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Private call has incorrect counter range")]
fn private_call_counter_end_less_than_start() {
    let mut builder = TestBuilder::new_from_counter(50);

    // Tweak the end counter to be less than the start counter.
    builder.private_call.counter = 10;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Private call has incorrect counter range")]
fn private_call_counter_end_equals_start() {
    let mut builder = TestBuilder::new_from_counter(50);

    // Tweak the end counter to be equal to the start counter.
    builder.private_call.counter = 50;

    builder.execute_and_fail();
}

// Note hash read requests

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_read_request_counter_less_than_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);

    // Tweak the counter of the request to be less than the private call's start counter.
    let mut item = builder.private_call.note_hash_read_requests.get(0);
    item.inner.counter = 49;
    builder.private_call.note_hash_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_read_request_counter_equals_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);

    // Tweak the counter of the request to be equal to the private call's start counter.
    let mut item = builder.private_call.note_hash_read_requests.get(0);
    item.inner.counter = 50;
    builder.private_call.note_hash_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn note_hash_read_request_counter_equals_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);

    // Tweak the counter of the request to be equal to the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.note_hash_read_requests.get(0);
    item.inner.counter = end_counter;
    builder.private_call.note_hash_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn note_hash_read_request_counter_greater_than_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);

    // Tweak the counter of the request to be greater than the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.note_hash_read_requests.get(0);
    item.inner.counter = end_counter + 1;

    builder.private_call.note_hash_read_requests.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_note_hash_read_request_counter() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(3);

    // Have two requests with the same counter.
    let mut item = builder.private_call.note_hash_read_requests.get(0);
    let another_item = builder.private_call.note_hash_read_requests.get(1);
    item.inner.counter = another_item.inner.counter;
    builder.private_call.note_hash_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_read_request_counter_equals_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hash_read_requests(1);
    builder.private_call.append_nullifier_read_requests(3);

    // Have the note hash read request counter equal to the counter of one of the nullifier read requests.
    let mut item = builder.private_call.note_hash_read_requests.get(0);
    let another_side_effect = builder.private_call.nullifier_read_requests.get(1);
    item.inner.counter = another_side_effect.inner.counter;
    builder.private_call.note_hash_read_requests.set(0, item);

    builder.execute_and_fail();
}

// Nullifier read requests

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn nullifier_read_request_counter_less_than_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);

    // Tweak the counter of the request to be less than the private call's start counter.
    let mut item = builder.private_call.nullifier_read_requests.get(0);
    item.inner.counter = 49;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn nullifier_read_request_counter_equals_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);

    // Tweak the counter of the request to be equal to the private call's start counter.
    let mut item = builder.private_call.nullifier_read_requests.get(0);
    item.inner.counter = 50;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn nullifier_read_request_counter_equals_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);

    // Tweak the counter of the request to be equal to the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.nullifier_read_requests.get(0);
    item.inner.counter = end_counter;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn nullifier_read_request_counter_greater_than_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);

    // Tweak the counter of the request to be greater than the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.nullifier_read_requests.get(0);
    item.inner.counter = end_counter + 1;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_nullifier_read_request_counter() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(5);

    // Have two requests with the same counter.
    let mut item = builder.private_call.nullifier_read_requests.get(0);
    let another_item = builder.private_call.nullifier_read_requests.get(3);
    item.inner.counter = another_item.inner.counter;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn nullifier_read_request_counter_equals_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);
    builder.private_call.append_note_hashes(3);

    // Have the nullifier read request counter equal to the counter of one of the note hashes.
    let mut item = builder.private_call.nullifier_read_requests.get(0);
    let another_side_effect = builder.private_call.note_hashes.get(2);
    item.inner.counter = another_side_effect.inner.counter;
    builder.private_call.nullifier_read_requests.set(0, item);

    builder.execute_and_fail();
}

// Note hashes

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_counter_less_than_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);

    // Tweak the counter of the note hash to be less than the private call's start counter.
    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = 49;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_counter_equals_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);

    // Tweak the counter of the note hash to be equal to the private call's start counter.
    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = 50;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn note_hash_counter_equals_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);

    // Tweak the counter of the note hash to be equal to the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = end_counter;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn note_hash_counter_greater_than_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);

    // Tweak the counter of the note hash to be greater than the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.note_hashes.get(0);
    item.inner.counter = end_counter + 1;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_note_hash_counter() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(5);

    // Have two note hashes with the same counter.
    let mut item = builder.private_call.note_hashes.get(0);
    let another_item = builder.private_call.note_hashes.get(3);
    item.inner.counter = another_item.inner.counter;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn note_hash_counter_equals_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_note_hashes(1);
    builder.private_call.append_nullifiers(3);

    // Have the note hash counter equal to the counter of one of the nullifiers.
    let mut item = builder.private_call.note_hashes.get(0);
    let another_side_effect = builder.private_call.nullifiers.get(1);
    item.inner.counter = another_side_effect.inner.counter;
    builder.private_call.note_hashes.set(0, item);

    builder.execute_and_fail();
}

// Nullifiers

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn nullifier_counter_less_than_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);

    // Tweak the counter of the nullifier to be less than the private call's start counter.
    let mut item = builder.private_call.nullifiers.get(0);
    item.inner.counter = 49;
    builder.private_call.nullifiers.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn nullifier_counter_equals_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);

    // Tweak the counter of the nullifier to be equal to the private call's start counter.
    let mut item = builder.private_call.nullifiers.get(0);
    item.inner.counter = 50;
    builder.private_call.nullifiers.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn nullifier_counter_equals_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);

    // Tweak the counter of the nullifier to be equal to the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.nullifiers.get(0);
    item.inner.counter = end_counter;
    builder.private_call.nullifiers.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn nullifier_counter_greater_than_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);

    // Tweak the counter of the nullifier to be greater than the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.nullifiers.get(0);
    item.inner.counter = end_counter + 1;
    builder.private_call.nullifiers.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_nullifier_counter() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(5);

    // Have two nullifiers with the same counter.
    let mut item = builder.private_call.nullifiers.get(0);
    let another_item = builder.private_call.nullifiers.get(3);
    item.inner.counter = another_item.inner.counter;
    builder.private_call.nullifiers.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn nullifier_counter_equals_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifiers(1);
    builder.private_call.append_private_call_requests(5);

    // Have the nullifier counter equal to the counter of one of the private call requests.
    let mut item = builder.private_call.nullifiers.get(0);
    let another_side_effect = builder.private_call.private_call_requests.get(3);
    item.inner.counter = another_side_effect.start_side_effect_counter;
    builder.private_call.nullifiers.set(0, item);

    builder.execute_and_fail();
}

// Private call requests

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_call_request_start_counter_less_than_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    // Tweak the start counter of the private call request to be less than the private call's start counter.
    let mut item = builder.private_call.private_call_requests.get(0);
    item.start_side_effect_counter = 49;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_call_request_start_counter_equals_counter_start() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    // Tweak the start counter of the private call request to be equal to the private call's start counter.
    let mut item = builder.private_call.private_call_requests.get(0);
    item.start_side_effect_counter = 50;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn private_call_request_end_counter_equals_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    // Tweak the end counter of the private call request to be equal to the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.private_call_requests.get(0);
    item.end_side_effect_counter = end_counter;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn private_call_request_end_counter_greater_than_counter_end() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    // Tweak the end counter of the private call request to be greater than the private call's end counter.
    let end_counter = builder.private_call.counter;
    let mut item = builder.private_call.private_call_requests.get(0);
    item.end_side_effect_counter = end_counter + 1;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
fn private_calls_with_overlapping_counter_ranges() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(2);

    // Have the end counter of the first private call request be greater than the start counter of the second private call request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let another_item = builder.private_call.private_call_requests.get(1);
    item.end_side_effect_counter = another_item.start_side_effect_counter + 1;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_calls_with_adjacent_counter_ranges() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(2);

    // Have the end counter of the first private call request be equal to the start counter of the second private call request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let another_item = builder.private_call.private_call_requests.get(1);
    item.end_side_effect_counter = another_item.start_side_effect_counter;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
fn private_call_with_reversed_counter_ranges() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    // Swap the start and end counters of the private call request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let start_counter = item.start_side_effect_counter;
    item.start_side_effect_counter = item.end_side_effect_counter;
    item.end_side_effect_counter = start_counter;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_call_with_no_range() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);

    // Have the start counter of the private call request be equal to the end counter.
    let mut item = builder.private_call.private_call_requests.get(0);
    item.start_side_effect_counter = item.end_side_effect_counter;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
fn private_call_start_less_than_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);
    builder.private_call.append_private_call_requests(1);

    // Have the start counter of the private call request be less than the counter of the nullifier read request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let another_side_effect = builder.private_call.nullifier_read_requests.get(0);
    item.start_side_effect_counter = another_side_effect.inner.counter - 1;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_call_start_equals_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_nullifier_read_requests(1);
    builder.private_call.append_private_call_requests(1);

    // Have the start counter of the private call request be equal to the counter of the nullifier read request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let another_side_effect = builder.private_call.nullifier_read_requests.get(0);
    item.start_side_effect_counter = another_side_effect.inner.counter;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatch global index: end of call request does not match hint")]
fn private_call_end_equals_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);
    builder.private_call.append_nullifier_read_requests(1);

    // Have the end counter of the private call request be equal to the counter of the nullifier read request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let another_side_effect = builder.private_call.nullifier_read_requests.get(0);
    item.end_side_effect_counter = another_side_effect.inner.counter;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
fn private_call_end_larger_than_other_side_effect() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_call_requests(1);
    builder.private_call.append_nullifier_read_requests(1);

    // Have the end counter of the private call request be equal to the counter of the nullifier read request.
    let mut item = builder.private_call.private_call_requests.get(0);
    let another_side_effect = builder.private_call.nullifier_read_requests.get(0);
    item.end_side_effect_counter = another_side_effect.inner.counter + 1;
    builder.private_call.private_call_requests.set(0, item);

    builder.execute_and_fail();
}

// Public call requests

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn public_call_request_start_counter_less_than_counter_start_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_public_call_requests(1);

    let mut item = builder.private_call.public_call_requests.get(0);
    item.counter = 49;

    builder.private_call.public_call_requests.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn public_call_request_end_counter_greater_than_counter_end_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_public_call_requests(1);

    let mut item = builder.private_call.public_call_requests.get(0);
    item.counter = 100;

    builder.private_call.public_call_requests.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_public_call_request_counter_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_public_call_requests(5);

    let mut item = builder.private_call.public_call_requests.get(0);
    let another_item = builder.private_call.public_call_requests.get(3);

    item.counter = another_item.counter;
    builder.private_call.public_call_requests.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn public_call_request_counter_duplicated_in_other_array_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_public_call_requests(5);
    builder.private_call.append_l2_to_l1_msgs(5);

    let mut item = builder.private_call.public_call_requests.get(0);
    let another_item = builder.private_call.l2_to_l1_msgs.get(3);

    item.counter = another_item.inner.counter;
    builder.private_call.public_call_requests.set(0, item);

    builder.execute_and_fail();
}

// L2 to L1 messages
#[test(should_fail_with = "Counter must be greater than previous counter")]
fn l2_to_l1_msg_counter_less_than_counter_start_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_l2_to_l1_msgs(1);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    item.inner.counter = 49;

    builder.private_call.l2_to_l1_msgs.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn l2_to_l1_msg_counter_greater_than_counter_end_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_l2_to_l1_msgs(1);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    item.inner.counter = 100;

    builder.private_call.l2_to_l1_msgs.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_l2_to_l1_msg_counter_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_l2_to_l1_msgs(5);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    let another_item = builder.private_call.l2_to_l1_msgs.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.l2_to_l1_msgs.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn l2_to_l1_msg_counter_duplicated_in_other_array_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_l2_to_l1_msgs(5);
    builder.private_call.append_private_logs(5);

    let mut item = builder.private_call.l2_to_l1_msgs.get(0);
    let another_item = builder.private_call.private_logs.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.l2_to_l1_msgs.set(0, item);

    builder.execute_and_fail();
}

// Private logs
#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_log_counter_less_than_counter_start_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_logs(1);

    let mut item = builder.private_call.private_logs.get(0);
    item.inner.counter = 49;

    builder.private_call.private_logs.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn private_log_counter_greater_than_counter_end_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_logs(1);

    let mut item = builder.private_call.private_logs.get(0);
    item.inner.counter = 100;

    builder.private_call.private_logs.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_private_log_counter_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_logs(5);

    let mut item = builder.private_call.private_logs.get(0);
    let another_item = builder.private_call.private_logs.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.private_logs.set(0, item);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn private_log_counter_duplicated_in_other_array_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_private_logs(5);
    builder.private_call.append_contract_class_logs(1);

    let mut item = builder.private_call.private_logs.get(3);
    let another_item = builder.private_call.contract_class_logs_hashes.get(0);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.private_logs.set(0, item);

    builder.execute_and_fail();
}

// Contract class logs
#[test(should_fail_with = "Counter must be greater than previous counter")]
fn contract_class_log_counter_less_than_counter_start_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_contract_class_logs(1);

    let mut item = builder.private_call.contract_class_logs_hashes.get(0);
    item.inner.counter = 49;

    builder.private_call.contract_class_logs_hashes.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn contract_class_log_counter_greater_than_counter_end_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_contract_class_logs(1);

    let mut item = builder.private_call.contract_class_logs_hashes.get(0);
    item.inner.counter = 100;

    builder.private_call.contract_class_logs_hashes.set(0, item);
    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_contract_class_log_counter_in_other_array_fails() {
    let mut builder = TestBuilder::new_from_counter(50);
    builder.private_call.append_contract_class_logs(1);
    builder.private_call.append_note_hash_read_requests(5);

    let mut item = builder.private_call.contract_class_logs_hashes.get(0);
    let another_item = builder.private_call.note_hash_read_requests.get(3);

    item.inner.counter = another_item.inner.counter;
    builder.private_call.contract_class_logs_hashes.set(0, item);

    builder.execute_and_fail();
}

// Min revertible side effect counter

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn min_revertible_side_effect_counter_less_than_counter_start_fails() {
    let mut builder = TestBuilder::new_from_counter(50);

    builder.private_call.min_revertible_side_effect_counter = 49;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be less than the end counter of the call")]
fn min_revertible_side_effect_counter_greater_than_counter_end_fails() {
    let mut builder = TestBuilder::new_from_counter(50);

    builder.private_call.min_revertible_side_effect_counter = 100;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Counter must be greater than previous counter")]
fn duplicated_min_revertible_side_effect_counter_against_call_request_end_fails() {
    let mut builder = TestBuilder::new_from_counter(50);

    builder.private_call.append_private_call_requests(2);

    let another_item = builder.private_call.private_call_requests.get(0);
    builder.private_call.min_revertible_side_effect_counter = another_item.end_side_effect_counter;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatch counter: end of call request does not match hint")]
fn duplicated_min_revertible_side_effect_counter_against_call_request_start_fails() {
    let mut builder = TestBuilder::new_from_counter(50);

    builder.private_call.append_private_call_requests(2);

    let another_item = builder.private_call.private_call_requests.get(1);
    builder.private_call.min_revertible_side_effect_counter =
        another_item.start_side_effect_counter;

    builder.execute_and_fail();
}
