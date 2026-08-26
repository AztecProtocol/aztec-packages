use super::{TEST_NUM_MSGS, TestBuilder};
use types::constants::{
    MAX_L1_TO_L2_MSGS_PER_BLOCK, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
};

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

// A block that consumes messages must start at an L1 bucket boundary: it may not pick up the tail of a bucket a
// previous block left half-consumed. Otherwise a proposer could split one L1 bucket across two blocks.
#[test(should_fail_with = "First consumed message must open a bucket")]
fn block_starting_mid_bucket_fails() {
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, false);

    let mut bucket_starts = [false; MAX_L1_TO_L2_MSGS_PER_BLOCK];
    bucket_starts[1] = true;
    builder.bucket_starts = bucket_starts;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Found bucket start after breakpoint")]
fn bucket_start_in_padding_lane_fails() {
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, false);

    builder.bucket_starts[TEST_NUM_MSGS] = true;

    builder.execute_and_fail();
}

#[test]
fn block_consuming_several_whole_buckets_succeeds() {
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, false);

    // Two more buckets opened inside the block's own run; every one of them is consumed whole.
    builder.bucket_starts[1] = true;
    builder.bucket_starts[3] = true;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "First consumed message must open a bucket")]
fn single_tx_block_starting_mid_bucket_fails_too() {
    // The single-tx variant runs the same composer, so the guard holds there as well.
    let mut builder = TestBuilder::default(IS_FIRST_BLOCK_ROOT, true);

    let mut bucket_starts = [false; MAX_L1_TO_L2_MSGS_PER_BLOCK];
    bucket_starts[2] = true;
    builder.bucket_starts = bucket_starts;

    builder.execute_and_fail();
}

#[test]
fn msg_sponge_commits_to_bucket_starts() {
    let one_bucket = TestBuilder::default(IS_FIRST_BLOCK_ROOT, false);
    let mut two_buckets = TestBuilder::default(IS_FIRST_BLOCK_ROOT, false);
    two_buckets.bucket_starts[2] = true;

    let one_bucket_pi = one_bucket.execute();
    let two_buckets_pi = two_buckets.execute();

    // Same leaves and same tree, but a different grouping — so the sponge the checkpoint root checks differs too,
    // which is what stops a block's flags from disagreeing with the checkpoint's `InboxParity` flags.
    assert_eq(one_bucket_pi.end_state, two_buckets_pi.end_state);
    assert(one_bucket_pi.end_msg_sponge != two_buckets_pi.end_msg_sponge);
}
