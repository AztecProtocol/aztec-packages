use crate::tests::private_kernel_reset::{NOTE_HASH_SILOING_AMOUNT, TestBuilder};
use dep::types::tests::utils::swap_items;

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
    let mut hints = builder.get_output_hints();
    // Tweak the hint to point to an empty item.
    hints.sorted_kept_note_hash_indexes[2] = 3;

    builder.validate_siloing_with_output_hints(hints);
}

#[test(should_fail_with = "Note hashes have been siloed in a previous reset")]
fn first_note_hash_is_siloed() {
    let mut builder = TestBuilder::new();

    // Add a siloed note hash to the previous kernel.
    builder.previous_kernel.append_siloed_note_hashes(1);
    builder.previous_kernel.append_note_hashes(2);

    builder.output.append_siloed_note_hashes(3);

    builder.validate_siloing();
}

#[test]
fn with_padded_note_hashes() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(5);

    // Pop the last two note hashes and use them as padded note hashes.
    builder.padded_side_effects.note_hashes[4] =
        builder.previous_kernel.note_hashes.pop().note_hash.value;
    builder.padded_side_effects.note_hashes[3] =
        builder.previous_kernel.note_hashes.pop().note_hash.value;

    builder.output.append_siloed_note_hashes(3);
    builder.output.append_padded_note_hashes(2);

    builder.validate_siloing();
}

#[test(should_fail_with = "attempt to subtract with overflow")]
fn more_non_empty_note_hashes_than_capped_size() {
    let mut builder = TestBuilder::new();

    // Add one more than the amount to be siloed.
    builder.previous_kernel.append_note_hashes(NOTE_HASH_SILOING_AMOUNT + 1);
    builder.output.append_siloed_note_hashes(NOTE_HASH_SILOING_AMOUNT + 1);

    builder.validate_siloing();
}
