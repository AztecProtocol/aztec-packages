use crate::{
    abis::BlockRollupPublicInputs,
    block_merge::block_merge_rollup::{self, BlockMergeRollupPrivateInputs},
    tests::RollupFixtureBuilder,
};
use types::constants::{
    BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
};

// Merges two consecutive single-block rollups into one.
fn merge(
    left: BlockRollupPublicInputs,
    left_vk_index: u32,
    right: BlockRollupPublicInputs,
    right_vk_index: u32,
) -> BlockRollupPublicInputs {
    block_merge_rollup::execute(
        BlockMergeRollupPrivateInputs {
            previous_rollups: [
                RollupFixtureBuilder::make_proof_data(left, left_vk_index),
                RollupFixtureBuilder::make_proof_data(right, right_vk_index),
            ],
        },
    )
}

// The roadmap's done-when: a checkpoint made of [first block, message-only block, normal block] proves. The
// message-only block sits in the middle, so the merge circuits must accept it as a non-first child and thread the state,
// archive and sponges through it.
#[test]
fn checkpoint_with_mid_checkpoint_msgs_only_block() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    // The consecutive single-block fixtures chain naturally by block number (archives, states and sponges line up).
    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let msgs_only = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);
    let normal = fixture_builder.get_block_rollup_public_inputs(start_block_number + 2);

    assert(first.is_first_block);
    assert(!msgs_only.is_first_block);
    assert(!normal.is_first_block);

    // ((first, msgs_only), normal)
    let left = merge(
        first,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        msgs_only,
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
    );
    let merged = merge(
        left,
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        normal,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_blocks(), 3);
    // `is_first_block` propagates from the leftmost (first) block only.
    assert(merged.is_first_block);
    assert_eq(merged.previous_archive, first.previous_archive);
    assert_eq(merged.new_archive, normal.new_archive);
    assert_eq(merged.start_msg_sponge, first.start_msg_sponge);
    assert_eq(merged.end_msg_sponge, normal.end_msg_sponge);
}

// A message-only block is a valid right (non-first) child of a block merge.
#[test]
fn msgs_only_block_accepted_as_right_child() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let msgs_only = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);

    let merged = merge(
        first,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        msgs_only,
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_blocks(), 2);
    assert(merged.is_first_block);
}

// The message-only block's `start_msg_sponge` is a free input; the merge continuity check must catch it if it does not
// follow on from the previous block's `end_msg_sponge`.
#[test(should_fail_with = "Mismatched message sponge: expected right.start_msg_sponge to match left.end_msg_sponge")]
fn msgs_only_block_bad_start_msg_sponge_fails() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let mut msgs_only = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);

    // Break the sponge continuity with the previous (first) block.
    msgs_only.start_msg_sponge.num_absorbed += 1;

    let _ = merge(
        first,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        msgs_only,
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
    );
}
