use super::TestBuilder;
use types::{hash::compute_siloed_nullifier, tests::utils::assert_array_eq};

// Note: Only a few cases are tested here to ensure that the code path to the `ReadRequestValidator` is reached for both
// note hash and nullifier read requests. More comprehensive tests for validating and propagating read requests can be
// found in `reset/read_request/tests`.

// --- Note hash ---

#[test]
fn validate_and_propagate_note_hash_read_requests() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(3);

    // Append 3 pending note hash reads, 2 settled reads, and 2 reads without hints.
    builder.read_pending_note_hash(0);
    builder.previous_kernel.append_note_hash_read_requests(1);
    builder.read_settled_note_hash(1);
    builder.read_settled_note_hash(2);
    builder.previous_kernel.append_note_hash_read_requests(1);
    builder.read_pending_note_hash(1);
    builder.read_pending_note_hash(2);

    let read_requests = builder.previous_kernel.note_hash_read_requests.storage();

    let pi = builder.execute();

    // Only the 2 reads without hints should be propagated.
    assert_eq(pi.validation_requests.note_hash_read_requests.length, 2);
    assert_array_eq(
        pi.validation_requests.note_hash_read_requests.array,
        [read_requests[1], read_requests[4]],
    );
}

#[test(should_fail_with = "Value of the note hash does not match read request")]
fn wrong_hint_for_pending_note_hash_read_request() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(3);

    builder.read_pending_note_hash(1);

    // Change the hint to point to a different pending value.
    let mut hint = builder.note_hash_read_request_hints.pending_read_hints.pop();
    hint.pending_value_index = 2;
    builder.note_hash_read_request_hints.pending_read_hints.push(hint);

    builder.failed();
}

#[test(should_fail_with = "Contract address of the note hash does not match read request")]
fn mismatch_pending_note_hash_contract_address() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(3);

    // Change the contract address.
    builder.previous_kernel.contract_address.inner += 1;

    // This read request has the new contract address, but it's reading a value with the old contract address.
    builder.read_pending_note_hash(1);

    builder.failed();
}

#[test(should_fail_with = "Value of the note hash leaf does not match read request")]
fn wrong_hint_for_settled_note_hash_read_request() {
    let mut builder = TestBuilder::new();

    builder.read_settled_note_hash(1);

    // Change the hint to a different value.
    let mut hint = builder.note_hash_read_request_hints.settled_read_hints.pop();
    hint.leaf_preimage.value = 99;
    builder.note_hash_read_request_hints.settled_read_hints.push(hint);

    builder.failed();
}

#[test(should_fail_with = "Membership check failed: leaf for read request not found in tree")]
fn settled_note_hash_read_request_non_existing_leaf() {
    let mut builder = TestBuilder::new();

    builder.read_settled_note_hash(1);
    // Change the read request to read a value that does not exist in the note hash tree.
    let mut read_request = builder.previous_kernel.note_hash_read_requests.pop();
    read_request.read_request.value = 99;
    builder.previous_kernel.note_hash_read_requests.push(read_request);

    // Change the hint to a different value.
    let mut hint = builder.note_hash_read_request_hints.settled_read_hints.pop();
    hint.leaf_preimage.value = 99;
    builder.note_hash_read_request_hints.settled_read_hints.push(hint);

    builder.failed();
}

#[test(should_fail_with = "Pending value must be emitted before the read request")]
fn note_hash_read_emitted_before_pending_value() {
    let mut builder = TestBuilder::new();

    // Add the read request first.
    let _ = builder.previous_kernel.add_read_request_for_pending_note_hash(0);

    // Add the pending value after the read request.
    builder.previous_kernel.append_note_hashes(1);

    // Add the hint.
    builder.note_hash_read_request_hints.add_pending_read_hint(0, 0);

    builder.failed();
}

// --- Nullifier ---

#[test]
fn validate_and_propagate_nullifier_read_requests() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);

    // Append 3 pending nullifier reads, 2 settled reads, and 2 reads without hints.
    builder.read_pending_nullifier(0);
    builder.read_settled_nullifier(1);
    builder.previous_kernel.append_nullifier_read_requests(1);
    builder.read_pending_nullifier(1);
    builder.previous_kernel.append_nullifier_read_requests(1);
    builder.read_pending_nullifier(2);
    builder.read_settled_nullifier(2);

    let read_requests = builder.previous_kernel.nullifier_read_requests.storage();

    let pi = builder.execute();

    // Only the 2 reads without hints should be propagated.
    assert_eq(pi.validation_requests.nullifier_read_requests.length, 2);
    assert_array_eq(
        pi.validation_requests.nullifier_read_requests.array,
        [read_requests[2], read_requests[4]],
    );
}

#[test(should_fail_with = "Value of the nullifier does not match read request")]
fn wrong_hint_for_pending_nullifier_read_request() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    builder.read_pending_nullifier(1);

    // Change the hint to point to a different pending value.
    let mut hint = builder.nullifier_read_request_hints.pending_read_hints.pop();
    hint.pending_value_index += 1;
    builder.nullifier_read_request_hints.pending_read_hints.push(hint);

    builder.failed();
}

#[test(should_fail_with = "Contract address of the nullifier does not match read request")]
fn mismatch_pending_nullifier_contract_address() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);

    // Change the contract address.
    builder.previous_kernel.contract_address.inner += 1;

    // This read request has the new contract address, but it's reading a value with the old contract address.
    builder.read_pending_nullifier(1);

    builder.failed();
}

#[test(should_fail_with = "Value of the nullifier leaf does not match read request")]
fn wrong_hint_for_settled_nullifier_read_request() {
    let mut builder = TestBuilder::new();

    builder.read_settled_nullifier(1);

    // Change the hint to a different value.
    let mut hint = builder.nullifier_read_request_hints.settled_read_hints.pop();
    hint.leaf_preimage.nullifier =
        compute_siloed_nullifier(builder.previous_kernel.contract_address, 99);
    builder.nullifier_read_request_hints.settled_read_hints.push(hint);

    builder.failed();
}

#[test(should_fail_with = "Membership check failed: leaf for read request not found in tree")]
fn settled_nullifier_read_request_non_existing_leaf() {
    let mut builder = TestBuilder::new();

    builder.read_settled_nullifier(1);
    // Change the read request to read a value that does not exist in the nullifier tree.
    let mut read_request = builder.previous_kernel.nullifier_read_requests.pop();
    read_request.read_request.value = 99;
    builder.previous_kernel.nullifier_read_requests.push(read_request);

    // Change the hint to a different value.
    let mut hint = builder.nullifier_read_request_hints.settled_read_hints.pop();
    hint.leaf_preimage.nullifier =
        compute_siloed_nullifier(builder.previous_kernel.contract_address, 99);
    builder.nullifier_read_request_hints.settled_read_hints.push(hint);

    builder.failed();
}

#[test(should_fail_with = "Pending value must be emitted before the read request")]
fn nullifier_read_emitted_before_pending_value() {
    let mut builder = TestBuilder::new();

    // Add the read request first.
    let _ = builder.previous_kernel.add_read_request_for_pending_nullifier(0);

    // Add the pending value after the read request.
    builder.previous_kernel.append_nullifiers(1);

    // Add the hint.
    builder.nullifier_read_request_hints.add_pending_read_hint(0, 0);

    builder.failed();
}
