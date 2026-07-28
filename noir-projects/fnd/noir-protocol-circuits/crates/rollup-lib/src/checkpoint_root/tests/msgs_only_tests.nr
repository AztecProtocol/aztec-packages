use super::TestBuilder;
use types::constants::{
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
    BLOCK_ROOT_ROLLUP_VK_INDEX,
};

// A checkpoint of [first block, message-only block] proves: the message-only block is accepted as a non-first direct
// child of the checkpoint root.
#[test]
fn checkpoint_with_msgs_only_right_block() {
    let builder = TestBuilder::new(
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        1,
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
        1,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

// The message-only block sets `is_first_block = false`, so it can never be the leftmost block of a checkpoint: the
// checkpoint root requires the leftmost rollup's `is_first_block` to be true.
#[test(should_fail_with = "The first block of the checkpoint must be a first block root")]
fn msgs_only_block_cannot_be_leftmost() {
    let builder = TestBuilder::new(
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
        1,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
    );
    builder.execute_with_mock_and_fail();
}
