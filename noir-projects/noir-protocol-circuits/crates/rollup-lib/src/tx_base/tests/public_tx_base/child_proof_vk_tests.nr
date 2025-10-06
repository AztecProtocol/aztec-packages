use super::TestBuilder;
use types::tests::fixtures::vk_tree::VK_MERKLE_TREE;

#[test]
unconstrained fn default_setup_success() {
    let builder = TestBuilder::new();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Incorrect public tube vk index")]
unconstrained fn incorrect_public_tube_vk_index() {
    let mut builder = TestBuilder::new();

    builder.public_tube_vk_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
unconstrained fn public_tube_vk_hash_not_in_vk_tree() {
    let mut builder = TestBuilder::new();

    // Change the public tube vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    new_vk_tree.update_vk_hash(builder.public_tube_vk_index, 999);

    builder.private_tail.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect avm vk index")]
unconstrained fn incorrect_avm_vk_index() {
    let mut builder = TestBuilder::new();

    builder.avm_vk_index -= 1;

    builder.execute_and_fail();
}

// TODO(#17162)
// #[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
// unconstrained fn avm_vk_hash_not_in_vk_tree() {
//     let mut builder = TestBuilder::new();

//     // Change the public tube vk hash so that the old vk hash in the proof data is no longer in the vk tree.
//     let mut new_vk_tree = VK_MERKLE_TREE;
//     new_vk_tree.update_vk_hash(builder.avm_vk_index, 999);

//     builder.private_tail.constants.vk_tree_root = new_vk_tree.get_root();

//     builder.execute_and_fail();
// }
