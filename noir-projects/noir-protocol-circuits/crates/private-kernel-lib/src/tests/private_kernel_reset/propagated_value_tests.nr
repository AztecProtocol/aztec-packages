use super::TestBuilder;
use types::{address::AztecAddress, tests::utils::assert_array_eq, traits::{Empty, FromField}};

// Values that may be squashed in the reset circuit are tested in other tests.

#[test]
fn correct_output_propagated_values() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.min_revertible_side_effect_counter = 246;
    builder.previous_kernel.append_l2_to_l1_msgs(2);
    builder.previous_kernel.append_contract_class_logs(1);
    builder.previous_kernel.append_private_call_requests(3);
    builder.previous_kernel.append_public_call_requests(2);
    builder.previous_kernel.set_public_teardown_call_request();
    builder.previous_kernel.fee_payer = AztecAddress::from_field(62);
    builder.previous_kernel.include_by_timestamp = 13;
    builder.previous_kernel.is_private_only = true;
    builder.previous_kernel.claimed_first_nullifier = 7788;

    let previous_kernel = builder.previous_kernel.to_private_kernel_circuit_public_inputs();

    let pi = builder.execute();

    assert_eq(pi.constants, previous_kernel.constants);
    assert_eq(pi.min_revertible_side_effect_counter, 246);
    let l2_to_l1_msgs = previous_kernel.end.l2_to_l1_msgs.array;
    assert_eq(pi.end.l2_to_l1_msgs.length, 2);
    // Note: Use `assert_array_eq` here instead of `assert_eq` to check that the propagated array elements aren't empty.
    assert_array_eq(
        pi.end.l2_to_l1_msgs.array,
        [l2_to_l1_msgs[0], l2_to_l1_msgs[1]],
    );
    let contract_class_logs_hashes = previous_kernel.end.contract_class_logs_hashes.array;
    assert_eq(pi.end.contract_class_logs_hashes.length, 1);
    assert_array_eq(
        pi.end.contract_class_logs_hashes.array,
        [contract_class_logs_hashes[0]],
    );
    let private_call_requests = previous_kernel.end.private_call_stack.array;
    assert_eq(pi.end.private_call_stack.length, 3);
    assert_array_eq(
        pi.end.private_call_stack.array,
        [private_call_requests[0], private_call_requests[1], private_call_requests[2]],
    );
    let public_call_requests = previous_kernel.end.public_call_requests.array;
    assert_eq(pi.end.public_call_requests.length, 2);
    assert_array_eq(
        pi.end.public_call_requests.array,
        [public_call_requests[0], public_call_requests[1]],
    );
    assert_eq(pi.public_teardown_call_request, previous_kernel.public_teardown_call_request);
    assert_eq(pi.fee_payer, AztecAddress::from_field(62));
    assert_eq(pi.include_by_timestamp, 13);
    assert_eq(pi.is_private_only, true);
    assert_eq(pi.claimed_first_nullifier, 7788);
}

#[test]
fn empty_propagated_values() {
    let builder = TestBuilder::new();

    let pi = builder.execute();

    // If a value is empty in the previous kernel, it stays empty.
    assert_eq(pi.min_revertible_side_effect_counter, 0);
    assert_array_eq(pi.end.l2_to_l1_msgs.array, []);
    assert_array_eq(pi.end.contract_class_logs_hashes.array, []);
    assert_array_eq(pi.end.private_call_stack.array, []);
    assert_array_eq(pi.end.public_call_requests.array, []);
    assert(pi.public_teardown_call_request.is_empty());
    assert(pi.fee_payer.is_empty());
    assert_eq(pi.is_private_only, false);
    assert_eq(pi.claimed_first_nullifier, 0);
}

#[test]
fn initialize_validation_request_split_counter() {
    let mut builder = TestBuilder::new();

    builder.min_revertible_side_effect_counter = 123;

    assert(builder.previous_kernel.validation_requests_split_counter.is_none());

    let pi = builder.execute();

    // The value from private inputs is set.
    assert_eq(pi.validation_requests.split_counter, Option::some(123));
}

#[test]
fn consistent_validation_request_split_counters() {
    let mut builder = TestBuilder::new();

    builder.min_revertible_side_effect_counter = 123;
    builder.previous_kernel.validation_requests_split_counter = Option::some(123);

    let pi = builder.execute();

    assert_eq(pi.validation_requests.split_counter, Option::some(123));
}

#[test(should_fail_with = "Mismatch hinted validation request split counter")]
fn mismatch_validation_request_split_counters() {
    let mut builder = TestBuilder::new();

    builder.min_revertible_side_effect_counter = 123;
    builder.previous_kernel.validation_requests_split_counter = Option::some(456);

    builder.failed();
}
