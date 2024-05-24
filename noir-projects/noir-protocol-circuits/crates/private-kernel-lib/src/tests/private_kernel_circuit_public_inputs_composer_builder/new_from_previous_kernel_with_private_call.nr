use crate::{tests::private_kernel_circuit_public_inputs_composer_builder::PrivateKernelCircuitPublicInputsComposerBuilder};
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputsArrayLengths, traits::is_empty,
    utils::arrays::array_eq
};

#[test]
fn new_from_previous_kernel_with_private_call_empty_data_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    let output = builder.compose_from_previous_kernel();

    let array_lengths = PrivateKernelCircuitPublicInputsArrayLengths::new(output);
    let expected_array_lengths = PrivateKernelCircuitPublicInputsArrayLengths::empty();
    assert_eq(array_lengths, expected_array_lengths);

    assert(output.validation_requests.for_rollup.max_block_number.is_none());
    assert(is_empty(output.public_teardown_call_request));
    assert(is_empty(output.fee_payer));
}

#[test]
fn new_from_previous_kernel_with_private_call_max_block_number_prev_empty_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.private_call.set_max_block_number(123);

    let output = builder.compose_from_previous_kernel();

    assert_eq(output.validation_requests.for_rollup.max_block_number.unwrap(), 123);
}

#[test]
fn new_from_previous_kernel_with_private_call_max_block_number_curr_empty_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.set_max_block_number(123);

    let output = builder.compose_from_previous_kernel();

    assert_eq(output.validation_requests.for_rollup.max_block_number.unwrap(), 123);
}

#[test]
fn new_from_previous_kernel_with_private_call_max_block_number_pick_prev_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.set_max_block_number(123);
    builder.private_call.set_max_block_number(4567);

    let output = builder.compose_from_previous_kernel();

    assert_eq(output.validation_requests.for_rollup.max_block_number.unwrap(), 123);
}

#[test]
fn new_from_previous_kernel_with_private_call_max_block_number_pick_curr_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.set_max_block_number(4567);
    builder.private_call.set_max_block_number(123);

    let output = builder.compose_from_previous_kernel();

    assert_eq(output.validation_requests.for_rollup.max_block_number.unwrap(), 123);
}

#[test]
fn new_from_previous_kernel_with_private_call_note_hash_read_requests_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_note_hash_read_requests(2);
    let prev = builder.previous_kernel.note_hash_read_requests.storage;
    builder.private_call.append_note_hash_read_requests(2);
    let curr = builder.private_call.note_hash_read_requests.storage;

    let output = builder.compose_from_previous_kernel();

    assert(
        array_eq(
            output.validation_requests.note_hash_read_requests,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_nullifier_read_requests_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_nullifier_read_requests(2);
    let prev = builder.previous_kernel.nullifier_read_requests.storage;
    builder.private_call.append_nullifier_read_requests(2);
    let curr = builder.private_call.nullifier_read_requests.storage;

    let output = builder.compose_from_previous_kernel();

    assert(
        array_eq(
            output.validation_requests.nullifier_read_requests,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_key_validation_requests_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_key_validation_requests(2);
    let prev = builder.previous_kernel.key_validation_requests.storage;
    builder.private_call.append_key_validation_requests(2);
    let curr = builder.private_call.key_validation_requests.storage;

    let output = builder.compose_from_previous_kernel();

    assert(
        array_eq(
            output.validation_requests.key_validation_requests,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_new_note_hashes_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_new_note_hashes(2, false);
    let prev = builder.previous_kernel.new_note_hashes.storage;
    builder.private_call.append_new_note_hashes(2, false);
    let curr = builder.private_call.new_note_hashes.storage;

    let output = builder.compose_from_previous_kernel();

    assert(
        array_eq(
            output.end.new_note_hashes,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_new_note_hashes_with_nullifier_counters_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_new_note_hashes(2, false);
    let prev = builder.previous_kernel.new_note_hashes.storage;
    builder.private_call.append_new_note_hashes(2, false);
    let mut curr = builder.private_call.new_note_hashes.storage;
    builder.note_hash_nullifier_counters[0] = curr[0].counter() + 10;
    builder.note_hash_nullifier_counters[1] = curr[1].counter() + 75;

    let output = builder.compose_from_previous_kernel();

    curr[0].nullifier_counter = curr[0].counter() + 10;
    curr[1].nullifier_counter = curr[1].counter() + 75;
    assert(
        array_eq(
            output.end.new_note_hashes,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_new_note_hashes_with_nullifier_counters_more_hints_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_new_note_hashes(2, false);
    let prev = builder.previous_kernel.new_note_hashes.storage;
    builder.private_call.append_new_note_hashes(2, false);
    let mut curr = builder.private_call.new_note_hashes.storage;
    builder.note_hash_nullifier_counters[0] = curr[0].counter() + 10;
    builder.note_hash_nullifier_counters[1] = curr[1].counter() + 75;
    // Add a random nullifier counter for a non-existent note hash to the hints.
    builder.note_hash_nullifier_counters[2] = 323;

    let output = builder.compose_from_previous_kernel();

    curr[0].nullifier_counter = curr[0].counter() + 10;
    curr[1].nullifier_counter = curr[1].counter() + 75;
    assert(
        array_eq(
            output.end.new_note_hashes,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
    // The extra counter won't be propagated.
    assert_eq(output.end.new_note_hashes[4].nullifier_counter, 0);
}

#[test(should_fail_with="Invalid nullifier counter")]
fn new_from_previous_kernel_with_private_call_new_note_hashes_with_nullifier_counters_less_than_fails() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_new_note_hashes(2, false);
    let _ = builder.previous_kernel.new_note_hashes.storage;
    builder.private_call.append_new_note_hashes(2, false);
    let curr = builder.private_call.new_note_hashes.storage;
    builder.note_hash_nullifier_counters[0] = curr[0].counter() + 10;
    // Tweak the nullifier counter to be less than the note hash counter.
    builder.note_hash_nullifier_counters[1] = curr[1].counter() - 1;

    let _ = builder.compose_from_previous_kernel();
}

#[test]
fn new_from_previous_kernel_with_private_call_new_nullifiers_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_new_nullifiers(2);
    let prev = builder.previous_kernel.new_nullifiers.storage;
    builder.private_call.append_new_nullifiers(2);
    let curr = builder.private_call.new_nullifiers.storage;

    let output = builder.compose_from_previous_kernel();

    assert(
        array_eq(
            output.end.new_nullifiers,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_new_l2_to_l1_msgs_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_new_l2_to_l1_msgs(1);
    let prev = builder.previous_kernel.new_l2_to_l1_msgs.storage;
    builder.private_call.append_new_l2_to_l1_msgs(1);
    let curr = builder.private_call.new_l2_to_l1_msgs.storage;

    let output = builder.compose_from_previous_kernel();

    assert(array_eq(output.end.new_l2_to_l1_msgs, [prev[0], curr[0]]));
}

// #[test]
// fn new_from_previous_kernel_with_private_call_logs_succeeds() {
//     let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

//     builder.private_call.append_logs(2);
//     let res = builder.private_call.logs.storage;

//     let output = builder.compose_from_previous_kernel();

//     assert(array_eq(output.end.logs, [res[0], res[1]]));
// }

#[test]
fn new_from_previous_kernel_with_private_call_private_call_requests_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_private_call_requests(2);
    let prev = builder.previous_kernel.private_call_requests.storage;
    builder.private_call.append_private_call_requests(2);
    let curr = builder.private_call.private_call_requests.storage;

    let output = builder.compose_from_previous_kernel();

    // Call requests from private call will be propagated in reversed order.
    assert(
        array_eq(
            output.end.private_call_stack,
            [prev[1], prev[0], curr[1], curr[0]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_public_call_requests_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_public_call_requests(2);
    let prev = builder.previous_kernel.public_call_requests.storage;
    builder.private_call.append_public_call_requests(2);
    let curr = builder.private_call.public_call_requests.storage;

    let output = builder.compose_from_previous_kernel();

    assert(
        array_eq(
            output.end.public_call_stack,
            [prev[0], prev[1], curr[0], curr[1]]
        )
    );
}

#[test]
fn new_from_previous_kernel_with_private_call_public_teardown_call_request_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.private_call.append_public_teardown_call_request();
    let request = builder.private_call.public_teardown_call_request;

    let output = builder.compose_from_previous_kernel();

    assert_eq(output.public_teardown_call_request, request);
}

#[test(should_fail_with="Public teardown call request already set")]
fn new_from_previous_kernel_with_private_call_public_teardown_call_request_overwrite_fails() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    builder.previous_kernel.append_public_teardown_call_request();
    builder.private_call.append_public_teardown_call_request();

    let _ = builder.compose_from_previous_kernel();
}

#[test]
fn new_from_previous_kernel_with_private_call_fee_payer_succeeds() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    let fee_payer = builder.private_call.make_fee_payer();

    let output = builder.compose_from_previous_kernel();

    assert_eq(output.fee_payer, fee_payer);
}

#[test(should_fail_with="Cannot overwrite non-empty fee_payer")]
fn new_from_previous_kernel_with_private_call_fee_payer_overwrite_fails() {
    let mut builder = PrivateKernelCircuitPublicInputsComposerBuilder::new();

    let _ = builder.previous_kernel.make_fee_payer();
    let _ = builder.private_call.make_fee_payer();

    let _ = builder.compose_from_previous_kernel();
}
