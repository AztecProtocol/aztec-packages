use crate::tests::private_kernel_tail::TestBuilder;
use dep::types::tests::utils::swap_items;

/**
 * l2_to_l1_msgs
 */
#[test]
fn l2_to_l1_msgs_remain_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    builder.output.append_l2_to_l1_msgs(2);

    builder.validate();
}

#[test]
fn l2_to_l1_msgs_unordered_become_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    swap_items(&mut builder.previous_kernel.l2_to_l1_msgs, 0, 1);
    builder.output.append_l2_to_l1_msgs(2);

    builder.validate();
}

#[test(should_fail_with = "mismatch l2_to_l1_msgs")]
fn l2_to_l1_msgs_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    builder.output.append_l2_to_l1_msgs(2);
    // Tweak the content in the output.
    let mut msg = builder.output.l2_to_l1_msgs.get(0);
    msg.inner.inner.content += 1;
    builder.output.l2_to_l1_msgs.set(0, msg);

    builder.validate();
}

#[test(should_fail_with = "mismatch l2_to_l1_msgs")]
fn l2_to_l1_msgs_extra_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    // Output has 1 more item.
    builder.output.append_l2_to_l1_msgs(3);

    builder.validate();
}

#[test(should_fail_with = "mismatch l2_to_l1_msgs")]
fn l2_to_l1_msgs_missing_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    // Output has 1 less item.
    builder.output.append_l2_to_l1_msgs(1);

    builder.validate();
}

/**
 * contract_class_log_hashes
 */
#[test]
fn contract_class_log_hashes_remain_sorted() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.add_contract_class_log_hash(3, 2);
    builder.output.add_contract_class_log_hash(3, 2);

    builder.validate();
}

#[test(should_fail_with = "mismatch contract_class_logs_hashes")]
fn contract_class_log_hashes_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.add_contract_class_log_hash(3, 2);
    builder.output.add_contract_class_log_hash(3, 2);
    // Tweak the log hash in the output.
    let mut log_hash = builder.output.contract_class_logs_hashes.get(0);
    log_hash.inner.inner.value += 1;
    builder.output.contract_class_logs_hashes.set(0, log_hash);

    builder.validate();
}

#[test(should_fail_with = "mismatch contract_class_logs_hashes")]
fn contract_class_log_hashes_missing_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.add_contract_class_log_hash(3, 2);
    // Output does not have the log.

    builder.validate();
}
