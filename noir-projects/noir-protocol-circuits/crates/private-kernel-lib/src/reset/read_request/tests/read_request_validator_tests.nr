use super::{PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN, TestBuilder};
use dep::types::tests::utils::assert_array_eq;

impl TestBuilder {
    pub fn new_mixed() -> Self {
        let mut builder = Self::new();

        // Create 5 read requests containing both pending and settled read requests.
        builder.add_pending_read(3);
        builder.add_pending_read(2);
        builder.add_settled_read(3);
        builder.add_settled_read(1);
        builder.add_pending_read(1);

        builder
    }
}

#[test]
fn clears_all_read_requests() {
    let builder = TestBuilder::new_mixed();
    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 0);
    assert_array_eq(builder.propagated_read_requests.array, []);
}

#[test]
fn clears_partial_read_requests() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(2);
    builder.add_settled_read(0);

    // Add a read request without hint.
    let index_99 = builder.add_read_request(99);
    let read_request_99 = builder.read_requests.array[index_99];

    builder.add_pending_read(3);

    // Add another read request without hint.
    let index_9999 = builder.add_read_request(9999);
    let read_request_9999 = builder.read_requests.array[index_9999];

    builder.add_settled_read(1);

    builder.build_propagated_read_requests();
    builder.validate();

    assert_eq(builder.propagated_read_requests.length, 2);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [read_request_99, read_request_9999],
    );
}

#[test(should_fail_with = "pending_read_hints length does not match PendingReadAmount")]
fn validate_amount_less_than_pending_read_hints() {
    let builder = TestBuilder::new_mixed();
    // Validate 1 less than the `pending_read_hints` array length.
    builder.validate_with_amount::<PENDING_READ_HINTS_LEN - 1, SETTLED_READ_HINTS_LEN>();
}

#[test(should_fail_with = "pending_read_hints length does not match PendingReadAmount")]
fn validate_amount_greater_than_pending_read_hints() {
    let builder = TestBuilder::new_mixed();
    // Validate 1 more than the `pending_read_hints` array length.
    builder.validate_with_amount::<PENDING_READ_HINTS_LEN + 1, SETTLED_READ_HINTS_LEN>();
}

#[test]
fn validate_with_zero_pending_read_amount() {
    let mut builder = TestBuilder::new();

    // Add a read request without hint.
    let _ = builder.add_read_request(99);

    builder.add_settled_read(0);
    builder.add_settled_read(1);

    // Add another read request without hint.
    let _ = builder.add_read_request(9999);

    builder.build_propagated_read_requests();

    // Validate 0 pending read requests.
    builder.validate_with_amount::<0, SETTLED_READ_HINTS_LEN>();

    let read_requests = builder.read_requests.array;

    // All read requests without hints are propagated.
    assert_eq(builder.propagated_read_requests.length, 2);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [read_requests[0], read_requests[3]],
    );
}

#[test(should_fail_with = "Unused pending read hint must not point to a read request")]
fn validate_with_zero_pending_read_amount_hints_non_empty() {
    let mut builder = TestBuilder::new();

    // Add a pending read request with hint.
    builder.add_pending_read(1);

    builder.add_settled_read(0);

    builder.build_propagated_read_requests();

    // Validate 0 pending read requests.
    builder.validate_with_amount::<0, SETTLED_READ_HINTS_LEN>();
}

#[test(should_fail_with = "settled_read_hints length does not match SettledReadAmount")]
fn validate_with_fewer_settled_read_amount_fails() {
    let mut builder = TestBuilder::new_mixed();
    // Validate 1 less than the `settled_read_hints` array length.
    builder.validate_with_amount::<PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN - 1>();
}

#[test(should_fail_with = "settled_read_hints length does not match SettledReadAmount")]
fn validate_with_more_settled_read_amount_fails() {
    let mut builder = TestBuilder::new_mixed();
    // Validate 1 more than the `settled_read_hints` array length.
    builder.validate_with_amount::<PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN + 1>();
}

#[test]
fn validate_with_zero_settled_read_amount() {
    let mut builder = TestBuilder::new();

    builder.add_pending_read(0);

    // Add a read request without hint.
    let _ = builder.add_read_request(99);

    // Add another read request without hint.
    let _ = builder.add_read_request(9999);

    builder.add_pending_read(1);

    builder.build_propagated_read_requests();

    // Validate 0 settled read requests.
    builder.validate_with_amount::<PENDING_READ_HINTS_LEN, 0>();

    let read_requests = builder.read_requests.array;

    // All read requests without hints are propagated.
    assert_eq(builder.propagated_read_requests.length, 2);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [read_requests[1], read_requests[2]],
    );
}

#[test(should_fail_with = "Unused settled read hint must not point to a read request")]
fn validate_with_zero_settled_read_amount_hints_non_empty() {
    let mut builder = TestBuilder::new();

    // Add a settled read request with hint.
    builder.add_settled_read(1);

    builder.add_pending_read(0);

    builder.build_propagated_read_requests();

    // Validate 0 settled read requests.
    builder.validate_with_amount::<PENDING_READ_HINTS_LEN, 0>();
}

#[test]
fn validate_with_zero_read_amounts() {
    let mut builder = TestBuilder::new();

    // Add two read requests without hints.
    let _ = builder.add_read_request(99);
    let _ = builder.add_read_request(9999);

    builder.build_propagated_read_requests();

    // Validate 0 pending and settled read requests.
    builder.validate_with_amount::<0, 0>();

    let read_requests = builder.read_requests.array;

    // All read requests are propagated.
    assert_eq(builder.propagated_read_requests.length, 2);
    assert_array_eq(
        builder.propagated_read_requests.array,
        [read_requests[0], read_requests[1]],
    );
}
