use crate::tests::private_kernel_reset::{NULLIFIER_SILOING_AMOUNT, TestBuilder};
use dep::types::tests::utils::swap_items;

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
    let mut hints = builder.get_output_hints();
    // Tweak the hint to point to an empty item.
    hints.sorted_kept_nullifier_indexes[3] = 4;

    builder.validate_siloing_with_output_hints(hints);
}

#[test]
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
        builder.previous_kernel.nullifiers.pop().nullifier.value;
    builder.padded_side_effects.nullifiers[3] =
        builder.previous_kernel.nullifiers.pop().nullifier.value;

    builder.output.append_siloed_nullifiers(3);
    builder.output.append_padded_nullifiers(2);

    builder.validate_siloing();
}

#[test(should_fail_with = "attempt to subtract with overflow")]
fn more_non_empty_nullifiers_than_capped_size() {
    let mut builder = TestBuilder::new();

    // Add one more than the amount to be siloed.
    builder.previous_kernel.append_nullifiers(NULLIFIER_SILOING_AMOUNT + 1);
    builder.output.append_siloed_nullifiers(NULLIFIER_SILOING_AMOUNT + 1);

    builder.validate_siloing();
}
