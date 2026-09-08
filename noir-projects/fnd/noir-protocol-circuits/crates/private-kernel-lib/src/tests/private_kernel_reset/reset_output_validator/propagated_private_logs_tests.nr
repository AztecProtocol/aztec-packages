use crate::tests::private_kernel_reset::{PRIVATE_LOG_SILOING_AMOUNT, TestBuilder};
use super::rebuild_bounded_vec;
use protocol_test_utils::swap_items;

#[test]
fn previous_private_logs_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(4);
    builder.output.append_siloed_private_logs(4);

    builder.validate_siloing();
}

#[test]
fn previous_private_logs_not_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(4);
    // Swap 2 of the private logs in the previous kernel.
    swap_items(&mut builder.previous_kernel.private_logs, 0, 2);

    builder.output.append_siloed_private_logs(4);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output private log first field does not match correctly-siloed private log first field")]
fn output_private_logs_not_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(4);

    builder.output.append_siloed_private_logs(4);
    // Swap 2 of the private logs in the output.
    swap_items(&mut builder.output.private_logs, 0, 2);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output private log first field does not match correctly-siloed private log first field")]
fn extra_non_empty_private_log_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);

    // Append an extra item to the output.
    builder.output.append_siloed_private_logs(3);

    builder.validate_siloing();
}

#[test(should_fail_with = "Output private log first field does not match correctly-siloed private log first field")]
fn previous_private_logs_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    let private_logs = builder.previous_kernel.private_logs.storage();
    builder.previous_kernel.private_logs = BoundedVec::from_parts(private_logs, 1);

    builder.output.append_siloed_private_logs(2);
    let output_private_logs = builder.output.private_logs.storage();
    builder.output.private_logs = BoundedVec::from_parts(output_private_logs, 1);

    let mut output_hints = builder.get_output_hints();
    // Add the extra private log beyond the claimed length to the kept private logs array.
    output_hints.kept_private_logs.array[1] = private_logs[1];

    builder.validate_siloing_with_output_hints(output_hints);

    // This test fails because the validator compares the output private logs beyond the claimed length with the padded
    // private logs, which don't match the siloed logs computed from the extra logs in the previous kernel.
}

#[test(should_fail_with = "Fields of the private log not copied correctly")]
fn mismatch_private_log_field_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    builder.output.append_siloed_private_logs(2);

    // Tweak the log at index 1.
    let mut private_log = builder.output.private_logs.get(1);
    private_log.inner.inner.log.fields[2] += 1;
    builder.output.private_logs.set(1, private_log);

    builder.validate_siloing();
}

#[test(should_fail_with = "Length of the private log not copied correctly")]
fn mismatch_private_log_length_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    builder.output.append_siloed_private_logs(2);

    // Tweak the length of the private log at index 1.
    let mut private_log = builder.output.private_logs.get(1);
    private_log.inner.inner.log.length += 1;
    builder.output.private_logs.set(1, private_log);

    builder.validate_siloing();
}

#[test(should_fail_with = "Linked note_hash_counter of the private log not copied correctly")]
fn mismatch_linked_note_hash_counter_in_output() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(2);
    builder.output.append_siloed_private_logs(2);

    // Tweak the linked note_hash_counter of the private log at index 1.
    let mut private_log = builder.output.private_logs.get(1);
    private_log.inner.inner.note_hash_counter += 1;
    builder.output.private_logs.set(1, private_log);

    builder.validate_siloing();
}

#[test]
fn with_padded_private_logs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(3);

    // Pop the last two private logs and use them as padded private logs.
    builder.padded_side_effects.private_logs[2] =
        builder.previous_kernel.private_logs.pop().innermost().log;
    builder.padded_side_effects.private_logs[1] =
        builder.previous_kernel.private_logs.pop().innermost().log;

    // BoundedVec.pop() no longer zeroes vacated slots; rebuild with clean storage.
    builder.previous_kernel.private_logs =
        rebuild_bounded_vec(builder.previous_kernel.private_logs);

    builder.output.append_siloed_private_logs(1);
    builder.output.append_padded_private_logs(2);

    builder.validate_siloing();
}

#[test(should_fail_with = "CappedSize not large enough to cover all items in result_array")]
fn previous_private_logs_more_than_capped_size() {
    let mut builder = TestBuilder::new();

    // Add one more than the amount to be siloed.
    builder.previous_kernel.append_private_logs(PRIVATE_LOG_SILOING_AMOUNT + 1);
    builder.output.append_siloed_private_logs(PRIVATE_LOG_SILOING_AMOUNT + 1);

    builder.validate_siloing();
}

#[test(should_fail_with = "Trailing items must have counter 0")]
fn total_private_logs_more_than_capped_size() {
    let mut builder = TestBuilder::new();

    // Add one more padding log that makes the total amount more than the capped size.
    builder.previous_kernel.append_private_logs(PRIVATE_LOG_SILOING_AMOUNT + 1);

    // Pop the last private log and use it as padding.
    builder.padded_side_effects.private_logs[PRIVATE_LOG_SILOING_AMOUNT] =
        builder.previous_kernel.private_logs.pop().innermost().log;

    // BoundedVec.pop() no longer zeroes vacated slots; rebuild with clean storage.
    builder.previous_kernel.private_logs =
        rebuild_bounded_vec(builder.previous_kernel.private_logs);

    builder.output.append_siloed_private_logs(PRIVATE_LOG_SILOING_AMOUNT);
    builder.output.append_padded_private_logs(1);

    builder.validate_siloing();
}
