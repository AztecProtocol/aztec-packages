use super::TestBuilder;
use protocol_test_utils::fixtures::vk_tree::{update_vk_hash, VK_MERKLE_TREE};
use types::constants::{
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX, INBOX_PARITY_256_VK_INDEX, INBOX_PARITY_64_VK_INDEX,
};

// --- Inbox parity proof / vk ---

// The checkpoint root accepts any rung of the inbox parity size ladder. The default builder uses the 1024 rung; here
// we exercise the other two to prove the whole allowed set is accepted.
#[test]
fn accepts_ladder_vk_index_64() {
    let mut builder = TestBuilder::default();
    builder.inbox_parity_vk_index = INBOX_PARITY_64_VK_INDEX;
    let _ = builder.execute_with_mock();
}

#[test]
fn accepts_ladder_vk_index_256_single_block() {
    let mut builder = TestBuilder::default_single_block();
    builder.inbox_parity_vk_index = INBOX_PARITY_256_VK_INDEX;
    let _ = builder.execute_with_mock();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn incorrect_inbox_parity_vk_index() {
    let mut builder = TestBuilder::default();

    builder.inbox_parity_vk_index = CHECKPOINT_ROOT_ROLLUP_VK_INDEX;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn incorrect_inbox_parity_vk_index_single_block() {
    let mut builder = TestBuilder::default_single_block();

    builder.inbox_parity_vk_index = CHECKPOINT_ROOT_ROLLUP_VK_INDEX;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn inbox_parity_vk_not_in_vk_tree() {
    let mut builder = TestBuilder::default();

    // Update the inbox parity vk hash so that the old vk hash in the proof data is no longer in the vk tree.
    let mut new_vk_tree = VK_MERKLE_TREE;
    update_vk_hash(&mut new_vk_tree, builder.inbox_parity_vk_index, 999);

    builder.left_rollup.constants.vk_tree_root = new_vk_tree.get_root();
    builder.right_rollup.constants.vk_tree_root = new_vk_tree.get_root();

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The prover id of the inbox parity does not match the rollup's prover id")]
fn mismatched_prover_id_from_parity() {
    let mut builder = TestBuilder::default();

    builder.inbox_parity.prover_id += 1;

    builder.execute_with_mock_and_fail();
}

// --- Message sponge ---

#[test(should_fail_with = "The blocks' message sponge does not match the inbox parity's message sponge")]
fn blocks_sponge_mismatch_parity() {
    let mut builder = TestBuilder::default();

    // Break the equality between the blocks' accumulated sponge and the inbox parity's sponge.
    builder.inbox_parity.end_sponge.num_absorbed += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The message sponge of the first block was not correctly initialized")]
fn first_block_start_sponge_not_empty() {
    let mut builder = TestBuilder::default();

    // The first block must start the message sponge from empty.
    builder.left_rollup.start_msg_sponge.num_absorbed += 1;

    builder.execute_with_mock_and_fail();
}
