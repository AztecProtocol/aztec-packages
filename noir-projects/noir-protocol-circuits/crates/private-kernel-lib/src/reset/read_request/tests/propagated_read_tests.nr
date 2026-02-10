use crate::reset::read_request::read_request_action::ReadRequestAction;
use super::TestBuilder;
use types::tests::utils::assert_array_eq;

#[test(should_fail_with = "Hinted settled read request does not match status")]
fn incorrect_action_for_pending_read_request() {
    let mut builder = TestBuilder::new();

    builder.add_settled_read(0);
    builder.add_pending_read(1);

    // Tweak the action for the pending read request to be reading as settled.
    builder.hints.read_request_actions[1] = ReadRequestAction::read_settled(0);

    builder.validate();
}

#[test(should_fail_with = "Hinted pending read request does not match status")]
fn incorrect_action_for_settled_read_request() {
    let mut builder = TestBuilder::new();

    builder.add_settled_read(0);
    builder.add_pending_read(1);

    // Tweak the action for the settled read request to be reading as pending.
    builder.hints.read_request_actions[0] = ReadRequestAction::read_pending(0);

    builder.validate();
}

#[test]
fn skip_action_for_validated_read_requests() {
    let mut builder = TestBuilder::new();

    builder.add_settled_read(0);
    builder.add_pending_read(1);

    let read_request_0 = builder.read_requests.array[0];
    let read_request_1 = builder.read_requests.array[1];

    // Tweak the action for both read requests to skip.
    builder.hints.read_request_actions[0] = ReadRequestAction::skip();
    builder.hints.read_request_actions[1] = ReadRequestAction::skip();

    builder.build_propagated_read_requests();

    builder.validate();

    // Both will be propagated.
    assert_eq(builder.propagated_read_requests.length, 2);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [read_request_0, read_request_1],
    );
}

#[test(should_fail_with = "Mismatch propagated read request")]
fn extra_read_request_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(1);

    // Add a read request without hints.
    let index_22 = builder.add_read_request(22);
    let read_request_22 = builder.read_requests.array[index_22];

    // Change the claimed length to be 1, making the second read request (22) irrelevant.
    builder.read_requests.length = 1;
    // Propagate it to the output at the new claimed length, where all un-validated read requests will be compared to.
    builder.propagated_read_requests.array[0] = read_request_22;

    builder.validate();
}

#[test]
fn extra_identical_read_requests_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(1);

    // Add a read request without hints.
    let index_22 = builder.add_read_request(22);
    let read_request_22 = builder.read_requests.array[index_22];

    // Fill the read requests array with the same read request.
    for i in 2..builder.read_requests.array.len() {
        builder.read_requests.array[i] = read_request_22;
    }

    // Change the claimed length to be 1, making all read requests except the first one irrelevant.
    builder.read_requests.length = 1;
    // Propagate it to the output at the new claimed length, where the un-validated read requests will be compared to.
    builder.propagated_read_requests.array[0] = read_request_22;

    builder.validate();

    // The dummy read request is propagated. But the claimed length is correctly set to 0.
    assert_eq(builder.propagated_read_requests.length, 0);
    assert_array_eq(builder.propagated_read_requests.array, [read_request_22]);
}

#[test(should_fail_with = "Incorrect propagated read requests length")]
fn propagate_extra_empty_read_request() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(1);

    // Tweak the length to be 1, to include the last empty read request.
    builder.propagated_read_requests.length = 1;

    // If an empty read request is propagated, the prover will have to call a reset circuit again to clear all read
    // requests before executing the private tail. But it's not possible to provide a correct hint to validate an empty
    // read request. So the transaction can never be proven.
    builder.validate();
}

#[test(should_fail_with = "Mismatch propagated read request")]
fn random_non_empty_read_request_at_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(1);

    // Set a random value to the read request at the claimed length.
    builder.propagated_read_requests.array[0].inner.inner = 9999;

    // It's fine to propagate non-empty read requests at or beyond the claimed length. But this test fails because
    // the implementation is simpler and cheaper if all the skipped read requests must match the propagated read
    // request at the claimed length.
    builder.validate();
}

#[test]
fn random_non_empty_read_request_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(1);

    // Set a random value to the first read request beyond the claimed length.
    builder.propagated_read_requests.array[1].inner.inner = 9999;

    builder.validate();

    // The claimed length is set to 0 correctly, and the random value would simply be ignored in other kernel circuits.
    assert_eq(builder.propagated_read_requests.length, 0);
}
