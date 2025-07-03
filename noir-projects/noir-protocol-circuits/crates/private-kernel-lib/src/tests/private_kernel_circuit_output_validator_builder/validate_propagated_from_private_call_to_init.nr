use crate::tests::private_kernel_circuit_output_validator_builder::PrivateKernelCircuitOutputValidatorBuilder;
use dep::types::tests::utils::swap_items;

#[test]
fn validate_propagated_from_private_call_to_init__empty_data_succeeds() {
    let builder = PrivateKernelCircuitOutputValidatorBuilder::new();
    builder.validate_as_first_call();
}

/**
 * note_hash_read_requests
 * With private call data only.
 */
#[test]
fn validate_propagated_from_private_call_to_init__note_hash_read_requests_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hash_read_requests(2);
    builder.output.append_note_hash_read_requests(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__note_hash_read_requests_output_mismatch_value_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hash_read_requests(2);
    builder.output.append_note_hash_read_requests(2);
    // Tweak the value in the output.
    let mut read_request = builder.output.note_hash_read_requests.get(1);
    read_request.read_request.value += 1;
    builder.output.note_hash_read_requests.set(1, read_request);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "propagated contract address does not match")]
fn validate_propagated_from_private_call_to_init__note_hash_read_requests_mismatch_contract_address_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hash_read_requests(2);
    builder.output.append_note_hash_read_requests(2);
    // Tweak the contract address in the output.
    let mut read_request = builder.output.note_hash_read_requests.get(1);
    read_request.contract_address.inner += 1;
    builder.output.note_hash_read_requests.set(1, read_request);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__note_hash_read_requests_output_one_less_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hash_read_requests(2);
    // Propagate 1 less item to the output.
    builder.output.append_note_hash_read_requests(1);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__note_hash_read_requests_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hash_read_requests(2);
    // Propagate 1 more item to the output.
    builder.output.append_note_hash_read_requests(3);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "Length mismatch")]
fn validate_propagated_from_private_call_to_init__note_hash_read_requests_output_extra_non_empty_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hash_read_requests(2);
    builder.output.append_note_hash_read_requests(2);
    // Add a non-empty item to the end of the output.
    let mut read_requests = builder.output.note_hash_read_requests.storage();
    read_requests[read_requests.len() - 1] = read_requests[0];
    builder.output.note_hash_read_requests = BoundedVec::from_array(read_requests);

    builder.validate_as_first_call();
}

// Create two tests (one succeeds and one fails) for the rest of the side effects to make sure that they are processed in the validator.

/**
 * nullifier_read_requests
 */
#[test]
fn validate_propagated_from_private_call_to_init__nullifier_read_requests_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_nullifier_read_requests(2);
    builder.output.append_nullifier_read_requests(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__nullifier_read_requests_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_nullifier_read_requests(2);
    // Propagate 1 more item to the output.
    builder.output.append_nullifier_read_requests(3);

    builder.validate_as_first_call();
}

/**
 * key_validation_requests
 */
#[test]
fn validate_propagated_from_private_call_to_init__key_validation_requests_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_key_validation_requests(2);
    builder.output.append_key_validation_requests(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__key_validation_requests_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_key_validation_requests(2);
    // Propagate 1 more item to the output.
    builder.output.append_key_validation_requests(3);

    builder.validate_as_first_call();
}

/**
 * note_hashes
 */
#[test]
fn validate_propagated_from_private_call_to_init__note_hashes_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hashes(2);
    builder.output.append_note_hashes(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__note_hashes_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_note_hashes(2);
    // Propagate 1 more item to the output.
    builder.output.append_note_hashes(3);

    builder.validate_as_first_call();
}

/**
 * nullifiers
 */
#[test]
fn validate_propagated_from_private_call_to_init__nullifiers_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();
    builder.with_protocol_nullifier();

    builder.offset_values(1); // Offset the first nullifier.
    builder.private_call.append_nullifiers(2);
    builder.output.append_nullifiers(2);

    builder.validate_as_first_call();
}

#[test]
fn validate_propagated_from_private_call_to_init__nullifiers_without_protocol_nullifier_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_nullifiers(2);
    builder.output.append_nullifiers(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "Length mismatch")]
fn validate_propagated_from_private_call_to_init__nullifiers_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_nullifiers(2);
    // Propagate 1 more item to the output.
    builder.output.append_nullifiers(3);

    builder.validate_as_first_call();
}

/**
 * l2_to_l1_msgs
 */
#[test]
fn validate_propagated_from_private_call_to_init__l2_to_l1_msgs_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_l2_to_l1_msgs(2);
    builder.output.append_l2_to_l1_msgs(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__l2_to_l1_msgs_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_l2_to_l1_msgs(1);
    // Propagate 1 more item to the output.
    builder.output.append_l2_to_l1_msgs(2);

    builder.validate_as_first_call();
}

/**
 * private_logs
 */
#[test]
fn validate_propagated_from_private_call_to_init__private_logs_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_private_logs(2);
    builder.output.append_private_logs(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__private_logs_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_private_logs(2);
    // Propagate 1 more item to the output.
    builder.output.append_private_logs(3);

    builder.validate_as_first_call();
}

/**
 * contract_class_log_hashes
 */
#[test]
fn validate_propagated_from_private_call_to_init__contract_class_log_hashes_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.add_contract_class_log_hash(2, 1);
    builder.output.add_contract_class_log_hash(2, 1);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__contract_class_log_hashes_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    // Propagate 1 more item to the output.
    builder.output.add_contract_class_log_hash(2, 1);

    builder.validate_as_first_call();
}

/**
 * private_call_requests
 */
#[test]
fn validate_propagated_from_private_call_to_init__private_call_requests_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_private_call_requests(2);
    builder.output.append_private_call_requests(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not reversed append to empty dest")]
fn validate_propagated_from_private_call_to_init__private_call_requests_not_reversed_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_private_call_requests(2);
    builder.output.append_private_call_requests(2);
    // Swap the call requests.
    swap_items(&mut builder.output.private_call_requests, 0, 1);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not reversed append to empty dest")]
fn validate_propagated_from_private_call_to_init__private_call_requests_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_private_call_requests(2);
    // Propagate 1 more item to the output.
    builder.output.append_private_call_requests(3);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "Length mismatch")]
fn validate_propagated_from_private_call_to_init__private_call_requests_output_one_more_not_reversed_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_private_call_requests(2);
    // Propagate 1 more item to the output.
    builder.output.append_private_call_requests(3);
    // Swap the order of the items so that the first two items matches the values in the private call after reversing.
    swap_items(&mut builder.output.private_call_requests, 0, 2);
    swap_items(&mut builder.output.private_call_requests, 1, 2);

    builder.validate_as_first_call();
}

/**
 * public_call_requests
 */
#[test]
fn validate_propagated_from_private_call_to_init__public_call_requests_succeeds() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_public_call_requests(2);
    builder.output.append_public_call_requests(2);

    builder.validate_as_first_call();
}

#[test(should_fail_with = "source item does not append to dest")]
fn validate_propagated_from_private_call_to_init__public_call_requests_output_one_more_fails() {
    let mut builder = PrivateKernelCircuitOutputValidatorBuilder::new();

    builder.private_call.append_public_call_requests(2);
    // Propagate 1 more item to the output.
    builder.output.append_public_call_requests(3);

    builder.validate_as_first_call();
}
