use super::{KEY_VALIDATION_HINTS_LEN, TestBuilder};
use types::tests::utils::{assert_array_eq, swap_items};

// Note: Only a few cases are tested here to ensure that the code path to the `KeyValidationRequestsValidator` is
// reached. More comprehensive tests for validating and propagating key validation requests can be
// found in `reset/key_validation_request/tests`.

#[test]
fn validate_and_propagate_key_validation_requests() {
    let mut builder = TestBuilder::new();

    for i in 0..KEY_VALIDATION_HINTS_LEN {
        builder.add_key_validation_request_and_hint(i as Field + 123);
    }
    // Add two more requests without hints.
    builder.add_key_validation_request(456);
    builder.add_key_validation_request(789);

    let requests = builder.previous_kernel.scoped_key_validation_requests_and_generators.storage();

    let pi = builder.execute();

    // Only the 2 requests without hints should be propagated.
    assert_eq(pi.validation_requests.scoped_key_validation_requests_and_generators.length, 2);
    assert_array_eq(
        pi.validation_requests.scoped_key_validation_requests_and_generators.array,
        [requests[KEY_VALIDATION_HINTS_LEN], requests[KEY_VALIDATION_HINTS_LEN + 1]],
    );
}

#[test(should_fail_with = "Failed to derive matching master public key from the secret key")]
fn wrong_order_for_key_validation_request() {
    let mut builder = TestBuilder::new();

    builder.add_key_validation_request_and_hint(123);
    builder.add_key_validation_request_and_hint(456);

    // Swap the hints.
    swap_items(&mut builder.key_validation_hints, 0, 1);

    builder.failed();
}
