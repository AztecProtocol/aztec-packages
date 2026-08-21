use super::TestBuilder;
use types::constants::{PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX};

global IS_FIRST_BLOCK_ROOT: bool = true;

// A start index that is a right child at some levels and a left child at others, so the append has to merge the batch
// into a real frontier rather than drop an aligned subtree into an empty slot.
global NON_ALIGNED_START_INDEX: u32 = 5;

fn builder_at_non_aligned_index(is_first_block_root: bool) -> TestBuilder {
    TestBuilder::new_at_l1_to_l2_index(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        is_first_block_root,
        NON_ALIGNED_START_INDEX,
    )
}

#[test]
fn first_block_appends_at_non_aligned_index() {
    let builder = builder_at_non_aligned_index(IS_FIRST_BLOCK_ROOT);
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn non_first_block_appends_at_non_aligned_index() {
    let builder = builder_at_non_aligned_index(!IS_FIRST_BLOCK_ROOT);
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn unpinned_frontier_hint_lane_is_ignored() {
    // Index 5 is a left child at level 1, so the snapshot root cannot pin that hint lane. The append overwrites it
    // with the batch's own node before anything reads it, so a wrong value there must not change the result.
    let mut builder = builder_at_non_aligned_index(!IS_FIRST_BLOCK_ROOT);
    builder.l1_to_l2_message_frontier_hint[1] += 1;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Frontier hint does not match the snapshot root")]
fn corrupted_pinned_frontier_hint_lane_fails() {
    // Index 5 is a right child at level 0, so that hint lane is pinned by the snapshot root and cannot be tampered
    // with. Note this is only testable at a non-zero start index: appending into an empty tree pins no lane at all.
    let mut builder = builder_at_non_aligned_index(!IS_FIRST_BLOCK_ROOT);
    builder.l1_to_l2_message_frontier_hint[0] += 1;

    builder.execute_and_fail();
}
