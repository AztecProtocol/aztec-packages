use super::TestBuilder;

// --- Archive ---

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn incorrect_next_available_archive__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;
    builder.right_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn incorrect_next_available_archive__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn incorrect_next_available_archive__non_first_block() {
    let mut builder = TestBuilder::default(false, false);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;
    builder.right_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn incorrect_next_available_archive__non_first_single_tx_block() {
    let mut builder = TestBuilder::default(false, true);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: empty subtree root not found at insertion index")]
fn incorrect_next_available_archive__empty_block() {
    // The error is different for the empty block root, as it doesn't have a tx, so the code path for the above tests
    // that validates the block number in the tx's constants is not triggered.
    let mut builder = TestBuilder::new_empty();

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn next_available_archive_leaf_index_too_large__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the next_available_leaf_index to be larger than u32.
    builder.left_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;
    builder.right_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn next_available_archive_leaf_index_too_large__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the next_available_leaf_index to be larger than u32.
    builder.left_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn next_available_archive_leaf_index_too_large__non_first_block() {
    let mut builder = TestBuilder::default(false, false);

    // Tweak the next_available_leaf_index to be larger than u32.
    builder.left_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;
    builder.right_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn next_available_archive_leaf_index_too_large__non_first_single_tx_block() {
    let mut builder = TestBuilder::default(false, true);

    // Tweak the next_available_leaf_index to be larger than u32.
    builder.left_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;

    builder.execute_and_fail();
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn next_available_archive_leaf_index_too_large__empty_block() {
    // The error is different for the empty block root, as it doesn't have a tx, so the code path for the above tests
    // that validates the block number in the tx's constants is not triggered.
    let mut builder = TestBuilder::new_empty();

    // Tweak the next_available_leaf_index to be larger than u32.
    builder.left_rollup.constants.last_archive.next_available_leaf_index +=
        (1 << 32 as u64) as Field;

    builder.execute_and_fail();
}

// --- L1-to-L2 tree snapshot ---

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn incorrect_l1_to_l2_tree_root__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the root of the l1_to_l2_tree_snapshot in the rollups' constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.root += 1;
    builder.right_rollup.constants.l1_to_l2_tree_snapshot.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn incorrect_l1_to_l2_tree_next_available_leaf_index__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the next_available_leaf_index of the l1_to_l2_tree_snapshot in the rollups' constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.next_available_leaf_index += 1;
    builder.right_rollup.constants.l1_to_l2_tree_snapshot.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn incorrect_l1_to_l2_tree_root__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the root of the l1_to_l2_tree_snapshot in the rollup's constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn incorrect_l1_to_l2_tree_next_available_leaf_index__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the next_available_leaf_index of the l1_to_l2_tree_snapshot in the rollup's constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn mismatched_vk_tree_root_from_parity__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the vk tree root of the parity root.
    builder.parity_root.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn mismatched_vk_tree_root_from_parity__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the vk tree root of the parity root.
    builder.parity_root.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn mismatched_vk_tree_root_from_parity__first_empty_block() {
    let mut builder = TestBuilder::new_empty();

    // Tweak the vk tree root of the parity root.
    builder.parity_root.vk_tree_root += 1;

    builder.execute_and_fail();
}
