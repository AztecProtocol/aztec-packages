use super::TestBuilder;
use protocol_test_utils::fixtures::vk_tree::{update_vk_hash, VK_MERKLE_TREE};
use types::constants::CHECKPOINT_ROOT_ROLLUP_VK_INDEX;

// --- Parity root proof / vk ---

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn incorrect_parity_root_vk_index() {
    let mut builder = TestBuilder::default();

    builder.parity_root_vk_index = CHECKPOINT_ROOT_ROLLUP_VK_INDEX;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Incorrect vk index for parity root")]
fn incorrect_parity_root_vk_index_single_block() {
    let mut builder = TestBuilder::default_single_block();

    builder.parity_root_vk_index = CHECKPOINT_ROOT_ROLLUP_VK_INDEX;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn parity_root_vk_not_in_vk_tree() {
    let mut builder = TestBuilder::default();

    // Update the parity root vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    update_vk_hash(&mut new_vk_tree, builder.parity_root_vk_index, 999);

    builder.parity_root.vk_tree_root = new_vk_tree.get_root();
    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();
    builder.right_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The vk tree root of the parity root does not match the rollup's vk tree root")]
fn mismatched_vk_tree_root_from_parity() {
    let mut builder = TestBuilder::default();

    builder.parity_root.vk_tree_root += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The prover id of the parity root does not match the rollup's prover id")]
fn mismatched_prover_id_from_parity() {
    let mut builder = TestBuilder::default();

    builder.parity_root.prover_id += 1;

    builder.execute_with_mock_and_fail();
}

// --- Message sponge ---

#[test(should_fail_with = "The parity root message sponge must start empty")]
fn parity_root_sponge_not_empty() {
    let mut builder = TestBuilder::default();

    // The parity root's message sponge must reset per checkpoint (start empty).
    builder.parity_root.start_sponge.num_absorbed += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The blocks' message sponge does not match the parity root's message sponge")]
fn blocks_sponge_mismatch_parity() {
    let mut builder = TestBuilder::default();

    // Break the equality between the blocks' accumulated sponge and the parity root's sponge.
    builder.parity_root.end_sponge.num_absorbed += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The message sponge of the first block was not correctly initialized")]
fn first_block_start_sponge_not_empty() {
    let mut builder = TestBuilder::default();

    // The first block must start the message sponge from empty.
    builder.left_rollup.start_msg_sponge.num_absorbed += 1;

    builder.execute_with_mock_and_fail();
}
