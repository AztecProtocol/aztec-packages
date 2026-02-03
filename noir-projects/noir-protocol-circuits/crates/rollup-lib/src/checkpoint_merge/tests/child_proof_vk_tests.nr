use super::TestBuilder;
use types::{
    constants::{BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX},
    tests::fixtures::vk_tree::VK_MERKLE_TREE,
};

#[test]
fn default_setup_success() {
    let builder = TestBuilder::default();
    let _ = builder.execute();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_left_rollup_vk_index() {
    let mut builder = TestBuilder::default();

    builder.left_rollup_vk_index = BLOCK_MERGE_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn disallowed_right_rollup_vk_index() {
    let mut builder = TestBuilder::default();

    builder.right_rollup_vk_index = BLOCK_ROOT_ROLLUP_VK_INDEX;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn left_rollup_vk_not_in_vk_tree() {
    let mut builder = TestBuilder::default();

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.left_rollup_vk_index, 999);

    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();
    builder.right_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn right_rollup_vk_not_in_vk_tree() {
    let mut builder = TestBuilder::default();

    // Make sure the vk indices are different, so that it won't fail when validating the left rollup.
    assert(builder.right_rollup_vk_index != builder.left_rollup_vk_index);

    // Update the vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.right_rollup_vk_index, 999);

    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();
    builder.right_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}
