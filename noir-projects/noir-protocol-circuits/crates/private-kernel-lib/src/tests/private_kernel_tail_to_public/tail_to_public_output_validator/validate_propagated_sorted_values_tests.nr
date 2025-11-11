use crate::tests::private_kernel_tail_to_public::TestBuilder;
use dep::types::tests::utils::swap_items;

// Only a few scenarios are tested here for `l2_to_l1_msgs`, `contract_class_logs_hashes`, and `public_call_requests` to
// ensure that `assert_split_sorted_transformed_arrays` is applied to them.
// More comprehensive tests are covered in `assert_split_sorted_transformed_arrays.nr`.

#[test(should_fail_with = "incorrect output l2_to_l1_msg")]
fn unsorted_output_non_revertible_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    // Non-revertible.
    builder.previous_kernel.append_l2_to_l1_msgs(3);
    builder.previous_kernel.end_setup();
    // Revertible.
    builder.previous_kernel.append_l2_to_l1_msgs(1);

    builder.output = builder.previous_kernel;

    // Shuffle items in the output.
    swap_items(&mut builder.output.l2_to_l1_msgs, 0, 1);

    builder.validate();
}

#[test(should_fail_with = "incorrect output contract_class_log_hash")]
fn non_revertible_contract_class_logs_hash_become_revertible() {
    let mut builder = TestBuilder::new();

    // Non-revertible.
    builder.previous_kernel.append_contract_class_logs(1);

    builder.previous_kernel.end_setup();
    builder.output.end_setup();

    // Revertible.
    // The log is added to the revertible side in the output.
    builder.output.append_contract_class_logs(1);

    builder.validate();
}

#[test(should_fail_with = "incorrect output public_call_request")]
fn unsorted_output_revertible_public_call_requests() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.end_setup();
    // Revertible.
    builder.previous_kernel.append_public_call_requests(3);

    builder.output = builder.previous_kernel;

    // Shuffle items in the output.
    swap_items(&mut builder.output.public_call_requests, 0, 2);

    builder.validate();
}
