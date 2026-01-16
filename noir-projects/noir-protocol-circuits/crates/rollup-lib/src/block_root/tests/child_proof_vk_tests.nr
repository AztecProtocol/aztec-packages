use super::TestBuilder;
use types::{
    constants::{
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX, PARITY_BASE_VK_INDEX,
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
    },
    tests::fixtures::vk_tree::VK_MERKLE_TREE,
};

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_left_rollup_vk_index__first_block() {
    let mut builder = TestBuilder::default(true, false);

    builder.left_rollup_vk_index = BLOCK_ROOT_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_right_rollup_vk_index__first_block() {
    let mut builder = TestBuilder::default(true, false);

    builder.right_rollup_vk_index = BLOCK_ROOT_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_rollup_vk_index__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    builder.left_rollup_vk_index = PARITY_BASE_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_left_rollup_vk_index__non_first_block() {
    let mut builder = TestBuilder::default(false, false);

    builder.left_rollup_vk_index = BLOCK_ROOT_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_right_rollup_vk_index__non_first_block() {
    let mut builder = TestBuilder::default(false, false);

    builder.right_rollup_vk_index = BLOCK_ROOT_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_rollup_vk_index__non_first_single_tx_block() {
    let mut builder = TestBuilder::default(false, true);

    builder.left_rollup_vk_index = BLOCK_ROOT_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn left_rollup_vk_not_in_vk_tree__first_block() {
    let mut builder = TestBuilder::new(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        true,
    );

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.left_rollup_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn right_rollup_vk_not_in_vk_tree__first_block() {
    let mut builder = TestBuilder::new(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        true,
    );

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.right_rollup_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn left_rollup_vk_not_in_vk_tree__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.left_rollup_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn left_rollup_vk_not_in_vk_tree__non_first_block() {
    let mut builder = TestBuilder::new(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        false,
    );

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.left_rollup_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn right_rollup_vk_not_in_vk_tree__non_first_block() {
    let mut builder = TestBuilder::new(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        false,
    );

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.right_rollup_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn left_rollup_vk_not_in_vk_tree__non_first_single_tx_block() {
    let mut builder = TestBuilder::default(false, true);

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.left_rollup_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

// --- Parity root ---

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn incorrect_parity_root_vk_index__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Change the vk index of the parity root to something else.
    builder.parity_root_vk_index = BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn incorrect_parity_root_vk_index__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Change the vk index of the parity root to something else.
    builder.parity_root_vk_index = PARITY_BASE_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn incorrect_parity_root_vk_index__first_empty_block() {
    let mut builder = TestBuilder::new_empty();

    // Change the vk index of the parity root to something else.
    builder.parity_root_vk_index = PARITY_BASE_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn parity_root_vk_not_in_vk_tree__first_block() {
    let mut builder = TestBuilder::default(true, false);

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.parity_root_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn parity_root_vk_not_in_vk_tree__first_single_tx_block() {
    let mut builder = TestBuilder::default(true, true);

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.parity_root_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn parity_root_vk_not_in_vk_tree__first_empty_block() {
    let mut builder = TestBuilder::new_empty();

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.parity_root_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.checkpoint_constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}
