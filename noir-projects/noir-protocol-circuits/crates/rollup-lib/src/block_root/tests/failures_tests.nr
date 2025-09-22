use super::TestBuilder;
use types::constants::{BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, PARITY_BASE_VK_INDEX};

// --- Archive ---

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn first_block_not_for_next_available_archive() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;
    builder.right_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn first_single_tx_block_not_for_next_available_archive() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn non_first_block_not_for_next_available_archive() {
    let mut builder = TestBuilder::default(false, false);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;
    builder.right_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The block number must match the index at which the block header hash is inserted into the archive")]
fn non_first_single_tx_block_not_for_next_available_archive() {
    let mut builder = TestBuilder::default(false, true);

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "membership check failed")]
fn first_empty_block_incorrect_next_available_archive() {
    // The error is different for the empty block root, as it doesn't have a tx, so the code path for the above tests
    // that validates the block number in the tx's constants is not triggered.
    let mut builder = TestBuilder::new_empty();

    // Tweak the next_available_leaf_index of the last archive.
    builder.left_rollup.constants.last_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

// --- L1-to-L2 tree snapshot ---

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn first_block_incorrect_l1_to_l2_tree_root() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the root of the l1_to_l2_tree_snapshot in the rollups' constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.root += 1;
    builder.right_rollup.constants.l1_to_l2_tree_snapshot.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn first_block_incorrect_l1_to_l2_tree_next_available_leaf_index() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the next_available_leaf_index of the l1_to_l2_tree_snapshot in the rollups' constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.next_available_leaf_index += 1;
    builder.right_rollup.constants.l1_to_l2_tree_snapshot.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn first_single_tx_block_incorrect_l1_to_l2_tree_root() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the root of the l1_to_l2_tree_snapshot in the rollup's constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l1_to_l2 tree snapshot in constants does not match the computed value")]
fn first_single_tx_block_incorrect_l1_to_l2_tree_next_available_leaf_index() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the next_available_leaf_index of the l1_to_l2_tree_snapshot in the rollup's constants.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

// --- Parity root ---

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn first_block_with_incorrect_parity_root_vk_index() {
    let mut builder = TestBuilder::default(true, false);

    // Change the vk index of the parity root to something else.
    builder.parity_root_vk_index = BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn first_single_tx_block_with_incorrect_parity_root_vk_index() {
    let mut builder = TestBuilder::default(true, true);

    // Change the vk index of the parity root to something else.
    builder.parity_root_vk_index = PARITY_BASE_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn first_empty_block_with_incorrect_parity_root_vk_index() {
    let mut builder = TestBuilder::new_empty();

    // Change the vk index of the parity root to something else.
    builder.parity_root_vk_index = PARITY_BASE_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn first_block_with_mismatched_vk_tree_root_from_parity() {
    let mut builder = TestBuilder::default(true, false);

    // Tweak the vk tree root of the parity root.
    builder.parity_root.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn first_single_tx_block_with_mismatched_vk_tree_root_from_parity() {
    let mut builder = TestBuilder::default(true, true);

    // Tweak the vk tree root of the parity root.
    builder.parity_root.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn first_empty_block_with_mismatched_vk_tree_root_from_parity() {
    let mut builder = TestBuilder::new_empty();

    // Tweak the vk tree root of the parity root.
    builder.parity_root.vk_tree_root += 1;

    builder.execute_and_fail();
}
