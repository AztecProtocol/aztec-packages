use crate::tests::private_kernel_reset::{NULLIFIER_SILOING_AMOUNT, TestBuilder};
use super::rebuild_bounded_vec;
use protocol_test_utils::swap_items;

#[test]
fn previous_nullifiers_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    builder.output.append_siloed_nullifiers(3);

    builder.validate_siloing();
}

#[test]
fn previous_nullifiers_not_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    // Swap 2 of the nullifiers in the previous kernel.
    swap_items(&mut builder.previous_kernel.nullifiers, 1, 2);

    builder.output.append_siloed_nullifiers(3);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output nullifier does not match correctly-siloed nullifier")]
fn output_nullifiers_not_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);

    builder.output.append_siloed_nullifiers(3);
    // Swap 2 of the nullifiers in the output.
    swap_items(&mut builder.output.nullifiers, 1, 2);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output nullifier does not match correctly-siloed nullifier")]
fn extra_non_empty_nullifier_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(2);

    // Append an extra item to the output.
    builder.output.append_siloed_nullifiers(3);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output nullifier does not match correctly-siloed nullifier")]
fn previous_nullifiers_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(2);
    let nullifiers = builder.previous_kernel.nullifiers.storage();
    builder.previous_kernel.nullifiers = BoundedVec::from_parts_unchecked(nullifiers, 1);

    builder.output.append_siloed_nullifiers(2);
    let output_nullifiers = builder.output.nullifiers.storage();
    builder.output.nullifiers = BoundedVec::from_parts_unchecked(output_nullifiers, 1);

    let mut output_hints = builder.get_output_hints();
    // Add the extra nullifier beyond the claimed length to the kept nullifiers array.
    output_hints.kept_nullifiers.array[1] = nullifiers[1];

    builder.validate_siloing_with_output_hints(output_hints);

    // This test fails because the validator compares the output nullifiers beyond the claimed length with the padded
    // nullifiers, which don't match the siloed nullifiers computed from the extra nullifiers in the previous kernel.
}

#[test(should_fail_with = "Linked note hash not copied correctly")]
fn mismatch_linked_note_hash_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(2);
    builder.output.append_siloed_nullifiers(2);

    // Tweak the linked note hash of the nullifier at index 1.
    let mut nullifier = builder.output.nullifiers.get(1);
    nullifier.inner.inner.note_hash += 1;
    builder.output.nullifiers.set(1, nullifier);

    builder.validate_siloing();
}

#[test(should_fail_with = "The contract_address of a siloed nullifier should be set to 0")]
fn non_zero_contract_address_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(2);
    builder.output.append_siloed_nullifiers(2);

    // Copy the contract address of the nullifier to the output.
    let mut nullifier = builder.output.nullifiers.get(1);
    nullifier.contract_address = builder.previous_kernel.nullifiers.get(1).contract_address;
    builder.output.nullifiers.set(1, nullifier);

    builder.validate_siloing();
}

#[test(should_fail_with = "Nullifiers have been siloed in a previous reset")]
fn previous_nullifiers_already_siloed() {
    let mut builder = TestBuilder::new();

    // 2 nullifiers are already siloed.
    builder.previous_kernel.append_siloed_nullifiers(2);
    builder.previous_kernel.append_nullifiers(1);

    builder.output.append_siloed_nullifiers(3);

    builder.validate_siloing();
}

#[test]
fn with_padded_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(5);

    // Pop the last two nullifiers and use them as padded nullifiers.
    builder.padded_side_effects.nullifiers[4] =
        builder.previous_kernel.nullifiers.pop().innermost().value;
    builder.padded_side_effects.nullifiers[3] =
        builder.previous_kernel.nullifiers.pop().innermost().value;

    // BoundedVec.pop() no longer zeroes vacated slots; rebuild with clean storage.
    builder.previous_kernel.nullifiers = rebuild_bounded_vec(builder.previous_kernel.nullifiers);

    builder.output.append_siloed_nullifiers(3);
    builder.output.append_padded_nullifiers(2);

    builder.validate_siloing();
}

#[test(should_fail_with = "CappedSize not large enough to cover all items in result_array")]
fn more_non_empty_nullifiers_than_capped_size() {
    let mut builder = TestBuilder::new();

    // Add one more than the amount to be siloed.
    builder.previous_kernel.append_nullifiers(NULLIFIER_SILOING_AMOUNT + 1);
    builder.output.append_siloed_nullifiers(NULLIFIER_SILOING_AMOUNT + 1);

    builder.validate_siloing();
}
