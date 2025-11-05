use super::TestBuilder;
use dep::types::{
    address::AztecAddress,
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, GENERATOR_INDEX__IVSK_M, PRIVATE_KERNEL_TAIL_INDEX,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    point::Point,
    side_effect::Scoped,
    traits::Empty,
};

// --- validation_requests ---

#[test(should_fail_with = "Non empty note hash read requests")]
fn non_empty_note_hash_read_requests() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.append_note_hashes(3);
    let _void = builder.previous_kernel.add_read_request_for_pending_note_hash(1);
    let _ = builder.execute();
}

#[test(should_fail_with = "Non empty nullifier read requests")]
fn non_empty_nullifier_read_requests() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.append_nullifiers(3);
    let _void = builder.previous_kernel.add_read_request_for_pending_nullifier(1);
    let _ = builder.execute();
}

#[test(should_fail_with = "Non empty key validation requests")]
fn non_empty_key_validations() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.add_request_for_key_validation(
        Point { x: 1, y: 2, is_infinite: false },
        27,
        GENERATOR_INDEX__IVSK_M as Field,
    );
    let _ = builder.execute();
}

#[test(should_fail_with = "split_counter must be 0 for pure private tx")]
fn non_zero_validation_requests_split_counter() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.validation_requests_split_counter = Option::some(123);
    let _ = builder.execute();
}

// --- fee_payer ---

#[test(should_fail_with = "Fee payer can't be empty")]
fn empty_fee_payer() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.set_fee_payer(AztecAddress::zero());
    let _ = builder.execute();
}

// --- is_private_only ---

#[test(should_fail_with = "Must be private only to be processed in tail")]
fn is_not_private_only() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.is_private_only = false;
    let _ = builder.execute();
}

// --- claimed_first_nullifier ---

#[test(should_fail_with = "First nullifier claim was not satisfied")]
fn first_nullifier_validation() {
    let mut builder = TestBuilder::new();
    let mut first_nullifier = builder.previous_kernel.nullifiers.get(0);
    first_nullifier.inner.inner.value += 1;
    builder.previous_kernel.nullifiers.set(0, first_nullifier);
    let _ = builder.execute();
}

// --- end ---

#[test(should_fail_with = "array is not dense trimmed")]
fn empty_note_hash_as_valid_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(3);
    // Add an empty note hash.
    builder.previous_kernel.note_hashes.push(Scoped::empty());

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not dense trimmed")]
fn non_empty_note_hash_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(3);
    let mut array = builder.previous_kernel.note_hashes.storage();
    // Add a non-empty note hash beyond the claimed length.
    array[5] = array[1];
    builder.previous_kernel.note_hashes = BoundedVec::from_parts_unchecked(array, 3);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not dense trimmed")]
fn empty_nullifier_as_valid_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    // Add an empty nullifier.
    builder.previous_kernel.nullifiers.push(Scoped::empty());

    let _ = builder.execute();
}

#[test(should_fail_with = "Cannot link a note hash emitted after a nullifier")]
fn nullifier_emitted_after_its_note_hash() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(2);
    let mut note_hash = builder.previous_kernel.note_hashes.pop();
    builder.previous_kernel.add_siloed_nullifier_for_note_hash(123, note_hash.innermost());
    // Tweak the counter of the note hash.
    note_hash.inner.counter += 99;
    builder.previous_kernel.note_hashes.push(note_hash);

    let _ = builder.execute();
}

#[test(should_fail_with = "Hinted siloed note hash does not match nullified note hash")]
fn nullifiers_for_note_hashes_not_found() {
    let mut builder = TestBuilder::new();

    // Assign a random note hash for the nullifier.
    builder.previous_kernel.add_siloed_nullifier_for_note_hash(3, 123);

    let _ = builder.execute();
}

#[test(should_fail_with = "Private log length exceeds max")]
fn private_log_length_exceeds_max() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(3);

    // The private log exceeds the max length allowed.
    builder.previous_kernel.append_siloed_private_logs_with_lengths([
        PRIVATE_LOG_SIZE_IN_FIELDS + 1,
    ]);

    let _ = builder.execute();
}

#[test(should_fail_with = "Contract class log length exceeds max")]
fn contract_class_log_length_exceeds_max() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.add_contract_class_log_hash(123, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1);

    let _ = builder.execute();
}

#[test(should_fail_with = "Public call stack must be empty when executing the tail circuit")]
fn non_empty_public_call_stack() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.append_public_call_requests(1);
    let _ = builder.execute();
}

#[test(should_fail_with = "Private call stack must be empty when executing the tail circuit")]
fn non_empty_private_call_stack() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.append_private_call_requests(1);
    let _ = builder.execute();
}

// --- public_teardown_call_request ---

#[test(should_fail_with = "Public teardown call request must be empty when executing the tail circuit")]
fn non_empty_public_teardown_call_request() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.set_public_teardown_call_request();
    let _ = builder.execute();
}

// --- proof and vk ---

#[test(should_fail_with = "Vk index not in allowed list")]
fn invalid_previous_kernel() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel = builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_TAIL_INDEX);
    let _res = builder.execute();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn vk_hash_mismatch_fails() {
    let mut builder = TestBuilder::new();

    // Tweak the vk hash.
    builder.previous_kernel.vk.hash += 1;

    let _res = builder.execute();
}
