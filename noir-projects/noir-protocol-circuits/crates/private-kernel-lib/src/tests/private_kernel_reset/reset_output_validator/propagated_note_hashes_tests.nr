use crate::tests::private_kernel_reset::{NOTE_HASH_SILOING_AMOUNT, TestBuilder};
use super::rebuild_bounded_vec;
use protocol_test_utils::swap_items;

#[test]
fn previous_note_hashes_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(4);
    builder.output.append_siloed_note_hashes(4);

    builder.validate_siloing();
}

#[test]
fn previous_note_hashes_not_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(4);
    // Swap 2 of the note hashes in the previous kernel.
    swap_items(&mut builder.previous_kernel.note_hashes, 0, 2);

    builder.output.append_siloed_note_hashes(4);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
fn output_note_hashes_not_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(4);

    builder.output.append_siloed_note_hashes(4);
    // Swap 2 of the note hashes in the output.
    swap_items(&mut builder.output.note_hashes, 0, 2);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
fn extra_non_empty_note_hash_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(2);

    // Append an extra item to the output.
    builder.output.append_siloed_note_hashes(3);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
fn previous_note_hashes_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(2);
    let note_hashes = builder.previous_kernel.note_hashes.storage();
    builder.previous_kernel.note_hashes = BoundedVec::from_parts(note_hashes, 1);

    builder.output.append_siloed_note_hashes(2);
    let output_note_hashes = builder.output.note_hashes.storage();
    builder.output.note_hashes = BoundedVec::from_parts(output_note_hashes, 1);

    let mut output_hints = builder.get_output_hints();
    // Add the extra note hash beyond the claimed length to the kept note hashes array.
    output_hints.kept_note_hashes.array[1] = note_hashes[1];

    builder.validate_siloing_with_output_hints(output_hints);

    // This test fails because the validator compares the output note hashes beyond the claimed length with the padded
    // note hashes, which don't match the siloed note hashes computed from the extra note hashes in the previous kernel.
}

#[test]
fn with_padded_note_hashes() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(5);

    // Pop the last two note hashes and use them as padded note hashes.
    builder.padded_side_effects.note_hashes[4] =
        builder.previous_kernel.note_hashes.pop().innermost();
    builder.padded_side_effects.note_hashes[3] =
        builder.previous_kernel.note_hashes.pop().innermost();

    // BoundedVec.pop() no longer zeroes vacated slots; rebuild with clean storage.
    builder.previous_kernel.note_hashes = rebuild_bounded_vec(builder.previous_kernel.note_hashes);

    builder.output.append_siloed_note_hashes(3);
    builder.output.append_padded_note_hashes(2);

    builder.validate_siloing();
}

#[test(should_fail_with = "CappedSize not large enough to cover all items in result_array")]
fn more_non_empty_note_hashes_than_capped_size() {
    let mut builder = TestBuilder::new();

    // Add one more than the amount to be siloed.
    builder.previous_kernel.append_note_hashes(NOTE_HASH_SILOING_AMOUNT + 1);
    builder.output.append_siloed_note_hashes(NOTE_HASH_SILOING_AMOUNT + 1);

    builder.validate_siloing();
}
