use super::TestBuilder;
use dep::types::tests::utils::assert_array_eq;

impl TestBuilder {
    pub fn new_all_pending() -> Self {
        let mut builder = Self::new();

        builder.add_pending_read(0);
        builder.add_pending_read(1);
        builder.add_pending_read(2);

        builder
    }
}

#[test]
fn reset_all_pending_read_requests() {
    let builder = TestBuilder::new_all_pending();
    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 0);
    assert_array_eq(builder.propagated_read_requests.array, []);
}

#[test]
fn reset_partial_pending_read_requests() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(0);

    // Add a read request without hint.
    let read_request_index = builder.add_read_request(9999);
    let skipped_read_request = builder.read_requests.array[read_request_index];

    builder.add_pending_read(2);

    builder.build_propagated_read_requests();
    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 1);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [skipped_read_request],
    );
}

#[test]
fn duplicate_pending_read_requests() {
    let mut builder = TestBuilder::new();

    // Add multiple requests reading the same value.
    builder.add_pending_read(1);
    builder.add_pending_read(2);
    builder.add_pending_read(1);
    builder.add_pending_read(2);

    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 0);
    assert_array_eq(builder.propagated_read_requests.array, []);
}

#[test(should_fail_with = "Hinted test value does not match read request")]
fn hint_points_to_wrong_pending_value() {
    let mut builder = TestBuilder::new_all_pending();

    // Tweak the hint to point to a different pending value.
    let mut hint = builder.hints.pending_read_hints.pop();
    hint.pending_value_index += 1;
    builder.hints.pending_read_hints.push(hint);

    builder.validate();
}

#[test(should_fail_with = "Hinted test value does not match read request")]
fn mismatch_pending_value_being_read() {
    let mut builder = TestBuilder::new_all_pending();

    // Read a value that does not exist.
    builder.read_requests.array[1].read_request.value = 9999;

    builder.validate();
}

#[test(should_fail_with = "Cannot read a pending value beyond claimed length")]
fn read_pending_value_at_claimed_length() {
    let mut builder = TestBuilder::new_all_pending();

    // Set a random value at the claimed length.
    let pending_value_index = builder.pending_values.length;
    builder.pending_values.array[pending_value_index].value = 9999;
    // Change the read request to be reading the random value.
    let mut hint = builder.hints.pending_read_hints.pop();
    builder.read_requests.array[hint.read_request_index].read_request.value = 9999;
    // Update the hint to point to the random value.
    hint.pending_value_index = pending_value_index;
    builder.hints.pending_read_hints.push(hint);

    builder.validate();
}

#[test(should_fail_with = "Cannot read a pending value beyond claimed length")]
fn read_pending_value_beyond_claimed_length() {
    let mut builder = TestBuilder::new_all_pending();

    // Set a random value at the claimed length.
    let pending_value_index = builder.pending_values.length + 1;
    builder.pending_values.array[pending_value_index].value = 9999;
    // Change the read request to be reading the random value.
    let mut hint = builder.hints.pending_read_hints.pop();
    builder.read_requests.array[hint.read_request_index].read_request.value = 9999;
    // Update the hint to point to the random value.
    hint.pending_value_index = pending_value_index;
    builder.hints.pending_read_hints.push(hint);

    builder.validate();
}

#[test(should_fail_with = "Pending value must be emitted before the read request")]
fn read_request_counter_equals_pending_value_counter() {
    let mut builder = TestBuilder::new_all_pending();

    // Change the counter of the read request to be equal to the counter of the pending value.
    let hint = builder.hints.pending_read_hints.get(1);
    let pending_value_counter = builder.pending_values.array[hint.pending_value_index].counter;
    builder.read_requests.array[hint.read_request_index].read_request.counter =
        pending_value_counter;

    builder.validate();
}

#[test(should_fail_with = "Pending value must be emitted before the read request")]
fn read_request_counter_less_than_pending_value_counter() {
    let mut builder = TestBuilder::new_all_pending();

    // Change the counter of the read request to be less than the counter of the pending value.
    let hint = builder.hints.pending_read_hints.get(1);
    let pending_value_counter = builder.pending_values.array[hint.pending_value_index].counter;
    builder.read_requests.array[hint.read_request_index].read_request.counter =
        pending_value_counter - 1;

    builder.validate();
}
