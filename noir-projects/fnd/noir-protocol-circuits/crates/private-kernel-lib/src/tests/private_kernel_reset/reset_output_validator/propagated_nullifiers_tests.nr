use crate::tests::private_kernel_reset::{NULLIFIER_SILOING_AMOUNT, TestBuilder};
use super::rebuild_bounded_vec;
use protocol_test_utils::swap_items;
use types::{address::AztecAddress, traits::{FromField, ToField}};

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
    builder.previous_kernel.nullifiers = BoundedVec::from_parts(nullifiers, 1);

    builder.output.append_siloed_nullifiers(2);
    let output_nullifiers = builder.output.nullifiers.storage();
    builder.output.nullifiers = BoundedVec::from_parts(output_nullifiers, 1);

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

// The siloed value, linked note hash, counter and ordering stay honest here: only the wrapper's
// emitting address is changed. That address is one of the two operands of the tail's
// cross-contract squash guard, so leaving it unbound makes that guard prover-satisfiable.
#[test(should_fail_with = "Emitting contract address of the nullifier not copied correctly")]
fn output_nullifier_with_forged_contract_address() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    builder.output.append_siloed_nullifiers(3);

    let mut nullifier = builder.output.nullifiers.get(0);
    nullifier.contract_address.inner += 1;
    builder.output.nullifiers.set(0, nullifier);

    builder.validate_siloing();
}

#[test(should_fail_with = "Emitting contract address of the nullifier not copied correctly")]
fn output_nullifier_with_zeroed_contract_address() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    builder.output.append_siloed_nullifiers(3);

    // Zero into both operands defeats the tail's guard without knowing either address, so pin it
    // separately from the arbitrary-address case above.
    let mut nullifier = builder.output.nullifiers.get(0);
    nullifier.contract_address = AztecAddress::zero();
    builder.output.nullifiers.set(0, nullifier);

    builder.validate_siloing();
}

// Two emitters with the emitters exchanged in the output. Both siloed values remain correct under
// their own input address, so only a binding to the item's own emitter rejects this.
#[test(should_fail_with = "Emitting contract address of the nullifier not copied correctly")]
fn output_nullifiers_with_swapped_contract_addresses() {
    let mut builder = TestBuilder::new();

    let emitter_a = builder.previous_kernel.contract_address;
    let emitter_b = AztecAddress::from_field(emitter_a.to_field() + 1);

    builder.previous_kernel.append_nullifiers(1);
    builder.previous_kernel.contract_address = emitter_b;
    builder.previous_kernel.append_nullifiers(1);
    builder.previous_kernel.contract_address = emitter_a;

    builder.output.append_siloed_nullifiers(1);
    builder.output.contract_address = emitter_b;
    builder.output.append_siloed_nullifiers(1);
    builder.output.contract_address = emitter_a;

    let mut first = builder.output.nullifiers.get(0);
    let mut second = builder.output.nullifiers.get(1);
    first.contract_address = emitter_b;
    second.contract_address = emitter_a;
    builder.output.nullifiers.set(0, first);
    builder.output.nullifiers.set(1, second);

    builder.validate_siloing();
}

#[test(should_fail_with = "Emitting contract address of the nullifier not copied correctly")]
fn padded_nullifier_with_forged_contract_address() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_nullifiers(3);

    builder.padded_side_effects.nullifiers[2] =
        builder.previous_kernel.nullifiers.pop().innermost().value;
    builder.previous_kernel.nullifiers = rebuild_bounded_vec(builder.previous_kernel.nullifiers);

    builder.output.append_siloed_nullifiers(2);
    builder.output.append_padded_nullifiers(1);

    let mut padded = builder.output.nullifiers.get(2);
    padded.contract_address.inner += 1;
    builder.output.nullifiers.set(2, padded);

    builder.validate_siloing();
}

// A reset carrying nullifiers from two different emitters must still validate. This is the
// positive control for the binding above: an output address pinned to any single fixed address
// would reject this honest witness, while the swapped-address test rejects an unpinned one.
#[test]
fn nullifiers_from_two_contracts() {
    let mut builder = TestBuilder::new();

    let emitter_a = builder.previous_kernel.contract_address;
    let emitter_b = AztecAddress::from_field(emitter_a.to_field() + 1);

    builder.previous_kernel.append_nullifiers(1);
    builder.previous_kernel.contract_address = emitter_b;
    builder.previous_kernel.append_nullifiers(1);
    builder.previous_kernel.contract_address = emitter_a;

    builder.output.append_siloed_nullifiers(1);
    builder.output.contract_address = emitter_b;
    builder.output.append_siloed_nullifiers(1);
    builder.output.contract_address = emitter_a;

    builder.validate_siloing();
}
