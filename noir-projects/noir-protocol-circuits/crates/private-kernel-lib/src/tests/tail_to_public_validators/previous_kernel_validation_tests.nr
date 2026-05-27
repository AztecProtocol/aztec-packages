use super::TestBuilder;
use types::{
    address::{AztecAddress, EthAddress},
    constants::{CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, DOM_SEP__TSK_M, PRIVATE_LOG_SIZE_IN_FIELDS},
    side_effect::Scoped,
    traits::{Empty, FromField},
};

// --- min_revertible_side_effect_counter ---

#[test(should_fail_with = "min_revertible_side_effect_counter must not be 0 for tail_to_public")]
fn zero_min_revertible_side_effect_counter() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.min_revertible_side_effect_counter = 0;
    let _ = builder.execute();
}

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
    builder.previous_kernel.add_request_for_key_validation(12345, 27, DOM_SEP__TSK_M as Field);
    let _ = builder.execute();
}

#[test(should_fail_with = "claimed_revertible_counter does not match min_revertible_side_effect_counter")]
fn mismatch_validation_requests_split_counter() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.min_revertible_side_effect_counter = 123;
    builder.previous_kernel.claimed_revertible_counter = 4567;

    let _ = builder.execute();
}

// --- fee_payer ---

#[test(should_fail_with = "Fee payer can't be empty")]
fn empty_fee_payer() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.fee_payer = AztecAddress::zero();
    let _ = builder.execute();
}

// --- is_private_only ---

#[test(should_fail_with = "Must not be private only to be processed in tail to public")]
fn is_private_only() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.is_private_only = true;
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

#[test(should_fail_with = "First nullifier must be non revertible")]
fn first_nullifier_is_revertible() {
    let mut builder = TestBuilder::new();
    // Pop the default protocol nullifier.
    let _ = builder.previous_kernel.nullifiers.pop();
    builder.previous_kernel.end_setup();
    // Add a revertible nullifier.
    builder.previous_kernel.append_nullifiers(1);
    // Update the claimed first nullifier.
    builder.previous_kernel.claimed_first_nullifier =
        builder.previous_kernel.nullifiers.get(0).innermost().value;
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

#[test(should_fail_with = "array is not dense trimmed")]
fn non_empty_nullifier_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    let mut array = builder.previous_kernel.nullifiers.storage();
    // Add a non-empty nullifier beyond the claimed length.
    array[5] = array[1];
    builder.previous_kernel.nullifiers = BoundedVec::from_parts_unchecked(array, 4);

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

#[test(should_fail_with = "call to assert_max_bit_size")]
fn invalid_l2_to_l1_msg_recipient() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.append_l2_to_l1_msgs(1);
    let mut l2_to_l1_msg = builder.previous_kernel.l2_to_l1_msgs.pop();
    // More than 160 bits.
    l2_to_l1_msg.inner.inner.recipient = EthAddress::from_field(-1);
    builder.previous_kernel.l2_to_l1_msgs.push(l2_to_l1_msg);
    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_l2_to_l1_msg_recipient_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    let mut array = builder.previous_kernel.l2_to_l1_msgs.storage();
    // Add a non-empty recipient to an L2 to L1 message beyond the claimed length.
    array[5].inner.inner.recipient = array[0].innermost().recipient;
    builder.previous_kernel.l2_to_l1_msgs = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_l2_to_l1_msg_content_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    let mut array = builder.previous_kernel.l2_to_l1_msgs.storage();
    // Add a non-empty content to an L2 to L1 message beyond the claimed length.
    array[5].inner.inner.content = array[0].innermost().content;
    builder.previous_kernel.l2_to_l1_msgs = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_l2_to_l1_msg_contract_address_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    let mut array = builder.previous_kernel.l2_to_l1_msgs.storage();
    // Add a non-empty contract address to an L2 to L1 message beyond the claimed length.
    array[5].contract_address = array[0].contract_address;
    builder.previous_kernel.l2_to_l1_msgs = BoundedVec::from_parts_unchecked(array, 2);

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

#[test(should_fail_with = "array is not dense")]
fn empty_private_log_as_valid_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    // Add an empty private log.
    builder.previous_kernel.private_logs.push(Scoped::empty());

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_private_log_length_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    let mut array = builder.previous_kernel.private_logs.storage();
    // Add a private log with non-zero length beyond the claimed length.
    array[5].inner.inner.log.length = 1;
    builder.previous_kernel.private_logs = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_private_log_fields_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    let mut array = builder.previous_kernel.private_logs.storage();
    // Add a private log with non-empty fields beyond the claimed length.
    array[5].inner.inner.log.fields[2] = 1;
    builder.previous_kernel.private_logs = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "Contract class log length exceeds max")]
fn contract_class_log_length_exceeds_max() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.add_contract_class_log_hash(123, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not dense")]
fn empty_contract_class_log_as_valid_item() {
    let mut builder = TestBuilder::new();

    // Add an empty contract class log hash as a valid item.
    builder.previous_kernel.contract_class_logs_hashes.push(Scoped::empty());

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_contract_class_log_length_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    let mut array = builder.previous_kernel.contract_class_logs_hashes.storage();
    // Add a contract class log with non-zero length beyond the claimed length.
    array[0].inner.inner.length = 1;
    builder.previous_kernel.contract_class_logs_hashes = BoundedVec::from_parts_unchecked(array, 0);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_contract_class_log_hash_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    let mut array = builder.previous_kernel.contract_class_logs_hashes.storage();
    // Add a contract class log with non-empty log hash value beyond the claimed length.
    array[0].inner.inner.value = 1;
    builder.previous_kernel.contract_class_logs_hashes = BoundedVec::from_parts_unchecked(array, 0);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_contract_class_log_contract_address_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    let mut array = builder.previous_kernel.contract_class_logs_hashes.storage();
    // Add a contract class log with non-empty contract address beyond the claimed length.
    array[0].contract_address = AztecAddress::from_field(1);
    builder.previous_kernel.contract_class_logs_hashes = BoundedVec::from_parts_unchecked(array, 0);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_public_call_request_msg_sender_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_public_call_requests(2);
    let mut array = builder.previous_kernel.public_call_requests.storage();
    // Add a non-empty msg sender to a public call request beyond the claimed length.
    array[5].inner.msg_sender = array[1].inner.msg_sender;
    builder.previous_kernel.public_call_requests = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_public_call_request_contract_address_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_public_call_requests(2);
    let mut array = builder.previous_kernel.public_call_requests.storage();
    // Add a non-empty contract address to a public call request beyond the claimed length.
    array[5].inner.contract_address = array[1].inner.contract_address;
    builder.previous_kernel.public_call_requests = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_public_call_request_is_static_call_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_public_call_requests(2);
    let mut array = builder.previous_kernel.public_call_requests.storage();
    // Add a non-empty is static call to a public call request beyond the claimed length.
    array[5].inner.is_static_call = true;
    builder.previous_kernel.public_call_requests = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "array is not trimmed")]
fn non_empty_public_call_request_calldata_hash_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_public_call_requests(2);
    let mut array = builder.previous_kernel.public_call_requests.storage();
    // Add a non-empty calldata hash to a public call request beyond the claimed length.
    array[5].inner.calldata_hash = 1;
    builder.previous_kernel.public_call_requests = BoundedVec::from_parts_unchecked(array, 2);

    let _ = builder.execute();
}

#[test(should_fail_with = "Private call stack must be empty when executing the tail circuit")]
fn non_empty_private_call_stack() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.append_private_call_requests(1);
    let _ = builder.execute();
}

#[test(should_fail_with = "Must have public calls when exporting public kernel data from the tail circuit")]
fn no_public_calls() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.public_call_requests = BoundedVec::new();
    let _ = builder.execute();
}

#[test]
fn can_run_with_only_teardown() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel.public_call_requests = BoundedVec::new();
    builder.previous_kernel.set_public_teardown_call_request();

    let _ = builder.execute();
}

// --- vk_index ---
// VK-tree membership is covered by reset circuit tests; `validate_previous_kernel_for_tail` only
// checks terminal public-input invariants.
