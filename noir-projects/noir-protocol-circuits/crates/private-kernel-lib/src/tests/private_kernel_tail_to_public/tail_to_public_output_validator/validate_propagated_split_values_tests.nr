use crate::tests::private_kernel_tail_to_public::TestBuilder;

// Only a few scenarios are tested here for `note_hashes`, `nullifiers`, and `private_logs` to ensure that
// `assert_split_transformed_arrays_from_sorted_padded_array` is applied to them.
// More comprehensive tests are covered in `assert_split_transformed_arrays_from_sorted_padded_array.nr`.

#[test(should_fail_with = "incorrect output note_hashes")]
fn mismatch_note_hash_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(1);
    // Add a different note hash to the output.
    builder.output.add_siloed_unique_note_hash(99);

    builder.validate();
}

#[test(should_fail_with = "array should be padded with empty items")]
fn extra_note_hash_in_output() {
    let builder = TestBuilder::new();

    let mut output = builder.export_output();
    // Add an extra note hash to the output.
    output.revertible_accumulated_data.note_hashes[3] = 99;

    builder.validate_with_output(output);
}

#[test(should_fail_with = "incorrect output nullifiers")]
fn mismatch_nullifier_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(1);
    // Add a different nullifier to the output.
    builder.output.add_siloed_nullifier(99);

    builder.validate();
}

#[test(should_fail_with = "num_padded_lt is too large")]
fn padded_num_non_revertible_nullifier_too_large() {
    let mut builder = TestBuilder::new();

    // Set a large padded amount for non-revertible nullifiers.
    builder.padded_side_effect_amounts.non_revertible_nullifiers = 100;

    builder.validate();
}

#[test(should_fail_with = "incorrect output private_logs")]
fn mismatch_private_log_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs_with_lengths([4]);
    // Add a private log with different length to the output.
    builder.output.append_siloed_private_logs_with_lengths([5]);

    builder.validate();
}

#[test(should_fail_with = "array should be padded with empty items")]
fn extra_private_log_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs_with_lengths([4]);
    builder.output.append_siloed_private_logs_with_lengths([4]);

    let mut output = builder.export_output();
    // Add an extra private log to the output.
    output.non_revertible_accumulated_data.private_logs[2].length = 5;

    builder.validate_with_output(output);
}
