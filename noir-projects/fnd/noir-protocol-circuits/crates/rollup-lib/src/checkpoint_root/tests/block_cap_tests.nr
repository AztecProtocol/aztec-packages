use super::TestBuilder;
use types::constants::{BLOCK_MERGE_ROLLUP_VK_INDEX, MAX_BLOCKS_PER_CHECKPOINT};

// The largest balanced left subtree that fits under the cap, so the right subtree carries the remainder.
global LEFT_BLOCKS: u32 = 64;

#[test]
fn checkpoint_at_the_block_cap() {
    let builder = TestBuilder::new(
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        LEFT_BLOCKS,
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        MAX_BLOCKS_PER_CHECKPOINT - LEFT_BLOCKS,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

#[test(should_fail_with = "The checkpoint contains too many blocks")]
fn checkpoint_over_the_block_cap() {
    TestBuilder::new(
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        LEFT_BLOCKS,
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        MAX_BLOCKS_PER_CHECKPOINT - LEFT_BLOCKS + 1,
    )
        .execute_with_mock_and_fail();
}
